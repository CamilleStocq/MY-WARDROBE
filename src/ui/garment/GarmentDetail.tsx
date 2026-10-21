import { useEffect, useMemo, useState } from 'react';
import type { Availability, Occasion, SlotName } from '../../domain/types';
import {
  AVAILABILITY_LABELS,
  CATEGORY_SINGULAR,
  FORMALITY_LABELS,
  PATTERN_LABELS,
  SILHOUETTE_LABELS,
  STYLE_LABELS,
  WARMTH_LABELS,
  seasonsLabel,
  subcategoryLabel,
} from '../../domain/taxonomy';
import { getColor } from '../../domain/colors';
import { wearWith } from '../../engine/generator';
import { slotsFor } from '../../engine/rules';
import { TODAY_EVENT, saveToday } from '../../services/outfitService';
import { useStore } from '../../state/store';
import { Button, ColorDot, ConfirmDialog, IconButton, Sheet } from '../primitives';
import { Icon } from '../Icon';
import { GarmentImg, GarmentPhoto } from './GarmentImage';
import { GarmentEditor } from './GarmentEditor';

/**
 * Fiche d'un vêtement — écran de référence de la direction artistique :
 * barre compacte, grande photo sur fond gris clair, marque + nom, trois actions
 * discrètes, « À porter avec », bouton noir fixé en bas.
 */
export function GarmentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { garments, setAvailability, saveGarment, removeGarment, favorites, prefs, engineContext, openGarment, toast } = useStore();
  const g = garments.find((x) => x.id === id);
  const [mode, setMode] = useState<'view' | 'edit' | 'photo' | 'confirm'>('view');
  const [menu, setMenu] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setShowAll(false);
    setMenu(false);
  }, [id]);

  const suggestions = useMemo(() => (g ? wearWith(g, engineContext((prefs.occasions[0] ?? 'quotidien') as Occasion), 12) : []), [g, engineContext, prefs.occasions]);

  if (!g) {
    return (
      <Sheet title="Vêtement introuvable" onClose={onClose} size="narrow">
        <p className="muted">Ce vêtement a été supprimé de votre garde-robe.</p>
      </Sheet>
    );
  }
  if (mode === 'edit' || mode === 'photo') {
    return <GarmentEditor garment={g} startWithPhoto={mode === 'photo'} onClose={() => setMode('view')} />;
  }

  const usedIn = favorites.filter((f) => f.garmentIds.includes(g.id)).length;
  const subLabel = subcategoryLabel(g.subcategory, prefs.customSubcategories);

  async function createOutfit() {
    const slot = slotsFor(g!, prefs)[0];
    await saveToday({
      slots: slot === 'accessory' ? { accessories: [g!.id] } : { [slot]: g!.id, accessories: [] },
      locked: [slot === 'accessory' ? 'accessories' : (slot as SlotName)],
      shown: [],
      occasion: prefs.occasions[0] ?? 'quotidien',
      autogen: true,
      banner: `Tenue composée autour de : ${g!.name}.`,
    });
    onClose();
    window.dispatchEvent(new Event(TODAY_EVENT));
    window.location.hash = '/today';
  }

  const shown = showAll ? suggestions : suggestions.slice(0, 6);

  return (
    <>
      <Sheet title={g.name} onClose={onClose} page>
        <div className="topnav" style={{ margin: '0 calc(-1 * var(--gutter))' }}>
          <IconButton icon="back" label="Retour" onClick={onClose} />
          <span className="eyebrow">{subLabel}</span>
          <IconButton icon="more" label="Plus d’actions" aria-expanded={menu} onClick={() => setMenu((m) => !m)} />
          {menu && (
            <div className="menu" role="menu">
              {(['available', 'laundry', 'unavailable'] as Availability[])
                .filter((a) => a !== g.availability)
                .map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setAvailability(g, a);
                      toast(`${g.name} : ${AVAILABILITY_LABELS[a].toLowerCase()}`);
                    }}
                  >
                    Marquer « {AVAILABILITY_LABELS[a].toLowerCase()} »
                  </button>
                ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  setMode('photo');
                }}
              >
                Remplacer ou retoucher la photo
              </button>
            </div>
          )}
        </div>

        <div className="item">
          <div className="item-photo photo">
            <GarmentImg imageId={g.imageId} size="full" alt={g.name} />
          </div>

          <div className="item-title">
            <span className="eyebrow">{g.brand || CATEGORY_SINGULAR[g.category]}</span>
            <h2>{g.name}</h2>
            <span className="item-meta">
              {subLabel} · {getColor(g.primaryColor).label} · {seasonsLabel(g.seasons)}
            </span>
            {g.availability !== 'available' && <span className="item-meta">{AVAILABILITY_LABELS[g.availability]}</span>}
            {g.isDemo && <span className="item-meta">Pièce de démonstration (illustration)</span>}
          </div>

          <div className="action-row">
            <button
              type="button"
              className="action-tile"
              aria-pressed={g.favorite}
              onClick={async () => {
                await saveGarment({ ...g, favorite: !g.favorite });
                toast(g.favorite ? 'Retiré de vos pièces préférées' : 'Ajouté à vos pièces préférées');
              }}
            >
              <Icon name="heart" size={20} filled={g.favorite} />
              Favori
            </button>
            <button type="button" className="action-tile" onClick={() => setMode('edit')}>
              <Icon name="edit" size={20} />
              Modifier
            </button>
            <button type="button" className="action-tile" onClick={() => setMode('confirm')}>
              <Icon name="trash" size={20} />
              Supprimer
            </button>
          </div>

          {suggestions.length > 0 && (
            <section aria-label="À porter avec">
              <div className="section-head">
                <h3>À porter avec</h3>
                {suggestions.length > 6 && (
                  <button type="button" className="link-btn" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? 'Moins' : 'Tout voir'}
                  </button>
                )}
              </div>
              <div className="hscroll">
                {shown.map((s) => (
                  <button key={s.id} type="button" className="mini-card" onClick={() => openGarment(s.id)}>
                    <GarmentPhoto imageId={s.imageId} alt="" compact />
                    <b>{s.name}</b>
                    <span>{s.brand || subcategoryLabel(s.subcategory, prefs.customSubcategories)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <details className="disclosure">
            <summary>Détails</summary>
            <dl className="props">
              <dt>Couleurs</dt>
              <dd>
                {[g.primaryColor, ...g.secondaryColors].map((c) => (
                  <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ColorDot color={c} size={12} /> {getColor(c).label}
                  </span>
                ))}
              </dd>
              <dt>Motif</dt>
              <dd>{PATTERN_LABELS[g.pattern]}</dd>
              <dt>Saison</dt>
              <dd>{seasonsLabel(g.seasons)}</dd>
              <dt>Style</dt>
              <dd>{g.styles.length ? g.styles.map((s) => STYLE_LABELS[s]).join(', ') : '—'}</dd>
              <dt>Formalité</dt>
              <dd>{FORMALITY_LABELS[g.formality]}</dd>
              <dt>Chaleur</dt>
              <dd>{WARMTH_LABELS[g.warmth]}</dd>
              {g.silhouette && (
                <>
                  <dt>Coupe</dt>
                  <dd>{SILHOUETTE_LABELS[g.silhouette]}</dd>
                </>
              )}
              {g.material && (
                <>
                  <dt>Matière</dt>
                  <dd>{g.material}</dd>
                </>
              )}
              {g.waterproof && (
                <>
                  <dt>Pluie</dt>
                  <dd>Imperméable</dd>
                </>
              )}
              <dt>Ajouté le</dt>
              <dd>{new Date(g.createdAt).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            </dl>
            {g.notes && <p className="small" style={{ marginTop: 'var(--s3)' }}>{g.notes}</p>}
          </details>

          <div className="sticky-cta">
            <Button variant="primary" block size="lg" onClick={createOutfit} disabled={g.availability !== 'available'}>
              Créer une tenue
            </Button>
            {g.availability !== 'available' && (
              <p className="small muted" style={{ textAlign: 'center', marginTop: 'var(--s2)' }}>
                Disponible à nouveau pour créer une tenue une fois sorti du lavage.
              </p>
            )}
          </div>
        </div>
      </Sheet>
      {mode === 'confirm' && (
        <ConfirmDialog
          danger
          title={`Supprimer « ${g.name} » ?`}
          message={
            usedIn > 0
              ? `Ce vêtement et sa photo seront supprimés. Il apparaît dans ${usedIn} tenue${usedIn > 1 ? 's' : ''} favorite${usedIn > 1 ? 's' : ''}, qui afficheront une pièce manquante.`
              : 'Ce vêtement et sa photo seront supprimés de la garde-robe.'
          }
          confirmLabel="Supprimer"
          onCancel={() => setMode('view')}
          onConfirm={async () => {
            onClose();
            await removeGarment(g);
          }}
        />
      )}
    </>
  );
}
