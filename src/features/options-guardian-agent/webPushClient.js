import { api } from '../../lib/api.js';
import {
  getNotificationDiagnostic,
  registerNotificationServiceWorker,
  showMobileSafeNotification
} from '../../services/notifications.js';

function decodeVapidKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const encoded = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(encoded);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export async function getNotificationCapability() {
  const base = await getNotificationDiagnostic();
  let pushSupported = false;
  let subscribed = false;
  if (base.serviceWorkerReady) {
    const registration = await navigator.serviceWorker.ready;
    pushSupported = 'pushManager' in registration;
    if (pushSupported) subscribed = Boolean(await registration.pushManager.getSubscription());
  }
  return {
    ...base,
    pushSupported,
    subscribed,
    lockedPhoneDeliveryConfigured: pushSupported && subscribed && base.permission === 'granted'
  };
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return { permission: 'unsupported', error: 'Notification API no disponible.' };
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  return { permission, error: permission === 'granted' ? null : 'Permiso no concedido.' };
}

export async function subscribeToGuardianWebPush(deviceLabel = 'Mi dispositivo') {
  const configuration = await api.pushPublicKey();
  if (!configuration.enabled || !configuration.publicKey) {
    throw new Error(configuration.configurationError || 'Web Push no esta configurado en el servidor. Agrega claves VAPID.');
  }
  const permission = await requestNotificationPermission();
  if (permission.permission !== 'granted') throw new Error(permission.error);
  await registerNotificationServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  if (!('pushManager' in registration)) throw new Error('PushManager no esta disponible en este navegador.');
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(configuration.publicKey)
    });
  }
  await api.pushSubscribe({
    subscription: subscription.toJSON(),
    deviceLabel,
    userAgent: navigator.userAgent,
    platform: navigator.platform || ''
  });
  return getNotificationCapability();
}

export async function unsubscribeFromGuardianWebPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return getNotificationCapability();
  await api.pushUnsubscribe({ endpoint: subscription.endpoint });
  await subscription.unsubscribe();
  return getNotificationCapability();
}

export async function testWebPush() {
  return api.pushTest();
}

export async function sendLocalTestNotification() {
  return showMobileSafeNotification({
    title: 'Options Guardian activo',
    body: 'Las alertas locales del Guardian estan funcionando correctamente.',
    tag: 'guardian-local-test',
    data: { url: '/institutional-os.html?tab=guardian#guardian' },
    requestPermission: true
  });
}
