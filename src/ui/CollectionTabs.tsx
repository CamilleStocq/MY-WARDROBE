/** Sous-navigation de l'onglet Favoris : les looks enregistrés et le calendrier des tenues portées. */
export function CollectionTabs({ current }: { current: 'favorites' | 'calendar' }) {
  return (
    <nav className="tabs-text collection-tabs" aria-label="Favoris">
      <a href="#/favorites" aria-current={current === 'favorites' ? 'page' : undefined}>
        Looks
      </a>
      <a href="#/calendar" aria-current={current === 'calendar' ? 'page' : undefined}>
        Calendrier
      </a>
    </nav>
  );
}
