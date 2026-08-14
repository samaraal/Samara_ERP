const CACHE = 'samara-erp-2.8.83-accounts-refund-approval-fix';
const SHELL = [
  './', './index.html', './styles.css?v=2.8.83', './app.js?v=2.8.83',
  './bootstrap-error.js?v=2.8.40', './health-check.js?v=2.8.40',
  './config.js?v=2.8.40', './manifest.webmanifest?v=2.8.40',
  './assets/samara-logo.png?v=20260812-global1',
  './icons/favicon.png?v=2.8.40', './icons/icon-192.png?v=2.8.40',
  './icons/icon-512.png?v=2.8.40', './icons/icon-maskable-512.png?v=2.8.40',
  './icons/apple-touch-icon.png?v=2.8.40'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()).then(async()=>{
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    clients.forEach(client=>client.postMessage({type:'SAMARA_UPDATE_AVAILABLE',version:'2.8.83'}));
  }));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const isNavigation = event.request.mode === 'navigate';
  const isCritical = /\/(index\.html|app\.js|styles\.css|config\.js|bootstrap-error\.js|health-check\.js|service-worker\.js)(\?|$)/.test(url.pathname + url.search);
  if (isNavigation || isCritical) {
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
