import { describe, expect, it } from 'vitest';
import type { Garment, ManualWeather, WeatherSnapshot } from '../domain/types';
import { defaultPreferences, normalizeGarment } from '../domain/normalize';
import { deriveNeeds } from './weatherNeeds';
import { adaptOutfit, evaluateOutfit, generateOutfit, mulberry32, rankAlternatives, wearWith } from './generator';
import type { EngineContext } from './rules';
import { colorHarmony } from './colorHarmony';
import { nearestColor } from '../domain/colors';

let n = 0;
function g(p: Partial<Garment> & Pick<Garment, 'category' | 'subcategory'>): Garment {
  return normalizeGarment({ id: `g${++n}`, name: p.subcategory, primaryColor: 'noir', ...p });
}

const prefs = defaultPreferences();

function ctxFor(garments: Garment[], manual: ManualWeather | null, seed = 1, extra: Partial<EngineContext> = {}): EngineContext {
  return {
    garments,
    needs: deriveNeeds({ weather: null, manual, prefs }),
    prefs,
    occasion: 'quotidien',
    season: 'automne',
    recent: [],
    favorites: [],
    rng: mulberry32(seed),
    ...extra,
  };
}

function wardrobe() {
  return {
    tee: g({ category: 'top', subcategory: 'tshirt', primaryColor: 'blanc', styles: ['casual'] }),
    shirt: g({ category: 'top', subcategory: 'chemise', primaryColor: 'bleu-ciel', styles: ['chic', 'casual'], formality: 2 }),
    pull: g({ category: 'top', subcategory: 'pull', primaryColor: 'camel', styles: ['casual'], warmth: 3 }),
    jean: g({ category: 'bottom', subcategory: 'jean', primaryColor: 'denim', styles: ['casual'] }),
    short: g({ category: 'bottom', subcategory: 'short', primaryColor: 'ecru', styles: ['casual'], warmth: 1 }),
    skirt: g({ category: 'bottom', subcategory: 'jupe', primaryColor: 'noir', styles: ['chic'] }),
    coat: g({ category: 'outerwear', subcategory: 'manteau', primaryColor: 'camel', styles: ['chic', 'casual'], warmth: 4 }),
    rain: g({ category: 'outerwear', subcategory: 'impermeable', primaryColor: 'kaki', waterproof: true, styles: ['casual'] }),
    sneakers: g({ category: 'shoes', subcategory: 'baskets', primaryColor: 'blanc', styles: ['casual', 'streetwear'] }),
    boots: g({ category: 'shoes', subcategory: 'bottines', primaryColor: 'noir', styles: ['chic', 'casual'] }),
    sandals: g({ category: 'shoes', subcategory: 'sandales', primaryColor: 'beige', styles: ['casual'] }),
    scarf: g({ category: 'accessory', subcategory: 'echarpe', primaryColor: 'bordeaux' }),
  };
}

describe('deriveNeeds', () => {
  it('utilise le ressenti sur les heures de sortie et la sensibilité au froid', () => {
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      time: `2026-10-21T${String(h).padStart(2, '0')}:00`,
      temperature: h < 8 ? 2 : 14,
      feelsLike: h < 8 ? 0 : 12,
      precipitationProbability: h === 15 ? 70 : 10,
      precipitation: h === 15 ? 1.5 : 0,
      weatherCode: 3,
      windSpeed: 10,
      windGusts: 20,
    }));
    const w = { hourly, current: {}, today: {}, location: {}, timestamp: '', provider: 'test' } as unknown as WeatherSnapshot;
    const needs = deriveNeeds({ weather: w, prefs });
    expect(needs.feels).toBe(12); // les heures avant 8 h sont ignorées
    expect(needs.band).toBe('cool');
    expect(needs.rain).toBe('likely');
    expect(needs.outer).toBe('required');

    const frileuse = deriveNeeds({ weather: w, prefs: { ...prefs, coldSensitivity: -1 } });
    expect(frileuse.adjusted).toBe(9);
  });

  it('les seuils sont configurables', () => {
    const custom = { ...prefs, thresholds: { ...prefs.thresholds, cool: 12, mild: 18 } };
    const needs = deriveNeeds({ weather: null, manual: { band: 'cool', rain: false, windy: false }, prefs: custom });
    expect(needs.band).toBe('cool');
  });
});

describe('generateOutfit — contraintes météo', () => {
  it('par grand froid : manteau chaud obligatoire, jamais de short ni sandales', () => {
    const w = wardrobe();
    for (let seed = 1; seed < 20; seed++) {
      const res = generateOutfit(ctxFor(Object.values(w), { band: 'cold', rain: false, windy: false }, seed));
      expect(res.status).toBe('ok');
      const s = res.proposal!.slots;
      expect(s.outer).toBe(w.coat.id);
      expect(s.bottom).not.toBe(w.short.id);
      expect(s.shoes).not.toBe(w.sandals.id);
    }
  });

  it('par forte chaleur : pas de manteau, pas de pull, pas de bottines', () => {
    const w = wardrobe();
    for (let seed = 1; seed < 20; seed++) {
      const res = generateOutfit(ctxFor(Object.values(w), { band: 'hot', rain: false, windy: false }, seed));
      const s = res.proposal!.slots;
      expect(res.status).toBe('ok');
      expect(s.outer).toBeUndefined();
      expect(s.mid).toBeUndefined();
      expect(s.top).not.toBe(w.pull.id);
      expect(s.accessories).not.toContain(w.scarf.id);
    }
  });

  it('sous la pluie : chaussures fermées et imperméable privilégiés', () => {
    const w = wardrobe();
    const res = generateOutfit(ctxFor(Object.values(w), { band: 'mild', rain: true, windy: false }));
    const s = res.proposal!.slots;
    expect(s.shoes).not.toBe(w.sandals.id);
    expect(s.outer).toBe(w.rain.id);
  });

  it("n'utilise que des pièces disponibles de la garde-robe", () => {
    const w = wardrobe();
    w.jean.availability = 'laundry';
    w.skirt.availability = 'unavailable';
    const ids = new Set(Object.values(w).map((x) => x.id));
    const res = generateOutfit(ctxFor(Object.values(w), { band: 'cool', rain: false, windy: false }));
    // Seul bas disponible : le short, interdit par temps frais → compromis signalé
    expect(res.status).toBe('compromise');
    expect(res.proposal!.warnings.join(' ')).toMatch(/trop léger/);
    for (const id of Object.values(res.proposal!.slots).flat()) expect(ids.has(id as string)).toBe(true);
    expect(res.proposal!.slots.bottom).toBe(w.short.id);
  });

  it('signale clairement l’absence de manteau par temps froid au lieu de prétendre que tout va bien', () => {
    const w = wardrobe();
    const garments = Object.values(w).filter((x) => x.category !== 'outerwear');
    const res = generateOutfit(ctxFor(garments, { band: 'cold', rain: false, windy: false }));
    expect(res.status).toBe('compromise');
    expect(res.proposal!.warnings.some((x) => /manteau/.test(x))).toBe(true);
  });

  it('explique pourquoi une tenue est impossible', () => {
    const w = wardrobe();
    const res = generateOutfit(ctxFor([w.tee, w.sneakers], { band: 'mild', rain: false, windy: false }));
    expect(res.status).toBe('impossible');
    expect(res.reasons.join(' ')).toMatch(/au moins un bas/);
    expect(generateOutfit(ctxFor([], null)).reasons[0]).toMatch(/vide/);
  });

  it('robe : ne force pas haut + bas', () => {
    const dress = g({ category: 'onepiece', subcategory: 'robe', primaryColor: 'rose-poudre', styles: ['romantique'] });
    const sandals = g({ category: 'shoes', subcategory: 'sandales', primaryColor: 'beige' });
    const res = generateOutfit(ctxFor([dress, sandals], { band: 'hot', rain: false, windy: false }));
    expect(res.proposal!.slots.onepiece).toBe(dress.id);
    expect(res.proposal!.slots.top).toBeUndefined();
    expect(res.proposal!.slots.bottom).toBeUndefined();
  });
});

describe('verrouillage, remplacement, diversité', () => {
  it('conserve une pièce verrouillée compatible', () => {
    const w = wardrobe();
    for (let seed = 1; seed < 10; seed++) {
      const res = generateOutfit(ctxFor(Object.values(w), { band: 'cool', rain: false, windy: false }, seed), {
        locked: { bottom: w.skirt.id, accessories: [] },
      });
      expect(res.proposal!.slots.bottom).toBe(w.skirt.id);
    }
  });

  it('ne conserve pas une pièce verrouillée incompatible avec la météo, et le dit', () => {
    const w = wardrobe();
    const res = generateOutfit(ctxFor(Object.values(w), { band: 'cold', rain: false, windy: false }), {
      locked: { bottom: w.short.id, accessories: [] },
    });
    expect(res.proposal!.slots.bottom).not.toBe(w.short.id);
    expect(res.notices.join(' ')).toMatch(/non conservée/);
  });

  it('propose une tenue différente quand on redemande', () => {
    const w = wardrobe();
    const ctx = ctxFor(Object.values(w), { band: 'mild', rain: false, windy: false }, 3);
    const first = generateOutfit(ctx).proposal!;
    const second = generateOutfit(ctx, { exclude: [first.signature] }).proposal!;
    expect(second.signature).not.toBe(first.signature);
  });

  it('classe les alternatives pour un emplacement et signale les pièces inadaptées', () => {
    const w = wardrobe();
    const ctx = ctxFor(Object.values(w), { band: 'cold', rain: false, windy: false });
    const res = generateOutfit(ctx).proposal!;
    const alts = rankAlternatives('shoes', res.slots, ctx);
    expect(alts.length).toBe(3);
    expect(alts[alts.length - 1].garment.id).toBe(w.sandals.id);
    expect(alts[alts.length - 1].issue).toBeTruthy();
  });

  it('favori : détecte une pièce au lavage et ne remplace que celle-ci', () => {
    const w = wardrobe();
    const slots = { top: w.pull.id, bottom: w.jean.id, outer: w.coat.id, shoes: w.boots.id, accessories: [] };
    w.jean.availability = 'laundry';
    const ctx = ctxFor(Object.values(w), { band: 'cold', rain: false, windy: false });
    const ev = evaluateOutfit(slots, ctx);
    expect(ev.issues.map((i) => i.slot)).toEqual(['bottom']);
    const adapted = adaptOutfit(slots, ctx).proposal!.slots;
    expect(adapted.top).toBe(w.pull.id);
    expect(adapted.outer).toBe(w.coat.id);
    expect(adapted.shoes).toBe(w.boots.id);
    expect(adapted.bottom).toBe(w.skirt.id);
  });

  it('les explications ne parlent que des pièces choisies', () => {
    const w = wardrobe();
    const res = generateOutfit(ctxFor(Object.values(w), { band: 'cold', rain: false, windy: false })).proposal!;
    const text = res.explanation.join(' ');
    expect(text).toMatch(/manteau/i);
    expect(text).not.toMatch(/imperméable/i);
  });

  it('gère une grande garde-robe rapidement', () => {
    const colors = ['noir', 'blanc', 'denim', 'camel', 'rouge', 'sauge', 'lilas', 'marine'];
    const subs: [Garment['category'], string][] = [
      ['top', 'tshirt'], ['top', 'pull'], ['top', 'chemise'], ['bottom', 'jean'], ['bottom', 'pantalon'],
      ['outerwear', 'manteau'], ['outerwear', 'veste'], ['shoes', 'baskets'], ['shoes', 'bottines'], ['accessory', 'sac'],
    ];
    const big: Garment[] = [];
    for (let i = 0; i < 300; i++) {
      const [category, subcategory] = subs[i % subs.length];
      big.push(g({ category, subcategory, primaryColor: colors[i % colors.length], styles: ['casual'] }));
    }
    const t0 = performance.now();
    const res = generateOutfit(ctxFor(big, { band: 'cool', rain: true, windy: false }));
    expect(res.status).toBe('ok');
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('à porter avec', () => {
  it('propose des pièces de la garde-robe adaptées à la saison de la pièce', () => {
    const w = wardrobe();
    const suggestions = wearWith(w.coat, ctxFor(Object.values(w), null));
    const ids = suggestions.map((g) => g.id);
    expect(ids.length).toBeGreaterThan(2);
    expect(ids).not.toContain(w.coat.id);
    expect(ids).not.toContain(w.sandals.id);
    expect(ids).not.toContain(w.short.id);
  });
  it('fonctionne aussi pour une pièce au lavage', () => {
    const w = wardrobe();
    w.jean.availability = 'laundry';
    expect(wearWith(w.jean, ctxFor(Object.values(w), null)).length).toBeGreaterThan(0);
  });
});

describe('couleurs', () => {
  it('une couleur forte sur base neutre est la meilleure harmonie', () => {
    expect(colorHarmony(['noir', 'blanc', 'rouge']).score).toBe(1);
  });
  it('deux couleurs vives non complémentaires sont pénalisées', () => {
    expect(colorHarmony(['rouge', 'vert', 'blanc']).score).toBeLessThan(0.75);
    expect(colorHarmony(['jaune', 'rose-vif']).score).toBeLessThan(0.5);
  });
  it('associe une couleur photographiée au nuancier', () => {
    expect(nearestColor(25, 25, 28)).toBe('noir');
    expect(nearestColor(200, 40, 45)).toBe('rouge');
    expect(nearestColor(75, 105, 145)).toBe('denim');
  });
});
