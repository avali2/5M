import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { GeminiBrokerCoach } from './GeminiBrokerCoach.jsx';

function money(value) {
  if (value === null || value === undefined || value === '') return 'N/D';
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(parsed)
    : 'N/D';
}

function percent(value) {
  if (value === null || value === undefined || value === '') return 'N/D';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : 'N/D';
}

function pnlTone(value) {
  if (value === null || value === undefined || value === '') return 'text-slate-600';
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return 'text-slate-600';
  return parsed < 0 ? 'text-red-700' : 'text-green-700';
}

function shortDate(value) {
  if (!value) return 'N/D';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/D' : date.toLocaleString('es-US', { dateStyle: 'short', timeStyle: 'short' });
}

function signalKey(setup = {}) {
  return [
    setup.symbol,
    setup.strategy,
    setup.expiration,
    setup.strikes || (setup.legs || []).map((leg) => leg.strike).join('/')
  ].map((value) => String(value || '')).join('|');
}

function tone(status) {
  if (/ONLINE|READY|SUBMITTED|FILLED|OPEN/i.test(String(status || ''))) return 'border-green-200 bg-green-50 text-green-800';
  if (/ERROR|REJECTED|LOCK|KILL|STALE|NOT_CONFIGURED|DISABLED|OFF/i.test(String(status || ''))) return 'border-red-200 bg-red-50 text-red-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function Badge({ children }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${tone(children)}`}>{children || 'N/D'}</span>;
}

function Metric({ label, value, detail }) {
  return (
    <div className="min-w-0 border-l-2 border-blue-200 pl-3">
      <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
      <p className="break-words text-lg font-black text-slate-950">{value}</p>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function Toggle({ label, detail, checked, onChange, danger = false }) {
  return (
    <label className="flex min-w-0 cursor-pointer items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className={`block text-sm font-black ${danger ? 'text-red-800' : 'text-slate-900'}`}>{label}</span>
        <span className="block text-xs leading-5 text-slate-500">{detail}</span>
      </span>
      <input className="h-5 w-5 shrink-0 accent-blue-600" type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function NumberField({ label, value, min, max, step = 1, onChange }) {
  return (
    <label className="min-w-0 border-b border-slate-100 py-2">
      <span className="block text-xs font-black text-slate-600">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
        max={max}
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function RealAccount({ live, scan, busy, onPreview, preview }) {
  const opportunities = Array.isArray(scan?.opportunities) ? scan.opportunities : [];
  const candidate = opportunities.find((setup) => setup.status === 'READY_GREEN');
  const coachTarget = candidate || scan?.conditionalIdeas?.[0] || scan?.rejected?.[0] || null;
  const positions = Array.isArray(live?.positions) ? live.positions : [];
  return (
    <>
      <section className="risk-card overflow-hidden">
        <div className="border-b border-blue-100 bg-blue-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-[11px] font-black uppercase text-blue-700">Mi broker personal</p><h2 className="text-xl font-black text-slate-950">Cuenta Tradier en vivo</h2><p className="text-xs text-slate-600">Capital, posiciones y tickets revisados con Gemini. La orden final sigue bajo tu control.</p></div>
            <Badge>{live?.status || 'NOT_CONFIGURED'}</Badge>
          </div>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Metric label="Equity" value={money(live?.balances?.totalEquity)} />
          <Metric label="Cash disponible" value={money(live?.balances?.cashAvailable ?? live?.balances?.totalCash)} />
          <Metric label="Buying power opciones" value={money(live?.balances?.optionBuyingPower)} />
          <Metric label="P/L abierto" value={money(live?.balances?.openPl)} />
          <Metric label="P/L cerrado" value={money(live?.balances?.closePl)} />
          <Metric label="Posiciones" value={positions.length} detail={live?.accountIdMasked || 'Cuenta no vinculada'} />
        </div>
        <div className="border-t border-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900">Preview de la mejor senal verde actual</p>
              <p className="break-words text-xs text-slate-500">{candidate ? `${candidate.symbol} | ${candidate.strategy} | ${percent(candidate.pop)} POP modelado` : 'No hay una senal READY_GREEN disponible.'}</p>
            </div>
            <button className="secondary-button small-action" disabled={!candidate || busy} onClick={() => onPreview(signalKey(candidate))} type="button">Validar ticket</button>
          </div>
          {preview && <div className="mt-3 border-l-4 border-green-500 bg-green-50 p-3 text-xs text-green-900"><strong>Preview completado.</strong> No se envio dinero ni orden real. {preview.note}</div>}
        </div>
      </section>

      <GeminiBrokerCoach environment="live" target={coachTarget} />

      <section className="risk-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-base font-black text-slate-950">Cartera real</h3><p className="text-xs text-slate-500">Posiciones importadas directamente desde Tradier.</p></div><span className="text-xs font-bold text-slate-500">Gestion humana obligatoria</span></div>
        <div className="mt-3 divide-y divide-slate-100">
          {!positions.length && <p className="py-4 text-sm text-slate-500">Tradier no reporta posiciones abiertas.</p>}
          {positions.map((position) => (
            <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center" key={position.id}>
              <div className="min-w-0"><p className="font-black text-slate-900">{position.symbol} | {position.strategy}</p><p className="break-words text-xs text-slate-500">{position.strikes || `${position.quantity || 0} unidades`} {position.expiration ? `| Exp ${position.expiration}` : ''} {position.maxRiskUsd ? `| Riesgo max ${money(position.maxRiskUsd)}` : ''}</p></div>
              <span className={`font-black ${pnlTone(position.openPnL)}`}>P/L {money(position.openPnL)}</span>
              <Badge>{position.definedRisk ? 'DEFINED_RISK' : 'REVIEW_RISK'}</Badge>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function PaperAccount({ paper, scan, form, setForm, busy, onSave, onAggressive, onRun, onCancel }) {
  const latest = paper?.runtime?.lastResult || paper?.runs?.[0]?.payload || null;
  const recommendation = latest?.selection?.recommendation;
  const positions = Array.isArray(paper?.account?.positions) ? paper.account.positions : [];
  const tracked = Array.isArray(paper?.trackedOrders) ? paper.trackedOrders : [];
  const management = Array.isArray(latest?.management) ? latest.management : [];
  const configured = Boolean(paper?.broker?.configured);
  const runtime = paper?.runtime || {};
  const blockers = Array.isArray(runtime.blockers) ? runtime.blockers : [];
  const marketState = configured ? (paper?.market?.state || 'N/D') : 'NO_CONECTADO';
  const marketDetail = !configured
    ? 'Sandbox sin credencial'
    : paper?.market?.verified ? 'Reloj Sandbox verificado' : 'Reloj Sandbox no verificado';
  const coachTarget = recommendation || scan?.opportunities?.[0] || scan?.conditionalIdeas?.[0] || scan?.rejected?.[0] || null;
  return (
    <>
      <section className="risk-card overflow-hidden">
        <div className="border-b border-green-100 bg-green-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-[11px] font-black uppercase text-green-700">Mi laboratorio de opciones</p><h2 className="text-xl font-black text-slate-950">Broker Paper autonomo</h2><p className="text-xs text-slate-600">Tradier Sandbox selecciona, previsualiza, abre y gestiona practica con riesgo definido.</p></div>
            <div className="flex flex-wrap gap-2"><Badge>{form?.profile || 'AGGRESSIVE_DEFINED_RISK'}</Badge><Badge>{runtime.state || 'COMPROBANDO'}</Badge><Badge>{latest?.status || 'SIN_CICLOS'}</Badge></div>
          </div>
        </div>
        {!configured && <div className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-900"><strong>Autonomia bloqueada: falta conectar Tradier Sandbox.</strong> Agrega en Render un <code>TRADIER_PAPER_TOKEN</code> propio de Sandbox, distinto del token real, y solo si Tradier no detecta la cuenta agrega <code>TRADIER_PAPER_ACCOUNT_ID</code>. Web y worker deben reiniciarse con el secreto.</div>}
        {configured && blockers.length > 0 && <div className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>El motor paper necesita atencion.</strong> {blockers.join(' ')}</div>}
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Metric label="Paper equity" value={money(paper?.account?.balances?.totalEquity)} />
          <Metric label="Cash paper" value={money(paper?.account?.balances?.cashAvailable ?? paper?.account?.balances?.totalCash)} />
          <Metric label="Paper buying power" value={money(paper?.account?.balances?.optionBuyingPower)} />
          <Metric label="P/L paper" value={money(paper?.account?.balances?.openPl)} />
          <Metric label="Mercado Sandbox" value={marketState} detail={marketDetail} />
          <Metric label="Posiciones paper" value={positions.length} detail={`Ciclo cada ${runtime.intervalMinutes || 3} min`} />
        </div>
        <div className="border-t border-slate-100 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-slate-900">Motor autonomo</p><Badge>{runtime.backgroundActive ? runtime.state : 'SIN_HEARTBEAT'}</Badge></div>
              <p className="mt-1 break-words text-xs text-slate-500">{latest ? `${latest.reason || latest.status} | ${shortDate(latest.asOf)}` : 'Esperando el primer ciclo del backend.'}</p>
              <p className="mt-1 text-[11px] font-bold text-slate-500">{runtime.schedulerMode === 'BACKGROUND_WORKER' ? 'Render Background Worker' : 'Web Service fallback'} | Siguiente ciclo: {shortDate(runtime.nextCycleAt)}</p>
            </div>
            <button className="primary-button small-action" disabled={!configured || busy} onClick={onRun} type="button">Ejecutar ciclo ahora</button>
          </div>
        </div>
      </section>

      <GeminiBrokerCoach environment="paper" target={coachTarget} />

      <details className="risk-card overflow-hidden">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
          <div><h3 className="text-base font-black text-slate-950">Mandato y limites del bot</h3><p className="text-xs text-slate-500">Abrir para ajustar riesgo, autoejecucion y filtros del servidor.</p></div>
          <Badge>{form?.killSwitch ? 'KILL_SWITCH' : form?.autoExecute ? 'AGRESIVO_AUTONOMO' : 'PREVIEW_ONLY'}</Badge>
        </summary>
        <div className="border-t border-slate-100 p-4">
          <button className="primary-button w-full" disabled={busy} onClick={onAggressive} type="button">Activar perfil agresivo autonomo ahora</button>
          <div className="mt-3 grid gap-x-6 lg:grid-cols-2">
          <div>
            <Toggle label="Bot habilitado" detail="Permite ciclos programados en el backend." checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} />
            <Toggle label="Autoejecucion Sandbox" detail="Envia ordenes limitadas despues del preview y todos los controles del servidor." checked={form.autoExecute} onChange={(value) => setForm({ ...form, autoExecute: value })} />
            <Toggle label="Gemini debe aprobar cada entrada" detail={form.requireGeminiApproval ? 'Encendido: una falta de respuesta o error 429 bloquea la entrada.' : 'Apagado: el motor READY_GREEN decide; Gemini conserva poder de veto y un 429 no detiene el paper bot.'} checked={form.requireGeminiApproval} onChange={(value) => setForm({ ...form, requireGeminiApproval: value })} />
            <Toggle label="Permitir 1 DTE" detail="Modo agresivo: admite 1 DTE con riesgo definido. Nunca permite 0 DTE." checked={form.allow1Dte} onChange={(value) => setForm({ ...form, allow1Dte: value })} />
            <Toggle danger label="Kill switch" detail="Apaga bot y autoejecucion inmediatamente al guardar." checked={form.killSwitch} onChange={(value) => setForm({ ...form, killSwitch: value })} />
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <NumberField label="Riesgo maximo %" min={0.25} max={2} step={0.25} value={form.maxRiskPct} onChange={(value) => setForm({ ...form, maxRiskPct: value })} />
            <NumberField label="Perdida diaria %" min={0.5} max={5} step={0.5} value={form.maxDailyLossPct} onChange={(value) => setForm({ ...form, maxDailyLossPct: value })} />
            <NumberField label="Posiciones maximas" min={1} max={8} value={form.maxOpenPositions} onChange={(value) => setForm({ ...form, maxOpenPositions: value })} />
            <NumberField label="Contratos maximos" min={1} max={5} value={form.maxContracts} onChange={(value) => setForm({ ...form, maxContracts: value })} />
            <NumberField label="Entradas maximas al dia" min={1} max={12} value={form.maxEntriesPerDay} onChange={(value) => setForm({ ...form, maxEntriesPerDay: value })} />
            <NumberField label="Liquidez minima / 10" min={5} max={10} step={0.5} value={form.minLiquidityScore} onChange={(value) => setForm({ ...form, minLiquidityScore: value })} />
            <NumberField label="Score minimo" min={65} max={95} value={form.minScore} onChange={(value) => setForm({ ...form, minScore: value })} />
            <NumberField label="POP minimo %" min={50} max={85} value={form.minPop} onChange={(value) => setForm({ ...form, minPop: value })} />
            <NumberField label="Take profit %" min={20} max={80} value={form.takeProfitPct} onChange={(value) => setForm({ ...form, takeProfitPct: value })} />
            <NumberField label="Stop loss %" min={20} max={100} value={form.stopLossPct} onChange={(value) => setForm({ ...form, stopLossPct: value })} />
          </div>
          </div>
          <button className="primary-button mt-4 w-full" disabled={busy} onClick={onSave} type="button">Guardar mandato paper</button>
        </div>
      </details>

      <section className="risk-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-black text-slate-950">Seleccion de estrategia por capital</h3><Badge>{latest?.selection?.capitalBand?.id || 'ESPERANDO'}</Badge></div>
        {recommendation ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0"><p className="text-lg font-black text-slate-950">{recommendation.symbol} | {recommendation.strategy}</p><p className="break-words text-sm text-slate-600">{recommendation.strikes || recommendation.legs?.map((leg) => `${leg.side} ${leg.strike}`).join(' / ')}</p><p className="mt-2 text-xs leading-5 text-slate-500">{recommendation.gemini?.summary || recommendation.reasons?.join(' ')}</p></div>
            <div className="grid grid-cols-2 gap-3 sm:w-52"><Metric label="POP" value={percent(recommendation.pop)} /><Metric label="Score" value={recommendation.score ?? 'N/D'} /><Metric label="Contratos" value={recommendation.contracts} /><Metric label="Riesgo" value={money(recommendation.totalMaxRisk)} /></div>
          </div>
        ) : <p className="mt-3 text-sm text-slate-500">{latest?.selection?.blockers?.[0] || 'El siguiente ciclo elegira entre senales verdes que quepan en el capital paper.'}</p>}
        <p className="mt-3 border-l-4 border-amber-400 bg-amber-50 p-3 text-xs leading-5 text-amber-900">POP y score son estimaciones, no garantias. Desde cinco cierres, el historial paper ajusta ligeramente el ranking por estrategia; los topes de riesgo y contratos nunca aumentan por aprendizaje.</p>
      </section>

      <section className="risk-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-black text-slate-950">Control de posiciones paper</h3><span className="text-xs font-bold text-slate-500">TP, stop y DTE revisados por ciclo</span></div>
        <div className="mt-2 divide-y divide-slate-100">
          {!management.length && !positions.length && <p className="py-4 text-sm text-slate-500">No hay posiciones Sandbox para administrar.</p>}
          {(management.length ? management : positions).map((item) => (
            <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto]" key={item.entryId || item.id}>
              <div><p className="font-black text-slate-900">{item.symbol} | {item.strategy}</p><p className="text-xs text-slate-500">{item.reason || `P/L ${money(item.openPnL)}`}</p></div>
              <Badge>{item.action || 'MONITORING'}</Badge>
            </div>
          ))}
        </div>
      </section>

      <section className="risk-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[11px] font-black uppercase text-violet-700">Academia Gemini</p><h3 className="text-base font-black text-slate-950">Aprendizaje con operaciones reales de Sandbox</h3><p className="text-xs text-slate-500">El historial ajusta ranking, pero nunca aumenta por si solo el riesgo permitido.</p></div><Badge>{paper?.learning?.confidence || 'LOW_SAMPLE'}</Badge></div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Metric label="Muestra cerrada" value={paper?.learning?.sampleSize || 0} />
          <Metric label="Win rate paper" value={percent(paper?.learning?.winRate)} />
          <Metric label="P/L realizado" value={money(paper?.learning?.realizedPnl)} />
          <Metric label="Confianza" value={paper?.learning?.confidence || 'LOW_SAMPLE'} />
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">{paper?.learning?.recommendation}</p>
        {Array.isArray(paper?.learning?.strategies) && paper.learning.strategies.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-black uppercase text-slate-600">Rendimiento por estrategia</p>
            <div className="mt-2 divide-y divide-slate-100">
              {paper.learning.strategies.slice(0, 6).map((strategy) => (
                <div className="grid grid-cols-2 gap-2 py-2 text-xs sm:grid-cols-5" key={strategy.strategy}>
                  <span className="col-span-2 font-black text-slate-900 sm:col-span-1">{strategy.strategy}</span>
                  <span className="text-slate-600">Trades {strategy.trades}</span>
                  <span className="text-slate-600">Cerradas {strategy.closed}</span>
                  <span className="text-slate-600">Win {percent(strategy.winRate)}</span>
                  <span className={`font-black ${pnlTone(strategy.pnl)}`}>P/L {money(strategy.pnl)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          <p className="py-3 text-xs font-black uppercase text-slate-600">Actividad del broker paper</p>
          {!tracked.length && <p className="pb-3 text-sm text-slate-500">Todavia no hay ordenes paper registradas.</p>}
          {tracked.slice(0, 12).map((order) => (
            <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center" key={order.id}>
              <div className="min-w-0"><p className="font-black text-slate-900">{order.kind} | {order.symbol} | {order.strategy}</p><p className="text-xs text-slate-500">{shortDate(order.createdAt)} | Tradier {order.brokerOrderId || 'sin id'}</p></div>
              <Badge>{order.status}</Badge>
              {/open|pending|submitted/i.test(String(order.status || '')) && order.brokerOrderId
                ? <button className="secondary-button small-action" disabled={busy} onClick={() => onCancel(order.id)} type="button">Cancelar</button>
                : <span />}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function TradierAutopilotDesk({ scan, view = 'paper' }) {
  const [overview, setOverview] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  async function load() {
    try {
      const next = await api.tradierOverview();
      setOverview(next);
      setForm((current) => current || next.paper?.settings || {});
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const settingsChanged = useMemo(() => form && overview?.paper?.settings && JSON.stringify(form) !== JSON.stringify(overview.paper.settings), [form, overview]);

  async function action(callback, success) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await callback();
      setMessage(success(result));
      await load();
      return result;
    } catch (actionError) {
      setError(actionError.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const result = await action(() => api.savePaperBotSettings(form), () => 'Mandato Sandbox guardado en el servidor.');
    if (result?.settings) setForm(result.settings);
  }

  async function run() {
    await action(() => api.runPaperBot(), (result) => `Ciclo terminado: ${result.result?.status || 'N/D'}.`);
  }

  async function aggressive() {
    const result = await action(
      () => api.applyAggressivePaperPreset(),
      () => 'Perfil agresivo autonomo activado en Tradier Sandbox.'
    );
    if (result?.settings) setForm(result.settings);
  }

  async function cancel(id) {
    await action(() => api.cancelPaperOrder(id), () => 'Orden Sandbox cancelada.');
  }

  async function previewLive(key) {
    const result = await action(() => api.previewLiveSignal(key, 1), () => 'Tradier valido el ticket sin enviar una orden real.');
    if (result) setPreview(result);
  }

  const liveView = view === 'live';

  if (!overview || !form) return <section className="risk-card p-5 text-sm font-bold text-slate-600">Cargando {liveView ? 'cuenta Tradier en vivo' : 'broker Paper'}...</section>;

  return (
    <div className="space-y-4">
      {message && <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-900">{message}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-900">{error}</div>}
      {settingsChanged && !liveView && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">Hay cambios sin guardar en el mandato paper.</div>}
      {liveView
        ? <RealAccount live={overview.live} scan={scan} busy={busy} onPreview={previewLive} preview={preview} />
        : <PaperAccount paper={overview.paper} scan={scan} form={form} setForm={setForm} busy={busy} onSave={save} onAggressive={aggressive} onRun={run} onCancel={cancel} />}
    </div>
  );
}
