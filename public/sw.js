self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let payload = { title: "VALIDO 1M", body: "Nueva alerta disponible.", tag: "valido-alert", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch { payload.body = event.data ? event.data.text() : payload.body; }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: payload.tag,
      renotify: true,
      requireInteraction: payload.requireInteraction ?? false,
      data: { url: payload.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client) { client.focus(); client.navigate(targetUrl); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});