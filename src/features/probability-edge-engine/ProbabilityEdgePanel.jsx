const money = (value) => Number.isFinite(value) ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'No disponible';
const metric = (value, suffix = '') => Number.isFinite(value) ? `${value}${suffix}` : 'No disponible';

export default function ProbabilityEdgePanel({ setup, onAudit }) {
  const edge = setup?.edge;
  if (!edge?.available) {
    return (
      <div className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs text-slate-400">
        Probability & Edge: No disponible. {edge?.missing?.length ? `Falta ${edge.missing.join(', ')}.` : 'Falta chain valida con IV, DTE y Greeks.'}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-sigma-blue/25 bg-blue-500/5 p-3">
      <div className="flex justify-between gap-2">
        <p className="eyebrow text-sigma-blue">Probability & Edge Engine</p>
        <button className="text-[11px] text-sigma-gold" onClick={() => onAudit?.({ metric: 'POP / EV', setup })}>Ver fuente y formula</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Value label="POP est." value={metric(edge.probabilityOfProfit, '%')} />
        <Value label="POP liq.-adj." value={metric(edge.liquidityAdjustedProbability, '%')} />
        <Value label="EV est." value={money(edge.expectedValue)} />
        <Value label="ROC max." value={metric(edge.returnOnCapital, '%')} />
        <Value label="P. OTM est." value={metric(edge.probabilityOtm, '%')} />
        <Value label="P. ITM est." value={metric(edge.probabilityItm, '%')} />
        <Value label="Slippage est." value={money(edge.estimatedSlippage)} />
        <Value label="R/R max." value={metric(edge.riskReward, 'x')} />
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">{edge.disclaimer} Modelo: {edge.model}.</p>
    </div>
  );
}

function Value({ label, value }) {
  return <div className="rounded-lg bg-sigma-soft p-2"><p className="eyebrow">{label}</p><p className="mt-1 font-mono text-xs text-slate-100">{value}</p></div>;
}
