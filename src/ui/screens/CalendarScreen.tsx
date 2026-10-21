import { useEffect, useMemo, useState } from 'react';
import type { OutfitSlots, SlotName } from '../../domain/types';
import { slotIds } from '../../domain/normalize';
import { signatureOf } from '../../engine/rules';
import { currentStreak, dateKey, mostWorn, monthGrid, parseDateKey, type WornDay } from '../../services/calendarService';
import { loadToday } from '../../services/outfitService';
import { useStore } from '../../state/store';
import { Button, EmptyState, IconButton, Sheet } from '../primitives';
import { Icon } from '../Icon';
import { GarmentPhoto } from '../garment/GarmentImage';
import { OutfitBoard, SLOT_LABELS } from '../outfit/OutfitBoard';
import { CollectionTabs } from '../CollectionTabs';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const ORDER: SlotName[] = ['outer', 'top', 'mid', 'bottom', 'onepiece', 'shoes'];

export function CalendarScreen({ goToday }: { goToday: () => void }) {
  const { calendar, garments } = useStore();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [openDay, setOpenDay] = useState<string | null>(null);
  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments]);

  const cells = monthGrid(ym.y, ym.m);
  const todayKey = dateKey(now);
  const isCurrentMonth = ym.y === now.getFullYear() && ym.m === now.getMonth();
  const monthDays = Object.values(calendar).filter((d) => {
    const dt = parseDateKey(d.date);
    return dt.getFullYear() === ym.y && dt.getMonth() === ym.m;
  });
  const top = mostWorn(monthDays, byId);
  const streak = currentStreak(calendar, now);
  const monthName = new Date(ym.y, ym.m, 1).toLocaleDateString('fr-BE', { month: 'long' });

  const shift = (delta: number) =>
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <>
      <div className="screen-head">
        <div>
          <h1>Favoris</h1>
          <p className="sub">Ce que vous avez porté, jour après jour.</p>
        </div>
      </div>
      <CollectionTabs current="calendar" />

      <div className="cal">
        <div className="cal-head">
          <IconButton icon="back" label="Mois précédent" onClick={() => shift(-1)} />
          <h2 aria-live="polite">
            <span className="cal-month">{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</span> <span className="cal-year">{ym.y}</span>
          </h2>
          <IconButton icon="chevron" label="Mois suivant" onClick={() => shift(1)} disabled={isCurrentMonth} />
        </div>
        <div className="cal-grid" role="grid" aria-label={`${monthName} ${ym.y}`}>
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-wd" role="columnheader">
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="cal-cell empty" aria-hidden />;
            const k = dateKey(d);
            const entry = calendar[k];
            const future = k > todayKey;
            const label = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
            return (
              <button
                key={k}
                type="button"
                role="gridcell"
                className={`cal-cell ${k === todayKey ? 'today' : ''} ${entry ? 'has' : ''}`}
                disabled={future}
                onClick={() => setOpenDay(k)}
                aria-label={`${label}${entry ? ', tenue notée' : future ? '' : ', aucune tenue'}`}
              >
                <span className="cal-num">{d.getDate()}</span>
                {entry && (
                  <span className="cal-outfit">
                    <OutfitBoard slots={entry.slots} byId={byId} mood="plain" compact label="" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!monthDays.length && (
          <p className="small muted cal-hint">
            Touchez « Je la porte aujourd’hui » sous votre tenue du jour, ou touchez un jour pour y noter une tenue.
          </p>
        )}

        <div className="cal-stats">
          <div className="stat">
            <span className="stat-art">{top ? <GarmentPhoto imageId={top.garment.imageId} alt="" compact /> : <Icon name="hanger" size={26} />}</span>
            <span>
              <b>{top ? `Le plus porté ce mois-ci : ${top.garment.name}` : 'Le plus porté ce mois-ci'}</b>
              <span className="muted small">{top ? `${top.count} jour${top.count > 1 ? 's' : ''}` : 'Pas encore de tenue notée ce mois-ci'}</span>
            </span>
          </div>
          <div className="stat">
            <span className="stat-art">
              <Icon name="sparkle" size={26} filled />
            </span>
            <span>
              <b>{streak > 0 ? `Série de ${streak} jour${streak > 1 ? 's' : ''}` : 'Aucune série en cours'}</b>
              <span className="muted small">Jours consécutifs avec une tenue notée</span>
            </span>
          </div>
          <div className="stat">
            <span className="stat-art">
              <Icon name="check" size={26} />
            </span>
            <span>
              <b>
                {monthDays.length} tenue{monthDays.length > 1 ? 's' : ''} notée{monthDays.length > 1 ? 's' : ''} en {monthName}
              </b>
              <span className="muted small">{new Set(monthDays.flatMap((d) => slotIds(d.slots))).size} pièces différentes portées</span>
            </span>
          </div>
        </div>
      </div>

      {openDay && <DaySheet date={openDay} onClose={() => setOpenDay(null)} goToday={goToday} />}
    </>
  );
}

function DaySheet({ date, onClose, goToday }: { date: string; onClose: () => void; goToday: () => void }) {
  const { calendar, garments, favorites, logWorn, clearWorn, openGarment, toast } = useStore();
  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments]);
  const entry = calendar[date];
  const [choosing, setChoosing] = useState(!entry);
  const [todaySlots, setTodaySlots] = useState<OutfitSlots | null>(null);
  const isToday = date === dateKey(new Date());
  const title = parseDateKey(date).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => {
    if (!isToday) return;
    loadToday()
      .then((t) => t && (t.slots.onepiece || (t.slots.top && t.slots.bottom)) && setTodaySlots(t.slots))
      .catch(() => undefined);
  }, [isToday]);

  // tenues proposées : tenue du jour, favoris, puis tenues déjà portées (sans doublons)
  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; label: string; slots: OutfitSlots; outfitId: string | null }[] = [];
    const push = (label: string, slots: OutfitSlots, outfitId: string | null) => {
      const sig = signatureOf(slots).join('+');
      if (!sig || seen.has(sig)) return;
      seen.add(sig);
      out.push({ key: sig, label, slots, outfitId });
    };
    if (todaySlots) push('Tenue du jour', todaySlots, null);
    favorites.forEach((f) => push(f.name, f.slots, f.id));
    (Object.values(calendar) as WornDay[])
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((d) => push(`Portée le ${parseDateKey(d.date).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}`, d.slots, d.outfitId));
    return out;
  }, [todaySlots, favorites, calendar]);

  async function pick(slots: OutfitSlots, outfitId: string | null) {
    await logWorn(date, slots, outfitId);
    setChoosing(false);
    toast(`Tenue notée pour le ${parseDateKey(date).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })}`);
  }

  async function remove() {
    if (!entry) return;
    const prev = entry;
    await clearWorn(date);
    onClose();
    toast('Tenue retirée du calendrier', { action: { label: 'Annuler', run: () => logWorn(prev.date, prev.slots, prev.outfitId) } });
  }

  const pieces = entry ? ORDER.filter((s) => entry.slots[s]).map((s) => ({ slot: s, id: entry.slots[s]! })) : [];

  return (
    <Sheet
      title={title.charAt(0).toUpperCase() + title.slice(1)}
      onClose={onClose}
      size="wide"
      footer={
        entry && !choosing ? (
          <>
            <Button variant="outline" icon="trash" onClick={remove}>
              Retirer
            </Button>
            <Button variant="secondary" icon="swap" onClick={() => setChoosing(true)}>
              Changer la tenue
            </Button>
          </>
        ) : undefined
      }
    >
      {entry && !choosing ? (
        <div className="detail">
          <div className="day-board">
            <OutfitBoard slots={entry.slots} byId={byId} mood="plain" onPiece={(_, id) => byId.has(id) && openGarment(id)} />
          </div>
          <div className="pieces">
            {[...pieces, ...entry.slots.accessories.map((id) => ({ slot: 'accessory' as const, id }))].map((p) => {
              const g = byId.get(p.id);
              return (
                <button key={p.id} type="button" className="piece-row" style={{ border: 0, textAlign: 'left' }} disabled={!g} onClick={() => g && openGarment(g.id)}>
                  <span className="thumb">
                    <GarmentPhoto imageId={g?.imageId ?? null} alt="" compact />
                  </span>
                  <span className="info">
                    <b>{g?.name ?? 'Pièce supprimée de la garde-robe'}</b>
                    <span>{SLOT_LABELS[p.slot]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : options.length ? (
        <>
          <p className="muted small" style={{ marginBottom: 'var(--s4)' }}>
            Choisissez la tenue portée ce jour-là.
          </p>
          <div className="fav-grid">
            {options.map((o) => (
              <button key={o.key} type="button" className="fav-card" onClick={() => pick(o.slots, o.outfitId)}>
                <OutfitBoard slots={o.slots} byId={byId} mood="plain" compact label={o.label} />
                <b>{o.label}</b>
              </button>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          art="favorites"
          title="Aucune tenue à noter"
          actions={
            <Button
              variant="primary"
              icon="sparkle"
              onClick={() => {
                onClose();
                goToday();
              }}
            >
              Composer ma tenue du jour
            </Button>
          }
        >
          Composez une tenue ou enregistrez des favoris pour pouvoir les noter dans le calendrier.
        </EmptyState>
      )}
    </Sheet>
  );
}
