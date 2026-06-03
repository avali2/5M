import { useEffect, useState } from 'react';
import { getNotificationDiagnostic, showMobileSafeNotification } from '../../services/notifications.js';

const stamp = (value) => value ? new Date(value).toLocaleString('es-US') : '--';

export default function NotificationCenter({ enabled, onEnabled }) {
  const [diagnostic, setDiagnostic] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getNotificationDiagnostic().then(setDiagnostic).catch((error) => setDiagnostic({ error: error.message }));
  }, []);

  async function testNotification() {
    setTesting(true);
    const result = await showMobileSafeNotification({
      title: 'V Valido 1M activo',
      body: 'Las alertas moviles con el icono V estan funcionando correctamente.',
      tag: 'valido-mobile-test',
      data: { url: '/institutional-os.html#signals' },
      requestPermission: true
    });
    setDiagnostic(result);
    onEnabled?.(result.permission === 'granted');
    setTesting(false);
  }

  return (
    <section id="notification-status" className="panel scroll-mt-24 p-4">
      <p className="eyebrow">Estado de notificaciones</p>
      <h3 className="mt-1 text-lg font-semibold">Alertas moviles seguras</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">Las alertas se envian mediante Service Worker y usan el icono V de Valido.</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">Solo se debe notificar READY implementable, riesgo urgente o earnings/noticia de alto impacto sobre posicion abierta.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Diagnostic label="Navegador" value={diagnostic?.browser} />
        <Diagnostic label="Sistema" value={diagnostic?.platform} />
        <Diagnostic label="HTTPS" value={diagnostic?.secureContext ? 'Si' : 'No'} />
        <Diagnostic label="Permiso" value={diagnostic?.permission || '--'} />
        <Diagnostic label="Service Worker" value={diagnostic?.registered ? 'Registrado' : 'No'} />
        <Diagnostic label="Listo" value={diagnostic?.serviceWorkerReady ? 'Si' : 'No'} />
        <Diagnostic label="Ultimo intento" value={stamp(diagnostic?.lastAttempt)} />
        <Diagnostic label="Alertas" value={enabled ? 'Activas' : 'Inactivas'} />
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">{diagnostic?.privateMode || 'El modo privado puede impedir permisos y almacenamiento del Service Worker.'}</p>
      {diagnostic?.error && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs text-red-700">{diagnostic.error}</p>}
      {diagnostic?.solution && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-700">{diagnostic.solution}</p>}
      <button className="btn btn-primary mt-4 w-full" onClick={testNotification} disabled={testing}>
        {testing ? 'Probando...' : 'Probar notificacion push'}
      </button>
      <p className="mt-3 rounded-lg bg-blue-50 p-3 text-[11px] leading-5 text-blue-700">Con la app cerrada, Render necesita Web Push/VAPID y un servicio despierto para avisar.</p>
    </section>
  );
}

function Diagnostic({ label, value }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-2"><p className="eyebrow">{label}</p><p className="mt-1 break-words text-slate-700">{value || '--'}</p></div>;
}
