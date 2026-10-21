import { db, newId } from './db';
import { analyzePixels, hasTransparency, type ColorAnalysis } from './colorAnalysis';

export interface ImageRecord {
  id: string;
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  createdAt: string;
}

export class ImageError extends Error {}

const FULL_MAX = 1400;
/** les PNG détourés sont plus lourds : on limite un peu leur taille */
const FULL_MAX_CUTOUT = 1200;
const THUMB_MAX = 480;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

export async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* repli sur <img> (certains formats / anciens Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new ImageError("Cette image n'a pas pu être lue. Essayez un fichier JPEG ou PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function sizeOf(src: ImageBitmap | HTMLImageElement | HTMLCanvasElement) {
  return 'naturalWidth' in src ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };
}

/** Dessine l'image réduite à `max` px. `background` : couleur de fond, ou null pour garder la transparence. */
export function draw(src: CanvasImageSource & (ImageBitmap | HTMLImageElement | HTMLCanvasElement), max: number, background: string | null = '#ffffff') {
  const { w, h } = sizeOf(src);
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ImageError('Le traitement d’image n’est pas disponible sur cet appareil.');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

export function toBlob(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png', quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError("L'image n'a pas pu être compressée."))), type, quality),
  );
}

export interface ProcessedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  analysis: ColorAnalysis;
  /** fond transparent (photo détourée) */
  cutout: boolean;
}

/**
 * Redimensionne, compresse et analyse une photo (tout se fait sur l'appareil).
 * Une image avec transparence (détourée dans l'app ou via iOS « Copier le sujet »)
 * est conservée en PNG ; une photo classique est compressée en JPEG.
 */
export async function processImage(file: Blob): Promise<ProcessedImage> {
  if (file.type && !file.type.startsWith('image/')) throw new ImageError("Ce fichier n'est pas une image.");
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('Image trop lourde (30 Mo maximum).');
  const src = await decode(file);
  try {
    const probe = draw(src, THUMB_MAX, null);
    const probeData = probe.ctx.getImageData(0, 0, probe.canvas.width, probe.canvas.height).data;
    const cutout = hasTransparency(probeData);
    const bg = cutout ? null : '#ffffff';
    const { canvas: fullCanvas } = draw(src, cutout ? FULL_MAX_CUTOUT : FULL_MAX, bg);
    const thumbCanvas = cutout ? probe.canvas : draw(src, THUMB_MAX, bg).canvas;
    const analysis = analyzePixels(probeData, probe.canvas.width, probe.canvas.height);
    const type = cutout ? 'image/png' : 'image/jpeg';
    const [full, thumb] = await Promise.all([toBlob(fullCanvas, type, 0.85), toBlob(thumbCanvas, type, 0.8)]);
    return { full, thumb, width: fullCanvas.width, height: fullCanvas.height, analysis, cutout };
  } finally {
    if ('close' in src) src.close();
  }
}

export async function saveImage(img: { full: Blob; thumb: Blob; width: number; height: number }): Promise<string> {
  const id = newId();
  await db.put<ImageRecord>('images', { id, ...img, createdAt: new Date().toISOString() });
  return id;
}

export async function getImageRecord(id: string): Promise<ImageRecord | undefined> {
  return db.get<ImageRecord>('images', id);
}

export async function putImageRecord(rec: ImageRecord): Promise<void> {
  await db.put('images', rec);
}

// Cache des URL d'objets pour éviter de relire IndexedDB à chaque rendu.
const urlCache = new Map<string, Promise<string | null>>();

export function imageUrl(id: string, size: 'thumb' | 'full'): Promise<string | null> {
  const key = `${id}:${size}`;
  let p = urlCache.get(key);
  if (!p) {
    p = getImageRecord(id)
      .then((rec) => (rec ? URL.createObjectURL(size === 'thumb' ? rec.thumb : rec.full) : null))
      .catch(() => null);
    urlCache.set(key, p);
  }
  return p;
}

export async function deleteImage(id: string): Promise<void> {
  for (const size of ['thumb', 'full'] as const) {
    const key = `${id}:${size}`;
    const p = urlCache.get(key);
    if (p) {
      urlCache.delete(key);
      p.then((u) => u && URL.revokeObjectURL(u));
    }
  }
  await db.delete('images', id);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
