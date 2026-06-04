import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

export default function RiskCommandCenter() {
  const [payload, setPayload] = useState({ positions: [] });

  useEffect(() => {
    let mounted = true;
    api.riskPositions().then((value) => mounted && setPayload(value)).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const positions = payload.positions || [];
  const critical = positions.filter((item) => item.health === 'CRITICAL_RISK').length;

  return (
    <section className="risk-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-red-700">Risk Command Center</p>
          <h2 className="text-xl font-black text-slate-950">Riesgo de posiciones</h2>
          <p className="text-sm text-slate-600">{payload.source || 'manual'} · solo lectura · sin ordenes reales</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${critical ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {critical ? `${critical} critico` : 'Controlado'}
        </span>
      </div>
      {positions.length ? positions.map((position) => (
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" key={position.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-black text-slate-950">{position.symbol} · {position.strategy}</h3>
              <p className="text-xs text-slate-500">{position.reason}</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">{position.health}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Mini label="Accion" value={position.action} />
            <Mini label="Urgencia" value={position.urgency} />
            <Mini label="P/L" value={position.currentRisk?.openPnL ?? 'N/D'} />
            <Mini label="DTE" value={position.currentRisk?.dte ?? 'N/D'} />
          </div>
          <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">{position.plan?.explanation}</p>
        </article>
      )) : (
        <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">No hay posiciones abiertas detectadas. Si Tradier no esta conectado, el sistema usa Journal/manual.</p>
      )}
    </section>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-black text-slate-900">{value}</p>
    </div>
  );
}
