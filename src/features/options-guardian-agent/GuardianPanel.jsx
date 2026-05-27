import { useEffect, useRef, useState } from 'react';
import { GuardianClientScheduler } from './agentScheduler.js';
import { getGuardianDashboardState, recordGuardianFeedback, runGuardianAgent, updateGuardianSettings } from './agentDatabase.js';
import { deliverGuardianNotifications } from './agentNotifications.js';
import { DEFAULT_GUARDIAN_SETTINGS, mergeGuardianSettings } from './agentTypes.js';
import {
  getNotificationCapability,
  sendLocalTestNotification,
  subscribeToGuardianWebPush,
  testWebPush,
  unsubscribeFromGuardianWebPush
} from './webPushClient.js';

const dateTime = (value) => value ? new Intl.DateTimeFormat('es-US', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value)) : '--';
const severityColor = {
  critical: 'border-red-500/40 bg-red-500/10 text-sigma-red',
  warning: 'border-amber-500/40 bg-amber-500/10 text-sigma-amber',
  opportunity: 'border-emerald-500/40 bg-emerald-500/10 text-sigma-green',
  educational: 'border-blue-500/40 bg-blue-500/10 text-sigma-blue',
  info: 'border-sigma-line bg-sigma-soft text-slate-300'
};

function Status({ label, value, good }) {
  return (
    <div className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs">
      <p className="text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${good === true ? 'text-sigma-green' : good === false ? 'text-sigma-amber' : 'text-white'}`}>{value || '--'}</p>
    </div>
  );
}

function TimelineEvent({ event, onAction, onReviewed, onIgnored, onSilence }) {
  return (
    <article className={`rounded-xl border p-3 text-xs ${severityColor[event.severity] || severityColor.info}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <strong className="font-mono">{event.symbol || 'MARKET'}</strong>
          <span className="rounded border border-current/20 px-2 py-0.5 text-[10px] font-bold">{event.type}</span>
        </div>
        <span className="text-slate-400">{dateTime(event.createdAt || event.created_at)}</span>
      </div>
      <h4 className="mt-2 font-semibold text-white">{event.title}</h4>
      <p className="mt-1 leading-5 text-slate-200">{event.message}</p>
      <p className="mt-2 leading-5 text-slate-400"><strong>Guardian:</strong> {event.recommendation}</p>
      <p className="mt-2 text-[11px] text-slate-500">Fuente: {event.source || 'No disponible'} | Notificacion: {event.notificationSent || event.notification_sent ? 'enviada' : 'in-app'}</p>
      {(event.data?.score || event.data?.dataMode) && (
        <p className="mt-1 text-[11px] text-slate-500">Score: {event.data.score ?? '--'} | Modo dato: {event.data.dataMode || 'No disponible'} | Timestamp: {dateTime(event.data.timestamp)}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {event.data?.setup && <button className="btn text-[11px]" onClick={() => onAction('simulate', event.data.setup)}>Simular</button>}
        {event.data?.setup && <button className="btn text-[11px]" onClick={() => onAction('paper', event.data.setup)}>Paper trade</button>}
        <button className="btn text-[11px]" onClick={() => onReviewed(event)}>Marcar revisada</button>
        <button className="btn text-[11px]" onClick={() => onIgnored(event)}>Ignorar / feedback</button>
        {event.symbol && <button className="btn text-[11px]" onClick={() => onSilence(event)}>Silenciar {event.symbol}</button>}
      </div>
    </article>
  );
}

export default function GuardianPanel({
  scan,
  onSimulate,
  onPaper,
  onOpenJournal,
  onOpenChecklist,
  onRefresh,
  onAiExplain
}) {
  const [settings, setSettings] = useState(DEFAULT_GUARDIAN_SETTINGS);
  const [events, setEvents] = useState([]);
  const [learning, setLearning] = useState(null);
  const [status, setStatus] = useState({});
  const [notification, setNotification] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const schedulerRef = useRef(null);
  const pushSubscribedRef = useRef(false);

  async function acceptResult(result, permitNotification = true) {
    if (result.error) setMessage(result.error);
    if (result.events?.length) {
      setEvents((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...result.events.filter((item) => !ids.has(item.id)), ...current].slice(0, 100);
      });
    }
    if (result.learning) setLearning(result.learning);
    if (permitNotification && !pushSubscribedRef.current && result.notifications?.length && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      await deliverGuardianNotifications(result.notifications);
    }
    setStatus((current) => ({
      ...current,
      marketStatus: result.marketStatus || current.marketStatus,
      lastScan: result.completedAt || new Date().toISOString(),
      nextCadenceMinutes: result.nextCadenceMinutes || current.nextCadenceMinutes
    }));
  }

  useEffect(() => {
    let mounted = true;
    let client = null;
    getGuardianDashboardState().then((state) => {
      if (!mounted) return;
      const loadedSettings = mergeGuardianSettings(state.settings);
      setStatus(state.status || {});
      setEvents(state.events || []);
      setLearning(state.learning);
      setSettings(loadedSettings);
      client = new GuardianClientScheduler({
        settings: loadedSettings,
        run: runGuardianAgent,
        onResult: (result) => mounted && acceptResult(result)
      });
      schedulerRef.current = client;
      client.start();
    });
    getNotificationCapability().then((capability) => mounted && setNotification(capability)).catch((error) => mounted && setMessage(error.message));
    return () => {
      mounted = false;
      client?.stop();
    };
  }, []);

  useEffect(() => {
    pushSubscribedRef.current = Boolean(notification?.subscribed);
  }, [notification?.subscribed]);

  async function saveSettings(next) {
    const value = mergeGuardianSettings(next);
    setSettings(value);
    schedulerRef.current?.updateSettings(value);
    await updateGuardianSettings(value);
  }

  async function runNow() {
    setBusy(true);
    setMessage('');
    const result = await runGuardianAgent();
    await acceptResult(result);
    if (onRefresh && result.marketStatus !== 'closed') onRefresh();
    setBusy(false);
  }

  async function localTest() {
    setBusy(true);
    const diagnostic = await sendLocalTestNotification();
    setNotification({ ...(notification || {}), ...diagnostic });
    setMessage(diagnostic.notificationShown ? 'Notificacion local enviada por Service Worker.' : diagnostic.error || diagnostic.solution);
    setBusy(false);
  }

  async function enablePush() {
    setBusy(true);
    try {
      const capability = await subscribeToGuardianWebPush('Movil Guardian');
      setNotification(capability);
      setMessage('Web Push activado para este dispositivo. La entrega final depende del sistema operativo y permisos.');
    } catch (error) {
      setMessage(error.message);
    }
    setBusy(false);
  }

  async function disablePush() {
    setBusy(true);
    try {
      setNotification(await unsubscribeFromGuardianWebPush());
      setMessage('Suscripcion Web Push desactivada en este dispositivo.');
    } catch (error) {
      setMessage(error.message);
    }
    setBusy(false);
  }

  async function pushTest() {
    setBusy(true);
    try {
      const result = await testWebPush();
      setMessage(result.sent ? `Push enviado a ${result.sent} dispositivo(s).` : result.error || 'No se envio push; revisa suscripcion y VAPID.');
    } catch (error) {
      setMessage(error.message);
    }
    setBusy(false);
  }

  async function markReviewed(event) {
    await recordGuardianFeedback(event, 'reviewed', 'Alerta revisada desde Guardian Timeline.');
    setEvents((current) => current.map((item) => item.id === event.id ? { ...item, status: 'reviewed' } : item));
  }

  async function ignoreEvent(event) {
    await recordGuardianFeedback(event, 'ignored', 'Alerta ignorada desde Guardian Timeline.');
    setEvents((current) => current.map((item) => item.id === event.id ? { ...item, status: 'ignored' } : item));
  }

  async function silenceSymbol(event) {
    const mutedSymbols = [...new Set([...(settings.mutedSymbols || []), event.symbol])];
    await saveSettings({ ...settings, mutedSymbols });
    await recordGuardianFeedback(event, 'silenced_symbol', `Silenciado ${event.symbol}.`);
    setMessage(`${event.symbol} silenciado para alertas no criticas.`);
  }

  function action(type, setup) {
    if (type === 'simulate') onSimulate?.(setup);
    if (type === 'paper') onPaper?.(setup);
  }

  const coach = learning?.coach || {
    weakConcept: 'Aun sin suficientes registros',
    lesson: 'Registra paper trades para que Guardian detecte conceptos a reforzar.',
    practice: 'Simula un spread definido y anota tu checklist.',
    repeatedError: 'No confirmado.',
    motivation: 'Antes de entrar: cadena, riesgo, invalidacion y tamano. Primero proceso.',
    notificationAdjustment: 'Work Mode protege tu atencion.'
  };
  const bestSetup = scan?.opportunities?.[0] || scan?.conditionalIdeas?.find((idea) => idea.strategy);

  return (
    <section id="guardian" className="panel scroll-mt-24 overflow-hidden">
      <div className="border-b border-sigma-line bg-gradient-to-r from-emerald-500/10 via-blue-500/5 to-transparent p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-sigma-green">Options Guardian Agent Pro</p>
            <h2 className="mt-1 text-xl font-bold">Companero operativo, profesor y guardian de riesgo</h2>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-400">Vigila senales y disciplina; no envia ordenes, no usa SMS y no llama IA automaticamente. Dato - Fuente - Calculo - Riesgo - Practica - Journal.</p>
          </div>
          <span className={`status-chip ${settings.enabled ? 'text-sigma-green' : 'text-sigma-amber'}`}>{settings.enabled ? 'ACTIVO' : 'PAUSADO'}</span>
        </div>
      </div>

      <div className="space-y-5 p-4 md:p-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Status label="Mercado" value={status.marketStatus || 'Consultando'} />
          <Status label="Ultimo scan" value={dateTime(status.lastScan)} />
          <Status label="Proxima cadence" value={status.nextCadenceMinutes ? `${status.nextCadenceMinutes} min` : '--'} />
          <Status label="Work Mode" value={settings.workMode.enabled ? 'Activo' : 'Apagado'} good={settings.workMode.enabled} />
          <Status label="Persistencia" value={status.persistence || 'Consultando'} good={status.persistence === 'postgresql'} />
          <Status label="Scheduler backend" value={status.backendScheduler === false ? 'Inactivo' : 'Activo'} good={status.backendScheduler !== false} />
          <Status label="Web Push" value={notification?.subscribed ? 'Suscrito' : 'No suscrito'} good={notification?.subscribed} />
          <Status label="IA manual" value={scan?.aiStatus?.enabled ? 'Disponible' : 'Opcional / apagada'} good={scan?.aiStatus?.enabled} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={() => saveSettings({ ...settings, enabled: !settings.enabled })}>{settings.enabled ? 'Pausar agente' : 'Activar agente'}</button>
          <button className="btn" disabled={busy} onClick={runNow}>{busy ? 'Procesando...' : 'Escanear ahora'}</button>
          <button className="btn" disabled={busy} onClick={localTest}>Probar notificacion local</button>
          {!notification?.subscribed && <button className="btn" disabled={busy} onClick={enablePush}>Activar alertas con movil bloqueado</button>}
          {notification?.subscribed && <button className="btn" disabled={busy} onClick={disablePush}>Desactivar Web Push</button>}
          <button className="btn" disabled={busy || !notification?.subscribed} onClick={pushTest}>Probar Web Push</button>
          <button className="btn" onClick={() => saveSettings({ ...settings, silencedUntil: new Date(Date.now() + 3600000).toISOString() })}>Silenciar 1 hora</button>
          <button className="btn" onClick={() => saveSettings({ ...settings, workMode: { ...settings.workMode, onlyCritical: !settings.workMode.onlyCritical } })}>{settings.workMode.onlyCritical ? 'Recibir alertas filtradas' : 'Solo criticas'}</button>
          {bestSetup && <button className="btn" onClick={() => onPaper?.(bestSetup)}>Crear practica paper</button>}
          <button className="btn" onClick={onOpenChecklist}>Cadena / checklist</button>
          <button className="btn" onClick={onOpenJournal}>Abrir journal</button>
          <button className="btn" onClick={onAiExplain}>Explicar con IA manual</button>
        </div>
        {message && <p className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs text-slate-300">{message}</p>}

        <div className="grid gap-4 xl:grid-cols-[1.2fr_.9fr]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div><p className="eyebrow">Guardian timeline</p><h3 className="mt-1 font-semibold">Alertas auditables</h3></div>
              <span className="status-chip">{events.length} eventos</span>
            </div>
            <div className="mt-3 max-h-[520px] space-y-2 overflow-auto scrollbar">
              {events.length ? events.slice(0, 20).map((event) => <TimelineEvent event={event} onAction={action} onReviewed={markReviewed} onIgnored={ignoreEvent} onSilence={silenceSymbol} key={event.id} />) : (
                <p className="rounded-lg border border-dashed border-sigma-line p-5 text-center text-xs text-slate-500">Aun no hay eventos Guardian. Ejecuta un scan o practica paper.</p>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-sigma-line bg-sigma-soft p-4 text-xs">
              <p className="eyebrow text-sigma-blue">Trading companion</p>
              <p className="mt-3 leading-5 text-slate-200"><strong>Que vigila:</strong> scanner, Risk Governor, cadena, macro, journal y calidad de datos.</p>
              <p className="mt-2 leading-5 text-slate-300"><strong>Que estudiar hoy:</strong> {coach.lesson}</p>
              <p className="mt-2 leading-5 text-slate-300"><strong>Practica:</strong> {coach.practice}</p>
              <p className="mt-2 leading-5 text-sigma-amber"><strong>Regla critica:</strong> {coach.motivation}</p>
            </div>
            <div className="rounded-xl border border-sigma-line bg-sigma-soft p-4 text-xs">
              <p className="eyebrow text-sigma-gold">Learning coach</p>
              <p className="mt-3 text-slate-300"><strong>Concepto debil:</strong> {coach.weakConcept}</p>
              <p className="mt-2 text-slate-300"><strong>Error repetido:</strong> {coach.repeatedError}</p>
              <p className="mt-2 text-slate-300"><strong>Alertas:</strong> {coach.notificationAdjustment}</p>
              {learning && <p className="mt-2 text-slate-500">Disciplina: {learning.disciplineScore}/100 | FOMO risk: {learning.fomoRiskScore}/100 | Revenge risk: {learning.revengeRiskScore}/100</p>}
            </div>
            <div className="rounded-xl border border-sigma-line bg-sigma-soft p-4 text-xs">
              <p className="eyebrow">Notification health</p>
              <p className="mt-3 text-slate-300">Permiso: {notification?.permission || 'No comprobado'} | Service Worker: {notification?.serviceWorkerReady ? 'listo' : 'no listo'}</p>
              <p className="mt-2 text-slate-300">PushManager: {notification?.pushSupported ? 'si' : 'no'} | Suscripcion: {notification?.subscribed ? 'activa' : 'no activa'}</p>
              <p className="mt-2 leading-5 text-slate-500">{notification?.solution || 'Para alertas con telefono bloqueado necesitas HTTPS, permiso, Service Worker, VAPID y suscripcion activa.'}</p>
              <p className="mt-2 leading-5 text-slate-500">iPhone: instala la PWA en Home Screen antes de activar push. Android: permite notificaciones del navegador/PWA. El sistema operativo puede retrasar o silenciar entregas.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
