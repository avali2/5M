const CACHE_PREFIX = 'valido-1m-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v4`;
const DEFAULT_ICON = '/icons/icon-192.png';
const DEFAULT_BADGE = '/icons/badge-72.png';
const SHELL = ['/manifest.webmanifest', DEFAULT_ICON, DEFAULT_BADGE, '/icons/validov.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (!['SHOW_NOTIFICATION', 'VALIDO_LOCAL_NOTIFICATION'].includes(event.data?.type)) return;
  const payload = event.data.payload || {};
  event.waitUntil(self.registration.showNotification(payload.title || 'Valido 1M', {
    body: payload.body || '',
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag: payload.tag || 'valido-alert',
    data: payload.data || { url: '/institutional-os.html' },
    actions: payload.actions || [],
    requireInteraction: Boolean(payload.requireInteraction)
  }));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const data = payload.data || { url: '/institutional-os.html?tab=guardian#guardian' };
  event.waitUntil(self.registration.showNotification(payload.title || 'Options Guardian', {
    body: payload.body || 'Nueva alerta Guardian disponible.',
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag: payload.tag || 'guardian-web-push',
    data,
    actions: payload.actions || [],
    requireInteraction: payload.severity === 'critical'
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/institutional-os.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ('focus' in client && client.url.includes('/institutional-os.html')) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'GUARDIAN_PUSH_SUBSCRIPTION_CHANGED' }));
    })
  );
});
