import type { Garment, Occasion, OutfitSlots, Season, SlotName, Style, UserPreferences } from '../domain/types';
import { findSubcategory, type SubcategoryDef } from '../domain/taxonomy';
import { getColor } from '../domain/colors';
import { colorHarmony, type HarmonyResult } from './colorHarmony';
import { matchTrends, type OutfitView, type TrendRule } from './trends';
import type { WeatherNeeds } from './weatherNeeds';
import { WEIGHTS, type ScoreComponent } from './weights';

export interface EngineContext {
  garments: Garment[];
  needs: WeatherNeeds;
  prefs: UserPreferences;
  occasion: Occasion;
  season: Season;
  /** ensembles de vêtements récemment proposés/portés (du plus récent au plus ancien) */
  recent: string[][];
  /** ensembles de vêtements des tenues favorites */
  favorites: string[][];
  rng?: () => number;
}

export type SlotKey = SlotName | 'accessory';

export function subOf(g: Garment, prefs: UserPreferences): SubcategoryDef {
  return (
    findSubcategory(g.subcategory, prefs.customSubcategories) ?? {
      key: g.subcategory,
      label: g.subcategory,
      category: g.category,
      warmth: g.warmth,
    }
  );
}

/** Emplacement naturel d'un vêtement dans une tenue. */
export function slotsFor(g: Garment, prefs: UserPreferences): SlotKey[] {
  switch (g.category) {
    case 'top':
      return subOf(g, prefs).layer ? ['top', 'mid'] : ['top'];
    case 'bottom':
      return ['bottom'];
    case 'onepiece':
      return ['onepiece'];
    case 'outerwear':
      return ['outer'];
    case 'shoes':
      return ['shoes'];
    case 'accessory':
      return ['accessory'];
  }
}

// ---------------------------------------------------------------------------
// Contraintes OBLIGATOIRES (météo). Une pièce qui en viole une est exclue en
// mode strict ; en mode compromis elle est autorisée mais signalée.
// ---------------------------------------------------------------------------

export function weatherIssue(g: Garment, slot: SlotKey, needs: WeatherNeeds, prefs: UserPreferences): string | null {
  if (needs.source === 'none') return null;
  const sub = subOf(g, prefs);
  const b = needs.band;
  const cold = b === 'cool' || b === 'cold' || b === 'freezing';
  const t = needs.feels !== null ? `${Math.round(needs.feels)} °C ressentis` : 'ce temps';

  if (slot === 'shoes') {
    if (sub.openShoe && cold) return `${g.name} : chaussures ouvertes, trop légères pour ${t}.`;
    if (sub.openShoe && needs.rain === 'likely') return `${g.name} : chaussures ouvertes, peu adaptées à la pluie prévue.`;
    if (b === 'hot' && g.warmth >= 4) return `${g.name} : trop chaudes pour ${t}.`;
    return null;
  }
  if (slot === 'accessory') {
    if (sub.coldAccessory && (b === 'hot' || b === 'warm')) return `${g.name} : inutile par ${t}.`;
    return null;
  }
  // pièces du corps
  if (b === 'hot' && g.warmth >= (slot === 'outer' ? 3 : 4)) return `${g.name} : trop chaud pour ${t}.`;
  if (b === 'hot' && sub.layer && g.warmth >= 3) return `${g.name} : maille trop chaude pour ${t}.`;
  if (b === 'warm' && g.warmth >= 4) return `${g.name} : trop chaud pour ${t}.`;
  if (b === 'mild' && g.warmth >= 5) return `${g.name} : trop chaud pour ${t}.`;
  if (cold && sub.legs === 'bare') return `${g.name} : trop léger pour ${t}.`;
  if (slot === 'outer' && needs.outer === 'required' && g.warmth < needs.minOuterWarmth) {
    return `${g.name} : pas assez chaud pour ${t}.`;
  }
  return null;
}

/** Contraintes qui portent sur la tenue entière. */
export function outfitIssues(view: OutfitView, needs: WeatherNeeds): string[] {
  const issues: string[] = [];
  if (needs.source === 'none') return issues;
  if (needs.outer === 'required' && !view.outer) {
    issues.push('Une veste ou un manteau est nécessaire par ce temps.');
  }
  if (needs.outer === 'avoid' && view.outer) {
    issues.push('Une couche extérieure est superflue par cette chaleur.');
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Score esthétique et pratique (0 → 1)
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  total: number;
  components: Record<ScoreComponent, number>;
  harmony: HarmonyResult;
  trends: TrendRule[];
  warmthSum: number;
}

export function viewOf(slots: OutfitSlots, byId: Map<string, Garment>): OutfitView {
  const get = (id?: string) => (id ? byId.get(id) : undefined);
  return {
    top: get(slots.top),
    mid: get(slots.mid),
    bottom: get(slots.bottom),
    onepiece: get(slots.onepiece),
    outer: get(slots.outer),
    shoes: get(slots.shoes),
    accessories: slots.accessories.map((id) => byId.get(id)).filter((g): g is Garment => !!g),
  };
}

export function bodyPieces(v: OutfitView): Garment[] {
  return [v.top, v.mid, v.bottom, v.onepiece, v.outer].filter((g): g is Garment => !!g);
}

export function warmthSum(v: OutfitView): number {
  return (
    (v.top?.warmth ?? 0) +
    (v.mid?.warmth ?? 0) +
    (v.bottom?.warmth ?? 0) +
    (v.onepiece ? v.onepiece.warmth + 1 : 0) +
    (v.outer?.warmth ?? 0)
  );
}

export function signatureOf(slots: OutfitSlots): string[] {
  return [slots.top, slots.mid, slots.bottom, slots.onepiece, slots.outer, slots.shoes]
    .filter((x): x is string => !!x)
    .sort();
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

function weatherScore(v: OutfitView, ctx: EngineContext): number {
  const n = ctx.needs;
  if (n.source === 'none') return 0.7;
  let s = 1;
  const sum = warmthSum(v);
  const [lo, hi] = n.warmthRange;
  if (sum < lo) s -= 0.18 * (lo - sum);
  if (sum > hi) s -= 0.15 * (sum - hi);

  const shoeSub = v.shoes ? subOf(v.shoes, ctx.prefs) : null;
  const rainFactor = n.rain === 'likely' ? 1 : n.rain === 'possible' ? 0.5 : 0;
  if (rainFactor) {
    if (!v.outer) s -= 0.25 * rainFactor;
    else if (!(v.outer.waterproof || v.outer.subcategory === 'impermeable')) s -= 0.15 * rainFactor;
    if (v.shoes && shoeSub && !shoeSub.coveredShoe) {
      s -= (/daim|suède|suede|toile/i.test(v.shoes.material) ? 0.25 : 0.1) * rainFactor;
    }
  }
  const legs = v.bottom ? subOf(v.bottom, ctx.prefs).legs : v.onepiece ? subOf(v.onepiece, ctx.prefs).legs : undefined;
  if (n.windy) {
    if (!v.outer) s -= 0.15;
    if (legs === 'partial') s -= 0.08;
  }
  if ((n.band === 'cold' || n.band === 'freezing') && legs === 'partial') s -= 0.12;
  if (n.variable && !v.mid && !v.outer) s -= 0.15;
  if (n.outer === 'suggested' && !v.outer) s -= 0.12;
  if (n.outer === 'avoid' && v.outer) s -= 0.4;
  if (n.band === 'hot' && v.mid) s -= 0.3;
  return clamp(s);
}

function patternScore(v: OutfitView): number {
  const main = bodyPieces(v).filter((g) => g.pattern !== 'uni').length;
  const minor = [v.shoes, ...v.accessories].filter((g) => g && g.pattern !== 'uni').length;
  const total = main + minor * 0.5;
  if (total === 0) return 0.85;
  if (total <= 1) return 1;
  if (total <= 1.5) return 0.75;
  if (total <= 2) return 0.45;
  return 0.15;
}

const STYLE_COMPAT: Record<string, number> = {
  'casual|streetwear': 0.85,
  'casual|sportif': 0.7,
  'casual|minimaliste': 0.9,
  'casual|chic': 0.7,
  'casual|boheme': 0.8,
  'casual|vintage': 0.8,
  'casual|romantique': 0.7,
  'casual|professionnel': 0.55,
  'chic|professionnel': 0.9,
  'chic|minimaliste': 0.9,
  'chic|romantique': 0.8,
  'chic|vintage': 0.75,
  'chic|streetwear': 0.55,
  'chic|sportif': 0.3,
  'minimaliste|professionnel': 0.9,
  'minimaliste|streetwear': 0.75,
  'minimaliste|sportif': 0.6,
  'minimaliste|romantique': 0.65,
  'professionnel|sportif': 0.2,
  'professionnel|streetwear': 0.35,
  'sportif|streetwear': 0.9,
  'boheme|romantique': 0.85,
  'boheme|vintage': 0.85,
  'romantique|vintage': 0.8,
};

export function styleCompat(a: Style, b: Style): number {
  if (a === b) return 1;
  const key = [a, b].sort().join('|');
  return STYLE_COMPAT[key] ?? 0.5;
}

function styleScore(v: OutfitView, ctx: EngineContext): number {
  const pieces = [...bodyPieces(v), v.shoes].filter((g): g is Garment => !!g);
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i].styles;
      const b = pieces[j].styles;
      let c = 0.75;
      if (a.length && b.length) c = Math.max(...a.flatMap((x) => b.map((y) => styleCompat(x, y))));
      total += c;
      pairs++;
    }
  }
  let s = pairs ? total / pairs : 0.75;
  const all = pieces.flatMap((g) => g.styles);
  if (ctx.occasion === 'sport' && !all.includes('sportif')) s *= 0.7;
  if (ctx.occasion === 'travail' && all.includes('sportif')) s *= 0.8;
  return clamp(s);
}

export function targetFormality(ctx: Pick<EngineContext, 'occasion' | 'prefs'>): number {
  switch (ctx.occasion) {
    case 'sport':
      return 1;
    case 'travail':
      return Math.max(2, ctx.prefs.usualFormality);
    case 'sortie':
      return 2;
    case 'evenement':
      return 3;
    default:
      return ctx.prefs.usualFormality;
  }
}

function formalityScore(v: OutfitView, ctx: EngineContext): number {
  const pieces = [...bodyPieces(v), v.shoes].filter((g): g is Garment => !!g);
  if (!pieces.length) return 0.7;
  const target = targetFormality(ctx);
  const diffs = pieces.map((g) => Math.abs(g.formality - target));
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const fs = pieces.map((g) => g.formality);
  const spread = Math.max(...fs) - Math.min(...fs);
  return clamp(1 - 0.32 * avg - (spread >= 2 ? 0.2 : 0));
}

function proportionScore(v: OutfitView): number {
  const up = [v.top, v.mid, v.outer].filter((g): g is Garment => !!g).map((g) => g.silhouette);
  const down = v.bottom?.silhouette ?? null;
  if (!down || up.every((s) => s === null)) return 0.8;
  const upAmple = up.includes('ample');
  if (upAmple && down === 'ample') return 0.55;
  if ((upAmple && down === 'ajuste') || (up.includes('ajuste') && down === 'ample')) return 1;
  return 0.85;
}

function seasonScore(v: OutfitView, season: Season): number {
  const pieces = [...bodyPieces(v), v.shoes].filter((g): g is Garment => !!g);
  if (!pieces.length) return 0.8;
  const ok = pieces.map((g) => (g.seasons.length === 0 || g.seasons.includes(season) ? 1 : 0.5));
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

function preferenceScore(v: OutfitView, ctx: EngineContext): number {
  const p = ctx.prefs;
  const pieces = [...bodyPieces(v), v.shoes, ...v.accessories].filter((g): g is Garment => !!g);
  let s = 0.7;
  const colors = pieces.map((g) => g.primaryColor);
  s += Math.min(0.2, 0.1 * colors.filter((c) => p.favoriteColors.includes(c)).length);
  s -= 0.1 * colors.filter((c) => p.rareColors.includes(c)).length;
  s += Math.min(0.2, 0.1 * pieces.filter((g) => g.styles.some((st) => p.favoriteStyles.includes(st))).length);
  s -= 0.35 * pieces.filter((g) => g.styles.some((st) => p.avoidedStyles.includes(st))).length;
  if (p.comfort === 'confort') s -= 0.06 * pieces.filter((g) => g.formality === 3).length;
  return clamp(s);
}

function trendScore(trends: TrendRule[]): number {
  return clamp(0.5 + 0.2 * trends.length);
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function diversityScore(sig: string[], ctx: EngineContext): number {
  let maxJ = 0;
  ctx.recent.slice(0, 15).forEach((r, i) => {
    const decay = 1 - i * 0.04;
    maxJ = Math.max(maxJ, jaccard(sig, r) * decay);
  });
  let s = 1 - 0.9 * maxJ;
  const isFav = ctx.favorites.some((f) => jaccard(f, sig) === 1);
  if (isFav && maxJ < 0.9) s += 0.15; // association appréciée, pas portée récemment
  return clamp(s);
}

export function scoreOutfit(slots: OutfitSlots, ctx: EngineContext, byId: Map<string, Garment>): ScoreBreakdown {
  const v = viewOf(slots, byId);
  const mainColors = [...bodyPieces(v), v.shoes].filter((g): g is Garment => !!g).map((g) => g.primaryColor);
  const accents = v.accessories.map((a) => a.primaryColor).filter((c) => getColor(c).tone === 'bold');
  const harmony = colorHarmony(mainColors, accents);
  // bonus « rappel de couleur » : chaussures/accessoire reprenant une couleur secondaire
  const secondaries = new Set(bodyPieces(v).flatMap((g) => g.secondaryColors));
  const echo = [v.shoes, ...v.accessories].some((g) => g && getColor(g.primaryColor).tone !== 'neutral' && secondaries.has(g.primaryColor));
  const trends = matchTrends(v);
  const components: Record<ScoreComponent, number> = {
    weather: weatherScore(v, ctx),
    color: clamp(harmony.score + (echo ? 0.06 : 0)),
    pattern: patternScore(v),
    style: styleScore(v, ctx),
    formality: formalityScore(v, ctx),
    proportion: proportionScore(v),
    season: seasonScore(v, ctx.season),
    preference: preferenceScore(v, ctx),
    trend: trendScore(trends),
    diversity: diversityScore(signatureOf(slots), ctx),
  };
  let total = 0;
  for (const k of Object.keys(WEIGHTS) as ScoreComponent[]) total += WEIGHTS[k] * components[k];
  return { total, components, harmony, trends, warmthSum: warmthSum(v) };
}
