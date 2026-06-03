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
const money = (value) => Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : 'No disponible';
const percent = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : 'No disponible';
const severityColor = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  opportunity: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  educational: 'border-blue-200 bg-blue-50 text-blue-900',
  info: 'border-slate-200 bg-slate-50 text-slate-700'
};

function ticketTone(ticket) {
  const classification = ticket?.classification || '';
  if (classification === 'AGGRESSIVE_EDGE' || ticket?.riskClass?.includes('Volatility Risk')) {
    return {
      card: 'border-amber-300 bg-amber-50 text-amber-950',
      badge: 'border-amber-300 bg-amber-100 text-amber-900',
      accent: 'text-amber-800',
      inset: 'border-amber-200 bg-white/80 text-amber-950'
    };
  }
  if (classification === 'TRADE_CANDIDATE' || classification === 'WAIT_TRIGGER') {
    return {
      card: 'border-blue-200 bg-blue-50 text-blue-950',
      badge: 'border-blue-200 bg-blue-100 text-blue-800',
      accent: 'text-blue-800',
      inset: 'border-blue-100 bg-white/85 text-blue-950'
    };
  }
  if (classification === 'EDGE_READY') {
    return {
      card: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      badge: 'border-emerald-200 bg-emerald-100 text-emerald-800',
      accent: 'text-emerald-800',
      inset: 'border-emerald-100 bg-white/85 text-emerald-950'
    };
  }
  if (classification === 'NO_READY' || classification === 'NO_TRADE_REAL') {
    return {
      card: 'border-red-200 bg-red-50 text-red-950',
      badge: 'border-red-200 bg-red-100 text-red-800',
      accent: 'text-red-800',
      inset: 'border-red-100 bg-white/85 text-red-950'
    };
  }
  return {
    card: 'border-slate-200 bg-slate-50 text-slate-900',
    badge: 'border-slate-200 bg-white text-slate-700',
    accent: 'text-slate-800',
    inset: 'border-slate-200 bg-white/85 text-slate-900'
  };
}

function Status({ label, value, good }) {
  return (
    <div className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs">
      <p className="text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${good === true ? 'text-emerald-700' : good === false ? 'text-amber-700' : 'text-slate-950'}`}>{value || '--'}</p>
    </div>
  );
}

function TicketDetails({ ticket, onAction }) {
  if (!ticket) return null;
  const tone = ticketTone(ticket);
  return (
    <div className={`mt-3 rounded-xl border p-3 text-[11px] shadow-sm ${tone.card}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={`font-mono font-bold ${tone.accent}`}>{ticket.classification} | {ticket.riskClass}</p>
          <h5 className="mt-1 text-sm font-semibold text-slate-950">{ticket.symbol} {ticket.strategy}</h5>
        </div>
        <span className={`rounded-full border px-2 py-1 font-bold ${tone.badge}`}>Score {ticket.edgeScore ?? '--'}/100</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <p><strong>Accion en broker:</strong><br />{ticket.robinhoodAction}</p>
        <p><strong>Expiracion:</strong><br />{ticket.expiration || 'No disponible'} ({ticket.dte ?? '--'} DTE)</p>
        <p><strong>Legs:</strong><br />{ticket.legsText || 'No disponible'}</p>
        <p><strong>Orden:</strong><br />{ticket.orderType} | {ticket.entryLimit}</p>
        <p><strong>Max risk:</strong><br />{money(ticket.maxRisk)}</p>
        <p><strong>Max profit:</strong><br />{money(ticket.maxProfit)}</p>
        <p><strong>Minimo configurado:</strong><br />{money(ticket.minProfitDollars)} {ticket.profitTargetOk ? '(cumple)' : '(no cumple)'}</p>
        <p><strong>Break-even:</strong><br />{ticket.breakEven || 'No disponible'}</p>
        <p><strong>POP / EV:</strong><br />{percent(ticket.popEstimated)} | {ticket.evEstimated === null ? 'EV no disponible' : money(ticket.evEstimated)}</p>
        <p><strong>ROC:</strong><br />{ticket.roc === null ? 'No disponible' : percent(ticket.roc)}</p>
        <p><strong>Modelo POP:</strong><br />{ticket.popModel || 'No disponible'}</p>
        <p><strong>Fuente:</strong><br />{ticket.dataSource || 'No disponible'}</p>
        <p><strong>Timestamp:</strong><br />{dateTime(ticket.timestamp)}</p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className={`rounded-lg border p-2 ${tone.inset}`}><strong>Take profit</strong><br />{ticket.takeProfit}</div>
        <div className={`rounded-lg border p-2 ${tone.inset}`}><strong>Stop loss</strong><br />{ticket.stopLoss}</div>
        <div className={`rounded-lg border p-2 ${tone.inset}`}><strong>Invalidacion</strong><br />{ticket.invalidation}</div>
      </div>
      <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-950">
        <summary className="cursor-pointer font-semibold text-sigma-amber">Do not enter if / seguridad</summary>
        <ul className="mt-2 list-inside list-disc space-y-1 text-amber-950">
          {(ticket.doNotEnterIf || []).map((rule) => <li key={rule}>{rule}</li>)}
          <li>POP estimada no garantiza ganancia. Revisa precio real, max loss e invalidacion en tu broker.</li>
        </ul>
      </details>
      <details className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-950">
        <summary className="cursor-pointer font-semibold text-sigma-blue">Como revisarlo en tu broker</summary>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-blue-950">
          <li>Busca {ticket.symbol} y abre Options.</li>
          <li>Selecciona expiracion {ticket.expiration || 'indicada'}.</li>
          <li>Agrega exactamente estas legs: {ticket.legsText || 'ver ticket'}.</li>
          <li>Usa limit order. No uses market order en opciones.</li>
          <li>Verifica que el credito/debito, max loss y break-even sigan alineados.</li>
          <li>Si el precio rompio invalidacion o la cadena empeoro, no persigas la entrada.</li>
        </ol>
      </details>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn text-[11px]" onClick={() => onAction('simulate', ticket.sourceSetup || ticket)}>Simular esta estrategia</button>
        <button className="btn text-[11px]" onClick={() => onAction('paper', ticket.sourceSetup || ticket)}>Crear paper manual</button>
        <button className="btn text-[11px]" onClick={() => onAction('chain', ticket)}>Checklist cadena</button>
        <button className="btn text-[11px]" onClick={() => onAction('journal', ticket)}>Guardar journal</button>
      </div>
    </div>
  );
}

function TimelineEvent({ event, onAction, onReviewed, onIgnored, onSilence, onTaken, onInvalid }) {
  const ticket = event.data?.ticket;
  return (
    <article className={`rounded-xl border p-3 text-xs ${severityColor[event.severity] || severityColor.info}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <strong className="font-mono">{event.symbol || 'MARKET'}</strong>
          <span className="rounded border border-current/20 px-2 py-0.5 text-[10px] font-bold">{event.type}</span>
        </div>
        <span className="text-slate-400">{dateTime(event.createdAt || event.created_at)}</span>
      </div>
      <h4 className="mt-2 font-semibold text-slate-950">{event.title}</h4>
      <p className="mt-1 leading-5 text-slate-700">{event.message}</p>
      <p className="mt-2 leading-5 text-slate-600"><strong>Guardian:</strong> {event.recommendation}</p>
      <p className="mt-2 text-[11px] text-slate-500">Fuente: {event.source || 'No disponible'} | Notificacion: {event.notificationSent || event.notification_sent ? 'enviada' : 'in-app'}</p>
      {(event.data?.score || event.data?.dataMode) && (
        <p className="mt-1 text-[11px] text-slate-500">Score: {event.data.score ?? '--'} | Modo dato: {event.data.dataMode || 'No disponible'} | Timestamp: {dateTime(event.data.timestamp)}</p>
      )}
      <TicketDetails ticket={ticket} onAction={onAction} />
      <div className="mt-3 flex flex-wrap gap-2">
        {(event.data?.setup || ticket) && <button className="btn text-[11px]" onClick={() => onAction('simulate', event.data.setup || ticket.sourceSetup || ticket)}>Simular</button>}
        {(event.data?.setup || ticket) && <button className="btn text-[11px]" onClick={() => onAction('paper', event.data.setup || ticket.sourceSetup || ticket)}>Paper trade</button>}
        <button className="btn text-[11px]" onClick={() => onReviewed(event)}>Marcar revisada</button>
        {ticket && <button className="btn text-[11px]" onClick={() => onTaken(event)}>Marcar como tomada</button>}
        <button className="btn text-[11px]" onClick={() => onIgnored(event)}>Ignorar / feedback</button>
        {ticket && <button className="btn text-[11px]" onClick={() => onInvalid(event)}>Marcar no valida</button>}
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

  async function markTaken(event) {
    await recordGuardianFeedback(event, 'taken_manual_review', 'El usuario marco el ticket como tomado/revisado manualmente. No fue ejecucion automatica.');
    setEvents((current) => current.map((item) => item.id === event.id ? { ...item, status: 'taken_manual_review' } : item));
  }

  async function markInvalid(event) {
    await recordGuardianFeedback(event, 'invalid', 'Ticket marcado como no valido por cambio de precio, cadena o invalidacion.');
    setEvents((current) => current.map((item) => item.id === event.id ? { ...item, status: 'invalid' } : item));
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
    if (type === 'chain') onOpenChecklist?.();
    if (type === 'journal') onOpenJournal?.();
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
  const macroRiskLabel = scan?.macro?.highImpactEvents?.length
    ? 'CRITICO'
    : scan?.macro?.softImpactEvents?.length ? 'Soft warning' : 'Normal';
  const dataSource = scan?.market?.quotes?.find((quote) => quote.source)?.source || scan?.marketDataMode || 'No disponible';
  const edgeStates = ['EDGE_READY', 'AGGRESSIVE_EDGE', 'TRADE_CANDIDATE', 'WAIT_TRIGGER', 'CAPITAL_HEAVY', 'HIGH_POP_BAD_PAYOUT', 'NO_READY', 'NO_TRADE_REAL'];

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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-12">
          <Status label="Mercado" value={status.marketStatus || 'Consultando'} />
          <Status label="Regime" value={scan?.market?.regime || 'No disponible'} />
          <Status label="VIX" value={scan?.market?.vix ?? 'No disponible'} />
          <Status label="Breadth" value={scan?.market?.breadth === null || scan?.market?.breadth === undefined ? 'No disponible' : `${scan.market.breadth}%`} />
          <Status label="Macro Risk" value={macroRiskLabel} good={macroRiskLabel === 'Normal'} />
          <Status label="Ultimo scan" value={dateTime(status.lastScan)} />
          <Status label="Data Source" value={dataSource} />
          <Status label="Proxima cadence" value={status.nextCadenceMinutes ? `${status.nextCadenceMinutes} min` : '--'} />
          <Status label="Work Mode" value={settings.workMode.enabled ? 'Activo' : 'Apagado'} good={settings.workMode.enabled} />
          <Status label="Persistencia" value={status.persistence || 'Consultando'} good={status.persistence === 'postgresql'} />
          <Status label="Scheduler backend" value={status.backendScheduler === false ? 'Inactivo' : 'Activo'} good={status.backendScheduler !== false} />
          <Status label="Web Push" value={notification?.subscribed ? 'Suscrito' : 'No suscrito'} good={notification?.subscribed} />
          <Status label="IA manual" value={scan?.aiStatus?.enabled ? 'Disponible' : 'Opcional / apagada'} good={scan?.aiStatus?.enabled} />
        </div>
        <div className="flex flex-wrap gap-2 rounded-xl border border-sigma-line bg-sigma-soft p-3 text-[11px]">
          <span className="font-semibold text-slate-300">Estados Guardian:</span>
          {edgeStates.map((state) => <span className="rounded-full border border-sigma-line px-2 py-1 font-mono text-slate-400" key={state}>{state}</span>)}
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
        {scan?.guardianEdge?.dailyBest && (
          <div className={`rounded-xl border p-4 text-xs ${ticketTone(scan.guardianEdge.dailyBest).card}`}>
            <p className={`eyebrow ${ticketTone(scan.guardianEdge.dailyBest).accent}`}>Daily Edge Ticket</p>
            <TicketDetails ticket={scan.guardianEdge.dailyBest} onAction={action} />
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.2fr_.9fr]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div><p className="eyebrow">Guardian timeline</p><h3 className="mt-1 font-semibold">Alertas auditables</h3></div>
              <span className="status-chip">{events.length} eventos</span>
            </div>
            <div className="mt-3 max-h-[520px] space-y-2 overflow-auto scrollbar">
              {events.length ? events.slice(0, 20).map((event) => <TimelineEvent event={event} onAction={action} onReviewed={markReviewed} onIgnored={ignoreEvent} onSilence={silenceSymbol} onTaken={markTaken} onInvalid={markInvalid} key={event.id} />) : (
                <p className="rounded-lg border border-dashed border-sigma-line p-5 text-center text-xs text-slate-500">Aun no hay eventos Guardian. Ejecuta un scan o practica paper.</p>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-sigma-line bg-sigma-soft p-4 text-xs">
              <p className="eyebrow text-sigma-blue">Trading companion</p>
              <p className="mt-3 leading-5 text-slate-700"><strong>Que vigila:</strong> scanner, Risk Governor, cadena, macro, journal y calidad de datos.</p>
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
