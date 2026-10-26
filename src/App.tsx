import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { Icon, type IconName } from './ui/Icon';
import { Notice } from './ui/primitives';
import { GarmentDetail } from './ui/garment/GarmentDetail';
import { WardrobeScreen } from './ui/screens/WardrobeScreen';
import { TodayScreen } from './ui/screens/TodayScreen';
import { FavoritesScreen } from './ui/screens/FavoritesScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { CalendarScreen } from './ui/screens/CalendarScreen';
import { GarmentEditor } from './ui/garment/GarmentEditor';
import { Onboarding } from './ui/Onboarding';

type Route = 'today' | 'wardrobe' | 'calendar' | 'favorites' | 'settings';
const ROUTES: Route[] = ['today', 'wardrobe', 'calendar', 'favorites', 'settings'];

/** Navigation principale : cinq onglets. */
const TABS: { route: Route; label: string; icon: IconName }[] = [
  { route: 'today', label: 'Aujourd’hui', icon: 'sparkle' },
  { route: 'wardrobe', label: 'Dressing', icon: 'hanger' },
  { route: 'favorites', label: 'Favoris', icon: 'heart' },
  { route: 'calendar', label: 'Calendrier', icon: 'calendar' },
  { route: 'settings', label: 'Profil', icon: 'user' },
];

const TITLES: Record<Route, string> = {
  today: 'Aujourd’hui',
  wardrobe: 'Dressing',
  calendar: 'Calendrier',
  favorites: 'Favoris',
  settings: 'Profil',
};

const isActive = (tab: Route, route: Route) => tab === route;

function readRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'today';
}

function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const fn = () => setRoute(readRoute());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  const go = useCallback((r: Route) => {
    if (readRoute() !== r) window.location.hash = `/${r}`;
    window.scrollTo({ top: 0 });
  }, []);
  return [route, go];
}

function Shell() {
  const { ready, fatal, toasts, dismissToast, detailId, openGarment, adding, setAdding, prefs, setPrefs, garments } = useStore();
  const [route, go] = useRoute();

  // premier lancement guidé : seulement pour un dressing vide ; un dressing existant le marque comme fait
  const onboarding = ready && !prefs.onboardingDone && garments.length === 0;
  useEffect(() => {
    if (ready && !prefs.onboardingDone && garments.length > 0) setPrefs({ ...prefs, onboardingDone: true });
  }, [ready, prefs, garments.length, setPrefs]);

  useEffect(() => {
    document.title = `${TITLES[route]} · My Wardrobe`;
  }, [route]);

  if (fatal) {
    return (
      <main className="app-main" style={{ maxWidth: 520 }}>
        <Notice tone="error" title="Stockage indisponible">
          {fatal} L’application a besoin du stockage du navigateur pour conserver votre garde-robe.
        </Notice>
      </main>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">My Wardrobe</div>
        <nav aria-label="Navigation principale">
          {TABS.map((t) => (
            <a key={t.route} href={`#/${t.route}`} className="side-link" aria-current={isActive(t.route, route) ? 'page' : undefined}>
              <Icon name={t.icon} />
              {t.label}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <button type="button" className="btn btn-primary btn-block" onClick={() => setAdding(true)}>
            <Icon name="plus" size={20} />
            Ajouter un vêtement
          </button>
        </div>
      </aside>

      <main className="app-main" id="main">
        {!ready ? (
          <div className="empty" aria-busy="true">
            <span className="spinner" aria-hidden />
            <p>Ouverture de votre dressing…</p>
          </div>
        ) : route === 'wardrobe' ? (
          <WardrobeScreen />
        ) : route === 'calendar' ? (
          <CalendarScreen goToday={() => go('today')} />
        ) : route === 'favorites' ? (
          <FavoritesScreen goTo={go} />
        ) : route === 'settings' ? (
          <SettingsScreen />
        ) : (
          <TodayScreen goTo={go} />
        )}
      </main>

      <nav className="tabbar" aria-label="Navigation principale">
        {TABS.map((t) => (
          <a key={t.route} href={`#/${t.route}`} className="tab" aria-current={isActive(t.route, route) ? 'page' : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>

      {onboarding && <Onboarding />}
      {adding && <GarmentEditor onClose={() => setAdding(false)} />}
      {detailId && <GarmentDetail id={detailId} onClose={() => openGarment(null)} />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Fermer la notification" onClick={() => dismissToast(t.id)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
