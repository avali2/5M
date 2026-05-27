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
      title: 'Sigma OS activo',
      body: 'Las alertas moviles estan funcionando correctamente.',
      tag: 'valido-mobile-test',
      data: { url: '/institutional-os.html#signals' },
      requestPermission: true
    });
    setDiagnostic(result);
    onEnabled(result.permission === 'granted');
    setTesting(false);
  }

  return (
    <section id="notification-status" className="panel scroll-mt-24 p-4">
      <p className="eyebrow">Estado de notificaciones</p>
      <h3 className="mt-1 text-lg font-semibold">Alertas moviles seguras</h3>
      <p className="mt-2 text-xs leading-5 text-slate-400">Las alertas se envian mediante Service Worker, compatible con el flujo PWA movil.</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">La prueba y los avisos del escaneo funcionan mientras la app esta abierta y actualizando. Alertas con la app cerrada requieren una futura suscripcion Web Push/VAPID.</p>
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
      {diagnostic?.error && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs text-sigma-red">{diagnostic.error}</p>}
      {diagnostic?.solution && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-sigma-amber">{diagnostic.solution}</p>}
      <button className="btn btn-primary mt-4 w-full" onClick={testNotification} disabled={testing}>
        {testing ? 'Probando...' : 'Probar notificacion movil'}
      </button>
    </section>
  );
}

function Diagnostic({ label, value }) {
  return <div className="rounded-lg border border-sigma-line bg-sigma-soft p-2"><p className="eyebrow">{label}</p><p className="mt-1 break-words text-slate-200">{value || '--'}</p></div>;
}
