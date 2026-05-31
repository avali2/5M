export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    await registerServiceWorker();
  }

  return permission;
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker no soportado en este navegador.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  return registration;
}

export async function sendLocalTestNotification() {
  if (Notification.permission !== "granted") {
    await requestNotificationPermission();
  }

  const registration = await navigator.serviceWorker.ready;

  await registration.showNotification("VALIDO 1M prueba de alerta", {
    body: "Si ves esto, las notificaciones basicas funcionan.",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    tag: "valido-test",
    renotify: true,
    data: { url: "/" }
  } as unknown as NotificationOptions);
}

export async function subscribeToPush(publicVapidKey: string) {
  const registration = await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
  });

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(subscription)
  });

  return subscription;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}