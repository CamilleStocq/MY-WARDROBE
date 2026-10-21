import { useEffect, useState } from 'react';
import { imageUrl } from '../../services/imageService';
import { Icon } from '../Icon';

/** Image d'un vêtement lue depuis le stockage local, avec états chargement / manquante. */
export function GarmentImg({ imageId, size = 'thumb', alt, compact }: { imageId: string | null; size?: 'thumb' | 'full'; alt: string; compact?: boolean }) {
  const [state, setState] = useState<{ url: string | null; status: 'loading' | 'ok' | 'missing' }>({ url: null, status: imageId ? 'loading' : 'missing' });

  useEffect(() => {
    let alive = true;
    if (!imageId) {
      setState({ url: null, status: 'missing' });
      return;
    }
    setState((s) => (s.status === 'ok' ? s : { url: null, status: 'loading' }));
    imageUrl(imageId, size).then((url) => alive && setState({ url, status: url ? 'ok' : 'missing' }));
    return () => {
      alive = false;
    };
  }, [imageId, size]);

  if (state.status === 'loading') return <div className="photo-skeleton" aria-hidden />;
  if (state.status === 'missing' || !state.url)
    return (
      <div className="photo-missing">
        <Icon name="image" size={compact ? 18 : 26} />
        {!compact && <span>Photo manquante</span>}
      </div>
    );
  return <img className="g-img" src={state.url} alt={alt} loading="lazy" decoding="async" onError={() => setState({ url: null, status: 'missing' })} />;
}

export function GarmentPhoto(props: { imageId: string | null; size?: 'thumb' | 'full'; alt: string; compact?: boolean }) {
  return (
    <div className="photo">
      <GarmentImg {...props} />
    </div>
  );
}
