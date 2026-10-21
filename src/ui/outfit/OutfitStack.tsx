import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Garment, OutfitSlots, SlotName } from '../../domain/types';
import { rankAlternatives, type Alternative } from '../../engine/generator';
import type { EngineContext } from '../../engine/rules';
import { GarmentImg } from '../garment/GarmentImage';
import { Icon } from '../Icon';
import { SLOT_LABELS } from './OutfitBoard';

/**
 * Tenue présentée en rangées empilées (veste, haut, bas, chaussures…).
 * Chaque rangée défile horizontalement : la pièce centrée est celle de la tenue,
 * ses voisines (alternatives classées par le moteur) dépassent sur les côtés.
 */
const MAX_ITEMS = 15;

interface RowDef {
  slot: SlotName;
  size: 'lg' | 'md' | 'sm';
}

function rowsFor(slots: OutfitSlots): RowDef[] {
  const rows: RowDef[] = [];
  if (slots.outer) rows.push({ slot: 'outer', size: 'lg' });
  if (slots.onepiece) {
    if (slots.mid) rows.push({ slot: 'mid', size: 'md' });
    rows.push({ slot: 'onepiece', size: 'lg' });
  } else {
    if (slots.top) rows.push({ slot: 'top', size: slots.outer ? 'md' : 'lg' });
    if (slots.mid) rows.push({ slot: 'mid', size: 'md' });
    if (slots.bottom) rows.push({ slot: 'bottom', size: 'lg' });
  }
  if (slots.shoes) rows.push({ slot: 'shoes', size: 'sm' });
  return rows;
}

/** Ordonne les alternatives autour de la pièce actuelle : meilleures de part et d'autre. */
function arrange(current: Garment | undefined, alts: Alternative[]): Alternative[] {
  const others = alts.filter((a) => a.garment.id !== current?.id).slice(0, MAX_ITEMS - 1);
  const left: Alternative[] = [];
  const right: Alternative[] = [];
  others.forEach((a, i) => (i % 2 === 0 ? right : left).push(a));
  const cur = alts.find((a) => a.garment.id === current?.id) ?? (current ? { garment: current, total: 0, issue: null } : null);
  return [...left.reverse(), ...(cur ? [cur] : []), ...right];
}

export function OutfitStack({
  slots,
  ctx,
  listsKey,
  locked,
  onChange,
  onPiece,
  busy,
}: {
  slots: OutfitSlots;
  ctx: EngineContext;
  /** change quand une nouvelle tenue est proposée : les listes de chaque rangée sont alors recalculées */
  listsKey: string;
  locked: SlotName[];
  onChange: (slot: SlotName, id: string) => void;
  onPiece: (slot: SlotName, id: string) => void;
  busy: boolean;
}) {
  const rows = rowsFor(slots);
  const byId = useMemo(() => new Map(ctx.garments.map((g) => [g.id, g])), [ctx.garments]);

  // listes figées pendant que l'utilisateur fait défiler (sinon elles se réordonneraient sous son doigt)
  const lists = useMemo(() => {
    const out: Partial<Record<SlotName, Alternative[]>> = {};
    for (const r of rowsFor(slots)) out[r.slot] = arrange(byId.get(slots[r.slot]!), rankAlternatives(r.slot, slots, ctx));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listsKey, rows.map((r) => r.slot).join(','), ctx.needs, ctx.occasion]);

  return (
    <div className="stack" aria-busy={busy}>
      <div className="stack-rows">
        {rows.map((r) => (
          <CarouselRow
            key={`${listsKey}-${r.slot}`}
            slot={r.slot}
            size={r.size}
            items={lists[r.slot] ?? []}
            currentId={slots[r.slot]!}
            locked={locked.includes(r.slot)}
            onChange={(id) => onChange(r.slot, id)}
            onPiece={(id) => onPiece(r.slot, id)}
          />
        ))}
      </div>
    </div>
  );
}

function CarouselRow({
  slot,
  size,
  items,
  currentId,
  locked,
  onChange,
  onPiece,
}: {
  slot: SlotName;
  size: 'lg' | 'md' | 'sm';
  items: Alternative[];
  currentId: string;
  locked: boolean;
  onChange: (id: string) => void;
  onPiece: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);
  const programmatic = useRef(false);
  const [center, setCenter] = useState(() => Math.max(0, items.findIndex((i) => i.garment.id === currentId)));

  const nearestIndex = useCallback(() => {
    const t = trackRef.current;
    if (!t) return 0;
    const mid = t.scrollLeft + t.clientWidth / 2;
    let best = 0;
    let bestD = Infinity;
    Array.from(t.children).forEach((el, i) => {
      const e = el as HTMLElement;
      const d = Math.abs(e.offsetLeft + e.offsetWidth / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }, []);

  const scrollToIndex = useCallback((i: number, smooth: boolean) => {
    const t = trackRef.current;
    const el = t?.children[i] as HTMLElement | undefined;
    if (!t || !el) return;
    programmatic.current = !smooth;
    t.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - t.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
    setCenter(i);
  }, []);

  // position initiale et changements venus de l'extérieur (remplacement via le sélecteur)
  useLayoutEffect(() => {
    const i = items.findIndex((x) => x.garment.id === currentId);
    if (i >= 0 && i !== nearestIndex()) scrollToIndex(i, false);
  }, [currentId, items, nearestIndex, scrollToIndex]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function settle() {
    const i = nearestIndex();
    setCenter(i);
    const id = items[i]?.garment.id;
    if (id && id !== currentId) onChange(id);
  }

  function onScroll() {
    if (programmatic.current) {
      programmatic.current = false;
      return;
    }
    setCenter(nearestIndex());
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(settle, 140);
  }

  const label = SLOT_LABELS[slot];
  const cur = items[center];

  return (
    <div className={`row row-${size}`} role="group" aria-label={`${label} : ${cur?.garment.name ?? ''}. Faites défiler pour changer.`}>
      <div className="row-track" ref={trackRef} onScroll={onScroll}>
        {items.map((it, i) => {
          const isCenter = i === center;
          return (
            <button
              key={it.garment.id}
              type="button"
              className={`row-item ${isCenter ? 'is-center' : ''}`}
              tabIndex={isCenter ? 0 : -1}
              aria-hidden={!isCenter}
              aria-label={isCenter ? `${label} : ${it.garment.name}${locked ? ' (verrouillée)' : ''}${it.issue ? ' — peu adapté à la météo' : ''}. Options` : undefined}
              onClick={() => (isCenter ? onPiece(it.garment.id) : scrollToIndex(i, true))}
            >
              <GarmentImg imageId={it.garment.imageId} alt="" compact />
              {isCenter && locked && (
                <span className="row-badge lock" aria-hidden>
                  <Icon name="lock" size={14} />
                </span>
              )}
              {isCenter && it.issue && <span className="row-badge warn">Peu adapté</span>}
            </button>
          );
        })}
      </div>
      {items.length > 1 && (
        <>
          <button type="button" className="row-nav prev" aria-label={`${label} précédent`} disabled={center <= 0} onClick={() => scrollToIndex(center - 1, true)}>
            <Icon name="back" size={18} />
          </button>
          <button type="button" className="row-nav next" aria-label={`${label} suivant`} disabled={center >= items.length - 1} onClick={() => scrollToIndex(center + 1, true)}>
            <Icon name="chevron" size={18} />
          </button>
        </>
      )}
    </div>
  );
}
