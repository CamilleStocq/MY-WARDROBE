/*
 * Service worker de My Wardrobe : permet d'ouvrir l'app sans connexion.
 *  - pages (navigation) : réseau d'abord, version en cache si hors ligne ;
 *  - fichiers de l'app (/assets/, noms avec empreinte) : cache d'abord ;
 *  - polices Google : cache, mis à jour en arrière-plan ;
 *  - météo et autres services externes : jamais mis en cache ici (l'app gère
 *    son propre cache météo, clairement signalé comme non actualisé).
 * Les données (vêtements, photos…) sont dans IndexedDB, pas dans ce cache.
 */
const CACHE = 'mw-shell-v2';
const SHELL = ['./', './manifest.webmanifest?v=2', './apple-touch-icon-v2.png', './icon-192-v2.png', './icon-512-v2.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // les fichiers JS/CSS de la version publiée, cités par la page d'accueil
      try {
        const html = await (await cache.match('./')).text();
        const assets = [...new Set(html.match(/\.\/assets\/[^"']+\.(?:js|css)/g) || [])];
        await cache.addAll(assets);
      } catch {
        /* ils seront mis en cache à la première utilisation */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request, fallbackUrl) {
  return fetch(request)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(fallbackUrl || request, copy));
      }
      return res;
    })
    .catch(() => caches.match(fallbackUrl || request).then((r) => r || caches.match('./')));
}

function cacheFirst(request) {
  return caches.match(request).then(
    (hit) =>
      hit ||
      fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }),
  );
}

function staleWhileRevalidate(request) {
  return caches.match(request).then((hit) => {
    const network = fetch(request)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => hit);
    return hit || network;
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, './'));
    return;
  }
  if (url.origin === self.location.origin) {
    // les gros fichiers WebAssembly du détourage sont chargés depuis leur propre CDN
    if (url.pathname.endsWith('.wasm')) return;
    event.respondWith(url.pathname.includes('/assets/') ? cacheFirst(request) : staleWhileRevalidate(request));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request));
  }
  // tout le reste (météo, géocodage, modèle de détourage) : comportement réseau normal
});
