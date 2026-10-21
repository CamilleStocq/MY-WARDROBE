import type { Garment } from '../domain/types';
import { getColor } from '../domain/colors';

/**
 * BASE ÉDITORIALE DE TENDANCES
 * ----------------------------------------------------------------------------
 * Ces règles ne proviennent PAS d'une source de tendances en temps réel.
 * Elles ont été rédigées manuellement et sont séparées en deux familles :
 *  - `timeless` : principes de stylisme intemporels ;
 *  - `seasonal` : inspirations éditoriales de saison, à revoir chaque saison.
 * Pour les mettre à jour : modifier ce fichier (ou, plus tard, le charger depuis
 * un fichier distant versionné). L'interface affiche toujours ce libellé.
 */
export const TREND_BASE = {
  label: 'Base éditoriale',
  season: 'Automne-hiver 2026-2027',
  writtenAt: '2026-10-21',
  disclaimer:
    'Inspirations rédigées manuellement, non synchronisées avec une source de tendances en temps réel.',
};

export interface OutfitView {
  top?: Garment;
  mid?: Garment;
  bottom?: Garment;
  onepiece?: Garment;
  outer?: Garment;
  shoes?: Garment;
  accessories: Garment[];
}

export interface TrendRule {
  id: string;
  kind: 'timeless' | 'seasonal';
  label: string;
  /** phrase affichée dans « Pourquoi ce look ? » */
  explain: string;
  test: (o: OutfitView) => boolean;
}

const body = (o: OutfitView) => [o.top, o.mid, o.bottom, o.onepiece, o.outer].filter((g): g is Garment => !!g);
const colorsOf = (o: OutfitView) => [...body(o), o.shoes].filter((g): g is Garment => !!g).map((g) => g.primaryColor);
const has = (o: OutfitView, keys: string[]) => colorsOf(o).some((c) => keys.includes(c));

export const TREND_RULES: TrendRule[] = [
  {
    id: 'tonal',
    kind: 'timeless',
    label: 'Ton sur ton',
    explain: 'Silhouette ton sur ton : elle allonge et paraît pensée.',
    test: (o) => {
      const cs = new Set(colorsOf(o));
      const groups = new Set([...cs].map((c) => getColor(c).hue === null ? c : Math.round((getColor(c).hue ?? 0) / 30)));
      return cs.size >= 3 && groups.size <= 2;
    },
  },
  {
    id: 'volume-balance',
    kind: 'timeless',
    label: 'Jeu de volumes',
    explain: 'Une pièce ample équilibrée par une pièce ajustée : proportions maîtrisées.',
    test: (o) => {
      const up = [o.top, o.mid, o.outer].filter(Boolean).map((g) => g!.silhouette);
      const down = o.bottom?.silhouette;
      return !!down && ((up.includes('ample') && down === 'ajuste') || (up.includes('ajuste') && down === 'ample'));
    },
  },
  {
    id: 'statement',
    kind: 'timeless',
    label: 'Une pièce forte',
    explain: 'Une seule pièce à motif sert de point focal, le reste l’accompagne.',
    test: (o) => body(o).filter((g) => g.pattern !== 'uni').length === 1,
  },
  {
    id: 'brown-burgundy',
    kind: 'seasonal',
    label: 'Bordeaux & chocolat',
    explain: 'Inspiration éditoriale de saison : l’accord bordeaux / brun profond.',
    test: (o) => has(o, ['bordeaux']) && has(o, ['marron', 'camel']),
  },
  {
    id: 'warm-neutrals',
    kind: 'seasonal',
    label: 'Neutres chauds',
    explain: 'Inspiration éditoriale de saison : camel, chocolat et écru superposés.',
    test: (o) => colorsOf(o).filter((c) => ['camel', 'marron', 'ecru', 'beige'].includes(c)).length >= 2,
  },
  {
    id: 'red-accent',
    kind: 'seasonal',
    label: 'Touche de rouge',
    explain: 'Inspiration éditoriale : une touche de rouge sur une base neutre.',
    test: (o) => {
      const all = [...colorsOf(o), ...o.accessories.map((a) => a.primaryColor)];
      const reds = all.filter((c) => c === 'rouge' || c === 'bordeaux').length;
      return reds === 1 && all.filter((c) => getColor(c).tone === 'bold').length === 1;
    },
  },
  {
    id: 'relaxed-tailoring',
    kind: 'seasonal',
    label: 'Tailoring décontracté',
    explain: 'Inspiration éditoriale : un blazer porté avec du denim ou des baskets.',
    test: (o) => o.outer?.subcategory === 'blazer' && (o.bottom?.subcategory === 'jean' || o.shoes?.subcategory === 'baskets'),
  },
  {
    id: 'knit-layering',
    kind: 'seasonal',
    label: 'Maille superposée',
    explain: 'Inspiration éditoriale : une maille portée sur une chemise ou un t-shirt visible.',
    test: (o) => !!o.mid && ['chemise', 'blouse', 'tshirt'].includes(o.top?.subcategory ?? ''),
  },
  {
    id: 'boots-skirt',
    kind: 'seasonal',
    label: 'Bottes & jupe',
    explain: 'Inspiration éditoriale : bottes hautes avec jupe ou robe.',
    test: (o) =>
      ['bottes', 'bottines'].includes(o.shoes?.subcategory ?? '') &&
      (o.bottom?.subcategory === 'jupe' || o.onepiece?.subcategory === 'robe'),
  },
];

export function matchTrends(o: OutfitView): TrendRule[] {
  return TREND_RULES.filter((r) => {
    try {
      return r.test(o);
    } catch {
      return false;
    }
  });
}
