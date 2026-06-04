import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

export default function NoGreenTodayPanel({ scan }) {
  const [diagnostics, setDiagnostics] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.scanDiagnostics().then((value) => mounted && setDiagnostics(value)).catch(() => {});
    return () => { mounted = false; };
  }, [scan?.asOf]);

  const ready = diagnostics?.readyGreen ?? scan?.opportunities?.filter((item) => item.status === 'READY_GREEN').length ?? 0;
  const reasons = diagnostics?.topRejectionReasons || [];

  return (
    <section className="risk-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Scanner Command Center</p>
          <h2 className="text-xl font-black text-slate-950">Por que no hubo verde hoy</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          {ready ? `${ready} READY_GREEN` : 'Sin verde'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Mini label="Simbolos" value={diagnostics?.symbolsScanned ?? scan?.collection?.scannedSymbols ?? 'N/D'} />
        <Mini label="Candidatos" value={diagnostics?.candidatesEvaluated ?? (scan?.rejected?.length || 0)} />
        <Mini label="Ultimo scan" value={diagnostics?.lastScan ? new Date(diagnostics.lastScan).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'N/D'} />
      </div>
      {reasons.length ? (
        <div className="space-y-2">
          {reasons.slice(0, 5).map((item, index) => (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700" key={`${item.reason}-${index}`}>
              <strong>{index + 1}. {item.count}x</strong> {item.reason}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">Esperando diagnostico del backend.</p>
      )}
      <p className="text-xs leading-5 text-slate-500">{diagnostics?.nextPossibleWindow || 'Proxima ventana: cuando datos criticos, liquidez, riesgo y contexto esten alineados.'}</p>
    </section>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
