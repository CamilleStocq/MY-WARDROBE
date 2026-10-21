import { useDeferredValue, useMemo, useState } from 'react';
import type { Availability, Garment, GarmentCategory, Season, Style } from '../../domain/types';
import { ALL_SEASONS, ALL_STYLES, AVAILABILITY_LABELS, CATEGORY_LABELS, CATEGORY_ORDER, SEASON_LABELS, STYLE_LABELS, subcategoryLabel } from '../../domain/taxonomy';
import { getColor } from '../../domain/colors';
import { useStore } from '../../state/store';
import { Button, ChipGroup, ColorPicker, EmptyState, Field, IconButton, Segmented, Sheet } from '../primitives';
import { GarmentCard } from '../garment/GarmentCard';
import { GarmentEditor } from '../garment/GarmentEditor';
import { Icon } from '../Icon';

type Sort = 'recent' | 'name' | 'color' | 'category';

interface Filters {
  seasons: Season[];
  colors: string[];
  styles: Style[];
  availability: Availability | 'all';
}

const NO_FILTERS: Filters = { seasons: [], colors: [], styles: [], availability: 'all' };

export function WardrobeScreen({ onProfile }: { onProfile: () => void }) {
  const { garments, openGarment, loadDemo, removeDemo, prefs } = useStore();
  const [category, setCategory] = useState<GarmentCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const activeFilterCount =
    filters.seasons.length + filters.colors.length + filters.styles.length + (filters.availability !== 'all' ? 1 : 0);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    garments.forEach((g) => m.set(g.category, (m.get(g.category) ?? 0) + 1));
    return m;
  }, [garments]);

  const list = useMemo(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const nq = norm(q.trim());
    const out = garments.filter((g) => {
      if (category !== 'all' && g.category !== category) return false;
      if (filters.availability !== 'all' && g.availability !== filters.availability) return false;
      if (filters.seasons.length && g.seasons.length && g.seasons.length < 4 && !filters.seasons.some((s) => g.seasons.includes(s))) return false;
      if (filters.colors.length && ![g.primaryColor, ...g.secondaryColors].some((c) => filters.colors.includes(c))) return false;
      if (filters.styles.length && !filters.styles.some((s) => g.styles.includes(s))) return false;
      if (nq) {
        const hay = norm(`${g.name} ${subcategoryLabel(g.subcategory, prefs.customSubcategories)} ${getColor(g.primaryColor).label} ${g.material}`);
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
    const sorters: Record<Sort, (a: Garment, b: Garment) => number> = {
      recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => a.name.localeCompare(b.name, 'fr'),
      color: (a, b) => getColor(a.primaryColor).label.localeCompare(getColor(b.primaryColor).label, 'fr'),
      category: (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name, 'fr'),
    };
    return out.sort(sorters[sort]);
  }, [garments, category, filters, q, sort, prefs.customSubcategories]);

  const hasDemo = garments.some((g) => g.isDemo);
  const laundry = garments.filter((g) => g.availability === 'laundry').length;

  if (!garments.length) {
    return (
      <>
        <Header count={0} onAdd={() => setAdding(true)} onProfile={onProfile} />
        <EmptyState
          art="wardrobe"
          title="Votre dressing vous attend"
          actions={
            <>
              <Button variant="primary" size="lg" icon="camera" onClick={() => setAdding(true)}>
                Ajouter mon premier vêtement
              </Button>
              <Button
                variant="ghost"
                loading={loadingDemo}
                onClick={async () => {
                  setLoadingDemo(true);
                  await loadDemo().catch(() => undefined);
                  setLoadingDemo(false);
                }}
              >
                Essayer avec un dressing de démonstration
              </Button>
            </>
          }
        >
          Photographiez vos vêtements un par un. Une dizaine de pièces (hauts, bas, chaussures, une veste) suffit pour recevoir vos premières tenues.
        </EmptyState>
        {adding && <GarmentEditor onClose={() => setAdding(false)} />}
      </>
    );
  }

  return (
    <>
      <Header count={garments.length} onAdd={() => setAdding(true)} onProfile={onProfile} laundry={laundry} />

      {hasDemo && (
        <div className="inline-notice">
          <span>Les pièces « Démo » sont des illustrations.</span>
          <button type="button" className="link-btn" onClick={removeDemo}>
            Les retirer
          </button>
        </div>
      )}

      <div className="toolbar">
        <div className="toolbar-row">
          <div className="search">
            <Icon name="search" size={20} />
            <label className="sr-only" htmlFor="w-search">
              Rechercher un vêtement
            </label>
            <input id="w-search" className="input" type="search" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="filter-btn">
            <IconButton icon="filter" label="Filtres et tri" onClick={() => setShowFilters(true)} />
            {activeFilterCount > 0 && <span className="pip" aria-hidden>{activeFilterCount}</span>}
          </div>
        </div>
        <div className="tabs-text" role="radiogroup" aria-label="Catégorie">
          <button type="button" role="radio" aria-checked={category === 'all'} onClick={() => setCategory('all')}>
            Tout<span className="count">{garments.length}</span>
          </button>
          {CATEGORY_ORDER.filter((c) => counts.get(c)).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c]}
              <span className="count">{counts.get(c)}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {list.length} vêtement{list.length > 1 ? 's' : ''} affiché{list.length > 1 ? 's' : ''}
      </p>

      {list.length ? (
        <div className="grid">
          {list.map((g) => (
            <GarmentCard key={g.id} garment={g} onOpen={openGarment} />
          ))}
        </div>
      ) : (
        <EmptyState
          art="search"
          title="Aucun vêtement ne correspond"
          actions={
            <Button
              variant="outline"
              onClick={() => {
                setFilters(NO_FILTERS);
                setQuery('');
                setCategory('all');
              }}
            >
              Effacer la recherche et les filtres
            </Button>
          }
        >
          Essayez un autre mot ou retirez un filtre.
        </EmptyState>
      )}

      {showFilters && (
        <Sheet
          title="Filtres et tri"
          onClose={() => setShowFilters(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setFilters(NO_FILTERS)} disabled={!activeFilterCount}>
                Tout effacer
              </Button>
              <Button variant="secondary" onClick={() => setShowFilters(false)}>
                Voir {list.length} vêtement{list.length > 1 ? 's' : ''}
              </Button>
            </>
          }
        >
          <Field label="Trier par">
            <Segmented<Sort>
              label="Trier par"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'recent', label: 'Récents' },
                { value: 'name', label: 'Nom' },
                { value: 'color', label: 'Couleur' },
                { value: 'category', label: 'Type' },
              ]}
            />
          </Field>
          <Field label="Disponibilité">
            <Segmented<Availability | 'all'>
              label="Disponibilité"
              value={filters.availability}
              onChange={(v) => setFilters((f) => ({ ...f, availability: v }))}
              options={[{ value: 'all', label: 'Toutes' }, ...(['available', 'laundry', 'unavailable'] as const).map((a) => ({ value: a, label: AVAILABILITY_LABELS[a] }))]}
            />
          </Field>
          <Field label="Saison">
            <ChipGroup<Season> label="Saison" multiple options={ALL_SEASONS.map((s) => ({ value: s, label: SEASON_LABELS[s] }))} value={filters.seasons} onChange={(v) => setFilters((f) => ({ ...f, seasons: v }))} />
          </Field>
          <Field label="Couleur">
            <ColorPicker label="Couleur" multiple value={filters.colors} onChange={(v) => setFilters((f) => ({ ...f, colors: v }))} />
          </Field>
          <Field label="Style">
            <ChipGroup<Style> label="Style" multiple options={ALL_STYLES.map((s) => ({ value: s, label: STYLE_LABELS[s] }))} value={filters.styles} onChange={(v) => setFilters((f) => ({ ...f, styles: v }))} />
          </Field>
        </Sheet>
      )}

      {adding && <GarmentEditor onClose={() => setAdding(false)} />}
    </>
  );
}

function Header({ count, onAdd, onProfile, laundry = 0 }: { count: number; onAdd: () => void; onProfile: () => void; laundry?: number }) {
  return (
    <div className="screen-head">
      <div>
        <h1>Ma garde-robe</h1>
        {count > 0 && (
          <p className="sub">
            {count} pièce{count > 1 ? 's' : ''}
            {laundry > 0 && `, dont ${laundry} au lavage`}
          </p>
        )}
      </div>
      <div className="head-actions">
        {count > 0 && (
          <>
            <Button variant="primary" size="sm" icon="plus" className="desktop-only" onClick={onAdd}>
              Ajouter un vêtement
            </Button>
            <IconButton icon="plus" label="Ajouter un vêtement" className="mobile-only" onClick={onAdd} />
          </>
        )}
        <IconButton icon="user" label="Profil et préférences" className="mobile-only" onClick={onProfile} />
      </div>
    </div>
  );
}
