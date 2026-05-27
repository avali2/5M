export default function OptionsFlowLite({ scan }) {
  const setups = [...(scan?.opportunities || []), ...(scan?.conditionalIdeas || [])].filter((item) => item.legs);
  const contracts = setups.flatMap((setup) => setup.legs.map((leg) => ({ ...leg, symbol: setup.symbol })));
  const unusual = contracts.filter((leg) => Number(leg.volume) > Number(leg.openInterest) && Number(leg.volume) > 0);
  const oi = contracts.filter((leg) => Number.isFinite(Number(leg.openInterest))).sort((a, b) => Number(b.openInterest) - Number(a.openInterest)).slice(0, 5);
  return (
    <section id="options-flow" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Options Flow Lite</p>
      <h2 className="mt-1 text-xl font-bold">Actividad de cadena, no flujo institucional confirmado</h2>
      <p className="mt-2 text-xs text-slate-400">Detecta volumen mayor que OI y concentracion OI solo en contratos usados por planes construidos. Sin OPRA/trade conditions no identifica compra/venta definitiva.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-sigma-line p-3">
          <h3 className="font-semibold">Unusual volume &gt; OI</h3>
          {unusual.length ? unusual.slice(0, 8).map((leg) => <Row key={`${leg.symbol}-${leg.type}-${leg.strike}`} text={`${leg.symbol} ${leg.type} ${leg.strike}`} value={`Vol ${leg.volume} / OI ${leg.openInterest}`} />) : <p className="mt-3 text-xs text-slate-400">No disponible o no detectado en planes actuales.</p>}
        </div>
        <div className="rounded-xl border border-sigma-line p-3">
          <h3 className="font-semibold">High OI / possible walls</h3>
          {oi.length ? oi.map((leg) => <Row key={`${leg.symbol}-${leg.type}-${leg.strike}`} text={`${leg.symbol} ${leg.type} ${leg.strike}`} value={`OI ${leg.openInterest}`} />) : <p className="mt-3 text-xs text-slate-400">No disponible: falta chain.</p>}
        </div>
      </div>
    </section>
  );
}
function Row({ text, value }) {
  return <div className="mt-2 flex justify-between rounded-lg bg-sigma-soft p-2 text-xs"><span>{text}</span><strong className="text-sigma-gold">{value}</strong></div>;
}
