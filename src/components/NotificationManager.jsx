import React, { useEffect, useState } from 'react';
import InfoTooltip from './InfoTooltip';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(window.atob(base64), (char) => char.charCodeAt(0));
}

export default function NotificationManager() {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const [subscription, setSubscription] = useState(null);
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration().then((registration) => registration?.pushManager.getSubscription()).then(setSubscription).catch(() => {});
    fetch('/api/push/public-key').then((response) => response.json()).then((data) => setConfigured(Boolean(data.configured && data.publicKey))).catch(() => {});
  }, [supported]);

  async function subscribeToPush() {
    setMessage('');
    try {
      const keyResponse = await fetch('/api/push/public-key');
      const keyData = await keyResponse.json();
      if (!keyData.configured || !keyData.publicKey) throw new Error('Web Push aun no esta configurado en Render.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const existing = await registration.pushManager.getSubscription();
      const nextSubscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: nextSubscription.toJSON(), deviceLabel: navigator.userAgent })
      });
      if (!response.ok) throw new Error('Render rechazo el registro del dispositivo.');
      setSubscription(nextSubscription);
      setMessage('Dispositivo registrado para alertas READY del Guardian.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function requestPermission() {
    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission === 'granted') await subscribeToPush();
  }

  async function testNotification() {
    const registration = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register('/sw.js');
    await registration?.showNotification('V VALIDO 1M', {
      body: 'Prueba local correcta. El Guardian solo avisara señales READY implementables.',
      icon: '/icons/valido-v-192.png',
      badge: '/icons/valido-v-badge-96.png',
      tag: 'valido-local-test',
      vibrate: [200, 100, 200],
      data: { url: '/institutional-os.html#signals' }
    });
  }

  return (
    <section className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black flex items-center">V Notificaciones Android <InfoTooltip explanation="Registra este dispositivo para recibir alertas READY y riesgos urgentes. WATCH, BLOCKED y NO DATA no se notifican." /></h2>
      <p className="text-sm text-slate-600">Instala la app desde Chrome en Android y permite notificaciones. Las alertas usan el icono V de Valido.</p>
      {!supported && <p className="text-sm text-red-700">Este navegador no soporta Web Push.</p>}
      {supported && !configured && <p className="text-sm text-amber-700">Web Push no esta configurado en Render todavia.</p>}
      {supported && permission !== 'granted' && <button className="primary-button w-full" onClick={requestPermission}>Activar alertas</button>}
      {supported && permission === 'granted' && <div className="grid grid-cols-2 gap-2"><button className="secondary-button" onClick={subscribeToPush}>{subscription ? 'Volver a registrar' : 'Registrar dispositivo'}</button><button className="secondary-button" onClick={testNotification}>Probar alerta local</button></div>}
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </section>
  );
}
