const strategies = [
  ['Long Call', 'Alcista, IV baja, movimiento fuerte', 'Prima pagada', 'Theta decay'],
  ['Long Put', 'Bajista, IV baja, breakdown', 'Prima pagada', 'Theta decay'],
  ['Bull Call Debit Spread', 'Alcista IV baja/moderada', 'Debito', 'Rally insuficiente'],
  ['Bear Put Debit Spread', 'Bajista IV baja/moderada', 'Debito', 'Rebote'],
  ['Bull Put Credit Spread', 'Alcista IV alta/moderada', 'Ancho - credito', 'Caida bajo short put'],
  ['Bear Call Credit Spread', 'Bajista IV alta/moderada', 'Ancho - credito', 'Subida sobre short call'],
  ['Iron Condor', 'Lateral, IV alta, gamma estable', 'Ancho mayor - credito', 'Movimiento fuera rango'],
  ['Iron Butterfly', 'Pin/rango estrecho', 'Ancho - credito', 'Gamma alto'],
  ['Calendar Spread', 'IV term structure / rango', 'Debito', 'Movimiento/IV adversos'],
  ['Diagonal Spread', 'Swing con theta gestionada', 'Debito', 'Asignacion/IV'],
  ['PMCC', 'Largo plazo, cuenta definida', 'Debito LEAPS', 'Caida y short call'],
  ['Covered Call', 'Acciones en cartera, neutral/alcista', 'Riesgo acciones', 'Pierde upside'],
  ['Cash Secured Put', 'Comprar acciones a descuento', 'Strike*100 - prima', 'Asignacion en caida'],
  ['Protective Put', 'Cobertura', 'Prima', 'Costo seguro'],
  ['Collar', 'Proteccion con cap upside', 'Segun primas', 'Upside limitado'],
  ['Broken Wing Butterfly', 'Educativo, sesgo moderado', 'Definido', 'Estructura compleja'],
  ['Ratio Spread', 'Solo paper educativo', 'Puede ser ilimitado', 'No habilitado real'],
  ['Synthetic Long Stock', 'Solo estudio', 'Alto', 'Asignacion/margen'],
  ['Synthetic Short Stock', 'Solo estudio', 'Alto', 'Riesgo alcista'],
  ['0DTE Defined Risk Spread', 'Solo gatillo tecnico', 'Definido reducido', 'Gamma extremo']
];

export default function StrategyLibrary({ onSimulate, onPaper }) {
  return (
    <section id="library" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Biblioteca de Estrategias</p>
      <h2 className="mt-1 text-xl font-bold">20 estructuras: cuando usar y cuando evitar</h2>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {strategies.map(([name, use, risk, avoid]) => (
          <article className="rounded-xl border border-sigma-line bg-sigma-soft p-3 text-xs" key={name}>
            <h3 className="font-semibold text-sigma-gold">{name}</h3>
            <p className="mt-2 text-slate-300"><strong>Usar:</strong> {use}</p>
            <p className="mt-1 text-slate-300"><strong>Riesgo max:</strong> {risk}</p>
            <p className="mt-1 text-slate-400"><strong>Evitar:</strong> {avoid}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn text-xs" onClick={() => onSimulate?.({ strategy: name, symbol: 'SPY', underlyingPrice: 100, dte: 30 })}>Simular</button>
              <button className="btn text-xs" onClick={() => onPaper?.({ strategy: name, symbol: 'SPY', underlyingPrice: 100, dte: 30, sourceMode: 'mock educativo' })}>Paper</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
