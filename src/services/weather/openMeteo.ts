import type { WeatherHour, WeatherSnapshot } from '../../domain/types';
import { WeatherError, type ForecastLocation, type WeatherProvider } from './provider';

/**
 * Fournisseur Open-Meteo (https://open-meteo.com) — sans clé, usage non commercial.
 * Pour la Belgique, le « best match » combine notamment KNMI HARMONIE et DWD ICON-D2.
 * Licence des données : CC BY 4.0 (attribution affichée dans l'application).
 */
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const HOURLY = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
];
const CURRENT = ['temperature_2m', 'apparent_temperature', 'precipitation', 'weather_code', 'wind_speed_10m', 'wind_gusts_10m', 'is_day'];
const DAILY = [
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'precipitation_probability_max',
  'precipitation_sum',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'weather_code',
];

export function buildOpenMeteoUrl(loc: ForecastLocation): string {
  const p = new URLSearchParams({
    latitude: loc.latitude.toFixed(2),
    longitude: loc.longitude.toFixed(2),
    current: CURRENT.join(','),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    timezone: 'auto',
    forecast_days: '1',
    wind_speed_unit: 'kmh',
  });
  return `${ENDPOINT}?${p.toString()}`;
}

type Num = number | null;
interface OpenMeteoResponse {
  current?: Record<string, Num | string>;
  hourly?: Record<string, (Num | string)[]>;
  daily?: Record<string, (Num | string)[]>;
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function parseOpenMeteo(json: OpenMeteoResponse, loc: ForecastLocation, now = new Date()): WeatherSnapshot {
  const c = json.current;
  const h = json.hourly;
  const d = json.daily;
  if (!c || !h || !d || !Array.isArray(h.time) || typeof c.temperature_2m !== 'number') {
    throw new WeatherError('Réponse météo incomplète.', 'format');
  }
  const hourly: WeatherHour[] = (h.time as string[]).map((time, i) => ({
    time,
    temperature: num(h.temperature_2m?.[i]),
    feelsLike: num(h.apparent_temperature?.[i], num(h.temperature_2m?.[i])),
    precipitationProbability: typeof h.precipitation_probability?.[i] === 'number' ? (h.precipitation_probability[i] as number) : null,
    precipitation: num(h.precipitation?.[i]),
    weatherCode: num(h.weather_code?.[i]),
    windSpeed: num(h.wind_speed_10m?.[i]),
    windGusts: num(h.wind_gusts_10m?.[i]),
  }));
  return {
    location: { name: loc.name, latitude: loc.latitude, longitude: loc.longitude },
    timestamp: now.toISOString(),
    provider: 'open-meteo',
    current: {
      time: String(c.time ?? ''),
      temperature: num(c.temperature_2m),
      feelsLike: num(c.apparent_temperature, num(c.temperature_2m)),
      precipitation: num(c.precipitation),
      weatherCode: num(c.weather_code),
      windSpeed: num(c.wind_speed_10m),
      windGusts: num(c.wind_gusts_10m),
      isDay: c.is_day === 1,
    },
    today: {
      date: String(d.time?.[0] ?? ''),
      min: num(d.temperature_2m_min?.[0]),
      max: num(d.temperature_2m_max?.[0]),
      feelsMin: num(d.apparent_temperature_min?.[0]),
      feelsMax: num(d.apparent_temperature_max?.[0]),
      precipitationProbabilityMax: typeof d.precipitation_probability_max?.[0] === 'number' ? (d.precipitation_probability_max[0] as number) : null,
      precipitationSum: num(d.precipitation_sum?.[0]),
      windMax: num(d.wind_speed_10m_max?.[0]),
      gustMax: num(d.wind_gusts_10m_max?.[0]),
      weatherCode: num(d.weather_code?.[0]),
    },
    hourly,
  };
}

export const openMeteoProvider: WeatherProvider = {
  id: 'open-meteo',
  label: 'Open-Meteo',
  attribution: { text: 'Données météo : Open-Meteo.com (CC BY 4.0)', url: 'https://open-meteo.com/' },
  async fetchForecast(loc, signal) {
    let res: Response;
    try {
      res = await fetch(buildOpenMeteoUrl(loc), { signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new WeatherError('Pas de connexion au service météo.', 'network');
    }
    if (!res.ok) throw new WeatherError(`Le service météo a répondu avec une erreur (${res.status}).`, 'server');
    let json: OpenMeteoResponse;
    try {
      json = await res.json();
    } catch {
      throw new WeatherError('Réponse météo illisible.', 'format');
    }
    return parseOpenMeteo(json, loc);
  },
};
