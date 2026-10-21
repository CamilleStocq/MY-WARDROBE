import type { WeatherSnapshot } from '../../domain/types';
import { kv } from '../db';
import { openMeteoProvider } from './openMeteo';
import { WeatherError, type ForecastLocation, type WeatherProvider } from './provider';

/** Fournisseur actif — remplaçable sans toucher au reste de l'application. */
export const weatherProvider: WeatherProvider = openMeteoProvider;

export interface WeatherResult {
  snapshot: WeatherSnapshot | null;
  /** live = récupéré à l'instant ; recent = récupéré il y a < 20 min ; cache = repli après une erreur */
  freshness: 'live' | 'recent' | 'cache' | 'none';
  /** les prévisions en cache datent d'un autre jour : inutilisables pour la tenue */
  outdated: boolean;
  error: string | null;
}

const RECENT_MS = 20 * 60 * 1000;
const TIMEOUT_MS = 10_000;

const cacheKey = (loc: ForecastLocation) => `weather:${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`;

function todayIn(snapshot: WeatherSnapshot): boolean {
  // la date « today » du fournisseur est au fuseau du lieu ; on la compare à la date locale
  const d = new Date();
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return snapshot.today.date === local;
}

async function withRetry<T>(fn: (signal: AbortSignal) => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await fn(ctrl.signal);
    } catch (e) {
      lastError = (e as Error).name === 'AbortError' ? new WeatherError('Le service météo ne répond pas.', 'network') : e;
      if (lastError instanceof WeatherError && lastError.kind === 'format') break;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export async function getWeather(loc: ForecastLocation, opts: { force?: boolean } = {}): Promise<WeatherResult> {
  const key = cacheKey(loc);
  const cached = await kv.get<WeatherSnapshot>(key).catch(() => undefined);

  if (!opts.force && cached && Date.now() - new Date(cached.timestamp).getTime() < RECENT_MS && todayIn(cached)) {
    return { snapshot: { ...cached, location: { ...cached.location, name: loc.name } }, freshness: 'recent', outdated: false, error: null };
  }

  try {
    const snapshot = await withRetry((signal) => weatherProvider.fetchForecast(loc, signal));
    await kv.set(key, snapshot).catch(() => undefined);
    return { snapshot, freshness: 'live', outdated: false, error: null };
  } catch (e) {
    const message = e instanceof WeatherError ? e.message : 'La météo est momentanément indisponible.';
    if (cached) {
      return { snapshot: cached, freshness: 'cache', outdated: !todayIn(cached), error: message };
    }
    return { snapshot: null, freshness: 'none', outdated: false, error: message };
  }
}
