import { db, newId } from './db';
import { analyzePixels, type ColorAnalysis } from './colorAnalysis';

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
const THUMB_MAX = 480;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
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

function sizeOf(src: ImageBitmap | HTMLImageElement) {
  return 'naturalWidth' in src ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };
}

function draw(src: ImageBitmap | HTMLImageElement, max: number) {
  const { w, h } = sizeOf(src);
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ImageError('Le traitement d’image n’est pas disponible sur cet appareil.');
  ctx.fillStyle = '#ffffff'; // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError("L'image n'a pas pu être compressée."))), 'image/jpeg', quality),
  );
}

export interface ProcessedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  analysis: ColorAnalysis;
}

/** Redimensionne, compresse et analyse une photo (tout se fait sur l'appareil). */
export async function processImage(file: Blob): Promise<ProcessedImage> {
  if (file.type && !file.type.startsWith('image/')) throw new ImageError("Ce fichier n'est pas une image.");
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('Image trop lourde (30 Mo maximum).');
  const src = await decode(file);
  const { canvas: fullCanvas } = draw(src, FULL_MAX);
  const { canvas: thumbCanvas, ctx: thumbCtx } = draw(src, THUMB_MAX);
  if ('close' in src) src.close();
  const data = thumbCtx.getImageData(0, 0, thumbCanvas.width, thumbCanvas.height);
  const analysis = analyzePixels(data.data, thumbCanvas.width, thumbCanvas.height);
  const [full, thumb] = await Promise.all([toBlob(fullCanvas, 0.85), toBlob(thumbCanvas, 0.8)]);
  return { full, thumb, width: fullCanvas.width, height: fullCanvas.height, analysis };
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
