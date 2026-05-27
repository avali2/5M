import ProbabilityEdgePanel from '../probability-edge-engine/ProbabilityEdgePanel.jsx';

const money = (value) => Number.isFinite(value) ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'No disponible';
const number = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits) : 'No disponible';
const classTone = (classification) => classification === 'Trade Validado' ? 'text-sigma-green'
  : classification === 'Trade Condicional' ? 'text-sigma-blue'
    : 'text-sigma-amber';

export default function ProSignals({ scan, onSimulate, onPaper, onAudit, onAiExplain }) {
  const ideas = [...(scan?.opportunities || []), ...(scan?.conditionalIdeas || []).filter((idea) => idea.symbol)];
  return (
    <section id="pro-signals" className="panel scroll-mt-24 p-4 md:p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="eyebrow text-sigma-blue">Senales Pro</p>
          <h2 className="mt-1 text-xl font-bold">Planes verificables, no ordenes automaticas</h2>
          <p className="mt-2 text-xs text-slate-400">Cada plan sale de cadena disponible, scoring, edge y Risk Governor. Si falla una validacion, queda solo condicional o paper.</p>
        </div>
        <span className="status-chip">{scan?.opportunities?.length ? 'VALIDADAS DISPONIBLES' : 'PRACTICA / CONDICIONAL'}</span>
      </div>
      <div className="mt-4 space-y-4">
        {ideas.length ? ideas.slice(0, 8).map((setup, index) => (
          <article className="rounded-xl border border-sigma-line bg-sigma-elevated p-4" key={`${setup.educationBias || index}-${setup.symbol}-${setup.strategy}`}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="eyebrow">{setup.educationBias ? `Escenario ${setup.educationBias}` : `Top setup #${index + 1}`}</p>
                <h3 className="mt-1 text-lg font-bold">{setup.symbol} <span className="text-sigma-gold">{setup.strategy}</span></h3>
                <p className={`mt-1 text-xs font-bold ${classTone(setup.classification)}`}>{setup.classification || 'Trade Condicional'} | Score {setup.tradeQualityScore ?? setup.confidenceScore}/100</p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>Exp {setup.expiration || 'No disponible'} | {setup.dte ?? '--'} DTE</p>
                <p>Fuente: chain server-side | {scan?.marketDataMode || 'live'} | {new Date(scan.asOf).toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <Mini label="Strikes" value={(setup.legs || []).map((leg) => leg.strike).join(' / ') || 'No disponible'} />
              <Mini label="Credito/Debito" value={money(setup.credit ?? setup.debit)} />
              <Mini label="Max risk" value={money(setup.maxRisk)} />
              <Mini label="Max profit" value={money(setup.maxProfit)} />
              <Mini label="IV Rank" value={number(setup.ivRank)} />
              <Mini label="Expected move" value={money(setup.expectedMove)} />
              <Mini label="Gamma" value={setup.gammaRisk || 'No disponible'} />
            </div>
            <div className="mt-3"><ProbabilityEdgePanel setup={setup} onAudit={onAudit} /></div>
            {!!setup.riskGovernor?.blocks?.length && (
              <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-sigma-amber">
                <strong>No Trade Real:</strong> {setup.riskGovernor.blocks.join(' | ')}
              </div>
            )}
            {!!setup.activationRules?.length && (
              <div className="mt-3 text-xs leading-5 text-slate-300">
                {setup.activationRules.map((rule) => <p key={rule}>- {rule}</p>)}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn" onClick={() => onAudit?.({ metric: 'Signal', setup })}>Ver calculo / fuente</button>
              <button className="btn" onClick={() => onSimulate(setup)}>Simular</button>
              <button className="btn btn-primary" onClick={() => onPaper(setup)}>Paper Trade</button>
              <button className="btn" onClick={() => onAiExplain?.(setup)}>Explicar con IA</button>
            </div>
          </article>
        )) : <p className="rounded-lg border border-dashed border-sigma-line p-5 text-sm text-slate-400">No existe chain valida para construir strikes. Conecta Tradier o practica en Paper Trading con datos manuales marcados como educativos.</p>}
      </div>
    </section>
  );
}

function Mini({ label, value }) {
  return <div className="rounded-lg bg-sigma-soft p-2"><p className="eyebrow">{label}</p><p className="mt-1 break-words font-mono text-[11px] text-slate-100">{value}</p></div>;
}
