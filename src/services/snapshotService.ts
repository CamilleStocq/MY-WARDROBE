import type { Garment, SavedOutfit, UserPreferences } from '../domain/types';
import { normalizeGarment, normalizeOutfit, normalizePreferences } from '../domain/normalize';
import { db, kv, newId } from './db';
import { loadCalendar, type Calendar } from './calendarService';
import { deleteImage } from './imageService';

/**
 * Copies internes automatiques : une copie des données est enregistrée DANS l'app
 * à chaque ouverture (si quelque chose a changé depuis la précédente).
 *
 * - Les photos ne sont pas dupliquées : une copie référence les photos existantes,
 *   qui ne sont supprimées que lorsque plus aucun vêtement ni aucune copie ne les utilise.
 * - Protège contre les erreurs (pièce supprimée, mauvaise restauration…), mais PAS
 *   contre la suppression de l'app : seul un fichier exporté protège de ce cas.
 */
export const MAX_SNAPSHOTS = 10;
const INDEX_KEY = 'snapshots:index';
const snapKey = (id: string) => `snapshot:${id}`;

export interface SnapshotMeta {
  id: string;
  createdAt: string;
  garments: number;
  outfits: number;
  days: number;
  /** empreinte du contenu, pour ne pas créer de copie identique à la précédente */
  hash: string;
  imageIds: string[];
}

interface SnapshotData {
  id: string;
  garments: Garment[];
  outfits: SavedOutfit[];
  calendar: Calendar;
  preferences: UserPreferences | null;
}

// ---------- fonctions pures (testées) ----------

/** Empreinte rapide et stable d'une chaîne (FNV-1a 32 bits). */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Contenu canonique (ordre stable) servant à calculer l'empreinte. */
export function canonical(garments: Garment[], outfits: SavedOutfit[], calendar: Calendar, preferences: unknown): string {
  const byId = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id));
  const days = Object.keys(calendar)
    .sort()
    .map((k) => [k, calendar[k].slots]);
  return JSON.stringify([byId(garments), byId(outfits), days, preferences]);
}

/** Copies à supprimer pour n'en garder que `max` (les plus récentes). */
export function snapshotsToPrune(index: SnapshotMeta[], max = MAX_SNAPSHOTS): SnapshotMeta[] {
  return [...index].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(max);
}

/** Photos qui ne sont plus utilisées ni par un vêtement, ni par une copie. */
export function unreferencedImages(candidates: string[], garments: Garment[], index: SnapshotMeta[]): string[] {
  const used = new Set<string>([...garments.map((g) => g.imageId).filter((x): x is string => !!x), ...index.flatMap((s) => s.imageIds)]);
  return candidates.filter((id) => !used.has(id));
}

// ---------- stockage ----------

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const index = (await kv.get<SnapshotMeta[]>(INDEX_KEY)) ?? [];
  return [...index].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function currentData() {
  const [garments, outfits, calendar, prefsRow] = await Promise.all([
    db.getAll<Garment>('garments'),
    db.getAll<SavedOutfit>('outfits'),
    loadCalendar(),
    db.get<{ key: string; value: UserPreferences }>('kv', 'preferences'),
  ]);
  return { garments, outfits, calendar, preferences: prefsRow?.value ?? null };
}

/**
 * Crée une copie si les données ont changé depuis la dernière.
 * Renvoie la copie créée, ou null si rien n'a changé (ou si la garde-robe est vide).
 */
export async function takeSnapshot(opts: { force?: boolean } = {}): Promise<SnapshotMeta | null> {
  const data = await currentData();
  if (!data.garments.length && !data.outfits.length) return null;
  const hash = fingerprint(canonical(data.garments, data.outfits, data.calendar, data.preferences));
  const index = await listSnapshots();
  if (!opts.force && index[0]?.hash === hash) return null;

  const meta: SnapshotMeta = {
    id: newId(),
    createdAt: new Date().toISOString(),
    garments: data.garments.length,
    outfits: data.outfits.length,
    days: Object.keys(data.calendar).length,
    hash,
    imageIds: data.garments.map((g) => g.imageId).filter((x): x is string => !!x),
  };
  const snap: SnapshotData = { id: meta.id, ...data };
  await kv.set(snapKey(meta.id), snap);
  let next = [meta, ...index];
  const pruned = snapshotsToPrune(next);
  next = next.filter((s) => !pruned.includes(s));
  await kv.set(INDEX_KEY, next);
  for (const p of pruned) await kv.del(snapKey(p.id));
  // photos qui n'étaient plus retenues que par les copies supprimées
  const orphan = unreferencedImages(
    pruned.flatMap((p) => p.imageIds),
    data.garments,
    next,
  );
  for (const id of new Set(orphan)) await db.delete('images', id);
  return meta;
}

/** Vrai si une copie interne utilise encore cette photo. */
export async function imageHeldBySnapshot(imageId: string): Promise<boolean> {
  return (await listSnapshots()).some((s) => s.imageIds.includes(imageId));
}

/**
 * Revient à une copie : l'état actuel est d'abord copié (opération réversible),
 * puis vêtements, favoris, calendrier et préférences sont remplacés en une transaction.
 */
export async function restoreSnapshot(id: string): Promise<void> {
  const snap = await kv.get<SnapshotData>(snapKey(id));
  if (!snap) throw new Error('Cette copie est introuvable.');
  // l'état actuel est copié s'il diffère de la dernière copie (sinon il y est déjà)
  await takeSnapshot();
  await db.replaceAtomic({
    clear: ['garments', 'outfits'],
    writes: [
      { store: 'garments', values: snap.garments.map(normalizeGarment) },
      { store: 'outfits', values: snap.outfits.map(normalizeOutfit) },
      {
        store: 'kv',
        values: [
          { key: 'calendar', value: snap.calendar ?? {} },
          ...(snap.preferences ? [{ key: 'preferences', value: normalizePreferences(snap.preferences) }] : []),
        ],
      },
    ],
  });
}

/** Supprime une photo seulement si aucune copie interne ne l'utilise encore. */
export async function releaseImage(imageId: string): Promise<void> {
  if (await imageHeldBySnapshot(imageId)) return;
  await deleteImage(imageId);
}
