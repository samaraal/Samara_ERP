const APP_VERSION = '2.13.93';
const CACHE = 'samara-erp-2.13.93-food-vendor';
const SHELL = [
  './',
  './index.html',
  `./date-time.js?v=${APP_VERSION}`,
  `./payments-statement-core.js?v=${APP_VERSION}`,
  `./payments-statement.js?v=${APP_VERSION}`,
  `./outgoing-payments.js?v=${APP_VERSION}`,
  `./food-vendor-core.js?v=${APP_VERSION}`,
  `./food-vendor.js?v=${APP_VERSION}`,
  `./food-vendor.css?v=${APP_VERSION}`,
  `./styles.css?v=${APP_VERSION}`,
  `./app.js?v=${APP_VERSION}`,
  `./consent-panel.js?v=${APP_VERSION}`,
  `./dictation.js?v=${APP_VERSION}`,
  `./button-feedback.js?v=${APP_VERSION}`,
  `./discharge-workflow.js?v=${APP_VERSION}`,
  `./duty-swap.js?v=${APP_VERSION}`,
  `./spot-assessment.js?v=${APP_VERSION}`,
  `./bootstrap-error.js?v=${APP_VERSION}`,
  `./health-check.js?v=${APP_VERSION}`,
  `./config.js?v=${APP_VERSION}`,
  `./manifest.webmanifest?v=${APP_VERSION}`,
  './assets/samara-mail-logo.png',
  './assets/samara-logo.png?v=20260812-global1',
  './assets/samara-whatsapp-header.jpg?v=20260904',
  `./icons/favicon.png?v=${APP_VERSION}`,
  `./icons/icon-192.png?v=${APP_VERSION}`,
  `./icons/icon-512.png?v=${APP_VERSION}`,
  `./icons/icon-maskable-512.png?v=${APP_VERSION}`,
  `./icons/apple-touch-icon.png?v=${APP_VERSION}`
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache files independently so one optional asset cannot block a new release.
    await Promise.allSettled(SHELL.map(async url => {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok) await cache.put(url, response.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('samara-erp-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: 'SAMARA_SW_ACTIVATED', version: APP_VERSION });
    }
  })());
});

self.addEventListener('message', event => {
  const type = event.data?.type;
  if (type === 'SAMARA_SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (type === 'SAMARA_CLEAR_APP_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('samara-erp-')).map(key => caches.delete(key)));
      event.source?.postMessage?.({ type: 'SAMARA_APP_CACHES_CLEARED', version: APP_VERSION });
    })());
  }
});

// Background retries are expected from the dispatcher, but they must not
// buzz the same phone every minute. IndexedDB keeps this throttle across
// service-worker restarts and browser reloads.
const PUSH_REPEAT_MS = 15 * 60 * 1000;
function pushThrottleKey(payload) {
  return String(payload.alert_key || payload.tag || `${payload.title || ''}|${payload.body || ''}`)
    .trim().toLowerCase().slice(0, 500) || 'samara-clinical-alert';
}
async function mayShowPush(payload) {
  if (!self.indexedDB) return true;
  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('samara-clinical-push', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('throttle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const key = pushThrottleKey(payload);
    // Read and reserve in ONE transaction: simultaneous push events cannot
    // both pass the same check before either has recorded its delivery.
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction('throttle', 'readwrite');
        const store = transaction.objectStore('throttle');
        let allowed = false;
        const request = store.get(key);
        request.onsuccess = () => {
          const now = Date.now();
          const last = Number(request.result || 0);
          if (!last || now - last >= PUSH_REPEAT_MS) {
            allowed = true;
            store.put(now, key);
          }
        };
        transaction.oncomplete = () => resolve(allowed);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  } catch (_) { return true; }
}

// True background push. This executes even when the ERP window is closed.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = { body: event.data?.text?.() || 'Clinical attention required.' }; }
  event.waitUntil((async () => {
    if (!(await mayShowPush(payload))) return;
    const title = payload.title || 'SAMARA · CLINICAL ALERT';
    const options = {
    body: payload.body || 'Clinical attention required.',
    icon: payload.icon || './icons/icon-192.png',
    badge: payload.badge || './icons/icon-192.png',
    // Keep one notification slot per clinical escalation.  The dispatcher may
    // retry while an item remains unresolved, but a retry must not create a
    // new audible notification every minute on the same phone.
    tag: payload.alert_key ? `samara-clinical-${payload.alert_key}` : (payload.tag || 'samara-clinical-alert'),
    renotify: false,
    requireInteraction: Boolean(payload.requireInteraction),
    data: { url: payload.url || './?push_page=Clinical%20Alerts', alert_key: payload.alert_key || '', event_kind: payload.event_kind || 'alert' },
    vibrate: payload.event_kind === 'escalation' ? [220,100,220,100,220] : [160,80,160]
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './?push_page=Clinical%20Alerts', self.location.href).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        try { await client.navigate(target); } catch (_) {}
        return client.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === 'navigate';
  const isCritical = /\/(index\.html|app\.js|styles\.css|config\.js|bootstrap-error\.js|health-check\.js|service-worker\.js)(\?|$)/.test(url.pathname + url.search);

  if (isNavigation || isCritical) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match(event.request)) || (isNavigation ? await caches.match('./index.html') : Response.error());
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
