import type { WeatherSnapshot } from '../../domain/types';

export interface ForecastLocation {
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Interface indépendante du fournisseur : pour passer à un autre service
 * (ex. un proxy IRM côté serveur), il suffit d'implémenter cette interface.
 */
export interface WeatherProvider {
  id: string;
  label: string;
  attribution: { text: string; url: string };
  fetchForecast(loc: ForecastLocation, signal?: AbortSignal): Promise<WeatherSnapshot>;
}

export class WeatherError extends Error {
  constructor(
    message: string,
    public kind: 'network' | 'server' | 'format',
  ) {
    super(message);
  }
}
