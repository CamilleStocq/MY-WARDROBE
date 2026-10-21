import type { Garment, Pattern } from '../domain/types';
import { getColor } from '../domain/colors';
import { db, newId } from './db';
import { createGarment, deleteGarment } from './garmentService';
import type { ImageRecord } from './imageService';

/**
 * Dressing de DÉMONSTRATION : illustrations vectorielles (pas de photos),
 * marquées `isDemo` et supprimables en un geste. Sert à découvrir l'application
 * avant d'avoir photographié ses propres vêtements.
 */
const SHAPES: Record<string, string> = {
  tshirt: 'M140 90 L95 112 L58 175 L100 200 L122 172 L122 420 L278 420 L278 172 L300 200 L342 175 L305 112 L260 90 Q200 132 140 90 Z',
  top: 'M150 100 L130 110 L125 420 L275 420 L270 110 L250 100 Q200 150 150 100 Z',
  chemise: 'M145 85 L95 110 L60 320 L98 330 L122 200 L122 425 L278 425 L278 200 L302 330 L340 320 L305 110 L255 85 L200 120 Z',
  blouse: 'M145 85 L95 110 L60 320 L98 330 L122 200 L118 425 L282 425 L278 200 L302 330 L340 320 L305 110 L255 85 Q200 130 145 85 Z',
  pull: 'M140 88 L92 112 L58 330 L98 340 L122 200 L122 425 L278 425 L278 200 L302 340 L342 330 L308 112 L260 88 Q200 128 140 88 Z',
  sweat: 'M138 88 L88 112 L55 335 L98 345 L120 205 L120 425 L280 425 L280 205 L302 345 L345 335 L312 112 L262 88 Q200 125 138 88 Z',
  cardigan: 'M140 88 L92 112 L58 330 L98 340 L122 200 L122 425 L195 425 L200 130 L205 425 L278 425 L278 200 L302 340 L342 330 L308 112 L260 88 L200 130 Z',
  jean: 'M130 75 L270 75 L288 430 L222 430 L200 185 L178 430 L112 430 Z',
  pantalon: 'M132 75 L268 75 L282 430 L220 430 L200 185 L180 430 L118 430 Z',
  legging: 'M140 75 L260 75 L262 430 L215 430 L200 185 L185 430 L138 430 Z',
  short: 'M130 130 L270 130 L288 320 L218 320 L200 215 L182 320 L112 320 Z',
  jupe: 'M152 100 L248 100 L305 390 L95 390 Z',
  robe: 'M162 62 L182 62 Q200 92 218 62 L238 62 L248 185 L305 435 L95 435 L152 185 Z',
  combinaison: 'M150 70 L250 70 L262 230 L285 435 L218 435 L200 260 L182 435 L115 435 L138 230 Z',
  veste: 'M140 80 L90 105 L58 330 L98 338 L118 210 L120 380 L280 380 L282 210 L302 338 L342 330 L310 105 L260 80 L200 165 Z',
  blazer: 'M140 80 L90 105 L58 340 L98 348 L118 210 L120 400 L280 400 L282 210 L302 348 L342 340 L310 105 L260 80 L200 200 Z',
  manteau: 'M140 66 L88 92 L56 390 L98 396 L116 210 L118 460 L282 460 L284 210 L302 396 L344 390 L312 92 L260 66 L200 175 Z',
  doudoune: 'M135 70 L82 98 L52 360 L100 368 L116 215 L114 420 L286 420 L284 215 L300 368 L348 360 L318 98 L265 70 Q200 110 135 70 Z',
  impermeable: 'M140 66 L88 92 L56 390 L98 396 L116 210 L114 455 L286 455 L284 210 L302 396 L344 390 L312 92 L260 66 L200 170 Z',
  baskets: 'M62 300 L84 222 L170 212 L232 258 L322 276 Q352 288 346 322 L62 322 Z',
  bottines: 'M108 120 L196 120 L200 268 L300 288 Q334 300 328 330 L104 330 Z',
  bottes: 'M118 50 L200 50 L204 272 L300 290 Q334 302 328 332 L112 332 Z',
  mocassins: 'M60 300 L92 252 L200 240 L310 268 Q348 282 342 318 L60 318 Z',
  habillees: 'M60 305 L95 255 L190 245 L300 280 Q340 292 340 318 L250 318 L240 300 L120 300 L110 318 L60 318 Z',
  sandales: 'M60 320 L340 320 L340 305 L60 305 Z M120 305 L160 250 L200 305 M200 305 L240 250 L280 305',
  sac: 'M100 200 L300 200 L320 420 L80 420 Z M150 200 Q150 110 200 110 Q250 110 250 200',
  echarpe: 'M150 60 L250 60 L250 350 L280 440 L220 440 L200 360 L180 440 L120 440 L150 350 Z',
  bonnet: 'M110 300 Q110 140 200 140 Q290 140 290 300 Z M100 300 L300 300 L300 345 L100 345 Z',
  ceinture: 'M40 230 L360 230 L360 270 L40 270 Z',
  bijou: 'M200 140 m-80 0 a80 80 0 1 0 160 0 a80 80 0 1 0 -160 0',
};

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

function patternDef(pattern: Pattern, base: string, accent: string): string {
  switch (pattern) {
    case 'rayures':
      return `<pattern id="p" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="${base}"/><rect width="22" height="7" fill="${accent}"/></pattern>`;
    case 'carreaux':
      return `<pattern id="p" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="36" height="36" fill="${base}"/><rect width="36" height="10" fill="${accent}" opacity=".55"/><rect width="10" height="36" fill="${accent}" opacity=".55"/></pattern>`;
    case 'floral':
    case 'pois':
    case 'imprime':
      return `<pattern id="p" width="34" height="34" patternUnits="userSpaceOnUse"><rect width="34" height="34" fill="${base}"/><circle cx="9" cy="9" r="${pattern === 'pois' ? 4 : 6}" fill="${accent}"/><circle cx="26" cy="25" r="${pattern === 'pois' ? 4 : 5}" fill="${accent}" opacity=".8"/></pattern>`;
    default:
      return '';
  }
}

export function demoSvg(subcategory: string, color: string, pattern: Pattern = 'uni', accentColor = 'blanc'): string {
  const base = getColor(color).hex;
  const accent = getColor(accentColor).hex;
  const d = SHAPES[subcategory] ?? SHAPES.top;
  const fill = pattern !== 'uni' ? 'url(#p)' : base;
  const stroke = shade(base, -45);
  const isOpen = subcategory === 'sandales' || subcategory === 'sac' || subcategory === 'bonnet';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs>${patternDef(pattern, base, accent)}</defs><path d="${d}" fill="${isOpen && subcategory === 'sandales' ? 'none' : fill}" stroke="${stroke}" stroke-width="${isOpen ? 14 : 4}" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

type DemoDef = Pick<Garment, 'name' | 'category' | 'subcategory' | 'primaryColor' | 'pattern' | 'warmth' | 'styles' | 'formality'> &
  Partial<Pick<Garment, 'secondaryColors' | 'silhouette' | 'waterproof' | 'seasons' | 'material'>>;

const DEMO: DemoDef[] = [
  { name: 'T-shirt blanc', category: 'top', subcategory: 'tshirt', primaryColor: 'blanc', pattern: 'uni', warmth: 1, styles: ['casual', 'minimaliste'], formality: 1, silhouette: 'droit' },
  { name: 'Chemise rayée', category: 'top', subcategory: 'chemise', primaryColor: 'bleu-ciel', secondaryColors: ['blanc'], pattern: 'rayures', warmth: 2, styles: ['casual', 'chic'], formality: 2, silhouette: 'ample' },
  { name: 'Top lilas', category: 'top', subcategory: 'top', primaryColor: 'lilas', pattern: 'uni', warmth: 1, styles: ['romantique', 'casual'], formality: 2, silhouette: 'ajuste' },
  { name: 'Pull camel', category: 'top', subcategory: 'pull', primaryColor: 'camel', pattern: 'uni', warmth: 3, styles: ['casual', 'chic'], formality: 2, silhouette: 'ample', material: 'Laine' },
  { name: 'Cardigan écru', category: 'top', subcategory: 'cardigan', primaryColor: 'ecru', pattern: 'uni', warmth: 2, styles: ['casual', 'romantique'], formality: 1 },
  { name: 'Sweat gris chiné', category: 'top', subcategory: 'sweat', primaryColor: 'gris-clair', pattern: 'uni', warmth: 3, styles: ['streetwear', 'casual', 'sportif'], formality: 1, silhouette: 'ample' },
  { name: 'Jean droit', category: 'bottom', subcategory: 'jean', primaryColor: 'denim', pattern: 'uni', warmth: 2, styles: ['casual', 'streetwear'], formality: 1, silhouette: 'droit' },
  { name: 'Pantalon noir', category: 'bottom', subcategory: 'pantalon', primaryColor: 'noir', pattern: 'uni', warmth: 2, styles: ['chic', 'professionnel', 'minimaliste'], formality: 2, silhouette: 'ajuste' },
  { name: 'Jupe midi bordeaux', category: 'bottom', subcategory: 'jupe', primaryColor: 'bordeaux', pattern: 'uni', warmth: 1, styles: ['chic', 'romantique'], formality: 2 },
  { name: 'Short écru', category: 'bottom', subcategory: 'short', primaryColor: 'ecru', pattern: 'uni', warmth: 1, styles: ['casual'], formality: 1, seasons: ['printemps', 'ete'] },
  { name: 'Robe fleurie', category: 'onepiece', subcategory: 'robe', primaryColor: 'rose-poudre', secondaryColors: ['sauge'], pattern: 'floral', warmth: 2, styles: ['romantique', 'boheme'], formality: 2, seasons: ['printemps', 'ete'] },
  { name: 'Manteau camel', category: 'outerwear', subcategory: 'manteau', primaryColor: 'camel', pattern: 'uni', warmth: 4, styles: ['chic', 'casual'], formality: 2, seasons: ['automne', 'hiver'] },
  { name: 'Trench imperméable', category: 'outerwear', subcategory: 'impermeable', primaryColor: 'kaki', pattern: 'uni', warmth: 2, styles: ['casual', 'chic'], formality: 2, waterproof: true },
  { name: 'Blazer noir', category: 'outerwear', subcategory: 'blazer', primaryColor: 'noir', pattern: 'uni', warmth: 2, styles: ['chic', 'professionnel'], formality: 3, silhouette: 'droit' },
  { name: 'Baskets blanches', category: 'shoes', subcategory: 'baskets', primaryColor: 'blanc', pattern: 'uni', warmth: 2, styles: ['casual', 'streetwear', 'sportif'], formality: 1 },
  { name: 'Bottines chocolat', category: 'shoes', subcategory: 'bottines', primaryColor: 'marron', pattern: 'uni', warmth: 3, styles: ['casual', 'chic'], formality: 2, material: 'Cuir' },
  { name: 'Mocassins noirs', category: 'shoes', subcategory: 'mocassins', primaryColor: 'noir', pattern: 'uni', warmth: 2, styles: ['chic', 'professionnel'], formality: 2 },
  { name: 'Sandales beige', category: 'shoes', subcategory: 'sandales', primaryColor: 'beige', pattern: 'uni', warmth: 1, styles: ['casual', 'boheme'], formality: 1, seasons: ['ete'] },
  { name: 'Sac cabas noir', category: 'accessory', subcategory: 'sac', primaryColor: 'noir', pattern: 'uni', warmth: 1, styles: ['chic', 'minimaliste'], formality: 2 },
  { name: 'Écharpe bordeaux', category: 'accessory', subcategory: 'echarpe', primaryColor: 'bordeaux', pattern: 'uni', warmth: 3, styles: ['casual'], formality: 1, seasons: ['automne', 'hiver'] },
];

export async function loadDemoWardrobe(): Promise<number> {
  for (const d of DEMO) {
    const svg = demoSvg(d.subcategory, d.primaryColor, d.pattern, d.secondaryColors?.[0]);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const imageId = newId();
    await db.put<ImageRecord>('images', { id: imageId, full: blob, thumb: blob, width: 400, height: 500, createdAt: new Date().toISOString() });
    await createGarment({
      secondaryColors: [],
      seasons: [],
      material: '',
      silhouette: null,
      waterproof: false,
      notes: '',
      ...d,
      imageId,
      availability: 'available',
      isDemo: true,
    });
  }
  return DEMO.length;
}

export async function removeDemoWardrobe(garments: Garment[]): Promise<void> {
  for (const g of garments.filter((x) => x.isDemo)) await deleteGarment(g);
}
