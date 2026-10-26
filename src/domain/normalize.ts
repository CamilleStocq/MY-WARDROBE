import type {
  Garment,
  GarmentCategory,
  Formality,
  OutfitSlots,
  SavedOutfit,
  TemperatureThresholds,
  UserPreferences,
  Warmth,
} from './types';
import { ALL_STYLES, findSubcategory } from './taxonomy';

export const DEFAULT_THRESHOLDS: TemperatureThresholds = { hot: 26, warm: 20, mild: 14, cool: 8, cold: 2 };

export function defaultPreferences(): UserPreferences {
  return {
    schemaVersion: 1,
    displayName: '',
    favoriteStyles: [],
    avoidedStyles: [],
    favoriteColors: [],
    rareColors: [],
    coldSensitivity: 0,
    thresholds: { ...DEFAULT_THRESHOLDS },
    comfort: 'equilibre',
    usualFormality: 1,
    occasions: ['quotidien'],
    outing: { start: 8, end: 19 },
    location: null,
    customSubcategories: [],
    onboardingDone: false,
  };
}

const CATEGORIES: GarmentCategory[] = ['top', 'bottom', 'onepiece', 'outerwear', 'shoes', 'accessory'];

function clampInt<T extends number>(v: unknown, min: number, max: number, fallback: T): T {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n)) as T;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Complète un vêtement lu en base (anciennes versions, champs manquants). */
export function normalizeGarment(raw: Partial<Garment> & { id: string }): Garment {
  const now = new Date().toISOString();
  const category = CATEGORIES.includes(raw.category as GarmentCategory) ? (raw.category as GarmentCategory) : 'top';
  const sub = raw.subcategory ?? '';
  const def = findSubcategory(sub);
  return {
    id: raw.id,
    schemaVersion: 1,
    name: (raw.name ?? '').trim() || def?.label || 'Vêtement',
    brand: (raw.brand ?? '').trim(),
    category,
    subcategory: sub,
    imageId: raw.imageId ?? null,
    primaryColor: raw.primaryColor || 'noir',
    secondaryColors: arr<string>(raw.secondaryColors),
    pattern: raw.pattern ?? 'uni',
    seasons: arr(raw.seasons),
    material: raw.material ?? '',
    warmth: clampInt<Warmth>(raw.warmth, 1, 5, (def?.warmth ?? 2) as Warmth),
    styles: arr<string>(raw.styles).filter((s): s is (typeof ALL_STYLES)[number] => (ALL_STYLES as string[]).includes(s)),
    formality: clampInt<Formality>(raw.formality, 1, 3, 1),
    availability: raw.availability ?? 'available',
    silhouette: raw.silhouette ?? null,
    waterproof: raw.waterproof ?? false,
    notes: raw.notes ?? '',
    isDemo: raw.isDemo ?? false,
    favorite: raw.favorite ?? false,
    laundryAt: (raw.availability ?? 'available') === 'laundry' ? (raw.laundryAt ?? raw.updatedAt ?? now) : null,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
  };
}

export function normalizeSlots(raw: Partial<OutfitSlots> | undefined): OutfitSlots {
  const s: OutfitSlots = { accessories: arr<string>(raw?.accessories) };
  for (const k of ['top', 'mid', 'bottom', 'onepiece', 'outer', 'shoes'] as const) {
    if (raw?.[k]) s[k] = raw[k];
  }
  return s;
}

export function slotIds(slots: OutfitSlots): string[] {
  return [slots.top, slots.mid, slots.bottom, slots.onepiece, slots.outer, slots.shoes, ...slots.accessories].filter(
    (x): x is string => !!x,
  );
}

export function normalizeOutfit(raw: Partial<SavedOutfit> & { id: string }): SavedOutfit {
  const now = new Date().toISOString();
  const slots = normalizeSlots(raw.slots);
  return {
    id: raw.id,
    schemaVersion: 1,
    name: raw.name?.trim() || 'Ma tenue',
    notes: raw.notes ?? '',
    slots,
    garmentIds: slotIds(slots),
    styleTags: arr(raw.styleTags),
    occasion: raw.occasion ?? 'quotidien',
    seasons: arr(raw.seasons),
    weatherContext: raw.weatherContext ?? null,
    explanation: arr(raw.explanation),
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
    lastWornAt: raw.lastWornAt ?? null,
  };
}

export function normalizePreferences(raw: Partial<UserPreferences> | undefined | null): UserPreferences {
  const d = defaultPreferences();
  if (!raw) return d;
  const sens = raw.coldSensitivity;
  return {
    ...d,
    ...raw,
    schemaVersion: 1,
    coldSensitivity: sens === -1 || sens === 1 ? sens : 0,
    thresholds: { ...d.thresholds, ...(raw.thresholds ?? {}) },
    outing: {
      start: clampInt(raw.outing?.start, 0, 23, d.outing.start),
      end: clampInt(raw.outing?.end, 0, 23, d.outing.end),
    },
    favoriteStyles: arr(raw.favoriteStyles),
    avoidedStyles: arr(raw.avoidedStyles),
    favoriteColors: arr(raw.favoriteColors),
    rareColors: arr(raw.rareColors),
    occasions: arr(raw.occasions).length ? arr(raw.occasions) : d.occasions,
    customSubcategories: arr(raw.customSubcategories),
    onboardingDone: raw.onboardingDone === true,
    usualFormality: clampInt<Formality>(raw.usualFormality, 1, 3, 1),
  };
}

/** Validation d'un vêtement avant enregistrement. Renvoie les erreurs par champ. */
export function validateGarment(g: Partial<Garment>): Partial<Record<keyof Garment, string>> {
  const errors: Partial<Record<keyof Garment, string>> = {};
  if (!g.name || !g.name.trim()) errors.name = 'Donnez un nom à ce vêtement.';
  else if (g.name.length > 60) errors.name = '60 caractères maximum.';
  if (!g.category) errors.category = 'Choisissez une catégorie.';
  if (!g.subcategory) errors.subcategory = 'Choisissez un type.';
  if (!g.primaryColor) errors.primaryColor = 'Choisissez la couleur principale.';
  return errors;
}
