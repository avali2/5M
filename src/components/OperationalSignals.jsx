import React, { useState } from 'react';
import InfoTooltip from './InfoTooltip';

const GROUPS = [
  { key: 'ready', title: 'Listas para implementar', tone: 'green', statuses: ['READY', 'AGGRESSIVE', '0DTE_SCALP'] },
  { key: 'watch', title: 'Vigilancia activa', tone: 'amber', statuses: ['WATCH', 'NO_DATA'] }
];

function money(value) { return Number.isFinite(Number(value)) ? `$${Number(value).toFixed(0)}` : 'SIN DATOS'; }
function decimal(value, digits = 2) { return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : 'SIN DATOS'; }
function pct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'SIN DATOS';
  return `${Math.round((number > 1 ? number : number * 100))}%`;
}
function Help({ text }) { return <InfoTooltip explanation={text} position="bottom" />; }
function shortLeg(signal) { return signal.legs?.find((leg) => leg.side === 'SELL') || signal.legs?.[0] || {}; }
function longLeg(signal) { return signal.legs?.find((leg) => leg.side === 'BUY') || signal.legs?.[1] || {}; }
function watchedStrikes(signal) {
  if (signal.legs?.length) return signal.legs.map((leg) => `${leg.side} ${leg.optionType || leg.type} ${leg.strike}`).join(' / ');
  return signal.strikes || 'SIN DATOS';
}
function spreadWidth(signal) {
  const strikes = (signal.legs || []).map((leg) => Number(leg.strike)).filter(Number.isFinite);
  if (strikes.length < 2) return 'SIN DATOS';
  return decimal(Math.max(...strikes) - Math.min(...strikes), 0);
}
function statusLabel(status) {
  if (['READY', 'AGGRESSIVE', '0DTE_SCALP'].includes(status)) return 'READY';
  if (status === 'WATCH') return 'WATCH';
  if (status === 'NO_DATA') return 'NO DATA';
  return 'BLOCKED';
}

function Signal({ signal, tone, onAccept, taken }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const sellLeg = shortLeg(signal);
  const buyLeg = longLeg(signal);
  const colors = tone === 'green'
    ? 'border-green-300 bg-green-50'
    : tone === 'amber'
      ? 'border-amber-300 bg-amber-50'
      : 'border-slate-300 bg-slate-100';
  async function accept() {
    setSaving(true);
    try {
      await onAccept(signal);
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className={`rounded-2xl border p-3 space-y-3 text-slate-900 ${colors}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-black">
            {signal.symbol || 'SIN DATOS'} {signal.strategyLabel || signal.strategy}
            <Help text="Ticket operativo calculado por el scanner. No envia ordenes reales." />
          </p>
          <p className="text-xs text-slate-700">
            Direccion: {signal.bias || 'neutral'} · Exp: {signal.expiration || 'SIN DATOS'} · {signal.dte ?? 'SIN DATOS'} DTE
          </p>
        </div>
        <span className="pill">{statusLabel(signal.status)}</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <p className="font-black text-slate-900">Vigilando: {watchedStrikes(signal)}</p>
        <p className="mt-1 text-slate-700">
          Short strike: {sellLeg.strike ?? 'SIN DATOS'} · Long strike: {buyLeg.strike ?? 'SIN DATOS'} · Ancho: {spreadWidth(signal)}
        </p>
        <p className="mt-1 text-slate-700">
          Delta short: {decimal(sellLeg.delta)} · Prob. beneficio: {pct(signal.pop)} · {signal.credit ? 'Credito' : 'Debito'} objetivo: {decimal(signal.credit ?? signal.debit)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Metric label="Score" value={signal.score ?? 'SIN DATOS'} help="Puntuacion combinada de tendencia, liquidez, opciones, noticias, earnings y riesgo." />
        <Metric label="Prob. ganadora" value={pct(signal.pop)} help="Probabilidad estimada de beneficio. No garantiza resultado; ayuda a comparar calidad del setup." />
        <Metric label="Max risk" value={money(signal.maxRiskUsd)} help="Perdida maxima estimada. Debe existir para estar READY." />
        <Metric label="Max profit" value={money(signal.maxProfitUsd)} help="Ganancia maxima teorica estimada por estructura." />
      </div>

      <p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-semibold text-violet-900">
        Gemini Guardian: {signal.geminiCoach?.decision?.toUpperCase?.() || (tone === 'green' ? 'APROBADA' : tone === 'amber' ? 'WATCH' : 'RECHAZADA')} · {signal.geminiCoach?.summary || signal.blockedReason || signal.technicalSummary || 'Revisar datos reales antes de decidir.'}
      </p>

      <button type="button" className="text-xs font-black text-blue-700" onClick={() => setOpen(!open)}>
        {open ? 'Ocultar detalle' : 'Ver griegas, volumen, earnings y plan'}
      </button>
      {open && (
        <div className="rounded-xl border border-slate-300 bg-white p-3 text-xs space-y-1">
          <p><strong>IV:</strong> {decimal(sellLeg.iv)} · <strong>Volumen:</strong> {sellLeg.volume ?? 'SIN DATOS'} · <strong>Open interest:</strong> {sellLeg.openInterest ?? 'SIN DATOS'}</p>
          <p><strong>Gamma:</strong> {decimal(sellLeg.gamma)} · <strong>Theta:</strong> {decimal(sellLeg.theta)} · <strong>Vega:</strong> {decimal(sellLeg.vega)}</p>
          <p><strong>Entrada:</strong> {signal.executionPlan?.entryTrigger || 'Orden limite solo si la cadena sigue valida.'}</p>
          <p><strong>Take profit:</strong> {signal.executionPlan?.takeProfit || 'Definir antes de entrar.'}</p>
          <p><strong>Stop / invalida:</strong> {signal.executionPlan?.stopLoss || signal.blockedReason || 'Si cambia tendencia, liquidez, macro, earnings o precio del spread.'}</p>
          <p><strong>Noticias/Earnings:</strong> {signal.newsSummary || 'Sin noticias significativas disponibles.'} · {signal.macroSummary || 'Macro sin dato.'}</p>
          <p><strong>Fuente:</strong> Mercado {signal.sourceQuality?.marketDataSource || 'SIN DATOS'} · Opciones {signal.sourceQuality?.optionDataSource || 'SIN DATOS'}</p>
        </div>
      )}

      {tone !== 'red' && (
        <button className="secondary-button w-full" type="button" disabled={taken || saving} onClick={accept}>
          {taken ? 'Registrada en Journal' : saving ? 'Guardando...' : 'Tome esta señal: registrar en Journal'}
        </button>
      )}
    </article>
  );
}

function Metric({ label, value, help }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <p className="text-[11px] font-bold text-slate-600">{label}<Help text={help} /></p>
      <strong className="mt-1 block text-slate-900">{value}</strong>
    </div>
  );
}

export function OperationalSignals({ signals = [], compact = false, onAccept = () => {}, takenSignalIds = [] }) {
  const taken = new Set(takenSignalIds);
  const visibleGroups = GROUPS
    .map((group) => ({
      ...group,
      items: signals.filter((signal) => group.statuses.includes(signal.status)).slice(0, compact ? 2 : group.key === 'blocked' ? 5 : 8)
    }))
    .filter((group) => group.items.length);
  return (
    <section id="signals" className="signal-card p-4 space-y-3">
      <div>
        <h2 className="text-xl font-black text-slate-900">Radar de señales <Help text="Solo READY puede activar push. WATCH no es entrada implementable todavia." /></h2>
        <p className="text-sm text-slate-700">Verde exige strikes, vencimiento, riesgo maximo, plan de salida, liquidez, probabilidad y revision Gemini. Lo que Gemini descarta se oculta.</p>
      </div>
      {visibleGroups.length ? visibleGroups.map((group) => (
        <div className="space-y-2" key={group.key}>
          <h3 className="text-sm font-black text-slate-900">{group.title} · {group.items.length}</h3>
          {group.items.map((signal) => (
            <Signal key={signal.id} signal={signal} tone={group.tone} onAccept={onAccept} taken={taken.has(signal.id)} />
          ))}
        </div>
      )) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-sm text-slate-900">
          Aun no hay tickets clasificables. Si faltan datos, Gemini debe decir NO DATA y explicar que cadena, liquidez, noticias o earnings faltan.
        </div>
      )}
    </section>
  );
}
