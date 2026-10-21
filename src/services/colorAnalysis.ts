import { nearestColor } from '../domain/colors';

export interface ColorAnalysis {
  primary: string | null;
  secondary: string[];
  /** part de l'image considérée comme le vêtement (0-1) ; faible = analyse peu fiable */
  coverage: number;
}

/**
 * Analyse simple et locale des couleurs d'une photo de vêtement :
 * 1. estime la couleur du fond à partir des bords de l'image ;
 * 2. ignore les pixels proches du fond ;
 * 3. associe les pixels restants au nuancier et compte les occurrences.
 * Elle ne devine ni la matière, ni la marque, ni la taille.
 */
export function analyzePixels(data: Uint8ClampedArray | number[], width: number, height: number): ColorAnalysis {
  const px = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };

  // 1. fond : moyenne des pixels du pourtour
  let br = 0, bg = 0, bb = 0, bn = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 60));
  for (let x = 0; x < width; x += step) {
    for (const y of [0, 1, height - 2, height - 1]) {
      if (y < 0 || y >= height) continue;
      const [r, g, b] = px(x, y);
      br += r; bg += g; bb += b; bn++;
    }
  }
  for (let y = 0; y < height; y += step) {
    for (const x of [0, 1, width - 2, width - 1]) {
      if (x < 0 || x >= width) continue;
      const [r, g, b] = px(x, y);
      br += r; bg += g; bb += b; bn++;
    }
  }
  const bgc = bn ? [br / bn, bg / bn, bb / bn] : [255, 255, 255];

  // 2-3. comptage dans la zone centrale
  const counts = new Map<string, number>();
  let kept = 0;
  let total = 0;
  const x0 = Math.floor(width * 0.15), x1 = Math.ceil(width * 0.85);
  const y0 = Math.floor(height * 0.1), y1 = Math.ceil(height * 0.9);
  const inner = Math.max(1, Math.floor(Math.min(width, height) / 120));
  for (let y = y0; y < y1; y += inner) {
    for (let x = x0; x < x1; x += inner) {
      total++;
      const [r, g, b] = px(x, y);
      const d = Math.abs(r - bgc[0]) + Math.abs(g - bgc[1]) + Math.abs(b - bgc[2]);
      if (d < 60) continue;
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
