import { memo } from 'react';
import type { Garment } from '../../domain/types';
import { subcategoryLabel } from '../../domain/taxonomy';
import { getColor } from '../../domain/colors';
import { ColorDot } from '../primitives';
import { GarmentImg } from './GarmentImage';
import { Icon } from '../Icon';

export const GarmentCard = memo(function GarmentCard({ garment, onOpen }: { garment: Garment; onOpen: (id: string) => void }) {
  const g = garment;
  const off = g.availability !== 'available';
  return (
    <button type="button" className={`g-card ${off ? 'dimmed' : ''}`} onClick={() => onOpen(g.id)} aria-label={`${g.name}, ${subcategoryLabel(g.subcategory)}${off ? g.availability === 'laundry' ? ', au lavage' : ', indisponible' : ''}`}>
      <div className="g-photo photo">
        <GarmentImg imageId={g.imageId} alt="" />
        <div className="g-flags">
          {g.availability === 'laundry' && (
            <span className="badge badge-laundry">
              <Icon name="wash" size={13} /> Au lavage
            </span>
          )}
          {g.availability === 'unavailable' && <span className="badge badge-off">Indisponible</span>}
          {g.isDemo && <span className="badge badge-demo">Démo</span>}
        </div>
      </div>
      <span className="g-name">{g.name}</span>
      <span className="g-meta">
        <ColorDot color={g.primaryColor} size={12} />
        {subcategoryLabel(g.subcategory)} · {getColor(g.primaryColor).label}
      </span>
    </button>
  );
});
