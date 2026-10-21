import { useEffect, useState } from 'react';
import type { SavedLocation } from '../../domain/types';
import { cityToLocation, getCurrentLocation, searchCities, type CityResult } from '../../services/locationService';
import { useStore } from '../../state/store';
import { Button, Field, Notice, Sheet } from '../primitives';
import { Icon } from '../Icon';

export function LocationPicker({ onDone }: { onDone?: (loc: SavedLocation) => void }) {
  const { prefs, setPrefs, toast } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        setResults(await searchCities(q, ctrl.signal));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  async function choose(loc: SavedLocation) {
    await setPrefs({ ...prefs, location: loc });
    toast(`Météo de ${loc.name}`);
    onDone?.(loc);
  }

  async function useGps() {
    setLocating(true);
    setError(null);
    try {
      await choose(await getCurrentLocation());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }

  return (
    <div>
      {prefs.location && (
        <p className="small muted" style={{ marginBottom: 'var(--s3)' }}>
          Lieu actuel : <b>{prefs.location.name}</b>
          {prefs.location.country ? `, ${prefs.location.country}` : ''}
        </p>
      )}
      <Button variant="outline" icon="pin" block loading={locating} onClick={useGps}>
        Utiliser ma position actuelle
      </Button>
      <p className="small muted" style={{ marginTop: 'var(--s2)' }}>
        La position n’est demandée qu’à ce moment-là, arrondie à environ 1 km, et sert uniquement à la météo.
      </p>
      <div style={{ marginTop: 'var(--s5)' }}>
        <Field label="Ou choisir une ville" htmlFor="city-q">
          <div className="search">
            <Icon name="search" size={20} />
            <input id="city-q" className="input" type="search" autoComplete="off" placeholder="Bruxelles, Liège, Gand…" value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus />
          </div>
        </Field>
      </div>
      {searching && <p className="small muted" style={{ marginTop: 'var(--s2)' }}>Recherche…</p>}
      {error && (
        <div style={{ marginTop: 'var(--s3)' }}>
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {results.length > 0 && (
        <div className="city-results" role="list">
          {results.map((r) => (
            <button key={r.id} type="button" role="listitem" onClick={() => choose(cityToLocation(r))}>
              <b>{r.name}</b>
              <span>{[r.region, r.country].filter(Boolean).join(', ')}</span>
            </button>
          ))}
        </div>
      )}
      {!searching && query.trim().length >= 2 && !results.length && !error && (
        <p className="small muted" style={{ marginTop: 'var(--s2)' }}>
          Aucune ville trouvée pour « {query.trim()} ».
        </p>
      )}
    </div>
  );
}

export function LocationSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Lieu pour la météo" onClose={onClose}>
      <LocationPicker onDone={onClose} />
    </Sheet>
  );
}
