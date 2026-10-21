/**
 * Modèle de données de l'application.
 * Chaque entité persistée porte un `schemaVersion` : les fonctions `normalize*`
 * (voir normalize.ts) complètent les champs manquants, ce qui permet de faire
 * évoluer le modèle sans casser les données déjà enregistrées.
 */

export type GarmentCategory = 'top' | 'bottom' | 'onepiece' | 'outerwear' | 'shoes' | 'accessory';

export type Pattern = 'uni' | 'rayures' | 'carreaux' | 'floral' | 'pois' | 'imprime' | 'autre';

export type Season = 'printemps' | 'ete' | 'automne' | 'hiver';

export type Style =
  | 'casual'
  | 'chic'
  | 'streetwear'
  | 'sportif'
  | 'minimaliste'
  | 'romantique'
  | 'professionnel'
  | 'boheme'
  | 'vintage';

/** 1 = décontractée, 2 = intermédiaire, 3 = habillée */
export type Formality = 1 | 2 | 3;

export type Availability = 'available' | 'laundry' | 'unavailable';

export type Silhouette = 'ajuste' | 'droit' | 'ample';

/** 1 (très léger) → 5 (très chaud) */
export type Warmth = 1 | 2 | 3 | 4 | 5;

export type ColorKey = string;

export interface Garment {
  id: string;
  schemaVersion: 1;
  name: string;
  /** marque (facultatif) */
  brand: string;
  category: GarmentCategory;
  /** clé de sous-catégorie (voir taxonomy.ts), ex. "jean", "pull" */
  subcategory: string;
  /** référence vers le magasin d'images (null = photo manquante) */
  imageId: string | null;
  primaryColor: ColorKey;
  secondaryColors: ColorKey[];
  pattern: Pattern;
  /** vide ou les 4 saisons = toute l'année */
  seasons: Season[];
  material: string;
  warmth: Warmth;
  styles: Style[];
  formality: Formality;
  availability: Availability;
  silhouette: Silhouette | null;
  /** imperméable / déperlant (utile pour la pluie) */
  waterproof: boolean;
  notes: string;
  /** vêtement de démonstration (illustration, pas une vraie photo) */
  isDemo: boolean;
  /** pièce préférée : légèrement favorisée dans les propositions */
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Emplacements d'une tenue. `mid` = couche intermédiaire (pull / cardigan sur un haut). */
export interface OutfitSlots {
  top?: string;
  mid?: string;
  bottom?: string;
  onepiece?: string;
  outer?: string;
  shoes?: string;
  accessories: string[];
}

export type SlotName = 'top' | 'mid' | 'bottom' | 'onepiece' | 'outer' | 'shoes';

export type Occasion = 'quotidien' | 'travail' | 'sortie' | 'sport' | 'evenement';

export interface OutfitWeatherContext {
  summary: string;
  feelsLike: number | null;
  band: TemperatureBand | null;
  rain: RainLevel;
  locationName: string | null;
}

export interface SavedOutfit {
  id: string;
  schemaVersion: 1;
  name: string;
  notes: string;
  slots: OutfitSlots;
  garmentIds: string[];
  styleTags: Style[];
  occasion: Occasion;
  seasons: Season[];
  weatherContext: OutfitWeatherContext | null;
  explanation: string[];
  createdAt: string;
  updatedAt: string;
  lastWornAt: string | null;
}

export interface SavedLocation {
  name: string;
  /** arrondi à 2 décimales (≈ 1 km) : pas de coordonnées précises stockées */
  latitude: number;
  longitude: number;
  country: string | null;
  source: 'gps' | 'search';
}

export interface TemperatureThresholds {
  /** ressenti ≥ hot → chaud */
  hot: number;
  warm: number;
  mild: number;
  cool: number;
  /** ressenti < cold → glacial */
  cold: number;
}

export interface CustomSubcategory {
  key: string;
  label: string;
  category: GarmentCategory;
  warmth: Warmth;
}

export interface UserPreferences {
  schemaVersion: 1;
  displayName: string;
  favoriteStyles: Style[];
  avoidedStyles: Style[];
  favoriteColors: ColorKey[];
  rareColors: ColorKey[];
  /** -1 = frileuse, 0 = neutre, 1 = supporte bien le froid */
  coldSensitivity: -1 | 0 | 1;
  thresholds: TemperatureThresholds;
  /** confort ↔ style */
  comfort: 'confort' | 'equilibre' | 'style';
  usualFormality: Formality;
  occasions: Occasion[];
  outing: { start: number; end: number };
  location: SavedLocation | null;
  customSubcategories: CustomSubcategory[];
}

export type TemperatureBand = 'freezing' | 'cold' | 'cool' | 'mild' | 'warm' | 'hot';
export type RainLevel = 'none' | 'possible' | 'likely';

export interface WeatherHour {
  time: string;
  temperature: number;
  feelsLike: number;
  precipitationProbability: number | null;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  windGusts: number;
}

export interface WeatherSnapshot {
  location: { name: string; latitude: number; longitude: number };
  /** heure de récupération auprès du fournisseur (ISO) */
  timestamp: string;
  provider: string;
  current: {
    time: string;
    temperature: number;
    feelsLike: number;
    precipitation: number;
    weatherCode: number;
    windSpeed: number;
    windGusts: number;
    isDay: boolean;
  };
  today: {
    date: string;
    min: number;
    max: number;
    feelsMin: number;
    feelsMax: number;
    precipitationProbabilityMax: number | null;
    precipitationSum: number;
    windMax: number;
    gustMax: number;
    weatherCode: number;
  };
  hourly: WeatherHour[];
}

/** Météo saisie manuellement quand le service est indisponible. */
export interface ManualWeather {
  band: TemperatureBand;
  rain: boolean;
  windy: boolean;
}
