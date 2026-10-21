import { useEffect, useState, type CSSProperties } from 'react';
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

export function layoutFor(slots: OutfitSlots, landscape: boolean): Placement[] {
  const out: Placement[] = [];
  const hasOuter = !!slots.outer;
  const add = (slot: SlotKey, id: string | undefined, p: Omit<Placement, 'slot' | 'id'>) => id && out.push({ slot, id, ...p });

  if (!landscape) {
    const mx = hasOuter ? 36 : 26;
    add('outer', slots.outer, { x: 1, y: 8, w: 42, h: 54, rot: -6, z: 1 });
    add('onepiece', slots.onepiece, { x: mx - 2, y: 4, w: 52, h: 72, rot: 0, z: 2 });
    add('bottom', slots.bottom, { x: mx + 2, y: 37, w: 42, h: 46, rot: 1, z: 2 });
    add('top', slots.top, { x: mx, y: 3, w: 46, h: 36, rot: -2, z: 3 });
    add('mid', slots.mid, { x: Math.min(mx + 26, 62), y: 12, w: 36, h: 30, rot: 5, z: 4 });
    add('shoes', slots.shoes, { x: 64, y: 71, w: 32, h: 26, rot: 7, z: 5 });
    const acc = hasOuter
      ? [{ x: 3, y: 64, w: 28, h: 22 }, { x: 8, y: 82, w: 22, h: 16 }, { x: 36, y: 84, w: 18, h: 14 }]
      : [{ x: 2, y: 44, w: 24, h: 22 }, { x: 3, y: 68, w: 22, h: 20 }, { x: 4, y: 88, w: 18, h: 10 }];
    slots.accessories.slice(0, 3).forEach((id, i) => add('accessory', id, { ...acc[i], rot: i % 2 ? 6 : -8, z: 6 }));
  } else {
    const mx = hasOuter ? 30 : 18;
    add('outer', slots.outer, { x: 2, y: 6, w: 28, h: 66, rot: -5, z: 1 });
    add('onepiece', slots.onepiece, { x: mx, y: 4, w: 32, h: 90, rot: 0, z: 2 });
    add('bottom', slots.bottom, { x: mx + 2, y: 44, w: 26, h: 52, rot: 1, z: 2 });
    add('top', slots.top, { x: mx, y: 3, w: 28, h: 44, rot: -2, z: 3 });
    add('mid', slots.mid, { x: mx + 22, y: 8, w: 24, h: 38, rot: 5, z: 4 });
    add('shoes', slots.shoes, { x: 72, y: 62, w: 24, h: 32, rot: 7, z: 5 });
    const acc = [{ x: 76, y: 6, w: 20, h: 26 }, { x: 78, y: 34, w: 16, h: 22 }, { x: hasOuter ? 6 : 2, y: 76, w: 16, h: 18 }];
    slots.accessories.slice(0, 3).forEach((id, i) => add('accessory', id, { ...acc[i], rot: i % 2 ? -5 : 6, z: 6 }));
  }
  return out;
}

export function moodFor(needs: WeatherNeeds | null): string {
  if (!needs || needs.source === 'none') return 'neutral';
  if (needs.rain === 'likely') return 'rain';
  if (needs.band === 'hot') return 'hot';
  if (needs.band === 'cool' || needs.band === 'cold' || needs.band === 'freezing') return 'cold';
  return 'warm';
}

function useWide(enabled: boolean) {
  const q = '(min-width: 960px)';
  const [wide, setWide] = useState(() => enabled && typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    if (!enabled || typeof matchMedia === 'undefined') return;
    const m = matchMedia(q);
    const fn = () => setWide(m.matches);
    fn();
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [enabled]);
  return wide;
}

export function OutfitBoard({
  slots,
  byId,
  mood,
  locked = [],
  onPiece,
  compact,
  responsive,
  label,
}: {
  slots: OutfitSlots;
  byId: Map<string, Garment>;
  mood: string;
  locked?: string[];
  onPiece?: (slot: SlotKey, id: string) => void;
  compact?: boolean;
  /** passe en composition paysage sur grand écran */
  responsive?: boolean;
  label?: string;
}) {
  const wide = useWide(!!responsive);
  const placements = layoutFor(slots, wide);
  const names = placements.map((p) => byId.get(p.id)?.name ?? 'pièce supprimée').join(', ');

  return (
    <div
      className="board"
      data-mood={mood}
      role={compact ? 'img' : 'group'}
      aria-label={label ?? `Tenue composée de : ${names}`}
      style={compact ? undefined : undefined}
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
