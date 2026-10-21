import type { CSSProperties } from 'react';
import type { Garment, OutfitSlots } from '../../domain/types';
import type { SlotKey } from '../../engine/rules';
import type { WeatherNeeds } from '../../engine/weatherNeeds';
import { GarmentImg } from '../garment/GarmentImage';
import { Icon } from '../Icon';

/**
 * Composition « à plat » : chaque pièce est positionnée en CSS (pourcentages)
 * sur un plateau dont la teinte reflète la météo. Ce n'est pas une image générée :
 * ce sont les vraies photos de l'utilisateur, disposées comme sur un lit.
 */
interface Placement {
  slot: SlotKey;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  z: number;
}

export const SLOT_LABELS: Record<SlotKey, string> = {
  top: 'Haut',
  mid: 'Couche',
  bottom: 'Bas',
  onepiece: 'Pièce complète',
  outer: 'Veste / manteau',
  shoes: 'Chaussures',
  accessory: 'Accessoire',
};

/**
 * Composition compacte « à plat », dans l'esprit des calendriers de tenues :
 * colonne principale (haut au-dessus du bas, ou pièce complète), veste à côté,
 * chaussures en bas, accessoires dans un coin. Pièces droites, sans rotation.
 */
export function layoutFor(slots: OutfitSlots): Placement[] {
  const out: Placement[] = [];
  const hasOuter = !!slots.outer;
  const add = (slot: SlotKey, id: string | undefined, p: Omit<Placement, 'slot' | 'id' | 'rot'>) => id && out.push({ slot, id, rot: 0, ...p });
  const mx = hasOuter ? 2 : 20; // colonne principale décalée quand il n'y a pas de veste
  add('outer', slots.outer, { x: 50, y: 2, w: 48, h: 60, z: 1 });
  add('onepiece', slots.onepiece, { x: mx, y: 2, w: 52, h: 78, z: 2 });
  add('bottom', slots.bottom, { x: mx + 4, y: 40, w: 44, h: 50, z: 2 });
  add('top', slots.top, { x: mx, y: 2, w: 52, h: 40, z: 3 });
  add('mid', slots.mid, { x: mx + 22, y: 8, w: 40, h: 34, z: 4 });
  add('shoes', slots.shoes, hasOuter ? { x: 56, y: 70, w: 38, h: 26, z: 5 } : { x: 2, y: 74, w: 30, h: 22, z: 5 });
  const acc = hasOuter
    ? [{ x: 2, y: 82, w: 18, h: 16 }, { x: 22, y: 86, w: 14, h: 12 }]
    : [{ x: 74, y: 4, w: 24, h: 24 }, { x: 76, y: 32, w: 20, h: 20 }];
  slots.accessories.slice(0, 2).forEach((id, i) => add('accessory', id, { ...acc[i], z: 6 }));
  return out;
}

export function moodFor(needs: WeatherNeeds | null): string {
  if (!needs || needs.source === 'none') return 'neutral';
  if (needs.rain === 'likely') return 'rain';
  if (needs.band === 'hot') return 'hot';
  if (needs.band === 'cool' || needs.band === 'cold' || needs.band === 'freezing') return 'cold';
  return 'warm';
}

export function OutfitBoard({
  slots,
  byId,
  mood,
  locked = [],
  onPiece,
  compact,
  label,
}: {
  slots: OutfitSlots;
  byId: Map<string, Garment>;
  mood: string;
  locked?: string[];
  onPiece?: (slot: SlotKey, id: string) => void;
  compact?: boolean;
  label?: string;
}) {
  const placements = layoutFor(slots);
  const names = placements.map((p) => byId.get(p.id)?.name ?? 'pièce supprimée').join(', ');

  return (
    <div
      className="board"
      data-mood={mood}
      role={compact ? 'img' : 'group'}
      aria-label={label ?? `Tenue composée de : ${names}`}
    >
      {placements.map((p, i) => {
        const g = byId.get(p.id);
        const style = {
          left: `${p.x}%`,
          top: `${p.y}%`,
          width: `${p.w}%`,
          height: `${p.h}%`,
          zIndex: p.z,
          '--rot': `${p.rot}deg`,
          '--delay': `${i * 60}ms`,
        } as CSSProperties;
        const isLocked = p.slot !== 'accessory' ? locked.includes(p.slot) : false;
        const content = (
          <>
            <GarmentImg imageId={g?.imageId ?? null} alt="" compact />
            {isLocked && !compact && (
              <span className="lock-pin" aria-hidden>
                <Icon name="lock" size={15} />
              </span>
            )}
          </>
        );
        if (compact || !onPiece) {
          return (
            <div key={`${p.slot}-${p.id}`} className="piece" style={style} aria-hidden>
              {content}
            </div>
          );
        }
        return (
          <button
            key={`${p.slot}-${p.id}`}
            type="button"
            className="piece"
            style={style}
            onClick={() => onPiece(p.slot, p.id)}
            aria-label={`${SLOT_LABELS[p.slot]} : ${g?.name ?? 'pièce supprimée'}${isLocked ? ' (verrouillée)' : ''}. Options`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
