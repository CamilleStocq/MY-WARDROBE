import { nearestColor } from '../domain/colors';

export interface ColorAnalysis {
  primary: string | null;
  secondary: string[];
  /** part de l'image considérée comme le vêtement (0-1) ; faible = analyse peu fiable */
  coverage: number;
}

/**
 * Analyse simple et locale des couleurs d'une photo de vêtement :
 * 1. image détourée (fond transparent) : seuls les pixels opaques comptent ;
 *    sinon, la couleur du fond est estimée sur les bords et ignorée ;
 * 2. les pixels retenus sont associés au nuancier et comptés.
 * Elle ne devine ni la matière, ni la marque, ni la taille.
 */
export function analyzePixels(data: Uint8ClampedArray | number[], width: number, height: number): ColorAnalysis {
  const px = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
  };

  // 1. bords : couleur moyenne et part de pixels transparents
  let br = 0, bg = 0, bb = 0, bn = 0, transparentBorder = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 60));
  const sample = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const [r, g, b, a] = px(x, y);
    bn++;
    if (a < 128) {
      transparentBorder++;
      return;
    }
    br += r; bg += g; bb += b;
  };
  for (let x = 0; x < width; x += step) for (const y of [0, 1, height - 2, height - 1]) sample(x, y);
  for (let y = 0; y < height; y += step) for (const x of [0, 1, width - 2, width - 1]) sample(x, y);
  const cutout = bn > 0 && transparentBorder / bn > 0.5;
  const opaque = bn - transparentBorder;
  const bgc = opaque ? [br / opaque, bg / opaque, bb / opaque] : [255, 255, 255];

  // 2. comptage (zone centrale si photo brute, toute l'image si détourée)
  const counts = new Map<string, number>();
  let kept = 0;
  let total = 0;
  const x0 = cutout ? 0 : Math.floor(width * 0.15), x1 = cutout ? width : Math.ceil(width * 0.85);
  const y0 = cutout ? 0 : Math.floor(height * 0.1), y1 = cutout ? height : Math.ceil(height * 0.9);
  const inner = Math.max(1, Math.floor(Math.min(width, height) / 120));
  for (let y = y0; y < y1; y += inner) {
    for (let x = x0; x < x1; x += inner) {
      const [r, g, b, a] = px(x, y);
      if (cutout) {
        if (a < 128) continue;
        total++;
      } else {
        total++;
        const d = Math.abs(r - bgc[0]) + Math.abs(g - bgc[1]) + Math.abs(b - bgc[2]);
        if (d < 60) continue;
      }
      kept++;
      const key = nearestColor(r, g, b);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const coverage = total ? kept / total : 0;
  if (kept < 20) return { primary: null, secondary: [], coverage };
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const primary = sorted[0][0];
  const secondary = sorted
    .slice(1, 4)
    .filter(([, c]) => c / kept >= 0.12)
    .map(([k]) => k);
  return { primary, secondary, coverage };
}

/** Vrai si une part significative de l'image est transparente (photo détourée). */
export function hasTransparency(data: Uint8ClampedArray, minShare = 0.01): boolean {
  let n = 0;
  const pixels = data.length / 4;
  const stride = Math.max(1, Math.floor(pixels / 40000));
  let sampled = 0;
  for (let i = 0; i < pixels; i += stride) {
    sampled++;
    if (data[i * 4 + 3] < 250) n++;
  }
  return n / sampled >= minShare;
}
