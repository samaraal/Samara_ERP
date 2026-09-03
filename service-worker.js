const CACHE = 'samara-erp-2.9.73-nurse-medication-window';
const SHELL = [
  './', './index.html', './styles.css?v=2.9.70', './app.js?v=2.9.70',
  './bootstrap-error.js?v=2.8.40', './health-check.js?v=2.8.40',
  './config.js?v=2.9.70', './manifest.webmanifest?v=2.8.40', './assets/samara-mail-logo.png',
  './assets/samara-logo.png?v=20260812-global1',
  './icons/favicon.png?v=2.8.40', './icons/icon-192.png?v=2.8.40',
  './icons/icon-512.png?v=2.8.40', './icons/icon-maskable-512.png?v=2.8.40',
  './icons/apple-touch-icon.png?v=2.8.40'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// v2.9.47: true background push. This executes even when the ERP window is closed.
self.addEventListener('push', event => {
  let payload={};
  try{payload=event.data?event.data.json():{}}catch(_){payload={body:event.data?.text?.()||'Clinical attention required.'}}
  const title=payload.title||'SAMARA · CLINICAL ALERT';
  const options={
    body:payload.body||'Clinical attention required.',
    icon:payload.icon||'./icons/icon-192.png',
    badge:payload.badge||'./icons/icon-192.png',
    tag:payload.tag||`samara-clinical-${Date.now()}`,
    renotify:payload.renotify!==false,
    requireInteraction:Boolean(payload.requireInteraction),
    data:{url:payload.url||'./?push_page=Clinical%20Alerts',alert_key:payload.alert_key||'',event_kind:payload.event_kind||'alert'},
    vibrate:payload.event_kind==='escalation'?[220,100,220,100,220]:[160,80,160]
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target=new URL(event.notification.data?.url||'./?push_page=Clinical%20Alerts',self.location.href).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('focus' in client){
        try{await client.navigate(target)}catch(_){}
        return client.focus();
      }
    }
    return self.clients.openWindow?self.clients.openWindow(target):undefined;
  })());
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
