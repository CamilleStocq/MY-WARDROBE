import type { ManualWeather, RainLevel, TemperatureBand, UserPreferences, WeatherSnapshot } from '../domain/types';

/**
 * Traduit la météo (ou une saisie manuelle) en besoins vestimentaires.
 * C'est ici que vivent les contraintes « obligatoires » liées à la météo.
 */
export interface WeatherNeeds {
  source: 'live' | 'cache' | 'manual' | 'none';
  /** ressenti retenu sur les heures de sortie, avant ajustement personnel */
  feels: number | null;
  /** ressenti ajusté selon la sensibilité au froid */
  adjusted: number | null;
  band: TemperatureBand;
  rain: RainLevel;
  rainProbability: number | null;
  rainAmount: number;
  windy: boolean;
  gusts: number | null;
  /** écart de température important dans la journée → superposition utile */
  variable: boolean;
  spread: number | null;
  /** somme de chaleur visée pour les pièces du corps (haut, couche, bas, veste) */
  warmthRange: [number, number];
  outer: 'required' | 'suggested' | 'optional' | 'avoid';
  minOuterWarmth: number;
  window: { start: number; end: number };
}

export const BAND_LABELS: Record<TemperatureBand, string> = {
  freezing: 'glacial',
  cold: 'froid',
  cool: 'frais',
  mild: 'doux',
  warm: 'agréable',
  hot: 'chaud',
};

/** Plages de chaleur cumulée visées par bande (voir docs/MOTEUR.md). */
export const WARMTH_RANGES: Record<TemperatureBand, [number, number]> = {
  hot: [2, 4],
  warm: [3, 5],
  mild: [4, 7],
  cool: [6, 9],
  cold: [8, 12],
  freezing: [10, 16],
};

/** Valeur de ressenti représentative d'une bande (saisie manuelle). */
const MANUAL_FEELS: Record<TemperatureBand, number> = {
  freezing: -2,
  cold: 5,
  cool: 11,
  mild: 17,
  warm: 23,
  hot: 29,
};

export function bandFor(t: number, th: UserPreferences['thresholds']): TemperatureBand {
  if (t >= th.hot) return 'hot';
  if (t >= th.warm) return 'warm';
  if (t >= th.mild) return 'mild';
  if (t >= th.cool) return 'cool';
  if (t >= th.cold) return 'cold';
  return 'freezing';
}

function outerPolicy(band: TemperatureBand, rain: RainLevel, windy: boolean, variable: boolean) {
  switch (band) {
    case 'freezing':
      return { outer: 'required' as const, min: 4 };
    case 'cold':
      return { outer: 'required' as const, min: 3 };
    case 'cool':
      return { outer: 'required' as const, min: 2 };
    case 'mild':
      return { outer: 'suggested' as const, min: 1 };
    case 'warm':
      return { outer: rain === 'likely' || windy || variable ? ('suggested' as const) : ('optional' as const), min: 1 };
    case 'hot':
      return { outer: rain === 'likely' ? ('optional' as const) : ('avoid' as const), min: 1 };
  }
}

export interface DeriveInput {
  weather: WeatherSnapshot | null;
  isCached?: boolean;
  manual?: ManualWeather | null;
  prefs: UserPreferences;
}

export function deriveNeeds({ weather, isCached, manual, prefs }: DeriveInput): WeatherNeeds {
  const window = { start: prefs.outing.start, end: Math.max(prefs.outing.start, prefs.outing.end) };
  const offset = prefs.coldSensitivity * 3; // frileuse : le froid est ressenti 3 °C plus fort

  if (!weather && manual) {
    const feels = MANUAL_FEELS[manual.band];
    const policy = outerPolicy(manual.band, manual.rain ? 'likely' : 'none', manual.windy, false);
    return {
      source: 'manual',
      feels,
      adjusted: feels,
      band: manual.band,
      rain: manual.rain ? 'likely' : 'none',
      rainProbability: null,
      rainAmount: 0,
      windy: manual.windy,
      gusts: null,
      variable: false,
      spread: null,
      warmthRange: WARMTH_RANGES[manual.band],
      outer: policy.outer,
      minOuterWarmth: policy.min,
      window,
    };
  }

  if (!weather) {
    // Aucune donnée : on reste prudent (mi-saison) sans rien affirmer.
    const band: TemperatureBand = 'mild';
    return {
      source: 'none',
      feels: null,
      adjusted: null,
      band,
      rain: 'none',
      rainProbability: null,
      rainAmount: 0,
      windy: false,
      gusts: null,
      variable: false,
      spread: null,
      warmthRange: WARMTH_RANGES[band],
      outer: 'suggested',
      minOuterWarmth: 1,
      window,
    };
  }

  const hours = weather.hourly.filter((h) => {
    const hr = parseInt(h.time.slice(11, 13), 10); // heure locale du lieu (ISO sans fuseau)
    return hr >= window.start && hr <= window.end;
  });
  const sample = hours.length ? hours : weather.hourly;

  let feels: number;
  let spread: number | null = null;
  let rainProbability: number | null = null;
  let rainAmount = 0;
  let gusts: number | null = null;
  let wind = 0;

  if (sample.length) {
    const feelsArr = sample.map((h) => h.feelsLike);
    const min = Math.min(...feelsArr);
    const mean = feelsArr.reduce((a, b) => a + b, 0) / feelsArr.length;
    // Prudence : on penche vers le moment le plus froid de la sortie.
    feels = Math.round((0.6 * min + 0.4 * mean) * 10) / 10;
    const temps = sample.map((h) => h.temperature);
    spread = Math.round((Math.max(...temps) - Math.min(...temps)) * 10) / 10;
    const probs = sample.map((h) => h.precipitationProbability).filter((p): p is number => p !== null);
    rainProbability = probs.length ? Math.max(...probs) : null;
    rainAmount = Math.round(sample.reduce((a, h) => a + h.precipitation, 0) * 10) / 10;
    gusts = Math.max(...sample.map((h) => h.windGusts));
    wind = Math.max(...sample.map((h) => h.windSpeed));
  } else {
    feels = weather.current.feelsLike;
    rainProbability = weather.today.precipitationProbabilityMax;
    rainAmount = weather.today.precipitationSum;
    gusts = weather.today.gustMax;
    wind = weather.today.windMax;
  }

  const adjusted = feels + offset;
  const band = bandFor(adjusted, prefs.thresholds);
  const rain: RainLevel =
    (rainProbability ?? 0) >= 60 || rainAmount >= 2
      ? 'likely'
      : (rainProbability ?? 0) >= 30 || rainAmount >= 0.5
        ? 'possible'
        : 'none';
  const windy = (gusts ?? 0) >= 45 || wind >= 30;
  const variable = (spread ?? 0) >= 8;
  const policy = outerPolicy(band, rain, windy, variable);

  return {
    source: isCached ? 'cache' : 'live',
    feels,
    adjusted,
    band,
    rain,
    rainProbability,
    rainAmount,
    windy,
    gusts,
    variable,
    spread,
    warmthRange: WARMTH_RANGES[band],
    outer: policy.outer,
    minOuterWarmth: policy.min,
    window,
  };
}

export function needsSummary(n: WeatherNeeds): string {
  if (n.source === 'none') return 'Météo indisponible : tenue de mi-saison par défaut';
  const parts: string[] = [];
  if (n.feels !== null) {
    parts.push(
      n.source === 'manual'
        ? `Temps ${BAND_LABELS[n.band]} (saisie manuelle)`
        : `Ressenti ${Math.round(n.feels)} °C de ${n.window.start} h à ${n.window.end} h`,
    );
  }
  if (n.rain === 'likely') parts.push('pluie probable');
  else if (n.rain === 'possible') parts.push('averses possibles');
  if (n.windy) parts.push('vent soutenu');
  if (n.variable) parts.push(`écart de ${Math.round(n.spread ?? 0)} °C dans la journée`);
  return parts.join(' · ');
}
