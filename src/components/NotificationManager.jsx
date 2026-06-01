import React, { useEffect, useState } from 'react';
import InfoTooltip from './InfoTooltip';

export default function NotificationManager() {
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const [supported, setSupported] = useState('serviceWorker' in navigator && 'PushManager' in window);
  const [subscription, setSubscription] = useState(null);

  const registerServiceWorker = async () => {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  };

  const subscribeToPush = async () => {
    const reg = await registerServiceWorker();
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    let sub;
    if (vapidKey) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
    }
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub || {})
    });
    setSubscription(sub || {});
    alert('✅ Notificaciones activadas.');
  };

  const requestPermission = async () => {
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm === 'granted') await subscribeToPush();
  };

  const testNotification = async () => {
    if (Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.showNotification) {
        reg.showNotification('🔔 VALIDO 1M', {
          body: 'Notificación de prueba. Las señales reales llegarán aquí.',
          icon: '/valido-mark.svg',
          tag: 'test',
          vibrate: [200, 100, 200]
        });
      }
    } else {
      alert('Permiso no concedido.');
    }
  };

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4 border border-slate-200">
      <h3 className="font-bold text-lg flex items-center text-slate-900">
        🔔 Notificaciones Push
        <InfoTooltip explanation="Recibe alertas en tu móvil/PC cuando haya una señal ENTRAR_AHORA." />
      </h3>
      {!supported && <p className="text-red-500 text-sm">Tu navegador no soporta notificaciones push.</p>}
      {supported && (
        <div className="flex flex-wrap gap-3 mt-2">
          {permission !== 'granted' ? (
            <button onClick={requestPermission} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
              Activar notificaciones
            </button>
          ) : (
            <>
              <button onClick={testNotification} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm">
                Probar alerta
              </button>
              <p className="text-xs text-slate-500 self-center">✅ Activado</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}