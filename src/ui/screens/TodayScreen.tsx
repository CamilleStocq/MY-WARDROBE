import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Occasion, OutfitSlots, SlotName, Style } from '../../domain/types';
import { OCCASION_LABELS, STYLE_LABELS, currentSeason } from '../../domain/taxonomy';
import { evaluateOutfit, generateOutfit, wardrobeGaps, type GenerationResult } from '../../engine/generator';
import { signatureOf, subOf, type SlotKey } from '../../engine/rules';
import { needsSummary } from '../../engine/weatherNeeds';
import { TREND_BASE } from '../../engine/trends';
import { TODAY_EVENT, loadToday, localDate, saveToday } from '../../services/outfitService';
import { useStore } from '../../state/store';
import { Button, Chip, EmptyState, IconButton, Notice } from '../primitives';
import { Icon } from '../Icon';
import { GarmentPhoto } from '../garment/GarmentImage';
import { OutfitBoard, SLOT_LABELS } from '../outfit/OutfitBoard';
import { OutfitStack } from '../outfit/OutfitStack';
import { SlotPicker } from '../outfit/SlotPicker';
import { WeatherLine } from '../weather/WeatherCard';

type LockKey = SlotName | 'accessories';
const ORDER: SlotName[] = ['outer', 'top', 'mid', 'bottom', 'onepiece', 'shoes'];

export function TodayScreen({ goTo }: { goTo: (tab: 'wardrobe' | 'favorites' | 'settings' | 'calendar') => void }) {
  const store = useStore();
  const { garments, prefs, needs, favorites, engineContext, rememberProposal, addFavorite, saveFavorite, toast, openGarment, logWorn, calendar } = store;
  const [loaded, setLoaded] = useState(false);
  const [slots, setSlots] = useState<OutfitSlots | null>(null);
  const [locked, setLocked] = useState<LockKey[]>([]);
  const [shown, setShown] = useState<string[]>([]);
  const [occasion, setOccasion] = useState<Occasion>(prefs.occasions[0] ?? 'quotidien');
  const [gen, setGen] = useState<GenerationResult | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<{ slot: SlotKey; currentId?: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  /** change à chaque nouvelle proposition : les rangées défilantes recalculent alors leurs alternatives */
  const [listsKey, setListsKey] = useState('init');
  const [autogenTick, setAutogenTick] = useState(0);
  const pendingLocks = useRef<OutfitSlots | null>(null);

  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments]);
  const ctx = useMemo(() => engineContext(occasion), [engineContext, occasion]);

  // restauration de la tenue du jour (au montage et quand une autre vue la modifie)
  const restore = useCallback(() => {
    loadToday()
      .then((t) => {
        if (!t) return;
        const hasBase = !!(t.slots.onepiece || (t.slots.top && t.slots.bottom));
        setSlots(t.autogen || !hasBase ? null : t.slots);
        setListsKey(`restore-${Date.now()}`);
        setLocked(t.locked as LockKey[]);
        setShown(t.shown);
        setOccasion(t.occasion);
        setGen(null);
        setBanner(t.banner ?? null);
        if (t.autogen) {
          pendingLocks.current = t.slots;
          setAutogenTick((n) => n + 1);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    restore();
    window.addEventListener(TODAY_EVENT, restore);
    return () => window.removeEventListener(TODAY_EVENT, restore);
  }, [restore]);

  useEffect(() => {
    if (!loaded || pendingLocks.current) return;
    saveToday({ slots: slots ?? { accessories: [] }, locked, shown: shown.slice(-40), occasion }).catch(() => undefined);
  }, [loaded, slots, locked, shown, occasion]);

  const generate = useCallback(
    async (base?: OutfitSlots | null, lockList: LockKey[] = locked) => {
      const src = base ?? slots;
      const lockedSlots: Partial<OutfitSlots> = {};
      if (src) {
        for (const k of lockList) {
          if (k === 'accessories') lockedSlots.accessories = src.accessories;
          else if (src[k]) lockedSlots[k] = src[k];
        }
      }
      setBusy(true);
      await new Promise((r) => setTimeout(r, 160)); // laisse le temps d'afficher l'état de chargement
      const res = generateOutfit(ctx, { locked: lockedSlots, exclude: shown });
      setGen(res);
      if (!base) setBanner(null);
      if (res.proposal) {
        setSlots(res.proposal.slots);
        setListsKey(`${res.proposal.signature}-${Date.now()}`);
        setShown((s) => [...s, res.proposal!.signature]);
        rememberProposal(res.proposal.slots);
        // retire les verrous sur des emplacements qui n'existent plus
        setLocked((l) => l.filter((k) => (k === 'accessories' ? res.proposal!.slots.accessories.length : res.proposal!.slots[k])));
      }
      setBusy(false);
    },
    [ctx, shown, slots, locked, rememberProposal],
  );

  // génération automatique (« créer une tenue » depuis une fiche, « s'inspirer » d'un favori)
  useEffect(() => {
    if (!autogenTick || !garments.length || !pendingLocks.current) return;
    const base = pendingLocks.current;
    pendingLocks.current = null;
    generate(base, locked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autogenTick, garments.length]);

  const evaluation = useMemo(() => (slots ? evaluateOutfit(slots, ctx) : null), [slots, ctx]);
  const signature = slots ? signatureOf(slots).join('+') : '';
  const savedAs = favorites.find((f) => signatureOf(f.slots).join('+') === signature);
  const wornEntry = calendar[localDate()];
  const wornToday = !!wornEntry && signatureOf(wornEntry.slots).join('+') === signature;
  const gaps = useMemo(() => wardrobeGaps(garments), [garments]);
  const canCompose =
    garments.some((g) => g.category === 'onepiece' && g.availability === 'available') ||
    (garments.some((g) => g.category === 'top' && g.availability === 'available') && garments.some((g) => g.category === 'bottom' && g.availability === 'available'));

  function toggleLock(k: LockKey) {
    setLocked((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));
  }

  function replace(slot: SlotKey, id: string, currentId?: string) {
    if (!slots) return;
    if (slot === 'accessory') {
      const acc = currentId ? slots.accessories.map((a) => (a === currentId ? id : a)) : [...slots.accessories, id];
      setSlots({ ...slots, accessories: [...new Set(acc)] });
    } else {
      setSlots({ ...slots, [slot]: id });
    }
    setListsKey(`pick-${Date.now()}`);
    setPicker(null);
  }

  function removePiece(slot: SlotKey, id: string) {
    if (!slots) return;
    if (slot === 'accessory') setSlots({ ...slots, accessories: slots.accessories.filter((a) => a !== id) });
    else {
      const next = { ...slots };
      delete next[slot];
      setSlots(next);
      setLocked((l) => l.filter((k) => k !== slot));
    }
    setListsKey(`remove-${Date.now()}`);
    setPicker(null);
  }

  async function save() {
    if (!slots || !evaluation) return;
    if (savedAs) {
      toast(`Déjà dans vos favoris : « ${savedAs.name} »`);
      return;
    }
    const pieces = ORDER.map((s) => (slots[s] ? byId.get(slots[s]!) : undefined)).filter(Boolean);
    const styleCount = new Map<Style, number>();
    pieces.forEach((g) => g!.styles.forEach((s) => styleCount.set(s, (styleCount.get(s) ?? 0) + 1)));
    const styleTags = [...styleCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s);
    const day = new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' });
    const name = styleTags[0] ? `Look ${STYLE_LABELS[styleTags[0]].toLowerCase()} du ${day}` : `Look du ${day}`;
    try {
      await addFavorite({
        name,
        notes: '',
        slots,
        styleTags,
        occasion,
        seasons: [currentSeason()],
        weatherContext:
          needs.source === 'none'
            ? null
            : { summary: needsSummary(needs), feelsLike: needs.feels, band: needs.band, rain: needs.rain, locationName: prefs.location?.name ?? null },
        explanation: evaluation.explanation,
      });
      toast('Look enregistré dans vos favoris', { action: { label: 'Voir', run: () => goTo('favorites') } });
    } catch {
      /* erreur déjà signalée */
    }
  }

  async function wear() {
    if (!slots) return;
    await logWorn(localDate(), slots, savedAs?.id ?? null);
    await rememberProposal(slots);
    if (savedAs) await saveFavorite({ ...savedAs, lastWornAt: new Date().toISOString() }).catch(() => undefined);
    toast('Ajoutée au calendrier', { action: { label: 'Voir', run: () => goTo('calendar') } });
  }

  const dateText = new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = dateText.charAt(0).toUpperCase() + dateText.slice(1);

  // ---------- en-tête ----------
  const head = (
    <>
      <div className="look-head">
        <div>
          <h1>Ton look du jour</h1>
          <p className="date">
            {today}
            {prefs.displayName ? ` · ${prefs.displayName}` : ''}
          </p>
        </div>
        <IconButton icon="user" label="Profil et préférences" className="mobile-only" onClick={() => goTo('settings')} />
      </div>
      <WeatherLine />
      {garments.length > 0 && (
        <div className="chip-row occasions" role="radiogroup" aria-label="Occasion">
          {(Object.keys(OCCASION_LABELS) as Occasion[]).map((o) => (
            <Chip key={o} role="radio" pressed={occasion === o} onClick={() => setOccasion(o)}>
              {OCCASION_LABELS[o]}
            </Chip>
          ))}
        </div>
      )}
    </>
  );

  const notices = (
    <>
      {banner && <Notice tone="info">{banner}</Notice>}
      {gen?.status === 'impossible' && (
        <Notice tone="warn" title="Aucune tenue possible avec ces contraintes">
          {gen.reasons.join(' ')}
          {locked.length > 0 && ' Essayez de déverrouiller certaines pièces.'}
        </Notice>
      )}
      {gen?.status === 'compromise' && slots && (
        <Notice tone="warn" title="Meilleure alternative possible">
          Aucune combinaison de votre garde-robe ne respecte toutes les contraintes météo du jour. Les points d’attention sont indiqués sous la tenue.
        </Notice>
      )}
      {gen?.notices.map((n) => (
        <Notice key={n} tone="info">
          {n}
        </Notice>
      ))}
    </>
  );

  // ---------- description courte du look ----------
  const description = slots && evaluation && (
    <div className="look-desc">
      <ul>
        {evaluation.explanation.slice(0, 3).map((e) => (
          <li key={e}>{e}</li>
        ))}
        {evaluation.warnings.slice(0, 2).map((w) => (
          <li key={w} className="warn">
            {w}
          </li>
        ))}
      </ul>
      {(evaluation.explanation.length > 3 || evaluation.warnings.length > 2) && (
        <details className="disclosure">
          <summary>Pourquoi ce look</summary>
          <div className="look-desc">
            <ul>
              {evaluation.explanation.slice(3).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {evaluation.warnings.slice(2).map((w) => (
                <li key={w} className="warn">
                  {w}
                </li>
              ))}
            </ul>
            {evaluation.explanation.some((e) => e.includes(TREND_BASE.label.toLowerCase())) && (
              <p className="trend-note">
                Tendances : {TREND_BASE.label.toLowerCase()} {TREND_BASE.season.toLowerCase()}. {TREND_BASE.disclaimer}
              </p>
            )}
          </div>
        </details>
      )}
      <div className="look-links">
        <button type="button" className="link-btn" onClick={() => setEditOpen((v) => !v)} aria-expanded={editOpen}>
          {editOpen ? 'Fermer la modification' : 'Modifier la tenue'}
        </button>
        {wornToday ? (
          <span className="small muted">
            <Icon name="check" size={14} /> Notée dans le calendrier
          </span>
        ) : (
          <button type="button" className="link-btn" onClick={wear}>
            Je la porte aujourd’hui
          </button>
        )}
      </div>
    </div>
  );

  // ---------- composition ----------
  let main: React.ReactNode;
  if (!garments.length) {
    main = (
      <EmptyState
        art="outfit"
        title="Commencez par votre garde-robe"
        actions={
          <Button variant="primary" onClick={() => goTo('wardrobe')}>
            Ajouter des vêtements
          </Button>
        }
      >
        Les tenues sont composées uniquement à partir de vos propres vêtements.
      </EmptyState>
    );
  } else if (!canCompose) {
    main = (
      <EmptyState
        art="outfit"
        title="Il manque quelques pièces"
        actions={
          <Button variant="primary" onClick={() => goTo('wardrobe')}>
            Compléter ma garde-robe
          </Button>
        }
      >
        {gaps.join(' ')}
      </EmptyState>
    );
  } else if (!slots) {
    main = (
      <div className="generate-hero">
        <h2>Votre tenue du jour</h2>
        <p>
          {needs.source === 'none'
            ? 'Choisissez votre lieu pour une tenue adaptée à la météo, ou composez-la dès maintenant.'
            : 'Composée à partir de vos vêtements disponibles et de la météo prévue sur vos heures de sortie.'}
        </p>
        <Button variant="primary" size="lg" loading={busy} onClick={() => generate()}>
          Composer ma tenue
        </Button>
      </div>
    );
  } else {
    main = (
      <>
        <div>
          <OutfitStack
            slots={slots}
            ctx={ctx}
            listsKey={listsKey}
            locked={locked.filter((k): k is SlotName => k !== 'accessories')}
            onChange={(slot, id) => setSlots((cur) => (cur ? { ...cur, [slot]: id } : cur))}
            onPiece={(slot, id) => setPicker({ slot, currentId: id })}
            busy={busy}
          />
          <p className="stack-hint">Faites glisser une pièce pour en essayer une autre, touchez-la pour plus d’options.</p>
        </div>

        <div className="mobile-block">{description}</div>

        {editOpen && (
          <section aria-label="Modifier la tenue">
            <div className="pieces">
              {ORDER.filter((s) => slots[s]).map((s) => {
                const g = byId.get(slots[s]!);
                const isLocked = locked.includes(s);
                return (
                  <div className="piece-row" key={s}>
                    <button type="button" className="thumb" style={{ border: 0, padding: 0, background: 'none' }} onClick={() => g && openGarment(g.id)} aria-label={`Voir la fiche : ${g?.name ?? 'pièce supprimée'}`}>
                      <GarmentPhoto imageId={g?.imageId ?? null} alt="" compact />
                    </button>
                    <div className="info">
                      <b>{g?.name ?? 'Pièce supprimée'}</b>
                      <span>{SLOT_LABELS[s]}</span>
                    </div>
                    <IconButton icon={isLocked ? 'lock' : 'unlock'} label={isLocked ? `Déverrouiller : ${g?.name}` : `Verrouiller : ${g?.name}`} aria-pressed={isLocked} onClick={() => toggleLock(s)} />
                    <IconButton icon="swap" label={`Remplacer : ${g?.name}`} onClick={() => setPicker({ slot: s, currentId: slots[s] })} />
                  </div>
                );
              })}
              {slots.accessories.map((id) => {
                const g = byId.get(id);
                return (
                  <div className="piece-row" key={id}>
                    <button type="button" className="thumb" style={{ border: 0, padding: 0, background: 'none' }} onClick={() => g && openGarment(g.id)} aria-label={`Voir la fiche : ${g?.name ?? 'pièce supprimée'}`}>
                      <GarmentPhoto imageId={g?.imageId ?? null} alt="" compact />
                    </button>
                    <div className="info">
                      <b>{g?.name ?? 'Pièce supprimée'}</b>
                      <span>Accessoire</span>
                    </div>
                    <IconButton icon="swap" label={`Changer : ${g?.name}`} onClick={() => setPicker({ slot: 'accessory', currentId: id })} />
                    <IconButton icon="close" label={`Retirer : ${g?.name}`} onClick={() => removePiece('accessory', id)} />
                  </div>
                );
              })}
            </div>
            <div className="add-row">
              {!slots.outer && garments.some((g) => g.category === 'outerwear' && g.availability === 'available') && (
                <Button size="sm" variant="outline" icon="plus" onClick={() => setPicker({ slot: 'outer' })}>
                  Veste
                </Button>
              )}
              {!slots.mid && slots.top && byId.get(slots.top) && !subOf(byId.get(slots.top)!, prefs).layer && garments.some((g) => g.category === 'top' && subOf(g, prefs).layer && g.availability === 'available') && (
                <Button size="sm" variant="outline" icon="plus" onClick={() => setPicker({ slot: 'mid' })}>
                  Maille
                </Button>
              )}
              {slots.accessories.length < 3 && garments.some((g) => g.category === 'accessory' && g.availability === 'available' && !slots.accessories.includes(g.id)) && (
                <Button size="sm" variant="outline" icon="plus" onClick={() => setPicker({ slot: 'accessory' })}>
                  Accessoire
                </Button>
              )}
              {slots.accessories.length > 0 && (
                <Button size="sm" variant="ghost" icon={locked.includes('accessories') ? 'lock' : 'unlock'} onClick={() => toggleLock('accessories')} aria-pressed={locked.includes('accessories')}>
                  {locked.includes('accessories') ? 'Accessoires gardés' : 'Garder les accessoires'}
                </Button>
              )}
            </div>
          </section>
        )}

        {gen && gen.alternatives.length > 0 && (
          <section aria-label="Autres looks possibles">
            <div className="section-head">
              <h3>Autres looks</h3>
            </div>
            <div className="alts">
              {gen.alternatives.map((a) => (
                <button
                  key={a.signature}
                  type="button"
                  className="alt"
                  onClick={() => {
                    setSlots(a.slots);
                    setListsKey(`alt-${a.signature}-${Date.now()}`);
                    setShown((s) => [...s, a.signature]);
                    rememberProposal(a.slots);
                    setGen({ ...gen, alternatives: gen.alternatives.filter((x) => x !== a).concat(gen.proposal && gen.proposal.signature !== a.signature ? [gen.proposal] : []), proposal: a });
                  }}
                  aria-label="Choisir ce look"
                >
                  <OutfitBoard slots={a.slots} byId={byId} mood="neutral" compact />
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="look-cta sticky-cta" style={{ bottom: 'calc(var(--nav-h) + var(--safe-b))' }}>
          <Button variant="primary" size="lg" loading={busy} onClick={() => generate()} style={{ flex: 1 }}>
            Générer une autre tenue
          </Button>
          <button
            type="button"
            className={`fav-toggle ${savedAs ? 'is-on' : ''}`}
            onClick={save}
            aria-pressed={!!savedAs}
            aria-label={savedAs ? 'Look enregistré dans les favoris' : 'Enregistrer ce look en favori'}
            title={savedAs ? 'Enregistré dans les favoris' : 'Enregistrer en favori'}
          >
            <Icon name="heart" size={22} filled={!!savedAs} />
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="today">
      <div className="today-side">
        {head}
        <div className="desktop-block">{notices}</div>
        <div className="desktop-block">{description}</div>
      </div>
      <div className="today-main">
        <div className="mobile-block" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
          {notices}
        </div>
        {main}
      </div>

      {picker && slots && (
        <SlotPicker
          slot={picker.slot}
          slots={slots}
          ctx={ctx}
          currentId={picker.currentId}
          locked={picker.slot !== 'accessory' && locked.includes(picker.slot)}
          onPick={(id) => replace(picker.slot, id, picker.currentId)}
          onRemove={picker.currentId && ['mid', 'outer', 'accessory', 'shoes'].includes(picker.slot) ? () => removePiece(picker.slot, picker.currentId!) : undefined}
          onToggleLock={picker.currentId && picker.slot !== 'accessory' ? () => toggleLock(picker.slot as SlotName) : undefined}
          onOpenDetail={(id) => {
            setPicker(null);
            openGarment(id);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
