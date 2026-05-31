export function SignalCard({ signal }) {
  if (!signal) return null;
  const isApproved = signal.geminiApproved && signal.rating !== "NO_TRADE";

  return (
    <article className={`signal-card p-4 space-y-4 ${isApproved ? "good-glow" : "warning-glow"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400 font-black">SEÑAL DE OPCIONES</p>
          <h2 className="text-xl font-black text-white">
            {isApproved ? "✅" : "👀"} {signal.symbol} · {signal.strategyType?.replaceAll("_", " ") || signal.strategy}
          </h2>
          <p className="text-sm text-slate-300 mt-1">{signal.thesis || signal.geminiSummary}</p>
        </div>
        <span className="pill">{signal.rating}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Expiracion" value={`${signal.expiration} · ${signal.dte}DTE`} />
        <Metric label="Entrada" value={signal.entry?.decision?.replaceAll("_", " ") || signal.entryDecision || "WATCH"} />
        <Metric label="Riesgo max" value={`$${signal.risk?.maxRisk ?? signal.maxRisk ?? "?"}`} />
        <Metric label="Ganancia max" value={signal.risk?.maxProfit == null ? "Variable" : `$${signal.risk.maxProfit}`} />
        <Metric label="POP" value={signal.risk?.popEstimate == null ? "N/D" : `${signal.risk.popEstimate}%`} />
        <Metric label="Score" value={`${signal.entry?.timingScore ?? signal.score ?? 0}`} />
      </div>

      {signal.greeks && (
        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
          <p className="text-xs text-slate-400 font-black mb-2">Greeks</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Greek label="Δ" value={signal.greeks.netDelta} />
            <Greek label="Θ" value={signal.greeks.netTheta} />
            <Greek label="V" value={signal.greeks.netVega} />
            <Greek label="Γ" value={signal.greeks.netGamma} />
          </div>
        </div>
      )}

      {signal.management && (
        <div className="rounded-2xl bg-blue-500/10 border border-blue-400/20 p-3">
          <p className="text-xs text-blue-300 font-black">Plan de gestion</p>
          <ul className="text-sm text-slate-200 mt-2 space-y-1">
            <li>TP: {signal.management.takeProfit}</li>
            <li>Stop: {signal.management.stopLoss}</li>
            <li>Time stop: {signal.management.timeStop}</li>
            <li>Invalida: {signal.management.invalidation}</li>
          </ul>
        </div>
      )}

      <div className="rounded-2xl bg-violet-500/10 border border-violet-400/20 p-3">
        <p className="text-xs text-violet-300 font-black">Gemini</p>
        <p className="text-sm text-slate-200 mt-1">{signal.geminiSummary || "Pendiente de revision."}</p>
        {signal.education && <p className="text-xs text-violet-200 mt-2">{signal.education}</p>}
      </div>
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
      <p className="text-xs text-slate-400 font-bold">{label}</p>
      <p className="text-sm text-white font-black mt-1">{value}</p>
    </div>
  );
}

function Greek({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-white font-black">{value == null ? "N/D" : Number(value).toFixed(2)}</p>
    </div>
  );
}