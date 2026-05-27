const levels = [
  ['Nivel 1: Fundamentos', 'Call, put, bid/ask, strike, expiration y valor extrinseco.', 'Que precio usar para evitar slippage? El limite cerca del mid, revalidando liquidez.'],
  ['Nivel 2: Riesgo', 'Max risk, profit, break-even, colateral y position sizing.', 'Puede abrirse un spread sin conocer max risk? No.'],
  ['Nivel 3: Greeks', 'Delta, Gamma, Theta, Vega y Rho.', 'Que Greek vigilar mas en 0DTE? Gamma.'],
  ['Nivel 4: Volatilidad', 'IV, IV Rank, expected move, skew, term structure y crush.', 'IV alta favorece siempre vender? No; eventos y liquidez importan.'],
  ['Nivel 5: Estrategias', 'Credit/debit spreads, condors, calendars, PMCC, CSP y covered call.', 'Que regla comparten aqui? Riesgo definido o cash/acciones cubriendo.'],
  ['Nivel 6: Lectura profesional', 'VWAP, soportes, Wyckoff, GEX aproximado y Tape Lite.', 'Confirma un trade por tape solamente? No, es evidencia secundaria.'],
  ['Nivel 7: Sistema', 'Scanner, playbooks, paper trade, journal y revision semanal.', 'Cuando usar dinero real? Solo tras validacion, riesgo y disciplina.']
];

export default function LearningRoadmap({ onSimulate, onPaper }) {
  return (
    <section id="roadmap" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Ruta de aprendizaje del trader de opciones</p>
      <h2 className="mt-1 text-xl font-bold">Aprender, practicar, revisar</h2>
      <div className="mt-4 space-y-2">
        {levels.map(([title, material, quiz]) => (
          <details className="rounded-xl border border-sigma-line bg-sigma-soft p-3 text-xs" key={title}>
            <summary className="cursor-pointer font-semibold text-sigma-gold">{title}</summary>
            <p className="mt-3 text-slate-300">{material}</p>
            <p className="mt-2 rounded-lg bg-sigma-bg p-2 text-slate-400"><strong>Mini quiz:</strong> {quiz}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn text-xs" onClick={() => onSimulate?.({ symbol: 'SPY', strategy: 'Bull Put Credit Spread', underlyingPrice: 100, dte: 14 })}>Practicar en simulador</button>
              <button className="btn text-xs" onClick={() => onPaper?.({ symbol: 'SPY', strategy: 'Bull Put Credit Spread', underlyingPrice: 100, dte: 14, sourceMode: 'mock educativo' })}>Paper educativo</button>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
