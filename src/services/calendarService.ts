import type { Garment, OutfitSlots } from '../domain/types';
import { normalizeSlots, slotIds } from '../domain/normalize';
import { kv } from './db';

/**
 * Calendrier des tenues portées : une tenue par jour (date locale AAAA-MM-JJ).
 * Les références pointent vers les vêtements de la garde-robe ; une pièce supprimée
 * apparaît comme manquante sans casser l'historique.
 */
export interface WornDay {
  date: string;
  slots: OutfitSlots;
  /** favori d'origine, si la tenue venait des favoris */
  outfitId: string | null;
  loggedAt: string;
}

export type Calendar = Record<string, WornDay>;

const KEY = 'calendar';
const LEGACY_KEY = 'history:worn';

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseDateKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export async function loadCalendar(): Promise<Calendar> {
  const cal = (await kv.get<Calendar>(KEY)) ?? {};
  // reprise de l'ancien journal « Je la porte » (avant l'onglet calendrier)
  const legacy = await kv.get<{ date: string; slots: OutfitSlots }[]>(LEGACY_KEY);
  if (legacy?.length) {
    for (const e of [...legacy].reverse()) {
      const k = dateKey(new Date(e.date));
      cal[k] = { date: k, slots: normalizeSlots(e.slots), outfitId: null, loggedAt: e.date };
    }
    await kv.set(KEY, cal);
    await kv.del(LEGACY_KEY);
  }
  for (const k of Object.keys(cal)) cal[k] = { ...cal[k], slots: normalizeSlots(cal[k].slots) };
  return cal;
}

export async function setWornDay(date: string, slots: OutfitSlots, outfitId: string | null = null): Promise<Calendar> {
  const cal = await loadCalendar();
  cal[date] = { date, slots: normalizeSlots(slots), outfitId, loggedAt: new Date().toISOString() };
  await kv.set(KEY, cal);
  return cal;
}

export async function clearWornDay(date: string): Promise<Calendar> {
  const cal = await loadCalendar();
  delete cal[date];
  await kv.set(KEY, cal);
  return cal;
}

export async function replaceCalendar(cal: Calendar): Promise<void> {
  await kv.set(KEY, cal);
}

// ---------- statistiques (fonctions pures, testées) ----------

/** Pièce la plus portée sur une liste de jours (hors accessoires si `bodyOnly`). */
export function mostWorn(days: WornDay[], garments: Map<string, Garment>): { garment: Garment; count: number } | null {
  const counts = new Map<string, number>();
  for (const d of days) for (const id of new Set(slotIds(d.slots))) counts.set(id, (counts.get(id) ?? 0) + 1);
  let best: { garment: Garment; count: number } | null = null;
  for (const [id, count] of counts) {
    const g = garments.get(id);
    if (!g) continue;
    if (!best || count > best.count || (count === best.count && g.category !== 'accessory' && best.garment.category === 'accessory')) best = { garment: g, count };
  }
  return best;
}

/** Nombre de jours consécutifs enregistrés, se terminant aujourd'hui (ou hier si aujourd'hui est vide). */
export function currentStreak(cal: Calendar, today = new Date()): number {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!cal[dateKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (cal[dateKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Grille du mois, semaines commençant le lundi ; `null` pour les cases hors mois. */
export function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: offset }, () => null);
  for (let i = 1; i <= days; i++) cells.push(new Date(year, month, i));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Ensembles des vêtements portés ces derniers jours (pour diversifier les propositions). */
export function recentlyWorn(cal: Calendar, days = 14, today = new Date()): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const e = cal[dateKey(d)];
    if (e) {
      const s = e.slots;
      out.push([s.top, s.mid, s.bottom, s.onepiece, s.outer, s.shoes].filter((x): x is string => !!x).sort());
    }
  }
  return out;
}
