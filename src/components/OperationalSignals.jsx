import React, { useState } from 'react';
import InfoTooltip from './InfoTooltip';

const GROUPS = [
  { key: 'ready', title: '🟢 Listas para revisar', tone: 'green', statuses: ['READY', 'AGGRESSIVE', '0DTE_SCALP'] },
  { key: 'watch', title: '🟠 Vigilancia activa', tone: 'amber', statuses: ['WATCH'] },
  { key: 'blocked', title: '🔴 Evitar o completar datos', tone: 'red', statuses: ['AVOID', 'NO_DATA', 'LOCKED_BY_RISK'] },
];
function money(value) { return Number.isFinite(value) ? `$${value.toFixed(0)}` : 'N/D'; }
function pct(value) { return Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'N/D'; }
function Help({ text }) { return <InfoTooltip explanation={text} position="bottom" />; }
function strongestLeg(signal) { return signal.legs?.find((leg) => leg.side === 'SELL') || signal.legs?.[0] || {}; }

function Signal({ signal, tone, onAccept }) {
  const [open, setOpen] = useState(false);
  const leg = strongestLeg(signal);
  const colors = tone === 'green' ? 'border-green-300 bg-green-50' : tone === 'amber' ? 'border-amber-300 bg-amber-50' : 'border-red-200 bg-red-50';
  return <article className={`rounded-2xl border p-3 space-y-2 text-slate-900 ${colors}`}>
    <div className="flex items-start justify-between gap-2"><div><p className="font-black">{signal.symbol || 'Símbolo pendiente'} <Help text="Ticker del activo que está revisando el scanner." /> · {signal.strategyLabel}</p><p className="text-xs text-slate-700">{signal.bias} · {signal.expiration || 'vencimiento por confirmar'} · {signal.dte ?? '?'} DTE</p></div><span className="pill">{signal.status}</span></div>
    <div className="grid grid-cols-3 gap-2 text-xs">
      <div><span>Score <Help text="Puntuación del motor por tendencia, liquidez, volatilidad, noticias y riesgo." /></span><strong className="block">{signal.score || 'N/D'}</strong></div>
      <div><span>POP est. <Help text="Probabilidad estimada por modelo. No garantiza resultado." /></span><strong className="block">{pct(signal.pop)}</strong></div>
      <div><span>Riesgo máx. <Help text="Pérdida contractual máxima estimada para la estructura." /></span><strong className="block">{money(signal.maxRiskUsd)}</strong></div>
    </div>
    <p className="text-xs font-semibold">{signal.blockedReason || signal.executionPlan?.entryTrigger || signal.technicalSummary}</p>
    <button className="text-xs font-black text-blue-700" onClick={() => setOpen(!open)}>{open ? 'Ocultar datos' : 'Ver griegas, volumen y motivo'}</button>
    {open && <div className="rounded-xl border border-slate-300 bg-white p-2 text-xs space-y-1">
      <p><strong>Tendencia:</strong> {signal.technicalSummary}</p>
      <p><strong>Delta:</strong> {leg.delta ?? 'N/D'} · <strong>Gamma:</strong> {leg.gamma ?? 'N/D'} · <strong>Theta:</strong> {leg.theta ?? 'N/D'} · <strong>Vega:</strong> {leg.vega ?? 'N/D'}</p>
      <p><strong>IV:</strong> {leg.iv ?? 'N/D'} · <strong>Volumen:</strong> {leg.volume ?? 'N/D'} · <strong>Open interest:</strong> {leg.openInterest ?? 'N/D'}</p>
      <p><strong>Noticias:</strong> {signal.newsSummary} · <strong>Macro:</strong> {signal.macroSummary}</p>
      <p><strong>Por qué esperar:</strong> {signal.geminiCoach?.summary || signal.blockedReason || 'Confirma gatillo, bid/ask, riesgo y noticias antes de actuar.'}</p>
    </div>}
    {tone !== 'red' && <button className="secondary-button w-full" onClick={() => onAccept(signal)}>✅ Tomé esta señal: registrar en Journal</button>}
  </article>;
}

export function OperationalSignals({ signals = [], compact = false, onAccept = () => {} }) {
  const visibleGroups = GROUPS.map((group) => ({ ...group, items: signals.filter((signal) => group.statuses.includes(signal.status)).slice(0, compact ? 2 : group.key === 'blocked' ? 5 : 8) })).filter((group) => group.items.length);
  return <section id="signals" className="signal-card p-4 space-y-3">
    <div><h2 className="text-xl font-black text-slate-900">📡 Radar de señales <Help text="Clasificación operativa del scanner. Ninguna tarjeta ejecuta operaciones automáticamente." /></h2><p className="text-sm text-slate-700">Verde exige revisión final. Naranja espera gatillo. Rojo explica por qué no actuar.</p></div>
    {visibleGroups.length ? visibleGroups.map((group) => <div className="space-y-2" key={group.key}><h3 className="text-sm font-black text-slate-900">{group.title} · {group.items.length}</h3>{group.items.map((signal) => <Signal key={signal.id} signal={signal} tone={group.tone} onAccept={onAccept} />)}</div>) : <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-sm text-slate-900">Aún no hay tickets clasificables. Revisa el estado del scanner y espera el próximo ciclo.</div>}
  </section>;
}
