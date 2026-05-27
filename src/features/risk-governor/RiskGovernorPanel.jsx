export default function RiskGovernorPanel({ scan }) {
  const profile = scan?.profile;
  const best = scan?.opportunities?.[0] || scan?.conditionalIdeas?.find((idea) => idea.symbol);
  const governor = best?.riskGovernor;
  if (!profile) return null;
  const rules = [
    ['No naked options', true],
    ['Chain valida para operacion real', Boolean(best?.edge?.available)],
    ['Riesgo dentro del limite', !governor?.blocks?.some((block) => /Riesgo|Colateral/i.test(block))],
    ['Sin evento macro bloqueante', !governor?.blocks?.some((block) => /macro|evento/i.test(block))],
    ['0DTE confirmado', best?.dte !== 0 || profile.allow0Dte],
    ['Cooling-off libre', (profile.consecutiveDailyLosses || 0) < 2]
  ];
  return (
    <section id="governor" className="panel scroll-mt-24 p-4">
      <p className="eyebrow">Risk Governor</p>
      <h3 className="mt-1 text-lg font-semibold">{governor?.allowedReal ? 'Operacion real elegible para revision humana' : 'Real bloqueado; paper disponible'}</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rules.map(([label, pass]) => <div className="flex justify-between rounded-lg bg-sigma-soft p-2 text-xs" key={label}><span>{label}</span><strong className={pass ? 'text-sigma-green' : 'text-sigma-red'}>{pass ? 'PASS' : 'BLOCK'}</strong></div>)}
      </div>
      {!!governor?.blocks?.length && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs leading-5 text-sigma-red">{governor.blocks.join(' | ')}</p>}
      <p className="mt-3 text-xs text-slate-400">Nunca envia ordenes. El broker y tu confirmacion final siguen siendo obligatorios.</p>
    </section>
  );
}
