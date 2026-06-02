import React from 'react';

const GROUPS = [
  { key: 'ready', title: '🟢 Listas para revisar', tone: 'green', statuses: ['READY', 'AGGRESSIVE', '0DTE_SCALP'] },
  { key: 'watch', title: '🟠 Vigilancia activa', tone: 'amber', statuses: ['WATCH'] },
  { key: 'blocked', title: '🔴 Evitar o completar datos', tone: 'red', statuses: ['AVOID', 'NO_DATA', 'LOCKED_BY_RISK'] },
];

function money(value) {
  return Number.isFinite(value) ? `$${value.toFixed(0)}` : 'N/D';
}

function pct(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'N/D';
}

function Signal({ signal, tone }) {
  const colors = tone === 'green'
    ? 'border-green-300 bg-green-50'
    : tone === 'amber' ? 'border-amber-300 bg-amber-50' : 'border-red-200 bg-red-50';
  return (
    <article className={`rounded-2xl border p-3 space-y-2 ${colors}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-black text-slate-900">{signal.symbol || 'Símbolo pendiente'} · {signal.strategyLabel}</p>
          <p className="text-xs text-slate-600">{signal.bias} · {signal.expiration || 'vencimiento por confirmar'} · {signal.dte ?? '?'} DTE</p>
        </div>
        <span className="pill">{signal.status}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div><span className="text-slate-500">Score</span><strong className="block">{signal.score || 'N/D'}</strong></div>
        <div><span className="text-slate-500">POP est.</span><strong className="block">{pct(signal.pop)}</strong></div>
        <div><span className="text-slate-500">Riesgo máx.</span><strong className="block">{money(signal.maxRiskUsd)}</strong></div>
      </div>
      <p className="text-xs text-slate-700">{signal.blockedReason || signal.executionPlan?.entryTrigger || signal.technicalSummary}</p>
      <p className="text-[11px] text-slate-500">Datos opciones: {signal.sourceQuality?.optionDataSource || 'N/D'} · Griegas: {signal.sourceQuality?.greeksFreshness || 'N/D'}</p>
    </article>
  );
}

export function OperationalSignals({ signals = [], compact = false }) {
  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    items: signals.filter((signal) => group.statuses.includes(signal.status)).slice(0, compact ? 2 : group.key === 'blocked' ? 5 : 8),
  })).filter((group) => group.items.length);

  return (
    <section id="signals" className="signal-card p-4 space-y-3">
      <div>
        <h2 className="text-xl font-black text-slate-900">📡 Radar de señales</h2>
        <p className="text-sm text-slate-600">Verde exige revisión final. Naranja espera gatillo. Rojo explica por qué no actuar.</p>
      </div>
      {visibleGroups.length ? visibleGroups.map((group) => (
        <div className="space-y-2" key={group.key}>
          <h3 className="text-sm font-black text-slate-800">{group.title} · {group.items.length}</h3>
          {group.items.map((signal) => <Signal key={signal.id} signal={signal} tone={group.tone} />)}
        </div>
      )) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Aún no hay tickets clasificables. Revisa el estado del scanner y espera el próximo ciclo.
        </div>
      )}
    </section>
  );
}
