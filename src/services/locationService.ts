import type { SavedLocation } from '../domain/types';

/** On ne conserve jamais de coordonnées précises : arrondi ≈ 1 km. */
export const roundCoord = (x: number) => Math.round(x * 100) / 100;

export class LocationError extends Error {
  constructor(
    message: string,
    public kind: 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'network',
  ) {
    super(message);
  }
}

/** Demande la position — à n'appeler qu'après une action explicite de l'utilisateur. */
export function getCurrentLocation(): Promise<SavedLocation> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new LocationError("La géolocalisation n'est pas disponible sur cet appareil.", 'unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          name: 'Ma position',
          latitude: roundCoord(pos.coords.latitude),
          longitude: roundCoord(pos.coords.longitude),
          country: null,
          source: 'gps',
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED)
          reject(new LocationError('Accès à la position refusé. Vous pouvez choisir une ville à la place.', 'denied'));
        else if (err.code === err.TIMEOUT) reject(new LocationError('La localisation a pris trop de temps.', 'timeout'));
        else reject(new LocationError('Position introuvable pour le moment.', 'unavailable'));
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

export interface CityResult {
  id: number;
  name: string;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number;
  longitude: number;
}

/** Recherche de ville via l'API de géocodage d'Open-Meteo (sans clé). */
export async function searchCities(query: string, signal?: AbortSignal): Promise<CityResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({
    name: q,
    count: '8',
    language: 'fr',
    format: 'json',
  })}`;
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new LocationError('Recherche impossible sans connexion.', 'network');
  }
  if (!res.ok) throw new LocationError('La recherche de ville a échoué.', 'network');
  const json = (await res.json()) as { results?: Record<string, unknown>[] };
  return (json.results ?? []).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    region: (r.admin1 as string) ?? null,
    country: (r.country as string) ?? null,
    countryCode: (r.country_code as string) ?? null,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
  }));
}

export function cityToLocation(c: CityResult): SavedLocation {
  return {
    name: c.name,
    latitude: roundCoord(c.latitude),
    longitude: roundCoord(c.longitude),
    country: c.country,
    source: 'search',
  };
}
