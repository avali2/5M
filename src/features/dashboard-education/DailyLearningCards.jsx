export default function DailyLearningCards({ scan, onSimulate, onPaper }) {
  const best = scan?.opportunities?.[0] || scan?.conditionalIdeas?.find((item) => item.symbol);
  const cards = [
    ['Regimen del mercado', scan?.market?.regime || 'No disponible', 'Define que estructuras merecen estudio hoy.'],
    ['Estrategia logica', best?.strategy || 'Esperar chain valida', best ? `${best.symbol} score ${best.confidenceScore}/100.` : 'Usa paper/manual para aprender sin inventar datos.'],
    ['Riesgo principal', best?.blocks?.[0] || scan?.decision?.reasons?.[0] || 'Verifica liquidez y max risk.', 'El Risk Governor decide si sigue siendo solo practica.'],
    ['Metrica importante', best?.edge?.available ? `POP est. ${best.edge.probabilityOfProfit}% / EV $${best.edge.expectedValue}` : 'Probability Edge no disponible', 'Probabilidad estimada no es garantia.']
  ];
  return (
    <section id="today-learning" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Que debo entender hoy</p>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        {cards.map(([title, value, detail]) => <article className="rounded-xl border border-sigma-line bg-sigma-soft p-3 text-xs" key={title}><p className="eyebrow">{title}</p><p className="mt-2 font-semibold text-sigma-gold">{value}</p><p className="mt-2 text-slate-400">{detail}</p></article>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {best && <><button className="btn" onClick={() => onSimulate(best)}>Simular leccion</button><button className="btn btn-primary" onClick={() => onPaper(best)}>Paper Trade</button></>}
        <a className="btn" href="#notification-status">Estado alertas</a>
      </div>
    </section>
  );
}
