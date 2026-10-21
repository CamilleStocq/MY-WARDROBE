import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Occasion, OutfitSlots, SlotName, Style } from '../../domain/types';
import { OCCASION_LABELS, STYLE_LABELS, currentSeason } from '../../domain/taxonomy';
import { evaluateOutfit, generateOutfit, wardrobeGaps, type GenerationResult } from '../../engine/generator';
import { signatureOf, subOf, type SlotKey } from '../../engine/rules';
import { needsSummary } from '../../engine/weatherNeeds';
import { TREND_BASE } from '../../engine/trends';
import { loadToday, markWorn, saveToday } from '../../services/outfitService';
import { useStore } from '../../state/store';
import { Button, Chip, EmptyState, IconButton, Notice } from '../primitives';
import { Icon } from '../Icon';
import { GarmentPhoto } from '../garment/GarmentImage';
import { OutfitBoard, SLOT_LABELS, moodFor } from '../outfit/OutfitBoard';
import { SlotPicker } from '../outfit/SlotPicker';
import { WeatherCard, adviceFor } from '../weather/WeatherCard';

type LockKey = SlotName | 'accessories';
const ORDER: SlotName[] = ['top', 'mid', 'bottom', 'onepiece', 'outer', 'shoes'];

function greeting(name: string) {
  const h = new Date().getHours();
  const hello = h < 5 ? 'Bonsoir' : h < 12 ? 'Bonjour' : h < 18 ? 'Bel après-midi' : 'Bonsoir';
  return name ? `${hello} ${name} !` : `${hello} !`;
}

export function TodayScreen({ goTo }: { goTo: (tab: 'wardrobe' | 'favorites' | 'settings') => void }) {
  const store = useStore();
  const { garments, prefs, needs, favorites, engineContext, rememberProposal, addFavorite, saveFavorite, toast, openGarment } = store;
  const [loaded, setLoaded] = useState(false);
  const [slots, setSlots] = useState<OutfitSlots | null>(null);
  const [locked, setLocked] = useState<LockKey[]>([]);
  const [shown, setShown] = useState<string[]>([]);
  const [occasion, setOccasion] = useState<Occasion>(prefs.occasions[0] ?? 'quotidien');
  const [gen, setGen] = useState<GenerationResult | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<{ slot: SlotKey; currentId?: string } | null>(null);
  const autogen = useRef(false);
  const pendingLocks = useRef<OutfitSlots | null>(null);

  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments]);
  const ctx = useMemo(() => engineContext(occasion), [engineContext, occasion]);

  // restauration de la tenue du jour
  useEffect(() => {
    loadToday()
      .then((t) => {
        if (t) {
          const hasBase = !!(t.slots.onepiece || (t.slots.top && t.slots.bottom));
          setSlots(t.autogen || !hasBase ? null : t.slots);
          setLocked(t.locked as LockKey[]);
          setShown(t.shown);
          setOccasion(t.occasion);
          if (t.banner) setBanner(t.banner);
          if (t.autogen) {
            autogen.current = true;
            pendingLocks.current = t.slots;
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!loaded) return;
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
      await new Promise((r) => setTimeout(r, 180)); // laisse le temps d'afficher l'état de chargement
      const res = generateOutfit(ctx, { locked: lockedSlots, exclude: shown });
      setGen(res);
      setBanner(null);
      if (res.proposal) {
        setSlots(res.proposal.slots);
        setShown((s) => [...s, res.proposal!.signature]);
        rememberProposal(res.proposal.slots);
        // retire les verrous sur des emplacements qui n'existent plus
        setLocked((l) => l.filter((k) => (k === 'accessories' ? res.proposal!.slots.accessories.length : res.proposal!.slots[k])));
      }
      setBusy(false);
    },
    [ctx, shown, slots, locked, rememberProposal],
  );

  // génération automatique (« s'inspirer d'un favori »)
  useEffect(() => {
    if (loaded && autogen.current && garments.length) {
      autogen.current = false;
      generate(pendingLocks.current, locked);
    }
  }, [loaded, garments.length, generate, locked]);

  const evaluation = useMemo(() => (slots ? evaluateOutfit(slots, ctx) : null), [slots, ctx]);
  const signature = slots ? signatureOf(slots).join('+') : '';
  const savedAs = favorites.find((f) => signatureOf(f.slots).join('+') === signature);
  const gaps = useMemo(() => wardrobeGaps(garments), [garments]);
  const canCompose = garments.some((g) => g.category === 'onepiece' && g.availability === 'available') ||
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
      toast('Tenue ajoutée à vos favoris', { action: { label: 'Voir', run: () => goTo('favorites') } });
    } catch {
      /* erreur déjà signalée */
    }
  }

  async function wear() {
    if (!slots) return;
    await markWorn(slots).catch(() => undefined);
    await rememberProposal(slots);
    if (savedAs) await saveFavorite({ ...savedAs, lastWornAt: new Date().toISOString() }).catch(() => undefined);
    toast('C’est noté, bonne journée ! Cette tenue sera moins proposée les prochains jours.');
  }

  const dateText = new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = dateText.charAt(0).toUpperCase() + dateText.slice(1);
  const advice = adviceFor(needs);
  const mood = moodFor(needs);

  const occasionChips = (
    <div className="chip-row occasions" role="radiogroup" aria-label="Occasion">
      {(Object.keys(OCCASION_LABELS) as Occasion[]).map((o) => (
        <Chip key={o} role="radio" pressed={occasion === o} onClick={() => setOccasion(o)}>
          {OCCASION_LABELS[o]}
        </Chip>
      ))}
    </div>
  );

  // ---------- partie principale (composition) ----------
  let main: React.ReactNode;
  if (!garments.length) {
    main = (
      <EmptyState
        art="outfit"
        title="Commencez par votre garde-robe"
        actions={
          <Button variant="primary" size="lg" icon="hanger" onClick={() => goTo('wardrobe')}>
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
          <Button variant="primary" icon="plus" onClick={() => goTo('wardrobe')}>
            Compléter ma garde-robe
          </Button>
        }
      >
        {gaps.join(' ')}
      </EmptyState>
    );
  } else if (!slots) {
    main = (
      <div className="board" data-mood={mood}>
        <div className="generate-hero" style={{ position: 'absolute', inset: 0 }}>
          <h2>Votre tenue du jour</h2>
          <p>
            {needs.source === 'none'
              ? 'Choisissez votre lieu pour une tenue adaptée à la météo, ou générez-la dès maintenant.'
              : 'Composée à partir de vos vêtements disponibles et de la météo prévue sur vos heures de sortie.'}
          </p>
          <Button variant="primary" size="lg" icon="sparkle" loading={busy} onClick={() => generate()}>
            Générer ma tenue
          </Button>
        </div>
      </div>
    );
  } else {
    main = (
      <div className="board-wrap">
        <OutfitBoard
          key={signature}
          slots={slots}
          byId={byId}
          mood={mood}
          responsive
          locked={locked.filter((k): k is SlotName => k !== 'accessories')}
          onPiece={(slot, id) => setPicker({ slot, currentId: id })}
        />
        <div className="board-actions">
          <Button variant="primary" icon="refresh" loading={busy} onClick={() => generate()}>
            Autre proposition
          </Button>
          <IconButton icon="heart" label={savedAs ? 'Déjà dans les favoris' : 'Enregistrer dans les favoris'} filled onClick={save} aria-pressed={!!savedAs} style={savedAs ? { color: 'var(--rose)' } : undefined} />
          <IconButton icon="check" label="Je porte cette tenue aujourd’hui" filled onClick={wear} />
        </div>

        <div className="pieces" aria-label="Pièces de la tenue">
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
          <div className="add-row">
            {!slots.outer && garments.some((g) => g.category === 'outerwear' && g.availability === 'available') && (
              <Button size="sm" variant="outline" icon="plus" onClick={() => setPicker({ slot: 'outer' })}>
                Ajouter une veste
              </Button>
            )}
            {!slots.mid && slots.top && !subOf(byId.get(slots.top)!, prefs).layer && garments.some((g) => g.category === 'top' && subOf(g, prefs).layer && g.availability === 'available') && (
              <Button size="sm" variant="outline" icon="plus" onClick={() => setPicker({ slot: 'mid' })}>
                Ajouter une maille
              </Button>
            )}
            {slots.accessories.length < 3 && garments.some((g) => g.category === 'accessory' && g.availability === 'available' && !slots.accessories.includes(g.id)) && (
              <Button size="sm" variant="outline" icon="plus" onClick={() => setPicker({ slot: 'accessory' })}>
                Ajouter un accessoire
              </Button>
            )}
            {slots.accessories.length > 0 && (
              <Button size="sm" variant={locked.includes('accessories') ? 'secondary' : 'ghost'} icon={locked.includes('accessories') ? 'lock' : 'unlock'} onClick={() => toggleLock('accessories')} aria-pressed={locked.includes('accessories')}>
                {locked.includes('accessories') ? 'Accessoires verrouillés' : 'Garder les accessoires'}
              </Button>
            )}
          </div>
        </div>

        {gen && gen.alternatives.length > 0 && (
          <section aria-label="Autres looks possibles">
            <h3 style={{ marginBottom: 'var(--s3)' }}>Autres looks possibles</h3>
            <div className="alts">
              {gen.alternatives.map((a) => (
                <button
                  key={a.signature}
                  type="button"
                  className="alt"
                  onClick={() => {
                    setSlots(a.slots);
                    setShown((s) => [...s, a.signature]);
                    rememberProposal(a.slots);
                    setGen({ ...gen, alternatives: gen.alternatives.filter((x) => x !== a).concat(gen.proposal && gen.proposal.signature !== a.signature ? [gen.proposal] : []), proposal: a });
                  }}
                  aria-label="Choisir ce look"
                >
                  <OutfitBoard slots={a.slots} byId={byId} mood={mood} compact />
                  <span>Choisir ce look</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ---------- colonne d'informations ----------
  const statusNotices = (
    <>
      {banner && <Notice tone="info">{banner}</Notice>}
      {gen?.status === 'impossible' && (
        <Notice tone="warn" title="Aucune tenue possible avec ces contraintes">
          {gen.reasons.join(' ')}
          {locked.length > 0 && ' Essayez de déverrouiller certaines pièces.'}
        </Notice>
      )}
      {gen?.status === 'compromise' && slots && (
        <Notice tone="warn" title="Meilleure alternative possible, mais pas idéale">
          Aucune combinaison de votre garde-robe ne respecte toutes les contraintes météo du jour. Les points d’attention sont détaillés ci-dessous.
        </Notice>
      )}
      {gen?.notices.map((n) => (
        <Notice key={n} tone="info">
          {n}
        </Notice>
      ))}
    </>
  );

  return (
    <div className="today">
      <div className="today-side">
        <div className="greeting">
          <p className="date">{today}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s3)' }}>
            <h1>
              {greeting(prefs.displayName)}
              <br />
              On s’habille comment aujourd’hui ?
            </h1>
            <IconButton icon="user" label="Profil et préférences" className="profile-btn mobile-only" filled onClick={() => goTo('settings')} />
          </div>
        </div>
        <WeatherCard />
        {advice && <p className="advice">{advice}</p>}
        {garments.length > 0 && occasionChips}
        <div className="desktop-block">{statusNotices}</div>
        {slots && evaluation && (
          <div className="why desktop-block">
            <WhyBlock explanation={evaluation.explanation} warnings={evaluation.warnings} />
          </div>
        )}
      </div>
      <div className="today-main" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
        <div className="mobile-block" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
          {statusNotices}
        </div>
        {main}
        {slots && evaluation && (
          <div className="why mobile-block">
            <WhyBlock explanation={evaluation.explanation} warnings={evaluation.warnings} />
          </div>
        )}
      </div>

      {picker && slots && (
        <SlotPicker
          slot={picker.slot}
          slots={slots}
          ctx={ctx}
          currentId={picker.currentId}
          locked={picker.slot !== 'accessory' && locked.includes(picker.slot)}
          onPick={(id) => replace(picker.slot, id, picker.currentId)}
          onRemove={
            picker.currentId && ['mid', 'outer', 'accessory', 'shoes'].includes(picker.slot)
              ? () => removePiece(picker.slot, picker.currentId!)
              : undefined
          }
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

function WhyBlock({ explanation, warnings }: { explanation: string[]; warnings: string[] }) {
  return (
    <>
      <h2>Pourquoi ce look ?</h2>
      <ul>
        {explanation.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {warnings.length > 0 && (
        <div className="warnings" style={{ marginTop: 'var(--s4)' }}>
          {warnings.map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
        </div>
      )}
      {explanation.some((e) => e.includes(TREND_BASE.label.toLowerCase())) && (
        <p className="trend-note">
          <Icon name="info" size={13} /> Tendances : {TREND_BASE.label.toLowerCase()} {TREND_BASE.season.toLowerCase()}, rédigée le {new Date(TREND_BASE.writtenAt).toLocaleDateString('fr-BE')}. {TREND_BASE.disclaimer}
        </p>
      )}
    </>
  );
}
