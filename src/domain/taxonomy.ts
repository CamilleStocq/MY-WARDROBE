import type {
  Availability,
  CustomSubcategory,
  Formality,
  GarmentCategory,
  Occasion,
  Pattern,
  Season,
  Silhouette,
  Style,
  Warmth,
} from './types';

export interface SubcategoryDef {
  key: string;
  label: string;
  category: GarmentCategory;
  /** chaleur par défaut proposée à l'ajout */
  warmth: Warmth;
  /** pour les hauts : pièce de maille qui peut se porter par-dessus un autre haut */
  layer?: boolean;
  /** jambes exposées : 'bare' (short) ou 'partial' (jupe, robe — collants possibles) */
  legs?: 'bare' | 'partial';
  /** chaussures ouvertes / sensibles à la pluie */
  openShoe?: boolean;
  /** chaussures fermées et couvrantes, adaptées à la pluie/froid */
  coveredShoe?: boolean;
  /** accessoire de froid (écharpe, bonnet, gants) */
  coldAccessory?: boolean;
  custom?: boolean;
}

export const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  top: 'Hauts',
  bottom: 'Bas',
  onepiece: 'Robes et combinaisons',
  outerwear: 'Vestes et manteaux',
  shoes: 'Chaussures',
  accessory: 'Accessoires',
};

export const CATEGORY_SINGULAR: Record<GarmentCategory, string> = {
  top: 'Haut',
  bottom: 'Bas',
  onepiece: 'Pièce complète',
  outerwear: 'Veste / manteau',
  shoes: 'Chaussures',
  accessory: 'Accessoire',
};

export const CATEGORY_ORDER: GarmentCategory[] = ['top', 'bottom', 'onepiece', 'outerwear', 'shoes', 'accessory'];

export const BUILTIN_SUBCATEGORIES: SubcategoryDef[] = [
  { key: 'tshirt', label: 'T-shirt', category: 'top', warmth: 1 },
  { key: 'top', label: 'Top', category: 'top', warmth: 1 },
  { key: 'chemise', label: 'Chemise', category: 'top', warmth: 2 },
  { key: 'blouse', label: 'Blouse', category: 'top', warmth: 2 },
  { key: 'pull', label: 'Pull', category: 'top', warmth: 3, layer: true },
  { key: 'sweat', label: 'Sweatshirt', category: 'top', warmth: 3, layer: true },
  { key: 'cardigan', label: 'Cardigan', category: 'top', warmth: 2, layer: true },

  { key: 'jean', label: 'Jean', category: 'bottom', warmth: 2 },
  { key: 'pantalon', label: 'Pantalon', category: 'bottom', warmth: 2 },
  { key: 'short', label: 'Short', category: 'bottom', warmth: 1, legs: 'bare' },
  { key: 'jupe', label: 'Jupe', category: 'bottom', warmth: 1, legs: 'partial' },
  { key: 'legging', label: 'Legging', category: 'bottom', warmth: 2 },

  { key: 'robe', label: 'Robe', category: 'onepiece', warmth: 2, legs: 'partial' },
  { key: 'combinaison', label: 'Combinaison', category: 'onepiece', warmth: 2 },

  { key: 'veste', label: 'Veste', category: 'outerwear', warmth: 2 },
  { key: 'blazer', label: 'Blazer', category: 'outerwear', warmth: 2 },
  { key: 'manteau', label: 'Manteau', category: 'outerwear', warmth: 4 },
  { key: 'doudoune', label: 'Doudoune', category: 'outerwear', warmth: 5 },
  { key: 'impermeable', label: 'Imperméable', category: 'outerwear', warmth: 2 },

  { key: 'baskets', label: 'Baskets', category: 'shoes', warmth: 2 },
  { key: 'bottines', label: 'Bottines', category: 'shoes', warmth: 3, coveredShoe: true },
  { key: 'bottes', label: 'Bottes', category: 'shoes', warmth: 4, coveredShoe: true },
  { key: 'mocassins', label: 'Mocassins', category: 'shoes', warmth: 2 },
  { key: 'habillees', label: 'Chaussures habillées', category: 'shoes', warmth: 2 },
  { key: 'sandales', label: 'Sandales', category: 'shoes', warmth: 1, openShoe: true },

  { key: 'sac', label: 'Sac', category: 'accessory', warmth: 1 },
  { key: 'ceinture', label: 'Ceinture', category: 'accessory', warmth: 1 },
  { key: 'echarpe', label: 'Écharpe', category: 'accessory', warmth: 3, coldAccessory: true },
  { key: 'bonnet', label: 'Bonnet', category: 'accessory', warmth: 3, coldAccessory: true },
  { key: 'bijou', label: 'Bijou', category: 'accessory', warmth: 1 },
  { key: 'autre-accessoire', label: 'Autre accessoire', category: 'accessory', warmth: 1 },
];

export function allSubcategories(custom: CustomSubcategory[] = []): SubcategoryDef[] {
  return [...BUILTIN_SUBCATEGORIES, ...custom.map((c) => ({ ...c, custom: true }))];
}

export function findSubcategory(key: string, custom: CustomSubcategory[] = []): SubcategoryDef | undefined {
  return allSubcategories(custom).find((s) => s.key === key);
}

export function subcategoriesOf(category: GarmentCategory, custom: CustomSubcategory[] = []): SubcategoryDef[] {
  return allSubcategories(custom).filter((s) => s.category === category);
}

export function subcategoryLabel(key: string, custom: CustomSubcategory[] = []): string {
  return findSubcategory(key, custom)?.label ?? key;
}

export const PATTERN_LABELS: Record<Pattern, string> = {
  uni: 'Uni',
  rayures: 'Rayures',
  carreaux: 'Carreaux',
  floral: 'Floral',
  pois: 'Pois',
  imprime: 'Imprimé',
  autre: 'Autre motif',
};

export const SEASON_LABELS: Record<Season, string> = {
  printemps: 'Printemps',
  ete: 'Été',
  automne: 'Automne',
  hiver: 'Hiver',
};

export const ALL_SEASONS: Season[] = ['printemps', 'ete', 'automne', 'hiver'];

export function seasonsLabel(seasons: Season[]): string {
  if (seasons.length === 0 || seasons.length === 4) return "Toute l'année";
  return seasons.map((s) => SEASON_LABELS[s]).join(' · ');
}

export const STYLE_LABELS: Record<Style, string> = {
  casual: 'Casual',
  chic: 'Chic',
  streetwear: 'Streetwear',
  sportif: 'Sportif',
  minimaliste: 'Minimaliste',
  romantique: 'Romantique',
  professionnel: 'Professionnel',
  boheme: 'Bohème',
  vintage: 'Vintage',
};

export const ALL_STYLES = Object.keys(STYLE_LABELS) as Style[];

export const FORMALITY_LABELS: Record<Formality, string> = {
  1: 'Décontractée',
  2: 'Intermédiaire',
  3: 'Habillée',
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: 'Disponible',
  laundry: 'Au lavage',
  unavailable: 'Indisponible',
};

export const SILHOUETTE_LABELS: Record<Silhouette, string> = {
  ajuste: 'Ajustée',
  droit: 'Droite',
  ample: 'Ample',
};

export const WARMTH_LABELS: Record<Warmth, string> = {
  1: 'Très léger',
  2: 'Léger',
  3: 'Mi-saison',
  4: 'Chaud',
  5: 'Très chaud',
};

export const OCCASION_LABELS: Record<Occasion, string> = {
  quotidien: 'Au quotidien',
  travail: 'Travail / études',
  sortie: 'Sortie',
  sport: 'Sport',
  evenement: 'Événement',
};

export function currentSeason(date = new Date()): Season {
  const m = date.getMonth(); // 0-11 (hémisphère nord)
  const d = date.getDate();
  const md = m * 100 + d;
  if (md >= 220 && md < 521) return 'printemps'; // 20 mars → 20 juin
  if (md >= 521 && md < 822) return 'ete'; // 21 juin → 22 sept
  if (md >= 822 && md < 1121) return 'automne'; // 22 sept → 21 déc
  return 'hiver';
}
