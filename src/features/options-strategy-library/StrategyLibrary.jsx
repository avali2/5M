import { STRATEGY_CATALOG } from '../../data/strategyCatalog.js';

const tierTone = (tier) => {
  if (tier === 'CORE_DEFINED_RISK') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (tier === 'INCOME_STOCK_BASED') return 'border-blue-200 bg-blue-50 text-blue-900';
  if (tier === 'ADVANCED_DEFINED_RISK') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (tier === 'BLOCKED_UNDEFINED_RISK') return 'border-red-200 bg-red-50 text-red-900';
  return 'border-slate-200 bg-slate-50 text-slate-800';
};

export default function StrategyLibrary({ onSimulate, onPaper }) {
  return (
    <section id="library" className="panel scroll-mt-24 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-sigma-blue">Biblioteca de Estrategias</p>
          <h2 className="mt-1 text-xl font-bold">Catalogo completo: READY, paper y bloqueadas</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
            La app puede estudiar muchas estructuras, pero solo marca READY las que pasen datos, riesgo definido, liquidez, macro/news y auditoria Guardian. Naked/undefined risk quedan bloqueadas.
          </p>
        </div>
        <span className="status-chip">{STRATEGY_CATALOG.length} estrategias</span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {STRATEGY_CATALOG.map((item) => (
          <article className={`rounded-xl border p-3 text-xs ${tierTone(item.tier)}`} key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-black">{item.name}</h3>
              <span className="rounded-full bg-white/75 px-2 py-1 text-[10px] font-bold">{item.readyLabel}</span>
            </div>
            <p className="mt-2"><strong>Descripcion:</strong> {item.description}</p>
            <p className="mt-1"><strong>Usar:</strong> {item.whenToUse}</p>
            <p className="mt-1"><strong>Gestion:</strong> {item.management}</p>
            <p className="mt-1"><strong>Sesgo:</strong> {item.preferredBias.join(', ')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn text-xs" onClick={() => onSimulate?.({ strategy: item.name, symbol: 'SPY', underlyingPrice: 100, dte: 30, sourceMode: 'educativo' })}>Simular</button>
              <button className="btn text-xs" onClick={() => onPaper?.({ strategy: item.name, symbol: 'SPY', underlyingPrice: 100, dte: 30, sourceMode: 'paper educativo' })}>Paper</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
