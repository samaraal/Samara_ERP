const CACHE = 'samara-erp-2.8.34-resident-profession';
const SHELL = [
  './', './index.html', './styles.css?v=2.8.34', './app.js?v=2.8.34',
  './bootstrap-error.js?v=2.8.34', './health-check.js?v=2.8.34',
  './config.js?v=2.8.34', './manifest.webmanifest?v=2.8.34',
  './assets/samara-logo.png?v=2.8.34',
  './icons/favicon.png?v=2.8.34', './icons/icon-192.png?v=2.8.34',
  './icons/icon-512.png?v=2.8.34', './icons/icon-maskable-512.png?v=2.8.34',
  './icons/apple-touch-icon.png?v=2.8.34'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const isCritical = /\/(index\.html|app\.js|styles\.css|config\.js|bootstrap-error\.js|health-check\.js)(\?|$)/.test(url.pathname + url.search);
  if (isCritical) {
    event.respondWith(fetch(event.request, {cache:'no-store'}).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  })));
});
