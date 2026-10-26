import { describe, expect, it } from 'vitest';
import { buildOpenMeteoUrl, parseOpenMeteo } from './weather/openMeteo';
import { analyzePixels, hasTransparency } from './colorAnalysis';
import { maskBounds } from './backgroundRemoval';
import { validateBackup } from './backupService';
import { needsBackupReminder } from './backupFile';
import { canonical, fingerprint, snapshotsToPrune, unreferencedImages } from './snapshotService';
import { normalizeGarment, normalizePreferences, validateGarment } from '../domain/normalize';
import { roundCoord } from './locationService';
import { localDate, pickPlan } from './outfitService';
import { cleanBy, isBackFromLaundry, lastLaundryReturn, laundryCandidates, nextLaundryReturn } from './laundryService';
import { deriveNeeds } from '../engine/weatherNeeds';

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

describe('photos détourées', () => {
  function cutout(w: number, h: number, fg: number[]) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const inside = x >= 30 && x < 70 && y >= 20 && y < 120;
        data.set(inside ? [...fg, 255] : [0, 0, 0, 0], (y * w + x) * 4);
      }
    return data;
  }
  it('analyse uniquement les pixels opaques', () => {
    const d = cutout(100, 140, [47, 79, 181]);
    expect(hasTransparency(d)).toBe(true);
    expect(analyzePixels(d, 100, 140).primary).toBe('bleu-roi');
  });
  it('une photo classique n’est pas considérée comme détourée', () => {
    expect(hasTransparency(new Uint8ClampedArray(400).fill(255))).toBe(false);
  });
  it('recadre autour du vêtement avec une marge', () => {
    const w = 100, h = 140;
    const mask = new Uint8ClampedArray(w * h);
    for (let y = 20; y < 120; y++) for (let x = 30; x < 70; x++) mask[y * w + x] = 255;
    const b = maskBounds(mask, w, h, 0.05)!;
    expect(b).toEqual({ x: 25, y: 15, w: 50, h: 110 });
    expect(maskBounds(new Uint8ClampedArray(w * h), w, h)).toBeNull();
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

describe('validation des sauvegardes', () => {
  const img = 'data:image/png;base64,iVBORw0KGgo=';
  const valid = () => ({
    app: 'my-wardrobe',
    version: 1,
    exportedAt: '2026-10-21T10:00:00Z',
    garments: [{ id: 'g1', category: 'top', subcategory: 'pull', imageId: 'i1', name: 'Pull' }],
    images: [{ id: 'i1', full: img, thumb: img, width: 10, height: 10, createdAt: '2026-10-21' }],
    outfits: [{ id: 'o1', slots: { top: 'g1', bottom: 'g-supprime', accessories: [] } }],
    calendar: { '2026-10-21': { date: '2026-10-21', slots: { top: 'g1', accessories: [] } } },
  });

  it('accepte une sauvegarde valide et résume son contenu', () => {
    const r = validateBackup(valid());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.summary).toMatchObject({ garments: 1, images: 1, outfits: 1, days: 1 });
      expect(r.summary.warnings.join(' ')).toMatch(/pièces absentes/);
    }
  });
  it('refuse un fichier qui n’est pas une sauvegarde', () => {
    expect(validateBackup({ foo: 1 }).ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
  });
  it('refuse une version plus récente', () => {
    const r = validateBackup({ ...valid(), version: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/plus récente/);
  });
  it('refuse un vêtement abîmé sans rien importer', () => {
    const d = valid();
    d.garments.push({ id: '', category: 'top', subcategory: 'x', imageId: '', name: '' });
    const r = validateBackup(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/n°2/);
  });
  it('refuse une photo corrompue', () => {
    const d = valid();
    d.images[0].full = 'pas-une-image';
    expect(validateBackup(d).ok).toBe(false);
  });
});

describe('copies automatiques', () => {
  const g = (id: string, imageId: string | null, name = id) =>
    normalizeGarment({ id, imageId, name, category: 'top', subcategory: 'pull', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' } as never);
  const meta = (id: string, createdAt: string, imageIds: string[] = []) => ({ id, createdAt, garments: 1, outfits: 0, days: 0, hash: id, imageIds });

  it('même contenu dans un autre ordre = même empreinte ; changement = autre empreinte', () => {
    const a = canonical([g('1', 'i1'), g('2', 'i2')], [], {}, null);
    const b = canonical([g('2', 'i2'), g('1', 'i1')], [], {}, null);
    const c = canonical([g('1', 'i1'), g('2', 'i2', 'Pull renommé')], [], {}, null);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(fingerprint(a)).not.toBe(fingerprint(c));
  });
  it('ne garde que les copies les plus récentes', () => {
    const index = Array.from({ length: 12 }, (_, i) => meta(`s${i}`, `2026-10-${String(i + 1).padStart(2, '0')}T08:00:00Z`));
    const pruned = snapshotsToPrune(index, 10).map((s) => s.id);
    expect(pruned).toEqual(['s1', 's0']);
  });
  it('une photo est conservée tant qu’une copie l’utilise', () => {
    const garments = [g('1', 'i1')];
    const index = [meta('s1', '2026-10-21T08:00:00Z', ['i2'])];
    expect(unreferencedImages(['i1', 'i2', 'i3'], garments, index)).toEqual(['i3']);
  });
});

describe('rappel de sauvegarde', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  it('rappelle quand il n’y a jamais eu de sauvegarde', () => {
    expect(needsBackupReminder(null, null, now)).toBe(true);
  });
  it('ne rappelle pas avant 14 jours', () => {
    expect(needsBackupReminder('2026-10-10T12:00:00Z', null, now)).toBe(false);
    expect(needsBackupReminder('2026-10-01T12:00:00Z', null, now)).toBe(true);
  });
  it('respecte « Plus tard »', () => {
    expect(needsBackupReminder(null, '2026-10-23T00:00:00Z', now)).toBe(false);
    expect(needsBackupReminder(null, '2026-10-20T00:00:00Z', now)).toBe(true);
  });
});

describe('option Demain', () => {
  // deux jours : aujourd'hui doux et sec, demain froid et pluvieux (heures de sortie 8 h–19 h)
  const hours = (date: string, temp: number, feels: number, rain: number) =>
    Array.from({ length: 24 }, (_, h) => ({ time: `${date}T${String(h).padStart(2, '0')}:00`, temp, feels, rain }));
  const all = [...hours('2026-10-21', 18, 18, 0), ...hours('2026-10-22', 5, 2, 80)];
  const TWO_DAYS = {
    current: SAMPLE.current,
    hourly: {
      time: all.map((h) => h.time),
      temperature_2m: all.map((h) => h.temp),
      apparent_temperature: all.map((h) => h.feels),
      precipitation_probability: all.map((h) => h.rain),
      precipitation: all.map((h) => (h.rain ? 0.4 : 0)),
      weather_code: all.map((h) => (h.rain ? 61 : 1)),
      wind_speed_10m: all.map(() => 10),
      wind_gusts_10m: all.map(() => 20),
    },
    daily: {
      time: ['2026-10-21', '2026-10-22'],
      temperature_2m_max: [19, 6],
      temperature_2m_min: [12, 3],
      apparent_temperature_max: [19, 3],
      apparent_temperature_min: [12, 0],
      precipitation_probability_max: [0, 80],
      precipitation_sum: [0, 9],
      wind_speed_10m_max: [12, 15],
      wind_gusts_10m_max: [20, 30],
      weather_code: [1, 61],
    },
  };

  it('demande deux jours et lit le lendemain', () => {
    expect(new URL(buildOpenMeteoUrl(loc)).searchParams.get('forecast_days')).toBe('2');
    const s = parseOpenMeteo(TWO_DAYS, loc);
    expect(s.today.date).toBe('2026-10-21');
    expect(s.tomorrow?.date).toBe('2026-10-22');
    expect(s.tomorrow?.precipitationProbabilityMax).toBe(80);
    expect(parseOpenMeteo(SAMPLE, loc).tomorrow).toBeUndefined();
  });

  it('les besoins de demain viennent uniquement des heures de demain', () => {
    const s = parseOpenMeteo(TWO_DAYS, loc);
    const prefs = normalizePreferences(null);
    const today = deriveNeeds({ weather: s, prefs });
    const tomorrow = deriveNeeds({ weather: s, prefs, date: '2026-10-22' });
    expect(today.feels).toBe(18);
    expect(today.rain).toBe('none');
    expect(tomorrow.feels).toBe(2);
    expect(tomorrow.rain).toBe('likely');
    expect(tomorrow.band).not.toBe(today.band);
  });

  it('la tenue préparée la veille devient celle du jour', () => {
    const look = { slots: { top: 't', bottom: 'b', accessories: [] }, locked: [], shown: [], occasion: 'quotidien' as const };
    const d = localDate();
    const planned = { ...look, date: d };
    // aucune tenue composée aujourd'hui : la tenue préparée est reprise, avec un message
    const picked = pickPlan('today', null, planned);
    expect(picked?.slots.top).toBe('t');
    expect(picked?.banner).toMatch(/préparée hier/);
    // une tenue déjà composée aujourd'hui reste prioritaire
    const own = { ...look, slots: { top: 'x', bottom: 'y', accessories: [] }, date: d };
    expect(pickPlan('today', own, planned)?.slots.top).toBe('x');
    // une tenue du jour vide ne masque pas la tenue préparée
    expect(pickPlan('today', { ...own, slots: { accessories: [] } }, planned)?.slots.top).toBe('t');
    // l'onglet Demain n'affiche que la tenue datée de demain
    expect(pickPlan('tomorrow', null, planned)).toBeNull();
    expect(pickPlan('tomorrow', null, { ...look, date: localDate(1) })?.slots.top).toBe('t');
  });
});

describe('lavage du dimanche', () => {
  // octobre 2026 : le 25 est un dimanche
  const at = (s: string) => new Date(s);
  const piece = (laundryAt: string | null, availability: 'laundry' | 'available' = 'laundry') =>
    normalizeGarment({ id: 'g', name: 'Pull', category: 'top', subcategory: 'pull', primaryColor: 'black', availability, laundryAt, createdAt: '2026-10-01T10:00:00', updatedAt: '2026-10-01T10:00:00' });

  it('le retour a lieu le dimanche à 17 h', () => {
    expect(lastLaundryReturn(at('2026-10-22T09:00:00')).toString()).toBe(at('2026-10-18T17:00:00').toString());
    expect(lastLaundryReturn(at('2026-10-25T16:59:00')).toString()).toBe(at('2026-10-18T17:00:00').toString());
    expect(lastLaundryReturn(at('2026-10-25T17:00:00')).toString()).toBe(at('2026-10-25T17:00:00').toString());
    expect(nextLaundryReturn(at('2026-10-22T09:00:00')).toString()).toBe(at('2026-10-25T17:00:00').toString());
  });

  it('les pièces mises au lavage avant dimanche 17 h redeviennent propres', () => {
    const g = piece('2026-10-22T08:00:00');
    expect(isBackFromLaundry(g, at('2026-10-25T16:00:00'))).toBe(false);
    expect(isBackFromLaundry(g, at('2026-10-25T17:00:00'))).toBe(true);
    // une pièce mise au lavage dimanche soir attend la machine suivante
    expect(isBackFromLaundry(piece('2026-10-25T18:00:00'), at('2026-10-27T09:00:00'))).toBe(false);
    // plusieurs dimanches sans ouvrir l'app : rattrapé à l'ouverture
    expect(isBackFromLaundry(g, at('2026-11-09T09:00:00'))).toBe(true);
    expect(isBackFromLaundry(piece(null, 'available'), at('2026-11-09T09:00:00'))).toBe(false);
  });

  it('demain : une pièce propre avant la sortie est proposée', () => {
    const g = piece('2026-10-23T08:00:00');
    expect(cleanBy(g, at('2026-10-24T08:00:00'))).toBe(false); // samedi
    expect(cleanBy(g, at('2026-10-26T08:00:00'))).toBe(true); // lundi
  });

  it('propose le linge du quotidien, pas la veste ni les chaussures', () => {
    const c = laundryCandidates({ top: 't', bottom: 'b', outer: 'o', shoes: 's', accessories: ['a'] });
    expect(c.filter((x) => x.checked).map((x) => x.id)).toEqual(['t', 'b']);
    expect(c.map((x) => x.id)).toEqual(['t', 'b', 'o', 's']);
  });
});
