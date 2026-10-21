import { useState } from 'react';
import type { Availability } from '../../domain/types';
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
import { useStore } from '../../state/store';
import { Button, ColorDot, ConfirmDialog, Notice, Segmented, Sheet } from '../primitives';
import { GarmentPhoto } from './GarmentImage';
import { GarmentEditor } from './GarmentEditor';

export function GarmentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { garments, setAvailability, removeGarment, favorites, prefs } = useStore();
  const g = garments.find((x) => x.id === id);
  const [mode, setMode] = useState<'view' | 'edit' | 'photo' | 'confirm'>('view');

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

  return (
    <>
      <Sheet
        title={g.name}
        onClose={onClose}
        size="wide"
        footer={
          <>
            <Button variant="outline" icon="trash" onClick={() => setMode('confirm')}>
              Supprimer
            </Button>
            <Button variant="secondary" icon="edit" onClick={() => setMode('edit')}>
              Modifier
            </Button>
          </>
        }
      >
        <div className="detail">
          <div>
            <GarmentPhoto imageId={g.imageId} size="full" alt={g.name} />
            <Button variant="ghost" size="sm" icon="camera" onClick={() => setMode('photo')} style={{ marginTop: 'var(--s2)' }}>
              {g.imageId ? 'Remplacer la photo' : 'Ajouter une photo'}
            </Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
            {g.isDemo && <Notice tone="demo">Pièce de démonstration : illustration, pas une photo de votre vêtement.</Notice>}
            <div className="field">
              <span className="label">Disponibilité</span>
              <Segmented<Availability>
                label="Disponibilité"
                options={(['available', 'laundry', 'unavailable'] as const).map((a) => ({ value: a, label: AVAILABILITY_LABELS[a] }))}
                value={g.availability}
                onChange={(a) => setAvailability(g, a)}
              />
              <span className="hint">Les pièces au lavage ou indisponibles ne sont pas proposées dans les tenues.</span>
            </div>
            <dl className="props">
              <dt>Type</dt>
              <dd>
                {CATEGORY_SINGULAR[g.category]} · {subcategoryLabel(g.subcategory, prefs.customSubcategories)}
              </dd>
              <dt>Couleurs</dt>
              <dd>
                {[g.primaryColor, ...g.secondaryColors].map((c) => (
                  <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ColorDot color={c} size={14} /> {getColor(c).label}
                  </span>
                ))}
              </dd>
              <dt>Motif</dt>
              <dd>{PATTERN_LABELS[g.pattern]}</dd>
              <dt>Saison</dt>
              <dd>
                <span className="badge badge-season">{seasonsLabel(g.seasons)}</span>
              </dd>
              <dt>Styles</dt>
              <dd>{g.styles.length ? g.styles.map((s) => <span key={s} className="badge badge-cat">{STYLE_LABELS[s]}</span>) : <span className="muted">Non précisé</span>}</dd>
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
            {g.notes && <p className="small">{g.notes}</p>}
            {usedIn > 0 && <p className="small muted">Présent dans {usedIn} tenue{usedIn > 1 ? 's' : ''} favorite{usedIn > 1 ? 's' : ''}.</p>}
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
