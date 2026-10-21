/**
 * Nuancier de l'application. Chaque couleur a :
 *  - `tone` : neutral (va avec tout), soft (pastel / désaturé), bold (saturée)
 *  - `hue`  : teinte en degrés (null pour les neutres purs)
 *  - `temp` : chaude / froide / neutre (pour les sous-tons)
 */
export type ColorTone = 'neutral' | 'soft' | 'bold';

export interface ColorDef {
  key: string;
  label: string;
  hex: string;
  tone: ColorTone;
  hue: number | null;
  temp: 'warm' | 'cool' | 'neutral';
}

export const COLORS: ColorDef[] = [
  { key: 'noir', label: 'Noir', hex: '#1F1E21', tone: 'neutral', hue: null, temp: 'neutral' },
  { key: 'blanc', label: 'Blanc', hex: '#F8F7F4', tone: 'neutral', hue: null, temp: 'neutral' },
  { key: 'ecru', label: 'Écru', hex: '#EEE6D6', tone: 'neutral', hue: 40, temp: 'warm' },
  { key: 'gris-clair', label: 'Gris clair', hex: '#C9C8C6', tone: 'neutral', hue: null, temp: 'neutral' },
  { key: 'gris', label: 'Gris anthracite', hex: '#55545A', tone: 'neutral', hue: null, temp: 'cool' },
  { key: 'beige', label: 'Beige', hex: '#D8C4A8', tone: 'neutral', hue: 35, temp: 'warm' },
  { key: 'camel', label: 'Camel', hex: '#B9864F', tone: 'neutral', hue: 30, temp: 'warm' },
  { key: 'marron', label: 'Chocolat', hex: '#5E3E2B', tone: 'neutral', hue: 22, temp: 'warm' },
  { key: 'marine', label: 'Bleu marine', hex: '#1F2A44', tone: 'neutral', hue: 222, temp: 'cool' },
  { key: 'denim', label: 'Bleu jean', hex: '#4A6A8F', tone: 'neutral', hue: 212, temp: 'cool' },
  { key: 'kaki', label: 'Kaki', hex: '#6E6B44', tone: 'neutral', hue: 58, temp: 'warm' },

  { key: 'bleu-ciel', label: 'Bleu ciel', hex: '#AFCBE3', tone: 'soft', hue: 205, temp: 'cool' },
  { key: 'sauge', label: 'Vert sauge', hex: '#A9BFA4', tone: 'soft', hue: 110, temp: 'cool' },
  { key: 'rose-poudre', label: 'Rose poudré', hex: '#EBC3C3', tone: 'soft', hue: 0, temp: 'warm' },
  { key: 'lilas', label: 'Lilas', hex: '#C9B8E4', tone: 'soft', hue: 265, temp: 'cool' },
  { key: 'jaune-pale', label: 'Jaune pâle', hex: '#F2E3A0', tone: 'soft', hue: 50, temp: 'warm' },
  { key: 'peche', label: 'Pêche', hex: '#F4C0A1', tone: 'soft', hue: 22, temp: 'warm' },

  { key: 'rouge', label: 'Rouge', hex: '#C92A2F', tone: 'bold', hue: 358, temp: 'warm' },
  { key: 'bordeaux', label: 'Bordeaux', hex: '#6D1F2E', tone: 'bold', hue: 348, temp: 'warm' },
  { key: 'rose-vif', label: 'Rose vif', hex: '#E0457B', tone: 'bold', hue: 338, temp: 'cool' },
  { key: 'corail', label: 'Corail', hex: '#F2765A', tone: 'bold', hue: 12, temp: 'warm' },
  { key: 'orange', label: 'Orange / rouille', hex: '#C8612A', tone: 'bold', hue: 22, temp: 'warm' },
  { key: 'moutarde', label: 'Moutarde', hex: '#C99A2E', tone: 'bold', hue: 42, temp: 'warm' },
  { key: 'jaune', label: 'Jaune', hex: '#F1C93B', tone: 'bold', hue: 48, temp: 'warm' },
  { key: 'vert', label: 'Vert émeraude', hex: '#1F7A5A', tone: 'bold', hue: 158, temp: 'cool' },
  { key: 'olive', label: 'Vert olive', hex: '#7C8A3A', tone: 'bold', hue: 70, temp: 'warm' },
  { key: 'bleu-roi', label: 'Bleu roi', hex: '#2F4FB5', tone: 'bold', hue: 226, temp: 'cool' },
  { key: 'violet', label: 'Violet / prune', hex: '#5E3A78', tone: 'bold', hue: 276, temp: 'cool' },
  { key: 'dore', label: 'Doré', hex: '#C8A85A', tone: 'neutral', hue: 44, temp: 'warm' },
  { key: 'argent', label: 'Argenté', hex: '#B8BBC0', tone: 'neutral', hue: null, temp: 'cool' },
];

const BY_KEY = new Map(COLORS.map((c) => [c.key, c]));

export function getColor(key: string): ColorDef {
  return BY_KEY.get(key) ?? { key, label: key, hex: '#999999', tone: 'neutral', hue: null, temp: 'neutral' };
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ---------- conversions (pour l'analyse de photo) ----------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const PALETTE_LAB = COLORS.filter((c) => c.key !== 'dore' && c.key !== 'argent').map((c) => ({
  key: c.key,
  lab: rgbToLab(...hexToRgb(c.hex)),
}));

/** Couleur du nuancier la plus proche (distance ΔE76 dans l'espace Lab). */
export function nearestColor(r: number, g: number, b: number): string {
  const lab = rgbToLab(r, g, b);
  let best = PALETTE_LAB[0].key;
  let bestD = Infinity;
  for (const p of PALETTE_LAB) {
    const d = (lab[0] - p.lab[0]) ** 2 + (lab[1] - p.lab[1]) ** 2 + (lab[2] - p.lab[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p.key;
    }
  }
  return best;
}
