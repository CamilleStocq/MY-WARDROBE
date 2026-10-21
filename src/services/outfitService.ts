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
/** événement émis quand la tenue du jour est modifiée depuis un autre écran */
export const TODAY_EVENT = 'mw:today-changed';
export const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function loadToday(): Promise<TodayState | null> {
  const t = await kv.get<TodayState>(TODAY_KEY);
  return t && t.date === localDate() ? t : null;
}

export async function saveToday(t: Omit<TodayState, 'date'>): Promise<void> {
  await kv.set(TODAY_KEY, { ...t, date: localDate() });
}

export async function clearToday(): Promise<void> {
  await kv.del(TODAY_KEY);
}

export { newId };
