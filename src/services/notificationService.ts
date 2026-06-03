import type { ProfessionalSignal } from "../types/signal";
import { shouldNotifySignal } from "../utils/signalFilters";
import {
  buildNotificationTitle,
  buildSignalNotificationBody
} from "../utils/notificationPayload";

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service workers are not supported.");
    return null;
  }

  try {
    return await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  } catch (error) {
    console.error("Service worker registration failed:", error);
    return null;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    console.warn("Notifications are not supported.");
    return "denied";
  }

  if (Notification.permission === "granted") return "granted";
  if (Notification.permission !== "denied") return await Notification.requestPermission();
  return Notification.permission;
}

export async function showSignalNotification(signal: ProfessionalSignal): Promise<void> {
  if (!shouldNotifySignal(signal)) return;

  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    console.warn("Notification permission not granted.");
    return;
  }

  const registration =
    (await navigator.serviceWorker.getRegistration()) ||
    (await registerServiceWorker());

  if (!registration) {
    console.warn("No service worker registration found.");
    return;
  }

  await registration.showNotification(buildNotificationTitle(signal), {
    body: buildSignalNotificationBody(signal),
    tag: `signal-${signal.id}`,
    icon: "/icons/valido-v-192.png",
    badge: "/icons/valido-v-badge-96.png",
    requireInteraction: false,
    data: {
      url: `/institutional-os.html#signals`,
      signalId: signal.id,
      symbol: signal.symbol,
      status: signal.status
    },
    actions: [
      { action: "view_signal", title: "Ver señal" },
      { action: "journal", title: "Registrar en Journal" }
    ]
  });
}
