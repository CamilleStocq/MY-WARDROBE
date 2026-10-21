import type { Garment, OutfitSlots, SlotName, TemperatureBand } from '../domain/types';
import { STYLE_LABELS, OCCASION_LABELS } from '../domain/taxonomy';
import { getColor } from '../domain/colors';
import {
  bodyPieces,
  outfitIssues,
  scoreOutfit,
  signatureOf,
  subOf,
  targetFormality,
  viewOf,
  weatherIssue,
  slotsFor,
  type EngineContext,
  type ScoreBreakdown,
  type SlotKey,
} from './rules';
import { BAND_LABELS, deriveNeeds } from './weatherNeeds';
import { TREND_BASE } from './trends';
import { BASE_BEAM, PICK_AMONG, PICK_SHARPNESS } from './weights';

export interface Proposal {
  slots: OutfitSlots;
  score: ScoreBreakdown;
  explanation: string[];
  warnings: string[];
  signature: string;
  compromise: boolean;
}

export interface GenerationResult {
  status: 'ok' | 'compromise' | 'impossible';
  proposal?: Proposal;
  alternatives: Proposal[];
  /** informations (pièce verrouillée ignorée, etc.) */
  notices: string[];
  /** raisons d'impossibilité */
  reasons: string[];
}

export interface GenerateOptions {
  locked?: Partial<OutfitSlots>;
  /** signatures déjà montrées pendant la session (évite de reproposer la même tenue) */
  exclude?: string[];
  alternatives?: number;
}

/** Générateur pseudo-aléatoire reproductible (tests). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLOT_NAMES: SlotName[] = ['top', 'mid', 'bottom', 'onepiece', 'outer', 'shoes'];
const COLD_BANDS = ['cool', 'cold', 'freezing'];

const sigKey = (slots: OutfitSlots) => signatureOf(slots).join('+');

interface Candidate {
  slots: OutfitSlots;
  score: ScoreBreakdown;
  issues: string[];
}

function poolFor(slot: SlotKey, pool: Garment[], ctx: EngineContext): Garment[] {
  return pool.filter((g) => {
    switch (slot) {
      case 'top':
        return g.category === 'top';
      case 'mid':
        return g.category === 'top' && !!subOf(g, ctx.prefs).layer;
      case 'bottom':
        return g.category === 'bottom';
      case 'onepiece':
        return g.category === 'onepiece';
      case 'outer':
        return g.category === 'outerwear';
      case 'shoes':
        return g.category === 'shoes';
      case 'accessory':
        return g.category === 'accessory';
    }
  });
}

function collectIssues(slots: OutfitSlots, ctx: EngineContext, byId: Map<string, Garment>): string[] {
  const issues: string[] = [];
  for (const s of SLOT_NAMES) {
    const g = slots[s] ? byId.get(slots[s]!) : undefined;
    if (g) {
      const i = weatherIssue(g, s, ctx.needs, ctx.prefs);
      if (i) issues.push(i);
    }
  }
  for (const id of slots.accessories) {
    const g = byId.get(id);
    const i = g && weatherIssue(g, 'accessory', ctx.needs, ctx.prefs);
    if (i) issues.push(i);
  }
  issues.push(...outfitIssues(viewOf(slots, byId), ctx.needs));
  return issues;
}

function buildCandidates(
  ctx: EngineContext,
  pool: Garment[],
  locked: Partial<OutfitSlots>,
  strict: boolean,
  byId: Map<string, Garment>,
): Candidate[] {
  const rng = ctx.rng ?? Math.random;
  const ok = (g: Garment, slot: SlotKey) => !strict || !weatherIssue(g, slot, ctx.needs, ctx.prefs);
  const filtered = (slot: SlotKey) => poolFor(slot, pool, ctx).filter((g) => ok(g, slot));
  const lockedOr = (slot: SlotName, list: Garment[]) => {
    const id = locked[slot];
    if (!id) return list;
    const g = byId.get(id);
    return g ? [g] : [];
  };

  const tops = lockedOr('top', filtered('top'));
  const bottoms = lockedOr('bottom', filtered('bottom'));
  const onepieces = lockedOr('onepiece', filtered('onepiece'));
  const mids = filtered('mid');
  const outers = filtered('outer');
  const shoes = filtered('shoes');
  const accessories = filtered('accessory');

  const bases: OutfitSlots[] = [];
  if (!locked.onepiece) {
    for (const t of tops) for (const b of bottoms) bases.push({ top: t.id, bottom: b.id, accessories: [] });
  }
  if (!locked.top && !locked.bottom) {
    for (const o of onepieces) bases.push({ onepiece: o.id, accessories: [] });
  }
  if (!bases.length) return [];

  const prescored = bases
    .map((b) => ({ b, s: scoreOutfit(b, ctx, byId).total + rng() * 0.05 }))
    .sort((x, y) => y.s - x.s)
    .slice(0, BASE_BEAM);

  const needs = ctx.needs;
  const midWanted = COLD_BANDS.includes(needs.band) || needs.variable;
  const results: Candidate[] = [];

  const pickBest = (base: OutfitSlots, slot: SlotName, options: (Garment | undefined)[]): OutfitSlots => {
    let best = base;
    let bestScore = -Infinity;
    for (const g of options) {
      const s: OutfitSlots = { ...base, [slot]: g?.id };
      if (!g) delete s[slot];
      const sc = scoreOutfit(s, ctx, byId).total;
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    return best;
  };

  for (const { b } of prescored) {
    let s: OutfitSlots = { ...b };
    const top = s.top ? byId.get(s.top) : undefined;

    // couche intermédiaire
    if (locked.mid && locked.mid !== s.top) {
      s.mid = locked.mid;
    } else if (midWanted && !(top && subOf(top, ctx.prefs).layer)) {
      s = pickBest(s, 'mid', [undefined, ...mids.filter((m) => m.id !== s.top)]);
    }

    // couche extérieure
    if (locked.outer) {
      s.outer = locked.outer;
    } else if (needs.outer === 'required' && strict) {
      if (!outers.length) continue;
      s = pickBest(s, 'outer', outers);
    } else if (needs.outer === 'avoid' && strict) {
      // rien
    } else {
      s = pickBest(s, 'outer', [undefined, ...outers]);
    }

    // chaussures
    if (locked.shoes) s.shoes = locked.shoes;
    else if (shoes.length) s = pickBest(s, 'shoes', shoes);

    // accessoires
    if (locked.accessories && locked.accessories.length) {
      s.accessories = [...locked.accessories];
    } else {
      const acc: string[] = [];
      const bags = accessories.filter((a) => a.subcategory === 'sac');
      if (bags.length) {
        const withBag = pickAccessory(s, bags, ctx, byId);
        if (withBag) acc.push(withBag);
      }
      if (needs.band === 'cold' || needs.band === 'freezing' || (needs.band === 'cool' && needs.windy)) {
        const warm = accessories.filter((a) => subOf(a, ctx.prefs).coldAccessory);
        const pick = pickAccessory({ ...s, accessories: acc }, warm, ctx, byId);
        if (pick) acc.push(pick);
      }
      s.accessories = acc;
    }

    const issues = collectIssues(s, ctx, byId);
    if (strict && issues.length) continue;
    results.push({ slots: s, score: scoreOutfit(s, ctx, byId), issues });
  }

  const seen = new Set<string>();
  return results.filter((c) => {
    const k = sigKey(c.slots);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function pickAccessory(s: OutfitSlots, options: Garment[], ctx: EngineContext, byId: Map<string, Garment>): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const g of options) {
    const sc = scoreOutfit({ ...s, accessories: [...s.accessories, g.id] }, ctx, byId).total;
    if (sc > bestScore) {
      bestScore = sc;
      best = g.id;
    }
  }
  return best;
}

function weightedPick<T extends { rank: number }>(items: T[], rng: () => number): T {
  const top = items[0].rank;
  const weights = items.map((i) => Math.exp((i.rank - top) * PICK_SHARPNESS));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function generateOutfit(ctx: EngineContext, opts: GenerateOptions = {}): GenerationResult {
  const rng = ctx.rng ?? Math.random;
  const byId = new Map(ctx.garments.map((g) => [g.id, g]));
  const pool = ctx.garments.filter((g) => g.availability === 'available');
  const notices: string[] = [];

  // Pièces verrouillées : on vérifie qu'elles existent et sont disponibles.
  const locked: Partial<OutfitSlots> = {};
  for (const s of SLOT_NAMES) {
    const id = opts.locked?.[s];
    if (!id) continue;
    const g = byId.get(id);
    if (!g) notices.push('Une pièce verrouillée a été supprimée de la garde-robe.');
    else if (g.availability !== 'available') notices.push(`${g.name} est verrouillée mais indisponible : elle a été remplacée.`);
    else locked[s] = id;
  }
  if (opts.locked?.accessories?.length) {
    locked.accessories = opts.locked.accessories.filter((id) => byId.get(id)?.availability === 'available');
  }

  // Mode strict : une pièce verrouillée incompatible avec la météo n'est pas conservée.
  const strictLocked: Partial<OutfitSlots> = { ...locked };
  const dropped: string[] = [];
  for (const s of SLOT_NAMES) {
    const id = strictLocked[s];
    const g = id ? byId.get(id) : undefined;
    const issue = g && weatherIssue(g, s, ctx.needs, ctx.prefs);
    if (issue) {
      dropped.push(issue);
      delete strictLocked[s];
    }
  }

  let compromise = false;
  let candidates = buildCandidates(ctx, pool, strictLocked, true, byId);
  if (candidates.length && dropped.length) {
    notices.push(...dropped.map((d) => `Pièce verrouillée non conservée — ${d}`));
  }
  if (!candidates.length) {
    candidates = buildCandidates(ctx, pool, locked, false, byId);
    compromise = candidates.length > 0;
  }
  if (!candidates.length) {
    return { status: 'impossible', alternatives: [], notices, reasons: wardrobeGaps(ctx.garments) };
  }

  const ranked = candidates
    .map((c) => ({ ...c, rank: c.score.total - 0.15 * c.issues.length }))
    .sort((a, b) => b.rank - a.rank);
  const exclude = new Set(opts.exclude ?? []);
  const fresh = ranked.filter((c) => !exclude.has(sigKey(c.slots)));
  const pickFrom = (fresh.length ? fresh : ranked).slice(0, PICK_AMONG);
  const chosen = weightedPick(pickFrom, rng);

  const toProposal = (c: Candidate): Proposal => {
    const { explanation, warnings } = explain(c.slots, ctx, byId, c.score, c.issues);
    return { slots: c.slots, score: c.score, explanation, warnings, signature: sigKey(c.slots), compromise: c.issues.length > 0 };
  };

  const altCount = opts.alternatives ?? 3;
  const alternatives = (fresh.length ? fresh : ranked)
    .filter((c) => c !== chosen)
    .slice(0, altCount)
    .map(toProposal);

  return {
    status: compromise ? 'compromise' : 'ok',
    proposal: toProposal(chosen),
    alternatives,
    notices,
    reasons: [],
  };
}

// ---------------------------------------------------------------------------
// Remplacer une pièce
// ---------------------------------------------------------------------------

export interface Alternative {
  garment: Garment;
  total: number;
  issue: string | null;
}

export function rankAlternatives(slot: SlotKey, slots: OutfitSlots, ctx: EngineContext): Alternative[] {
  const byId = new Map(ctx.garments.map((g) => [g.id, g]));
  const pool = poolFor(slot, ctx.garments, ctx).filter((g) => g.availability === 'available');
  return pool
    .filter((g) => !Object.values(slots).flat().includes(g.id) || (slot !== 'accessory' && slots[slot as SlotName] === g.id))
    .map((g) => {
      const s: OutfitSlots =
        slot === 'accessory' ? { ...slots, accessories: [...slots.accessories, g.id] } : { ...slots, [slot]: g.id };
      return {
        garment: g,
        total: scoreOutfit(s, ctx, byId).total,
        issue: weatherIssue(g, slot, ctx.needs, ctx.prefs),
      };
    })
    .sort((a, b) => (a.issue ? 1 : 0) - (b.issue ? 1 : 0) || b.total - a.total);
}

// ---------------------------------------------------------------------------
// Évaluer une tenue existante (favoris → « la porter à nouveau »)
// ---------------------------------------------------------------------------

export interface SlotIssue {
  slot: SlotKey;
  garmentId: string | null;
  reason: string;
}

export interface Evaluation {
  issues: SlotIssue[];
  score: ScoreBreakdown;
  explanation: string[];
  warnings: string[];
}

export function evaluateOutfit(slots: OutfitSlots, ctx: EngineContext): Evaluation {
  const byId = new Map(ctx.garments.map((g) => [g.id, g]));
  const issues: SlotIssue[] = [];
  const check = (slot: SlotKey, id: string) => {
    const g = byId.get(id);
    if (!g) return issues.push({ slot, garmentId: id, reason: 'Cette pièce a été supprimée de la garde-robe.' });
    if (g.availability === 'laundry') return issues.push({ slot, garmentId: id, reason: `${g.name} est au lavage.` });
    if (g.availability === 'unavailable') return issues.push({ slot, garmentId: id, reason: `${g.name} est indisponible.` });
    const w = weatherIssue(g, slot, ctx.needs, ctx.prefs);
    if (w) issues.push({ slot, garmentId: id, reason: w });
  };
  for (const s of SLOT_NAMES) if (slots[s]) check(s, slots[s]!);
  slots.accessories.forEach((id) => check('accessory', id));
  const present: OutfitSlots = {
    ...slots,
    accessories: slots.accessories.filter((id) => byId.has(id)),
  };
  for (const s of SLOT_NAMES) if (present[s] && !byId.has(present[s]!)) delete present[s];
  const v = viewOf(present, byId);
  for (const reason of outfitIssues(v, ctx.needs)) {
    issues.push({ slot: 'outer', garmentId: present.outer ?? null, reason });
  }
  const score = scoreOutfit(present, ctx, byId);
  const { explanation, warnings } = explain(present, ctx, byId, score, issues.map((i) => i.reason));
  return { issues, score, explanation, warnings };
}

/** Adapte une tenue : conserve les pièces valides, remplace seulement les autres. */
export function adaptOutfit(slots: OutfitSlots, ctx: EngineContext): GenerationResult {
  const ev = evaluateOutfit(slots, ctx);
  const bad = new Set(ev.issues.map((i) => i.garmentId).filter(Boolean));
  const locked: Partial<OutfitSlots> = { accessories: slots.accessories.filter((id) => !bad.has(id)) };
  for (const s of SLOT_NAMES) if (slots[s] && !bad.has(slots[s]!)) locked[s] = slots[s];
  // si la veste était superflue (chaleur), on ne la verrouille pas
  if (ctx.needs.outer === 'avoid') delete locked.outer;
  return generateOutfit(ctx, { locked });
}

// ---------------------------------------------------------------------------
// Explications « Pourquoi ce look ? » — dérivées des pièces réellement choisies
// ---------------------------------------------------------------------------

export function explain(
  slots: OutfitSlots,
  ctx: EngineContext,
  byId: Map<string, Garment>,
  score: ScoreBreakdown,
  issues: string[],
): { explanation: string[]; warnings: string[] } {
  const v = viewOf(slots, byId);
  const n = ctx.needs;
  const out: string[] = [];
  const warnings: string[] = [...issues];
  const lc = (g?: Garment) => (g ? g.name.toLowerCase() : '');

  // Météo
  if (n.source !== 'none' && n.feels !== null && !issues.length) {
    const t = Math.round(n.feels);
    if (n.band === 'hot' || n.band === 'warm') {
      out.push(`Des pièces légères pour un temps ${BAND_LABELS[n.band]} (${t} °C ressentis).`);
    } else if (v.mid && v.outer) {
      out.push(`Trois couches (${lc(v.top)}, ${lc(v.mid)}, ${lc(v.outer)}) pour un ressenti de ${t} °C.`);
    } else if (v.outer) {
      out.push(`${v.outer.name} pour un temps ${BAND_LABELS[n.band]} (${t} °C ressentis).`);
    } else {
      out.push(`Une tenue adaptée à un temps ${BAND_LABELS[n.band]} (${t} °C ressentis).`);
    }
  }
  if (n.variable && (v.mid || v.outer) && !issues.length) {
    out.push(`La superposition permet de s'adapter : la température varie de ${Math.round(n.spread ?? 0)} °C dans la journée.`);
  }
  if (n.rain !== 'none') {
    const prob = n.rainProbability !== null ? ` (${n.rainProbability} %)` : '';
    const wp = v.outer && (v.outer.waterproof || v.outer.subcategory === 'impermeable');
    if (wp) out.push(`${v.outer!.name} : protège de la pluie prévue${prob}.`);
    else warnings.push(`Pluie ${n.rain === 'likely' ? 'probable' : 'possible'}${prob} : aucune pièce imperméable dans cette tenue, pensez au parapluie.`);
    if (v.shoes && subOf(v.shoes, ctx.prefs).coveredShoe) out.push(`${v.shoes.name} fermées : adaptées au temps humide.`);
  }
  if (n.windy && v.outer && !issues.length) out.push('Une couche extérieure pour couper le vent annoncé.');

  // Couleurs
  out.push(score.harmony.note);

  // Motifs
  const patterned = bodyPieces(v).filter((g) => g.pattern !== 'uni');
  if (patterned.length === 1) out.push(`${patterned[0].name} apporte le motif ; le reste de la tenue reste uni pour le mettre en valeur.`);
  if (patterned.length >= 2) warnings.push('Plusieurs motifs dans la même tenue : un parti pris audacieux.');

  // Style
  const pieces = [...bodyPieces(v), v.shoes].filter((g): g is Garment => !!g);
  const counts = new Map<string, number>();
  pieces.forEach((g) => g.styles.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1)));
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length && sorted[0][1] >= Math.max(2, Math.ceil(pieces.length * 0.6))) {
    out.push(`Ligne cohérente : ${STYLE_LABELS[sorted[0][0] as keyof typeof STYLE_LABELS].toLowerCase()}.`);
  } else if (sorted.length >= 2) {
    out.push(
      `Un mélange ${STYLE_LABELS[sorted[0][0] as keyof typeof STYLE_LABELS].toLowerCase()} / ${STYLE_LABELS[sorted[1][0] as keyof typeof STYLE_LABELS].toLowerCase()} qui garde de la personnalité.`,
    );
  }
  if (score.components.formality >= 0.8 && ctx.occasion !== 'quotidien') {
    out.push(`Niveau d'habillement adapté : ${OCCASION_LABELS[ctx.occasion].toLowerCase()}.`);
  } else if (score.components.formality < 0.6) {
    const target = targetFormality(ctx);
    warnings.push(target >= 2 ? 'Certaines pièces sont plus décontractées que l’occasion choisie.' : 'Certaines pièces sont plus habillées que l’occasion choisie.');
  }

  // Préférences
  const fav = pieces.map((g) => g.primaryColor).find((c) => ctx.prefs.favoriteColors.includes(c));
  if (fav) out.push(`Inclut une de vos couleurs préférées : ${getColor(fav).label.toLowerCase()}.`);

  // Tendances (base éditoriale, clairement identifiée)
  const trend = score.trends.find((t) => t.kind === 'seasonal') ?? score.trends[0];
  if (trend) out.push(trend.kind === 'seasonal' ? `${trend.explain} (${TREND_BASE.label.toLowerCase()})` : trend.explain);

  // Points d'attention
  const legs = v.bottom ? subOf(v.bottom, ctx.prefs).legs : v.onepiece ? subOf(v.onepiece, ctx.prefs).legs : undefined;
  if (legs === 'partial' && COLD_BANDS.includes(n.band) && n.source !== 'none') warnings.push('Prévoyez des collants chauds avec cette pièce.');
  if (!v.shoes) warnings.push('Aucune paire de chaussures disponible dans la garde-robe pour compléter la tenue.');
  if (n.source === 'none') warnings.push('Météo inconnue : cette tenue n’a pas été vérifiée par rapport aux conditions du jour.');
  if (n.source === 'cache') warnings.push('Basée sur des prévisions enregistrées précédemment (pas actualisées).');

  return { explanation: out, warnings: [...new Set(warnings)] };
}

// ---------------------------------------------------------------------------
// Garde-robe insuffisante
// ---------------------------------------------------------------------------

export function wardrobeGaps(garments: Garment[]): string[] {
  const avail = garments.filter((g) => g.availability === 'available');
  const count = (c: Garment['category'], list = avail) => list.filter((g) => g.category === c).length;
  const reasons: string[] = [];
  const tops = count('top');
  const bottoms = count('bottom');
  const ones = count('onepiece');
  if (!garments.length) return ['Votre garde-robe est vide : ajoutez quelques vêtements pour commencer.'];
  if (ones === 0 && (tops === 0 || bottoms === 0)) {
    if (tops === 0) reasons.push(count('top', garments) ? 'Tous vos hauts sont au lavage ou indisponibles.' : 'Ajoutez au moins un haut.');
    if (bottoms === 0) reasons.push(count('bottom', garments) ? 'Tous vos bas sont au lavage ou indisponibles.' : 'Ajoutez au moins un bas.');
    reasons.push('Une robe ou une combinaison peut aussi suffire.');
  }
  if (count('shoes') === 0) reasons.push('Ajoutez une paire de chaussures pour des tenues complètes.');
  if (count('outerwear') === 0) reasons.push('Une veste ou un manteau permettra de s’adapter au froid et à la pluie.');
  return reasons;
}

// ---------------------------------------------------------------------------
// « À porter avec » (fiche vêtement) : associations hors météo du jour, mais
// cohérentes avec la saison de la pièce (un manteau appelle des pièces d'hiver)
// ---------------------------------------------------------------------------

export function seasonBandFor(g: Garment): TemperatureBand {
  const s = g.seasons;
  const winterOnly = s.length > 0 && s.every((x) => x === 'hiver' || x === 'automne');
  const summerOnly = s.length > 0 && s.every((x) => x === 'ete' || x === 'printemps');
  if (g.warmth >= 4 || winterOnly) return 'cold';
  if (summerOnly || (g.warmth <= 1 && g.category !== 'top' && g.category !== 'accessory')) return 'warm';
  return 'mild';
}

export function wearWith(garment: Garment, ctx: EngineContext, limit = 8): Garment[] {
  const self: Garment = { ...garment, availability: 'available' };
  const local: EngineContext = {
    ...ctx,
    garments: ctx.garments.map((g) => (g.id === garment.id ? self : g)),
    needs: deriveNeeds({ weather: null, manual: { band: seasonBandFor(garment), rain: false, windy: false }, prefs: ctx.prefs }),
    recent: [],
    rng: mulberry32(7),
  };
  const slot = slotsFor(self, ctx.prefs)[0];
  const locked: Partial<OutfitSlots> = slot === 'accessory' ? { accessories: [self.id] } : { [slot]: self.id, accessories: [] };
  const res = generateOutfit(local, { locked, alternatives: 6 });
  const byId = new Map(local.garments.map((g) => [g.id, g]));
  const out: Garment[] = [];
  const seen = new Set<string>([garment.id]);
  for (const p of [res.proposal, ...res.alternatives]) {
    if (!p) continue;
    const s = p.slots;
    for (const id of [s.top, s.mid, s.bottom, s.onepiece, s.outer, s.shoes, ...s.accessories]) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const g = byId.get(id);
      if (g) out.push(g);
    }
  }
  return out.slice(0, limit);
}
