const SERVICE_WORKER_URL = '/sw.js';

function platformInfo() {
  const agent = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/i.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(agent);
  const samsung = /SamsungBrowser/i.test(agent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return {
    platform: ios ? 'iOS / iPadOS' : android ? 'Android' : 'Desktop',
    browser: samsung ? 'Samsung Internet' : ios ? 'Safari iOS' : /Chrome/i.test(agent) ? 'Chrome' : 'Navegador web',
    ios,
    android,
    standalone,
    privateMode: 'No detectable; modo privado/incognito puede bloquear alertas.',
    userAgent: agent
  };
}

export function suggestedNotificationSolution(diagnostic) {
  if (!diagnostic.secureContext) return 'Abre la app mediante HTTPS. Las notificaciones no funcionan por HTTP fuera de localhost.';
  if (!diagnostic.supported) return 'Este navegador no ofrece Service Worker y Notification API compatibles.';
  if (diagnostic.platform === 'iOS / iPadOS' && !diagnostic.standalone) return 'En iPhone instala Valido 1M en la pantalla de inicio y abre la app instalada antes de activar alertas.';
  if (diagnostic.permission === 'denied') return 'Activa las notificaciones para este sitio desde los ajustes del navegador o del telefono.';
  if (diagnostic.permission === 'default') return 'Toca Probar notificacion movil para solicitar permiso.';
  if (!diagnostic.serviceWorkerReady) return 'Recarga la app; el Service Worker aun no esta listo.';
  return 'Alertas preparadas. El telefono debe permitir notificaciones para el navegador o PWA.';
}

export async function registerNotificationServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  return navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
}

export async function getNotificationDiagnostic() {
  const info = platformInfo();
  const supported = 'serviceWorker' in navigator && 'Notification' in window;
  let registered = false;
  let serviceWorkerReady = false;
  let error = null;
  if (supported && window.isSecureContext) {
    try {
      const registration = await registerNotificationServiceWorker();
      registered = Boolean(registration);
      serviceWorkerReady = Boolean(await navigator.serviceWorker.ready);
    } catch (registrationError) {
      error = registrationError.message;
    }
  }
  const diagnostic = {
    supported,
    secureContext: window.isSecureContext,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
    registered,
    serviceWorkerReady,
    notificationShown: false,
    error,
    lastAttempt: new Date().toISOString(),
    ...info
  };
  return { ...diagnostic, solution: suggestedNotificationSolution(diagnostic) };
}

export async function showMobileSafeNotification({
  title,
  body,
  icon = '/valido-mark.svg',
  badge = '/valido-mark.svg',
  tag = 'valido-alert',
  data = { url: '/institutional-os.html' },
  actions = [],
  requireInteraction = false,
  requestPermission = false
}) {
  const info = platformInfo();
  const diagnostic = {
    supported: 'serviceWorker' in navigator && 'Notification' in window,
    secureContext: window.isSecureContext,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
    registered: false,
    serviceWorkerReady: false,
    notificationShown: false,
    error: null,
    lastAttempt: new Date().toISOString(),
    ...info
  };
  try {
    if (!diagnostic.secureContext) throw new Error('Las notificaciones requieren HTTPS o localhost.');
    if (!diagnostic.supported) throw new Error('Service Worker o Notification API no disponible.');
    await registerNotificationServiceWorker();
    diagnostic.registered = true;
    if (requestPermission && Notification.permission === 'default') {
      diagnostic.permission = await Notification.requestPermission();
    } else {
      diagnostic.permission = Notification.permission;
    }
    if (diagnostic.permission !== 'granted') {
      throw new Error(diagnostic.permission === 'denied' ? 'Permiso de notificaciones denegado.' : 'Permiso pendiente; usa el boton de prueba.');
    }
    const registration = await navigator.serviceWorker.ready;
    diagnostic.serviceWorkerReady = true;
    await registration.showNotification(title, { body, icon, badge, tag, data, actions, requireInteraction });
    diagnostic.notificationShown = true;
  } catch (error) {
    diagnostic.error = error.message;
  }
  return { ...diagnostic, solution: suggestedNotificationSolution(diagnostic) };
}
