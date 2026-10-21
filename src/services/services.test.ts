import { describe, expect, it } from 'vitest';
import { buildOpenMeteoUrl, parseOpenMeteo } from './weather/openMeteo';
import { analyzePixels } from './colorAnalysis';
import { normalizeGarment, normalizePreferences, validateGarment } from '../domain/normalize';
import { roundCoord } from './locationService';

const loc = { name: 'Bruxelles', latitude: 50.8503, longitude: 4.3517 };

// Forme réelle d'une réponse Open-Meteo (vérifiée le 21/10/2026), tronquée à 2 heures.
const SAMPLE = {
  current: { time: '2026-10-21T11:15', temperature_2m: 10.5, apparent_temperature: 6.8, precipitation: 0.1, weather_code: 51, wind_speed_10m: 20.9, wind_gusts_10m: 41.0, is_day: 1 },
  hourly: {
    time: ['2026-10-21T08:00', '2026-10-21T09:00'],
    temperature_2m: [10.0, 10.2],
    apparent_temperature: [7.0, 7.2],
    precipitation_probability: [20, null],
    precipitation: [0, 0.3],
    weather_code: [3, 61],
    wind_speed_10m: [18, 20],
    wind_gusts_10m: [35, 41],
  },
  daily: {
    time: ['2026-10-21'],
    temperature_2m_max: [13.1],
    temperature_2m_min: [9.0],
    apparent_temperature_max: [10],
    apparent_temperature_min: [5.5],
    precipitation_probability_max: [32],
    precipitation_sum: [1.4],
    wind_speed_10m_max: [25],
    wind_gusts_10m_max: [50],
    weather_code: [61],
  },
};

describe('Open-Meteo', () => {
  it('construit une URL sans coordonnées précises', () => {
    const url = buildOpenMeteoUrl(loc);
    expect(url).toContain('latitude=50.85');
    expect(url).toContain('longitude=4.35');
    expect(url).toContain('apparent_temperature');
    expect(url).toContain('timezone=auto');
  });

  it('convertit la réponse en WeatherSnapshot', () => {
    const s = parseOpenMeteo(SAMPLE, loc, new Date('2026-10-21T09:20:00Z'));
    expect(s.current.feelsLike).toBe(6.8);
    expect(s.today.precipitationProbabilityMax).toBe(32);
    expect(s.hourly).toHaveLength(2);
    expect(s.hourly[1].precipitationProbability).toBeNull();
    expect(s.provider).toBe('open-meteo');
  });

  it('refuse une réponse incomplète au lieu d’inventer des valeurs', () => {
    expect(() => parseOpenMeteo({ current: {} }, loc)).toThrow(/incomplète/);
  });
});

describe('analyse de couleur', () => {
  function image(w: number, h: number, bg: number[], fg: number[]) {
    const data: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const inside = x > w * 0.25 && x < w * 0.75 && y > h * 0.2 && y < h * 0.8;
        data.push(...(inside ? fg : bg), 255);
      }
    return data;
  }
  it('ignore le fond et trouve la couleur du vêtement', () => {
    const r = analyzePixels(image(120, 150, [250, 250, 248], [200, 40, 45]), 120, 150);
    expect(r.primary).toBe('rouge');
  });
  it('ne prétend rien quand l’image est uniforme', () => {
    const r = analyzePixels(image(80, 100, [250, 250, 248], [250, 250, 248]), 80, 100);
    expect(r.primary).toBeNull();
  });
});

describe('modèle de données', () => {
  it('complète un ancien enregistrement sans casser les données', () => {
    const g = normalizeGarment({ id: 'x', name: 'Vieux pull', category: 'top', subcategory: 'pull' } as never);
    expect(g.warmth).toBe(3);
    expect(g.availability).toBe('available');
    expect(g.styles).toEqual([]);
    expect(g.schemaVersion).toBe(1);
  });
  it('valide les champs obligatoires', () => {
    const e = validateGarment({ name: ' ', category: 'top' });
    expect(e.name).toBeTruthy();
    expect(e.subcategory).toBeTruthy();
    expect(e.primaryColor).toBeTruthy();
  });
  it('préférences par défaut sûres', () => {
    const p = normalizePreferences({ coldSensitivity: 7 as never, outing: { start: 30, end: -2 } });
    expect(p.coldSensitivity).toBe(0);
    expect(p.outing).toEqual({ start: 23, end: 0 });
  });
  it('arrondit la position à ~1 km', () => {
    expect(roundCoord(50.850345)).toBe(50.85);
  });
});
