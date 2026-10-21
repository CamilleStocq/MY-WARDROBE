import { useMemo } from 'react';
import type { OutfitSlots } from '../../domain/types';
import { rankAlternatives } from '../../engine/generator';
import type { EngineContext, SlotKey } from '../../engine/rules';
import { Button, EmptyState, Sheet } from '../primitives';
import { GarmentPhoto } from '../garment/GarmentImage';
import { SLOT_LABELS } from './OutfitBoard';

const TITLES: Record<SlotKey, string> = {
  top: 'Remplacer le haut',
  mid: 'Couche intermédiaire',
  bottom: 'Remplacer le bas',
  onepiece: 'Remplacer la pièce',
  outer: 'Veste ou manteau',
  shoes: 'Changer les chaussures',
  accessory: 'Ajouter un accessoire',
};

/**
 * Choix d'une pièce pour un emplacement : alternatives classées par le moteur,
 * avec les pièces inadaptées à la météo signalées (mais toujours sélectionnables).
 */
export function SlotPicker({
  slot,
  slots,
  ctx,
  currentId,
  locked,
  onPick,
  onRemove,
  onToggleLock,
  onOpenDetail,
  onClose,
}: {
  slot: SlotKey;
  slots: OutfitSlots;
  ctx: EngineContext;
  currentId?: string;
  locked?: boolean;
  onPick: (id: string) => void;
  onRemove?: () => void;
  onToggleLock?: () => void;
  onOpenDetail?: (id: string) => void;
  onClose: () => void;
}) {
  const alts = useMemo(() => {
    const base = currentId && slot === 'accessory' ? { ...slots, accessories: slots.accessories.filter((a) => a !== currentId) } : slots;
    return rankAlternatives(slot, base, ctx);
  }, [slot, slots, ctx, currentId]);
  const best = alts.find((a) => !a.issue)?.total ?? 0;

  return (
    <Sheet
      title={currentId && slot === 'accessory' ? 'Accessoire' : TITLES[slot]}
      onClose={onClose}
      footer={
        currentId ? (
          <>
            {onOpenDetail && (
              <Button variant="outline" onClick={() => onOpenDetail(currentId)}>
                Voir la fiche
              </Button>
            )}
            {onToggleLock && (
              <Button variant="secondary" icon={locked ? 'unlock' : 'lock'} onClick={onToggleLock}>
                {locked ? 'Déverrouiller' : 'Verrouiller'}
              </Button>
            )}
            {onRemove && (
              <Button variant="outline" icon="close" onClick={onRemove}>
                Retirer
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {locked && <p className="small muted" style={{ marginBottom: 'var(--s3)' }}>Pièce verrouillée : elle sera conservée lors des prochaines propositions.</p>}
      {alts.length === 0 ? (
        <EmptyState art="wardrobe" title="Aucune autre pièce disponible">
          Ajoutez des vêtements de ce type à votre garde-robe, ou vérifiez ceux qui sont au lavage.
        </EmptyState>
      ) : (
        <div className="alt-list">
          {alts.map((a) => (
            <button
              key={a.garment.id}
              type="button"
              className="alt-item"
              aria-current={a.garment.id === currentId}
              onClick={() => onPick(a.garment.id)}
              aria-label={`${a.garment.name}${a.issue ? ` — ${a.issue}` : ''}`}
            >
              <GarmentPhoto imageId={a.garment.imageId} alt="" />
              <span>{a.garment.name}</span>
              {a.issue ? (
                <span className="why-not">Peu adapté à la météo</span>
              ) : a.total >= best - 0.005 && a.garment.id !== currentId ? (
                <span className="badge badge-season" style={{ alignSelf: 'flex-start' }}>
                  Meilleur accord
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 'var(--s4)' }}>
        {SLOT_LABELS[slot]} : pièces disponibles de votre garde-robe, de la plus harmonieuse à la moins adaptée.
      </p>
    </Sheet>
  );
}
