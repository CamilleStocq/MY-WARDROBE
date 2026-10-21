/**
 * Détourage automatique, exécuté sur l'appareil (@imgly/background-removal, licence AGPL-3.0).
 * La photo n'est jamais envoyée : seuls le modèle d'IA (« isnet_quint8 », ≈ 40 Mo) et le moteur
 * WebAssembly sont téléchargés une fois depuis le CDN d'IMG.LY, puis gardés en cache par le navigateur.
 * La bibliothèque est chargée à la demande pour ne pas alourdir le démarrage de l'application.
 */
export const BG_MODEL = 'isnet_quint8' as const;
export const BG_MODEL_SIZE_LABEL = '40 Mo';

export class BackgroundRemovalError extends Error {}

export interface RemovalProgress {
  phase: 'download' | 'process';
  /** 0 → 1, ou null si inconnu */
  ratio: number | null;
}

/** Renvoie le masque alpha (0 = fond, 255 = vêtement) à la taille de l'image fournie. */
export async function computeForegroundMask(
  image: Blob,
  width: number,
  height: number,
  onProgress?: (p: RemovalProgress) => void,
): Promise<Uint8ClampedArray> {
  let lib: typeof import('@imgly/background-removal');
  try {
    lib = await import('@imgly/background-removal');
  } catch {
    throw new BackgroundRemovalError('Le module de détourage n’a pas pu être chargé. Vérifiez votre connexion.');
  }

  let result: Blob;
  try {
    result = await lib.removeBackground(image, {
      model: BG_MODEL,
      output: { format: 'image/png', quality: 1 },
      progress: (key, current, total) => {
        onProgress?.({ phase: key.startsWith('fetch') ? 'download' : 'process', ratio: total > 0 ? current / total : null });
      },
    });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/fetch|network|load/i.test(msg)) {
      throw new BackgroundRemovalError('Le modèle de détourage n’a pas pu être téléchargé. Réessayez avec une connexion (Wi-Fi conseillé).');
    }
    if (/memory|allocation|OOM/i.test(msg)) {
      throw new BackgroundRemovalError('L’appareil manque de mémoire pour détourer cette photo. Fermez d’autres apps puis réessayez.');
    }
    throw new BackgroundRemovalError('Le détourage a échoué sur cette photo. Vous pouvez utiliser la gomme à la place.');
  }

  // Lecture du canal alpha du résultat, remis à la taille de travail.
  const bmp = await createImageBitmap(result);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];
  return mask;
}

/** Boîte englobante du vêtement (pixels opaques), avec une marge. */
export function maskBounds(mask: Uint8ClampedArray, width: number, height: number, margin = 0.04) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const m = Math.round(Math.max(maxX - minX, maxY - minY) * margin);
  const x = Math.max(0, minX - m);
  const y = Math.max(0, minY - m);
  return { x, y, w: Math.min(width, maxX + m + 1) - x, h: Math.min(height, maxY + m + 1) - y };
}
