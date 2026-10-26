import type { Garment, OutfitSlots, SlotName } from '../domain/types';
import { normalizeGarment } from '../domain/normalize';
import { db } from './db';

/**
 * Lavage : la machine tourne le dimanche après-midi. Chaque dimanche à 17 h,
 * tout ce qui était au lavage redevient disponible. Le navigateur ne peut rien
 * exécuter en arrière-plan : le retour est appliqué à l'ouverture de l'app
 * (et au retour au premier plan), pour tous les dimanches écoulés depuis.
 */
export const LAUNDRY_DAY = 0; // dimanche
export const LAUNDRY_HOUR = 17;

/** Dernier « dimanche 17 h » passé (ou égal à `now`), heure locale. */
export function lastLaundryReturn(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(LAUNDRY_HOUR, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - LAUNDRY_DAY + 7) % 7));
  if (d > now) d.setDate(d.getDate() - 7);
  return d;
}

/** Prochain « dimanche 17 h » strictement après `now`. */
export function nextLaundryReturn(now = new Date()): Date {
  const d = lastLaundryReturn(now);
  d.setDate(d.getDate() + 7);
  return d;
}

/** Date de mise au lavage (les anciennes données n'en ont pas : dernière modification). */
const sentAt = (g: Garment) => new Date(g.laundryAt ?? g.updatedAt);

/** La pièce est au lavage et une machine a tourné depuis : elle est propre. */
export function isBackFromLaundry(g: Garment, now = new Date()): boolean {
  return g.availability === 'laundry' && sentAt(g) < lastLaundryReturn(now);
}

/** La pièce sera propre au moment `at` (ex. demain à l'heure de sortie). */
export function cleanBy(g: Garment, at: Date): boolean {
  return g.availability !== 'laundry' || sentAt(g) < lastLaundryReturn(at);
}

/** « dimanche à 17 h », « aujourd'hui à 17 h »… pour les messages */
export function laundryReturnLabel(now = new Date()): string {
  const next = nextLaundryReturn(now);
  const today = next.toDateString() === now.toDateString();
  return today ? `aujourd’hui à ${LAUNDRY_HOUR} h` : `dimanche à ${LAUNDRY_HOUR} h`;
}

/** Pièces d'une tenue portée proposées pour le lavage : cochées par défaut ou non. */
export function laundryCandidates(slots: OutfitSlots): { slot: SlotName; id: string; checked: boolean }[] {
  // le linge du quotidien part à la machine ; veste, manteau et chaussures rarement
  const order: [SlotName, boolean][] = [
    ['top', true],
    ['mid', true],
    ['bottom', true],
    ['onepiece', true],
    ['outer', false],
    ['shoes', false],
  ];
  return order.filter(([s]) => slots[s]).map(([s, checked]) => ({ slot: s, id: slots[s]!, checked }));
}

/** Écrit en une transaction les pièces sorties du lavage ; renvoie les pièces mises à jour. */
export async function applyLaundryReturn(garments: Garment[], now = new Date()): Promise<Garment[]> {
  const back = garments.filter((g) => isBackFromLaundry(g, now));
  if (!back.length) return [];
  const stamp = now.toISOString();
  const updated = back.map((g) => normalizeGarment({ ...g, availability: 'available', laundryAt: null, updatedAt: stamp }));
  await db.putAtomic([{ store: 'garments', values: updated }]);
  return updated;
}

/** Annulation : réécrit les pièces telles qu'elles étaient. */
export async function restoreGarments(garments: Garment[]): Promise<void> {
  if (garments.length) await db.putAtomic([{ store: 'garments', values: garments }]);
}

/** Met plusieurs pièces au lavage en une transaction. */
export async function sendToLaundry(garments: Garment[], now = new Date()): Promise<Garment[]> {
  const stamp = now.toISOString();
  const updated = garments.map((g) => normalizeGarment({ ...g, availability: 'laundry', laundryAt: stamp, updatedAt: stamp }));
  if (updated.length) await db.putAtomic([{ store: 'garments', values: updated }]);
  return updated;
}
