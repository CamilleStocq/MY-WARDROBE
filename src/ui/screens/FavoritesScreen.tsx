import { useMemo, useState } from 'react';
import type { Garment, Occasion, OutfitSlots, SavedOutfit, Season, SlotName, Style } from '../../domain/types';
import { OCCASION_LABELS, SEASON_LABELS, STYLE_LABELS } from '../../domain/taxonomy';
import { getColor } from '../../domain/colors';
import { adaptOutfit, evaluateOutfit, type Evaluation } from '../../engine/generator';
import { saveToday } from '../../services/outfitService';
import { useStore } from '../../state/store';
import { Button, Chip, ConfirmDialog, EmptyState, Field, Notice, Sheet } from '../primitives';
import { GarmentPhoto } from '../garment/GarmentImage';
import { Icon } from '../Icon';
import { OutfitBoard, SLOT_LABELS } from '../outfit/OutfitBoard';

const ORDER: SlotName[] = ['top', 'mid', 'bottom', 'onepiece', 'outer', 'shoes'];

type Filter = { kind: 'season'; v: Season } | { kind: 'style'; v: Style } | { kind: 'occasion'; v: Occasion } | null;

export function FavoritesScreen({ goTo }: { goTo: (t: 'today' | 'wardrobe') => void }) {
  const { favorites, garments, removeFavorite } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(null);
  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments]);

  const facets = useMemo(() => {
    const seasons = new Set<Season>();
    const styles = new Set<Style>();
    const occasions = new Set<Occasion>();
    favorites.forEach((f) => {
      f.seasons.forEach((s) => seasons.add(s));
      f.styleTags.forEach((s) => styles.add(s));
      occasions.add(f.occasion);
    });
    return { seasons: [...seasons], styles: [...styles], occasions: [...occasions] };
  }, [favorites]);

  const list = favorites.filter((f) => {
    if (!filter) return true;
    if (filter.kind === 'season') return f.seasons.includes(filter.v);
    if (filter.kind === 'style') return f.styleTags.includes(filter.v);
    return f.occasion === filter.v;
  });
  const same = (a: Filter, b: Filter) => !!a && !!b && a.kind === b.kind && a.v === b.v;
  const showFacets = facets.seasons.length + facets.styles.length + facets.occasions.length > 2;

  return (
    <>
      <div className="screen-head">
        <div>
          <h1>Favoris</h1>
          <p className="sub">{favorites.length ? `${favorites.length} look${favorites.length > 1 ? 's' : ''} enregistré${favorites.length > 1 ? 's' : ''}` : 'Vos looks enregistrés'}</p>
        </div>
      </div>

      {!favorites.length ? (
        <EmptyState
          art="favorites"
          title="Aucune tenue enregistrée"
          actions={
            <Button variant="primary" icon="sparkle" onClick={() => goTo('today')}>
              Composer ma tenue du jour
            </Button>
          }
        >
          Touchez le cœur sous une tenue proposée pour la retrouver ici et la porter à nouveau.
        </EmptyState>
      ) : (
        <>
          {showFacets && (
            <div className="chip-row" role="radiogroup" aria-label="Filtrer les favoris" style={{ marginBottom: 'var(--s4)' }}>
              <Chip role="radio" pressed={!filter} onClick={() => setFilter(null)}>
                Toutes
              </Chip>
              {facets.seasons.map((s) => (
                <Chip key={s} role="radio" pressed={same(filter, { kind: 'season', v: s })} onClick={() => setFilter({ kind: 'season', v: s })}>
                  {SEASON_LABELS[s]}
                </Chip>
              ))}
              {facets.occasions.map((o) => (
                <Chip key={o} role="radio" pressed={same(filter, { kind: 'occasion', v: o })} onClick={() => setFilter({ kind: 'occasion', v: o })}>
                  {OCCASION_LABELS[o]}
                </Chip>
              ))}
              {facets.styles.map((s) => (
                <Chip key={s} role="radio" pressed={same(filter, { kind: 'style', v: s })} onClick={() => setFilter({ kind: 'style', v: s })}>
                  {STYLE_LABELS[s]}
                </Chip>
              ))}
            </div>
          )}
          <div className="fav-grid">
            {list.map((f) => {
              const missing = f.garmentIds.filter((id) => !byId.has(id)).length;
              return (
                <div key={f.id} className="fav-item">
                <button type="button" className="fav-card" onClick={() => setOpen(f.id)}>
                  <OutfitBoard slots={f.slots} byId={byId} mood={f.weatherContext ? moodFromContext(f) : 'warm'} compact label={f.name} />
                  <b>{f.name}</b>
                  <span>
                    {new Date(f.createdAt).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
                    {f.weatherContext?.feelsLike != null && `, ${Math.round(f.weatherContext.feelsLike)} °C ressentis`}
                    {missing > 0 && `, ${missing} pièce${missing > 1 ? 's' : ''} manquante${missing > 1 ? 's' : ''}`}
                  </span>
                </button>
                <button type="button" className="fav-heart" onClick={() => removeFavorite(f)} aria-label={`Retirer « ${f.name} » des favoris`} title="Retirer des favoris">
                  <Icon name="heart" size={18} filled />
                </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {open && <FavoriteDetail id={open} onClose={() => setOpen(null)} goToday={() => goTo('today')} />}
    </>
  );
}

function moodFromContext(f: SavedOutfit): string {
  const w = f.weatherContext!;
  if (w.rain === 'likely') return 'rain';
  if (w.band === 'hot') return 'hot';
  if (w.band === 'cool' || w.band === 'cold' || w.band === 'freezing') return 'cold';
  return 'warm';
}

/** Pièce la plus caractéristique d'un look : motif ou couleur vive, sinon le bas. */
function signaturePiece(slots: OutfitSlots, byId: Map<string, Garment>): SlotName | null {
  const present = ORDER.filter((s) => slots[s] && byId.get(slots[s]!)?.availability === 'available');
  const score = (s: SlotName) => {
    const g = byId.get(slots[s]!)!;
    return (g.pattern !== 'uni' ? 2 : 0) + (getColor(g.primaryColor).tone === 'bold' ? 2 : getColor(g.primaryColor).tone === 'soft' ? 1 : 0) + (s === 'bottom' || s === 'onepiece' ? 0.5 : 0);
  };
  return present.sort((a, b) => score(b) - score(a))[0] ?? null;
}

function FavoriteDetail({ id, onClose, goToday }: { id: string; onClose: () => void; goToday: () => void }) {
  const { favorites, garments, saveFavorite, removeFavorite, engineContext, needs, openGarment, toast } = useStore();
  const fav = favorites.find((f) => f.id === id);
  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments]);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(fav?.name ?? '');
  const [notes, setNotes] = useState(fav?.notes ?? '');
  const [check, setCheck] = useState<Evaluation | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!fav) return null;
  const ctx = engineContext(fav.occasion);

  async function commitName() {
    setRenaming(false);
    const n = name.trim();
    if (!n) {
      setName(fav!.name);
      return;
    }
    if (n !== fav!.name) {
      await saveFavorite({ ...fav!, name: n });
      toast('Tenue renommée');
    }
  }

  async function startWear() {
    const ev = evaluateOutfit(fav!.slots, ctx);
    if (!ev.issues.length) {
      await wearAsIs();
    } else {
      setCheck(ev);
    }
  }

  async function wearAsIs() {
    await saveToday({ slots: fav!.slots, locked: [], shown: [], occasion: fav!.occasion, banner: `« ${fav!.name} » choisie pour aujourd’hui.` });
    await saveFavorite({ ...fav!, lastWornAt: new Date().toISOString() }).catch(() => undefined);
    onClose();
    goToday();
  }

  async function adapt() {
    setBusy(true);
    const res = adaptOutfit(fav!.slots, ctx);
    setBusy(false);
    if (!res.proposal) {
      toast(res.reasons.join(' ') || 'Aucune adaptation possible avec la garde-robe actuelle.', { tone: 'error' });
      return;
    }
    const replaced = ORDER.filter((s) => fav!.slots[s] && res.proposal!.slots[s] !== fav!.slots[s]).length;
    await saveToday({
      slots: res.proposal.slots,
      locked: [],
      shown: [res.proposal.signature],
      occasion: fav!.occasion,
      banner: `Adaptée de « ${fav!.name} » : ${replaced || 'aucune'} pièce${replaced > 1 ? 's' : ''} remplacée${replaced > 1 ? 's' : ''}, l’esprit du look est conservé.`,
    });
    onClose();
    goToday();
  }

  async function inspire() {
    const slot = signaturePiece(fav!.slots, byId);
    if (!slot) {
      toast('Les pièces de cette tenue ne sont pas disponibles aujourd’hui.', { tone: 'error' });
      return;
    }
    const g = byId.get(fav!.slots[slot]!)!;
    await saveToday({
      slots: { [slot]: g.id, accessories: [] },
      locked: [slot],
      shown: [],
      occasion: fav!.occasion,
      autogen: true,
      banner: `Inspirée de « ${fav!.name} » : ${g.name} est conservé et le reste est recomposé.`,
    });
    onClose();
    goToday();
  }

  const pieces = [...ORDER.filter((s) => fav.slots[s]).map((s) => ({ slot: SLOT_LABELS[s], id: fav.slots[s]! })), ...fav.slots.accessories.map((id) => ({ slot: 'Accessoire', id }))];

  return (
    <>
      <Sheet
        size="wide"
        title={
          renaming ? (
            <input
              className="inline-edit"
              value={name}
              autoFocus
              maxLength={60}
              aria-label="Nom de la tenue"
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setName(fav.name);
                  setRenaming(false);
                }
              }}
            />
          ) : (
            <button type="button" className="inline-edit" onClick={() => setRenaming(true)} aria-label={`${fav.name}. Renommer`}>
              {fav.name}
            </button>
          )
        }
        onClose={onClose}
        footer={
          <>
            <Button variant="outline" icon="sparkle" onClick={inspire}>
              M’en inspirer
            </Button>
            <Button variant="primary" icon="check" onClick={startWear}>
              La porter aujourd’hui
            </Button>
          </>
        }
      >
        <div className="detail">
          <OutfitBoard slots={fav.slots} byId={byId} mood={fav.weatherContext ? moodFromContext(fav) : 'warm'} onPiece={(_, gid) => byId.has(gid) && openGarment(gid)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
            {check && (
              <Notice
                tone="warn"
                title="Cette tenue n’est pas idéale aujourd’hui"
                actions={
                  <>
                    <Button size="sm" variant="secondary" loading={busy} onClick={adapt}>
                      Remplacer seulement ces pièces
                    </Button>
                    <Button size="sm" variant="outline" onClick={wearAsIs}>
                      La porter quand même
                    </Button>
                  </>
                }
              >
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {check.issues.map((i) => (
                    <li key={i.reason}>{i.reason}</li>
                  ))}
                </ul>
                {needs.source === 'none' && <span> La météo du jour n’est pas connue : seule la disponibilité a été vérifiée.</span>}
              </Notice>
            )}
            <div className="pieces">
              {pieces.map((p) => {
                const g = byId.get(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="piece-row"
                    style={{ border: 0, textAlign: 'left' }}
                    onClick={() => g && openGarment(g.id)}
                    disabled={!g}
                  >
                    <span className="thumb">
                      <GarmentPhoto imageId={g?.imageId ?? null} alt="" compact />
                    </span>
                    <span className="info">
                      <b>{g?.name ?? 'Pièce supprimée de la garde-robe'}</b>
                      <span>
                        {p.slot}
                        {g && g.availability === 'laundry' && ', au lavage'}
                        {g && g.availability === 'unavailable' && ', indisponible'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {fav.weatherContext && (
              <p className="small muted">
                Enregistrée le {new Date(fav.createdAt).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
                {fav.weatherContext.locationName ? ` à ${fav.weatherContext.locationName}` : ''} : {fav.weatherContext.summary.toLowerCase()}.
              </p>
            )}
            {fav.explanation.length > 0 && (
              <details>
                <summary className="small" style={{ fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>
                  Pourquoi ce look fonctionnait
                </summary>
                <ul className="small muted" style={{ paddingLeft: 18 }}>
                  {fav.explanation.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
            <Field label="Note personnelle" htmlFor="fav-notes">
              <textarea
                id="fav-notes"
                className="textarea"
                value={notes}
                maxLength={400}
                placeholder="Ex. parfait pour les réunions du lundi"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== fav.notes && saveFavorite({ ...fav, notes }).then(() => toast('Note enregistrée'))}
              />
            </Field>
            <Button variant="ghost" icon="trash" onClick={() => setConfirm(true)} style={{ alignSelf: 'flex-start' }}>
              Retirer des favoris
            </Button>
          </div>
        </div>
      </Sheet>
      {confirm && (
        <ConfirmDialog
          danger
          title="Retirer cette tenue ?"
          message={`« ${fav.name} » sera retirée de vos favoris. Les vêtements restent dans votre garde-robe.`}
          confirmLabel="Retirer"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            onClose();
            await removeFavorite(fav);
          }}
        />
      )}
    </>
  );
}
