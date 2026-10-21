/** Codes météo WMO (utilisés par Open-Meteo) → libellé français + pictogramme. */
export type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export function describeWeatherCode(code: number): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: 'Ciel dégagé', icon: 'sun' };
  if (code === 1) return { label: 'Plutôt ensoleillé', icon: 'partly' };
  if (code === 2) return { label: 'Partiellement nuageux', icon: 'partly' };
  if (code === 3) return { label: 'Ciel couvert', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Brouillard', icon: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Bruine', icon: 'drizzle' };
  if (code >= 61 && code <= 67) return { label: code >= 65 ? 'Forte pluie' : 'Pluie', icon: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Neige', icon: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Averses', icon: 'rain' };
  if (code === 85 || code === 86) return { label: 'Averses de neige', icon: 'snow' };
  if (code >= 95) return { label: 'Orage', icon: 'storm' };
  return { label: 'Conditions variables', icon: 'cloud' };
}
