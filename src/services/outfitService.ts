import type { OutfitSlots, SavedOutfit } from '../domain/types';
import { normalizeOutfit, slotIds } from '../domain/normalize';
import { signatureOf } from '../engine/rules';
import { db, kv, newId } from './db';

// ---------- favoris ----------

export async function listFavorites(): Promise<SavedOutfit[]> {
  const rows = await db.getAll<SavedOutfit>('outfits');
  return rows.map(normalizeOutfit).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveFavorite(data: Omit<SavedOutfit, 'id' | 'schemaVersion' | 'createdAt' | 'updatedAt' | 'garmentIds' | 'lastWornAt'>): Promise<SavedOutfit> {
  const now = new Date().toISOString();
  const o = normalizeOutfit({ ...data, id: newId(), createdAt: now, updatedAt: now, lastWornAt: null });
  await db.put('outfits', o);
  return o;
}

export async function updateFavorite(o: SavedOutfit): Promise<SavedOutfit> {
  const next = normalizeOutfit({ ...o, garmentIds: slotIds(o.slots), updatedAt: new Date().toISOString() });
  await db.put('outfits', next);
  return next;
}

export async function deleteFavorite(id: string): Promise<void> {
  await db.delete('outfits', id);
}

export async function restoreFavorite(o: SavedOutfit): Promise<void> {
  await db.put('outfits', o);
}

// ---------- historique (diversité des propositions) ----------

const RECENT_KEY = 'history:recent';
const MAX_RECENT = 30;

const REJECTED_KEY = 'history:rejected';

/** Tenues écartées (« Une autre tenue » sans enregistrer ni porter) : moins reproposées. */
export async function getRejected(): Promise<string[]> {
  return (await kv.get<string[]>(REJECTED_KEY)) ?? [];
}

export async function pushRejected(signature: string): Promise<string[]> {
  if (!signature) return getRejected();
  const list = [signature, ...(await getRejected()).filter((s) => s !== signature)].slice(0, 40);
  await kv.set(REJECTED_KEY, list);
  return list;
}

export async function getRecent(): Promise<string[][]> {
  return (await kv.get<string[][]>(RECENT_KEY)) ?? [];
}

export async function pushRecent(slots: OutfitSlots): Promise<string[][]> {
  const sig = signatureOf(slots);
  const list = [sig, ...(await getRecent()).filter((s) => s.join('+') !== sig.join('+'))].slice(0, MAX_RECENT);
  await kv.set(RECENT_KEY, list);
  return list;
}

// ---------- tenue du jour (survit au rechargement) ----------

export interface TodayState {
  date: string;
  slots: OutfitSlots;
  locked: string[];
  shown: string[];
  occasion: SavedOutfit['occasion'];
  /** générer une proposition dès l'ouverture (ex. « s'inspirer d'un favori ») */
  autogen?: boolean;
  /** texte affiché une fois à l'ouverture (ex. favori adapté) */
  banner?: string;
}

const TODAY_KEY = 'today';
const TOMORROW_KEY = 'plan:tomorrow';
export type PlanDay = 'today' | 'tomorrow';
/** événement émis quand la tenue du jour est modifiée depuis un autre écran */
export const TODAY_EVENT = 'mw:today-changed';
/** date locale AAAA-MM-JJ, décalée de `offset` jours */
export const localDate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const planDate = (day: PlanDay) => localDate(day === 'tomorrow' ? 1 : 0);

const hasBase = (t: TodayState) => !!(t.slots.onepiece || (t.slots.top && t.slots.bottom));

/**
 * Choisit la tenue à afficher pour un jour, sans rien écrire.
 * Une tenue préparée la veille devient la tenue du jour si aucune autre n'a été composée.
 */
export function pickPlan(day: PlanDay, today: TodayState | null | undefined, planned: TodayState | null | undefined, date = localDate()): TodayState | null {
  if (day === 'tomorrow') return planned && planned.date === localDate(1) ? planned : null;
  const t = today && today.date === date ? today : null;
  if (t && hasBase(t)) return t;
  if (planned && planned.date === date && hasBase(planned)) {
    return { ...planned, autogen: false, banner: 'Voici la tenue préparée hier. Elle est vérifiée avec la météo du jour.' };
  }
  return t;
}

export async function loadPlan(day: PlanDay): Promise<TodayState | null> {
  const [t, p] = await Promise.all([kv.get<TodayState>(TODAY_KEY), kv.get<TodayState>(TOMORROW_KEY)]);
  return pickPlan(day, t, p);
}

export async function savePlan(day: PlanDay, t: Omit<TodayState, 'date'>): Promise<void> {
  await kv.set(day === 'tomorrow' ? TOMORROW_KEY : TODAY_KEY, { ...t, date: planDate(day) });
}

export const loadToday = () => loadPlan('today');
export const saveToday = (t: Omit<TodayState, 'date'>) => savePlan('today', t);

export async function clearToday(): Promise<void> {
  await kv.del(TODAY_KEY);
}

export { newId };
