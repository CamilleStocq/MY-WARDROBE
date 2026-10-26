import { memo } from 'react';
import type { Garment } from '../../domain/types';
import { subcategoryLabel } from '../../domain/taxonomy';
import { GarmentImg } from './GarmentImage';
import { useStore } from '../../state/store';

export const GarmentCard = memo(function GarmentCard({ garment, onOpen }: { garment: Garment; onOpen: (id: string) => void }) {
  const g = garment;
  const off = g.availability !== 'available';
  // les catégories personnalisées (Profil → Mes catégories) ont leur propre libellé
  const type = subcategoryLabel(g.subcategory, useStore().prefs.customSubcategories);
  return (
    <button type="button" className={`g-card ${off ? 'dimmed' : ''}`} onClick={() => onOpen(g.id)} aria-label={`${g.name}, ${type}${off ? g.availability === 'laundry' ? ', au lavage' : ', indisponible' : ''}`}>
      <div className="g-photo photo">
        <GarmentImg imageId={g.imageId} alt="" />
        <div className="g-flags">
          {g.availability === 'laundry' && <span className="badge badge-laundry">Au lavage</span>}
          {g.availability === 'unavailable' && <span className="badge badge-off">Indisponible</span>}
          {g.isDemo && <span className="badge badge-demo">Démo</span>}
        </div>
      </div>
      <span className="g-name">{g.name}</span>
      <span className="g-meta">{g.brand || type}</span>
    </button>
  );
});
