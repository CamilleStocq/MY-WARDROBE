import type { Garment } from '../domain/types';
import { normalizeGarment } from '../domain/normalize';
import { db, newId } from './db';
import { deleteImage, getImageRecord, putImageRecord, type ImageRecord } from './imageService';

export async function listGarments(): Promise<Garment[]> {
  const rows = await db.getAll<Garment>('garments');
  return rows.map(normalizeGarment).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createGarment(data: Omit<Garment, 'id' | 'schemaVersion' | 'createdAt' | 'updatedAt'>): Promise<Garment> {
  const now = new Date().toISOString();
  const g = normalizeGarment({ ...data, id: newId(), createdAt: now, updatedAt: now });
  await db.put('garments', g);
  return g;
}

export async function updateGarment(g: Garment): Promise<Garment> {
  const next = normalizeGarment({ ...g, updatedAt: new Date().toISOString() });
  await db.put('garments', next);
  return next;
}

export interface DeletedGarment {
  garment: Garment;
  image: ImageRecord | undefined;
}

/** Supprime un vêtement et sa photo ; renvoie de quoi annuler. */
export async function deleteGarment(g: Garment): Promise<DeletedGarment> {
  const image = g.imageId ? await getImageRecord(g.imageId) : undefined;
  await db.delete('garments', g.id);
  if (g.imageId) await deleteImage(g.imageId);
  return { garment: g, image };
}

export async function restoreGarment(d: DeletedGarment): Promise<void> {
  if (d.image) await putImageRecord(d.image);
  await db.put('garments', d.garment);
}
