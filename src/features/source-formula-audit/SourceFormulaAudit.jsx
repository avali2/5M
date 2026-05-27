const formulas = {
  'POP / EV': [
    'Option chain con Greeks, IV, DTE, break-even y primas.',
    'POP combina proxy Delta y probabilidad lognormal hasta break-even; EV = POP * max profit - (1 - POP) * max risk - slippage.',
    'No modela gaps, cambios abruptos de IV ni fills garantizados.'
  ],
  Signal: [
    'Quotes, history, options chain, calendario y noticias obtenidos server-side.',
    'Score = liquidez 20 + tecnico 15 + IV 15 + POP 15 + EV 10 + eventos 10 + GEX/flow 10 + riesgo 5.',
    'Una buena puntuacion no garantiza resultado; Risk Governor puede bloquearla.'
  ],
  'Max Risk': [
    'Primas y strikes de la estrategia.',
    'Credit spread = (ancho - credito) * 100; debit spread = debito * 100; condor = (ancho mayor - credito) * 100.',
    'Asignacion, fees extra y slippage pueden alterar resultado.'
  ]
};

export default function SourceFormulaAudit({ item, onClose }) {
  if (!item) return null;
  const lines = formulas[item.metric] || formulas.Signal;
  const setup = item.setup;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={onClose}>
      <section className="panel max-h-[90vh] w-full max-w-2xl overflow-auto p-5" onMouseDown={(event) => event.stopPropagation()}>
        <button className="float-right text-slate-400" onClick={onClose}>X</button>
        <p className="eyebrow text-sigma-blue">Source & Formula Audit</p>
        <h2 className="mt-2 text-xl font-bold">{item.metric}{setup ? ` - ${setup.symbol} ${setup.strategy}` : ''}</h2>
        <div className="mt-4 space-y-2 text-sm text-slate-300">
          <p><strong>Dato usado:</strong> {lines[0]}</p>
          <p><strong>Formula / modelo:</strong> {lines[1]}</p>
          <p><strong>Limitacion:</strong> {lines[2]}</p>
          {setup && <p><strong>Timestamp:</strong> {setup.edge?.timestamp || 'No disponible'} | <strong>Modo:</strong> server-side chain / estimado por codigo.</p>}
          {setup?.edge?.inputs && <pre className="overflow-auto rounded-lg bg-sigma-soft p-3 text-xs">{JSON.stringify(setup.edge.inputs, null, 2)}</pre>}
        </div>
        <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-xs text-sigma-amber">Estos calculos son deterministas y educativos; no son una promesa de rentabilidad ni una orden.</p>
      </section>
    </div>
  );
}
