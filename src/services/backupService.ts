import type { Garment, SavedOutfit, UserPreferences } from '../domain/types';
import { normalizeGarment, normalizeOutfit, normalizePreferences } from '../domain/normalize';
import { db } from './db';
import { blobToDataUrl, dataUrlToBlob, type ImageRecord } from './imageService';
import { loadCalendar, replaceCalendar, type Calendar } from './calendarService';

/**
 * Sauvegarde complète (vêtements + photos + favoris + préférences) dans un
 * fichier JSON. Utile tant que les données ne sont stockées que sur l'appareil.
 */
interface BackupFile {
  app: 'my-wardrobe';
  version: 1;
  exportedAt: string;
  preferences: UserPreferences;
  garments: Garment[];
  outfits: SavedOutfit[];
  calendar?: Calendar;
  images: { id: string; full: string; thumb: string; width: number; height: number; createdAt: string }[];
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
    version: 1,
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

export async function importBackup(file: File): Promise<{ garments: number; outfits: number }> {
  let data: BackupFile;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde lisible.");
  }
  if (data?.app !== 'my-wardrobe' || !Array.isArray(data.garments)) {
    throw new Error("Ce fichier n'est pas une sauvegarde My Wardrobe.");
  }
  for (const i of data.images ?? []) {
    await db.put<ImageRecord>('images', {
      id: i.id,
      full: await dataUrlToBlob(i.full),
      thumb: await dataUrlToBlob(i.thumb),
      width: i.width,
      height: i.height,
      createdAt: i.createdAt,
    });
  }
  for (const g of data.garments) await db.put('garments', normalizeGarment(g));
  for (const o of data.outfits ?? []) await db.put('outfits', normalizeOutfit(o));
  if (data.calendar) await replaceCalendar({ ...(await loadCalendar()), ...data.calendar });
  if (data.preferences) await db.put('kv', { key: 'preferences', value: normalizePreferences(data.preferences) });
  return { garments: data.garments.length, outfits: data.outfits?.length ?? 0 };
}

export async function deleteEverything(): Promise<void> {
  await Promise.all([db.clear('garments'), db.clear('images'), db.clear('outfits'), db.clear('kv')]);
}
