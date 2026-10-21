import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { Icon, type IconName } from './ui/Icon';
import { Notice } from './ui/primitives';
import { GarmentDetail } from './ui/garment/GarmentDetail';
import { WardrobeScreen } from './ui/screens/WardrobeScreen';
import { TodayScreen } from './ui/screens/TodayScreen';
import { FavoritesScreen } from './ui/screens/FavoritesScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';

type Route = 'today' | 'wardrobe' | 'favorites' | 'settings';
const ROUTES: Route[] = ['today', 'wardrobe', 'favorites', 'settings'];

const TABS: { route: Route; label: string; icon: IconName }[] = [
  { route: 'wardrobe', label: 'Ma garde-robe', icon: 'hanger' },
  { route: 'today', label: 'Outfit du jour', icon: 'sparkle' },
  { route: 'favorites', label: 'Mes favoris', icon: 'heart' },
];

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
  const { ready, fatal, toasts, dismissToast, detailId, openGarment } = useStore();
  const [route, go] = useRoute();
  const [prev, setPrev] = useState<Route>('today');

  useEffect(() => {
    if (route !== 'settings') setPrev(route);
    document.title = { today: 'Outfit du jour', wardrobe: 'Ma garde-robe', favorites: 'Mes favoris', settings: 'Profil' }[route] + ' · My Wardrobe';
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
        <div className="brand">
          <span className="brand-dot" aria-hidden />
          My Wardrobe
        </div>
        <nav aria-label="Navigation principale">
          {[TABS[1], TABS[0], TABS[2]].map((t) => (
            <a key={t.route} href={`#/${t.route}`} className="side-link" aria-current={route === t.route ? 'page' : undefined}>
              <Icon name={t.icon} />
              {t.label}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <a href="#/settings" className="side-link" aria-current={route === 'settings' ? 'page' : undefined}>
            <Icon name="user" />
            Profil et préférences
          </a>
        </div>
      </aside>

      <main className="app-main" id="main">
        {!ready ? (
          <div className="empty" aria-busy="true">
            <span className="spinner" aria-hidden />
            <p>Ouverture de votre dressing…</p>
          </div>
        ) : route === 'wardrobe' ? (
          <WardrobeScreen onProfile={() => go('settings')} />
        ) : route === 'favorites' ? (
          <FavoritesScreen goTo={go} onProfile={() => go('settings')} />
        ) : route === 'settings' ? (
          <SettingsScreen onBack={() => go(prev)} />
        ) : (
          <TodayScreen goTo={go} />
        )}
      </main>

      <nav className="tabbar" aria-label="Navigation principale">
        {TABS.map((t) => (
          <a key={t.route} href={`#/${t.route}`} className="tab" aria-current={route === t.route ? 'page' : undefined}>
            <span className="tab-icon">
              <Icon name={t.icon} filled={route === t.route && t.icon === 'heart'} />
            </span>
            {t.label}
          </a>
        ))}
      </nav>

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
