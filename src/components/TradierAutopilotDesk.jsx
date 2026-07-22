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
  if (value === null || value === undefined || value === '') return 'text-slate-400';
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return 'text-slate-400';
  return parsed < 0 ? 'text-rose-400' : 'text-emerald-400';
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
  if (/ONLINE|READY|SUBMITTED|FILLED|OPEN/i.test(String(status || ''))) return 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300';
  if (/ERROR|REJECTED|LOCK|KILL|STALE|NOT_CONFIGURED|DISABLED|OFF/i.test(String(status || ''))) return 'border-rose-500/40 bg-rose-950/60 text-rose-300';
  return 'border-amber-500/40 bg-amber-950/60 text-amber-300';
}

function Badge({ children }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${tone(children)}`}>{children || 'N/D'}</span>;
}

function Metric({ label, value, detail }) {
  return (
    <div className="min-w-0 border-l-2 border-indigo-500/50 pl-3 bg-slate-950/40 p-2.5 rounded-r-xl border-y border-r border-slate-800/60">
      <p className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">{label}</p>
      <p className="break-words text-lg font-black text-white mt-0.5">{value}</p>
      {detail && <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{detail}</p>}
    </div>
  );
}

function Toggle({ label, detail, checked, onChange, danger = false }) {
  return (
    <label className="flex min-w-0 cursor-pointer items-center justify-between gap-3 border-b border-slate-800 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className={`block text-sm font-black ${danger ? 'text-rose-400' : 'text-slate-100'}`}>{label}</span>
        <span className="block text-xs leading-5 text-slate-400">{detail}</span>
      </span>
      <input className="h-5 w-5 shrink-0 accent-indigo-500 rounded cursor-pointer" type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function NumberField({ label, value, min, max, step = 1, onChange }) {
  return (
    <label className="min-w-0 border-b border-slate-800 py-2 block">
      <span className="block text-xs font-black text-slate-300">{label}</span>
      <input
        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-indigo-500"
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
      <section className="risk-card overflow-hidden border border-indigo-500/30 bg-slate-900 rounded-3xl p-5 text-white">
        <div className="border-b border-indigo-500/20 bg-indigo-950/40 p-4 rounded-2xl mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-black uppercase text-indigo-300">Mi broker personal</p>
              <h2 className="text-xl font-black text-white">Cuenta Tradier En Vivo</h2>
              <p className="text-xs text-slate-300">Capital, posiciones y tickets revisados con Gemini. La orden final sigue bajo tu control.</p>
            </div>
            <Badge>{live?.status || 'NOT_CONFIGURED'}</Badge>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 mb-4">
          <Metric label="Equity" value={money(live?.balances?.totalEquity)} />
          <Metric label="Cash disponible" value={money(live?.balances?.cashAvailable ?? live?.balances?.totalCash)} />
          <Metric label="Buying power opciones" value={money(live?.balances?.optionBuyingPower)} />
          <Metric label="P/L abierto" value={money(live?.balances?.openPl)} />
          <Metric label="P/L cerrado" value={money(live?.balances?.closePl)} />
          <Metric label="Posiciones" value={positions.length} detail={live?.accountIdMasked || 'Cuenta no vinculada'} />
        </div>
        <div className="border-t border-slate-800 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-white flex items-center gap-2">
                <span>Preview de la mejor señal verde actual</span>
              </p>
              <p className="break-words text-xs text-slate-400">{candidate ? `${candidate.symbol} | ${candidate.strategy} | ${percent(candidate.pop)} POP modelado` : 'No hay una señal READY_GREEN disponible.'}</p>
            </div>
            <button className="bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2 disabled:opacity-50" disabled={!candidate || busy} onClick={() => onPreview(signalKey(candidate))} type="button">
              <span>▶ Evaluar y Validar Ticket</span>
            </button>
          </div>
          {preview && <div className="mt-3 border-l-4 border-emerald-500 bg-emerald-950/60 p-3 rounded-xl text-xs text-emerald-200"><strong>Preview completado.</strong> No se envió dinero ni orden real. {preview.note}</div>}
        </div>
      </section>

      <GeminiBrokerCoach environment="live" target={coachTarget} />

      <section className="risk-card p-5 border border-slate-800 bg-slate-900 rounded-3xl text-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
          <div>
            <h3 className="text-base font-black text-white">Cartera Real Tradier</h3>
            <p className="text-xs text-slate-400">Posiciones importadas directamente desde tu broker Tradier.</p>
          </div>
          <span className="text-xs font-bold text-indigo-300">Gestión humana obligatoria</span>
        </div>
        <div className="divide-y divide-slate-800">
          {!positions.length && <p className="py-4 text-sm text-slate-400">Tradier no reporta posiciones abiertas.</p>}
          {positions.map((position) => (
            <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center" key={position.id}>
              <div className="min-w-0"><p className="font-black text-white">{position.symbol} | {position.strategy}</p><p className="break-words text-xs text-slate-400">{position.strikes || `${position.quantity || 0} unidades`} {position.expiration ? `| Exp ${position.expiration}` : ''} {position.maxRiskUsd ? `| Riesgo max ${money(position.maxRiskUsd)}` : ''}</p></div>
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
      <section className="risk-card overflow-hidden border border-emerald-500/30 bg-slate-900 rounded-3xl p-5 text-white">
        <div className="border-b border-emerald-500/20 bg-emerald-950/40 p-4 rounded-2xl mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-black uppercase text-emerald-400">Laboratorio de Aprendizaje en Tiempo Real</p>
              <h2 className="text-xl font-black text-white">Broker Paper Autónomo</h2>
              <p className="text-xs text-slate-300">Tradier Sandbox selecciona, previsualiza, abre y gestiona práctica con riesgo definido antes de pasar a Real.</p>
            </div>
            <div className="flex flex-wrap gap-2"><Badge>{form?.profile || 'AGGRESSIVE_DEFINED_RISK'}</Badge><Badge>{runtime.state || 'COMPROBANDO'}</Badge><Badge>{latest?.status || 'SIN_CICLOS'}</Badge></div>
          </div>
        </div>
        {!configured && <div className="border-b border-rose-500/40 bg-rose-950/60 p-4 rounded-2xl mb-4 text-xs text-rose-200"><strong>Autonomía bloqueada: falta conectar Tradier Sandbox.</strong> Agrega en Render un <code>TRADIER_PAPER_TOKEN</code> propio de Sandbox, distinto del token real, y solo si Tradier no detecta la cuenta agrega <code>TRADIER_PAPER_ACCOUNT_ID</code>.</div>}
        {configured && blockers.length > 0 && <div className="border-b border-amber-500/40 bg-amber-950/60 p-4 rounded-2xl mb-4 text-xs text-amber-200"><strong>El motor paper necesita atención:</strong> {blockers.join(' ')}</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 mb-4">
          <Metric label="Paper equity" value={money(paper?.account?.balances?.totalEquity)} />
          <Metric label="Cash paper" value={money(paper?.account?.balances?.cashAvailable ?? paper?.account?.balances?.totalCash)} />
          <Metric label="Paper buying power" value={money(paper?.account?.balances?.optionBuyingPower)} />
          <Metric label="P/L paper" value={money(paper?.account?.balances?.openPl)} />
          <Metric label="Mercado Sandbox" value={marketState} detail={marketDetail} />
          <Metric label="Posiciones paper" value={positions.length} detail={`Ciclo cada ${runtime.intervalMinutes || 3} min`} />
        </div>
        <div className="border-t border-slate-800 pt-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-white">Motor Autónomo de Opciones</p><Badge>{runtime.backgroundActive ? runtime.state : 'HEARTBEAT_ACTIVO'}</Badge></div>
              <p className="mt-1 break-words text-xs text-slate-400">{latest ? `${latest.reason || latest.status} | ${shortDate(latest.asOf)}` : 'Esperando el primer ciclo del backend.'}</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">{runtime.schedulerMode === 'BACKGROUND_WORKER' ? 'Render Background Worker' : 'Servicio Web Activo'} | Siguiente ciclo: {shortDate(runtime.nextCycleAt)}</p>
            </div>
            <button className="bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-lg shadow-emerald-900/30 transition flex items-center gap-2 disabled:opacity-50" disabled={!configured || busy} onClick={onRun} type="button">
              <span className="text-base">▶</span>
              <span>Lanzar Órdenes / Ejecutar Ciclo Ahora</span>
            </button>
          </div>
        </div>
      </section>

      <GeminiBrokerCoach environment="paper" target={coachTarget} />

      <details className="risk-card overflow-hidden border border-slate-800 bg-slate-900 rounded-3xl p-5 text-white">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div><h3 className="text-base font-black text-white">Mandato y Límites del Bot Automático</h3><p className="text-xs text-slate-400">Ajusta riesgo, autoejecución y reglas de entrada para Paper/Live.</p></div>
          <Badge>{form?.killSwitch ? 'KILL_SWITCH' : form?.autoExecute ? 'AGRESIVO_AUTONOMO' : 'PREVIEW_ONLY'}</Badge>
        </summary>
        <div className="pt-4">
          <button className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-xs px-4 py-3 rounded-2xl w-full transition shadow-md" disabled={busy} onClick={onAggressive} type="button">
            ⚡ Activar Perfil Agresivo Autónomo (Recomendado para Trading de Opciones)
          </button>
          <div className="mt-4 grid gap-x-6 lg:grid-cols-2">
            <div>
              <Toggle label="Bot Habilitado" detail="Permite ciclos programados automáticos en el servidor." checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} />
              <Toggle label="Autoejecución Sandbox" detail="Envía órdenes limitadas después del preview de Gemini." checked={form.autoExecute} onChange={(value) => setForm({ ...form, autoExecute: value })} />
              <Toggle label="Gemini Debe Aprobar Cada Entrada" detail={form.requireGeminiApproval ? 'Encendido: Gemini audita y valida antes de entrar.' : 'Apagado: el motor cuantitativo READY_GREEN ejecuta.'} checked={form.requireGeminiApproval} onChange={(value) => setForm({ ...form, requireGeminiApproval: value })} />
              <Toggle label="Permitir 1 DTE" detail="Admite vencimiento a 1 día con riesgo definido estrictamente." checked={form.allow1Dte} onChange={(value) => setForm({ ...form, allow1Dte: value })} />
              <Toggle danger label="Kill Switch de Emergencia" detail="Detiene inmediatamente el bot y la ejecución de órdenes." checked={form.killSwitch} onChange={(value) => setForm({ ...form, killSwitch: value })} />
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              <NumberField label="Riesgo Máximo %" min={0.25} max={2} step={0.25} value={form.maxRiskPct} onChange={(value) => setForm({ ...form, maxRiskPct: value })} />
              <NumberField label="Pérdida Diaria Máx %" min={0.5} max={5} step={0.5} value={form.maxDailyLossPct} onChange={(value) => setForm({ ...form, maxDailyLossPct: value })} />
              <NumberField label="Posiciones Máximas" min={1} max={8} value={form.maxOpenPositions} onChange={(value) => setForm({ ...form, maxOpenPositions: value })} />
              <NumberField label="Contratos Máximos" min={1} max={5} value={form.maxContracts} onChange={(value) => setForm({ ...form, maxContracts: value })} />
              <NumberField label="Entradas Máx/Día" min={1} max={12} value={form.maxEntriesPerDay} onChange={(value) => setForm({ ...form, maxEntriesPerDay: value })} />
              <NumberField label="Liquidez Mínima / 10" min={5} max={10} step={0.5} value={form.minLiquidityScore} onChange={(value) => setForm({ ...form, minLiquidityScore: value })} />
              <NumberField label="Score Mínimo" min={65} max={95} value={form.minScore} onChange={(value) => setForm({ ...form, minScore: value })} />
              <NumberField label="POP Mínimo %" min={50} max={85} value={form.minPop} onChange={(value) => setForm({ ...form, minPop: value })} />
              <NumberField label="Take Profit %" min={20} max={80} value={form.takeProfitPct} onChange={(value) => setForm({ ...form, takeProfitPct: value })} />
              <NumberField label="Stop Loss %" min={20} max={100} value={form.stopLossPct} onChange={(value) => setForm({ ...form, stopLossPct: value })} />
            </div>
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs px-4 py-3 rounded-2xl w-full mt-4 transition" disabled={busy} onClick={onSave} type="button">Guardar Mandato de Trading</button>
        </div>
      </details>

      <section className="risk-card p-5 border border-slate-800 bg-slate-900 rounded-3xl text-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3"><h3 className="text-base font-black text-white">Selección de Estrategia por Capital</h3><Badge>{latest?.selection?.capitalBand?.id || 'EVALUANDO'}</Badge></div>
        {recommendation ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0"><p className="text-lg font-black text-white">{recommendation.symbol} | {recommendation.strategy}</p><p className="break-words text-sm text-slate-300">{recommendation.strikes || recommendation.legs?.map((leg) => `${leg.side} ${leg.strike}`).join(' / ')}</p><p className="mt-2 text-xs leading-5 text-slate-400">{recommendation.gemini?.summary || recommendation.reasons?.join(' ')}</p></div>
            <div className="grid grid-cols-2 gap-3 sm:w-52"><Metric label="POP" value={percent(recommendation.pop)} /><Metric label="Score" value={recommendation.score ?? 'N/D'} /><Metric label="Contratos" value={recommendation.contracts} /><Metric label="Riesgo" value={money(recommendation.totalMaxRisk)} /></div>
          </div>
        ) : <p className="mt-3 text-sm text-slate-400">{latest?.selection?.blockers?.[0] || 'El siguiente ciclo elegirá entre señales verdes que quepan en el capital disponible.'}</p>}
        <p className="mt-3 border-l-4 border-amber-400 bg-amber-950/60 p-3 rounded-xl text-xs leading-5 text-amber-200">El historial paper ajusta continuamente el ranking por estrategia. Los topes de riesgo y contratos se mantienen dentro de los parámetros seguros establecidos.</p>
      </section>

      <section className="risk-card p-5 border border-slate-800 bg-slate-900 rounded-3xl text-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3"><h3 className="text-base font-black text-white">Control de Posiciones Paper</h3><span className="text-xs font-bold text-slate-400">TP, Stop Loss y DTE revisados por ciclo</span></div>
        <div className="mt-2 divide-y divide-slate-800">
          {!management.length && !positions.length && <p className="py-4 text-sm text-slate-400">No hay posiciones Sandbox para administrar en este momento.</p>}
          {(management.length ? management : positions).map((item) => (
            <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto]" key={item.entryId || item.id}>
              <div><p className="font-black text-white">{item.symbol} | {item.strategy}</p><p className="text-xs text-slate-400">{item.reason || `P/L ${money(item.openPnL)}`}</p></div>
              <Badge>{item.action || 'MONITORING'}</Badge>
            </div>
          ))}
        </div>
      </section>

      <section className="risk-card p-5 border border-purple-500/30 bg-slate-900 rounded-3xl text-white">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3"><div><p className="text-[11px] font-black uppercase text-purple-400">Gemini Learning Engine</p><h3 className="text-base font-black text-white">Aprendizaje Continuo de Paper Trading</h3><p className="text-xs text-slate-400">El historial ajusta el ranking de estrategias para maximizar el Win Rate antes de operar en Vivo.</p></div><Badge>{paper?.learning?.confidence || 'HIGH_PRECISION'}</Badge></div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Muestra Cerrada" value={paper?.learning?.sampleSize || 0} />
          <Metric label="Win Rate Paper" value={percent(paper?.learning?.winRate)} />
          <Metric label="P/L Realizado" value={money(paper?.learning?.realizedPnl)} />
          <Metric label="Nivel Confianza" value={paper?.learning?.confidence || 'HIGH_PRECISION'} />
        </div>
        <p className="mt-3 text-xs leading-5 text-indigo-200 font-medium bg-indigo-950/40 p-3 rounded-xl border border-indigo-500/20">{paper?.learning?.recommendation || 'Gemini evalúa continuamente el comportamiento de la volatilidad y las griegas en cada operación.'}</p>
        {Array.isArray(paper?.learning?.strategies) && paper.learning.strategies.length > 0 && (
          <div className="mt-4 border-t border-slate-800 pt-3">
            <p className="text-xs font-black uppercase text-slate-400">Rendimiento por Estrategia</p>
            <div className="mt-2 divide-y divide-slate-800">
              {paper.learning.strategies.slice(0, 6).map((strategy) => (
                <div className="grid grid-cols-2 gap-2 py-2 text-xs sm:grid-cols-5" key={strategy.strategy}>
                  <span className="col-span-2 font-black text-white sm:col-span-1">{strategy.strategy}</span>
                  <span className="text-slate-400">Trades {strategy.trades}</span>
                  <span className="text-slate-400">Cerradas {strategy.closed}</span>
                  <span className="text-slate-400">Win {percent(strategy.winRate)}</span>
                  <span className={`font-black ${pnlTone(strategy.pnl)}`}>P/L {money(strategy.pnl)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 divide-y divide-slate-800 border-t border-slate-800">
          <p className="py-3 text-xs font-black uppercase text-slate-400">Actividad Reciente del Broker</p>
          {!tracked.length && <p className="pb-3 text-sm text-slate-400">Todavía no hay órdenes paper registradas.</p>}
          {tracked.slice(0, 12).map((order) => (
            <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center" key={order.id}>
              <div className="min-w-0"><p className="font-black text-white">{order.kind} | {order.symbol} | {order.strategy}</p><p className="text-xs text-slate-400">{shortDate(order.createdAt)} | Tradier {order.brokerOrderId || 'sin id'}</p></div>
              <Badge>{order.status}</Badge>
              {/open|pending|submitted/i.test(String(order.status || '')) && order.brokerOrderId
                ? <button className="bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-xs font-bold px-3 py-1 rounded-xl transition" disabled={busy} onClick={() => onCancel(order.id)} type="button">Cancelar</button>
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
