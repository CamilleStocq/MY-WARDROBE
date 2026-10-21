import type { Garment, SavedOutfit, UserPreferences } from '../domain/types';
import { normalizeGarment, normalizeOutfit, normalizePreferences, slotIds } from '../domain/normalize';
import { db } from './db';
import { blobToDataUrl, dataUrlToBlob, type ImageRecord } from './imageService';
import { loadCalendar, type Calendar } from './calendarService';

/**
 * Sauvegarde complète (vêtements + photos + favoris + calendrier + préférences)
 * dans un fichier JSON. Indispensable tant que les données ne vivent que sur l'appareil.
 *
 * Restauration : le fichier est entièrement validé et les photos décodées AVANT toute
 * écriture, puis tout est écrit en une seule transaction. La restauration ajoute ou
 * remplace les éléments du fichier, sans supprimer ce qui existe déjà sur l'appareil.
 */
export const BACKUP_VERSION = 1;

interface BackupImage {
  id: string;
  full: string;
  thumb: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface BackupFile {
  app: 'my-wardrobe';
  version: number;
  exportedAt: string;
  preferences?: UserPreferences;
  garments: Garment[];
  outfits?: SavedOutfit[];
  calendar?: Calendar;
  images?: BackupImage[];
}

export interface BackupSummary {
  garments: number;
  outfits: number;
  images: number;
  days: number;
  warnings: string[];
}

export type BackupValidation = { ok: true; backup: BackupFile; summary: BackupSummary } | { ok: false; error: string };

const CATEGORIES = new Set(['top', 'bottom', 'onepiece', 'outerwear', 'shoes', 'accessory']);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Validation pure (sans accès au stockage) : testable et utilisée avant toute écriture. */
export function validateBackup(data: unknown): BackupValidation {
  if (!isObj(data) || data.app !== 'my-wardrobe') return { ok: false, error: "Ce fichier n'est pas une sauvegarde My Wardrobe." };
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    return { ok: false, error: 'Cette sauvegarde vient d’une version plus récente de l’application : mettez l’application à jour puis réessayez.' };
  }
  if (!Array.isArray(data.garments)) return { ok: false, error: 'La sauvegarde ne contient pas de liste de vêtements valide.' };

  const garments = data.garments as unknown[];
  const ids = new Set<string>();
  for (const [i, g] of garments.entries()) {
    if (!isObj(g) || !isStr(g.id) || !CATEGORIES.has(String(g.category))) {
      return { ok: false, error: `Le vêtement n°${i + 1} de la sauvegarde est incomplet ou abîmé. Rien n’a été importé.` };
    }
    ids.add(g.id);
  }
  const images = data.images ?? [];
  if (!Array.isArray(images)) return { ok: false, error: 'Les photos de la sauvegarde sont illisibles. Rien n’a été importé.' };
  const imageIds = new Set<string>();
  for (const [i, im] of (images as unknown[]).entries()) {
    if (!isObj(im) || !isStr(im.id) || !isStr(im.full) || !isStr(im.thumb) || !im.full.startsWith('data:image/') || !im.thumb.startsWith('data:image/')) {
      return { ok: false, error: `La photo n°${i + 1} de la sauvegarde est abîmée. Rien n’a été importé.` };
    }
    imageIds.add(im.id);
  }
  const outfits = data.outfits ?? [];
  if (!Array.isArray(outfits) || (outfits as unknown[]).some((o) => !isObj(o) || !isStr(o.id))) {
    return { ok: false, error: 'Les favoris de la sauvegarde sont illisibles. Rien n’a été importé.' };
  }
  const calendar = data.calendar ?? {};
  if (!isObj(calendar)) return { ok: false, error: 'Le calendrier de la sauvegarde est illisible. Rien n’a été importé.' };

  const warnings: string[] = [];
  const missingPhotos = (garments as Garment[]).filter((g) => g.imageId && !imageIds.has(g.imageId)).length;
  if (missingPhotos) warnings.push(`${missingPhotos} vêtement${missingPhotos > 1 ? 's' : ''} sans photo dans la sauvegarde.`);
  const brokenRefs = (outfits as SavedOutfit[]).filter((o) => slotIds(o.slots ?? { accessories: [] }).some((id) => !ids.has(id))).length;
  if (brokenRefs) warnings.push(`${brokenRefs} favori${brokenRefs > 1 ? 's' : ''} mentionne${brokenRefs > 1 ? 'nt' : ''} des pièces absentes : elles apparaîtront comme manquantes.`);

  return {
    ok: true,
    backup: data as unknown as BackupFile,
    summary: {
      garments: garments.length,
      outfits: (outfits as unknown[]).length,
      images: (images as unknown[]).length,
      days: Object.keys(calendar).length,
      warnings,
    },
  };
}

export async function exportBackup(): Promise<Blob> {
  const [garments, outfits, images, prefsRow] = await Promise.all([
    db.getAll<Garment>('garments'),
    db.getAll<SavedOutfit>('outfits'),
    db.getAll<ImageRecord>('images'),
    db.get<{ key: string; value: UserPreferences }>('kv', 'preferences'),
  ]);
  const file: BackupFile = {
    app: 'my-wardrobe',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    preferences: normalizePreferences(prefsRow?.value),
    garments,
    outfits,
    calendar: await loadCalendar(),
    images: await Promise.all(
      images.map(async (i) => ({
        id: i.id,
        full: await blobToDataUrl(i.full),
        thumb: await blobToDataUrl(i.thumb),
        width: i.width,
        height: i.height,
        createdAt: i.createdAt,
      })),
    ),
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Lit et valide un fichier sans rien écrire (pour afficher un résumé avant de confirmer). */
export async function readBackup(file: File): Promise<BackupValidation> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: "Ce fichier n'est pas une sauvegarde lisible (JSON invalide). Rien n’a été importé." };
  }
  return validateBackup(data);
}

export async function importBackup(backup: BackupFile): Promise<void> {
  // 1. décodage de toutes les photos en mémoire : en cas d'échec, rien n'est écrit
  let imageRecords: ImageRecord[];
  try {
    imageRecords = await Promise.all(
      (backup.images ?? []).map(async (i) => ({
        id: i.id,
        full: await dataUrlToBlob(i.full),
        thumb: await dataUrlToBlob(i.thumb),
        width: i.width,
        height: i.height,
        createdAt: i.createdAt,
      })),
    );
  } catch {
    throw new Error('Certaines photos de la sauvegarde n’ont pas pu être décodées. Rien n’a été importé.');
  }
  // 2. fusion du calendrier (les jours du fichier remplacent les mêmes jours)
  const calendar = { ...(await loadCalendar()), ...(backup.calendar ?? {}) };
  // 3. écriture atomique
  const kvRows: { key: string; value: unknown }[] = [{ key: 'calendar', value: calendar }];
  if (backup.preferences) kvRows.push({ key: 'preferences', value: normalizePreferences(backup.preferences) });
  await db.putAtomic([
    { store: 'images', values: imageRecords },
    { store: 'garments', values: backup.garments.map(normalizeGarment) },
    { store: 'outfits', values: (backup.outfits ?? []).map(normalizeOutfit) },
    { store: 'kv', values: kvRows },
  ]);
}

export async function deleteEverything(): Promise<void> {
  await Promise.all([db.clear('garments'), db.clear('images'), db.clear('outfits'), db.clear('kv')]);
}
