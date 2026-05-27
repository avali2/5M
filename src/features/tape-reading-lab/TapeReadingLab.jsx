function clamp(value) { return Math.max(-100, Math.min(100, Math.round(value))); }

export default function TapeReadingLab({ scan }) {
  const spy = scan?.market?.quotes?.find((quote) => quote.symbol === 'SPY');
  const technical = scan?.market?.technicals?.SPY;
  const available = Number.isFinite(spy?.price) && Number.isFinite(technical?.vwap20);
  const vwapReaction = available ? clamp(((spy.price - technical.vwap20) / technical.vwap20) * 2000) : null;
  const volumeSurge = Number.isFinite(technical?.relativeVolume20) ? clamp((technical.relativeVolume20 - 1) * 50) : null;
  const pressure = available ? clamp((vwapReaction + (volumeSurge || 0)) / 2) : null;
  const label = pressure === null ? 'Low Confidence' : pressure > 25 ? 'Bullish Tape' : pressure < -25 ? 'Bearish Tape' : 'Neutral / Choppy Tape';
  return (
    <section id="tape-lab" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Tape Reading Lab</p>
      <h2 className="mt-1 text-xl font-bold">Confirmacion secundaria, no senal unica</h2>
      <p className="mt-2 rounded-lg bg-amber-500/10 p-3 text-xs text-sigma-amber">Modo Tape Reading Lite: no hay profundidad completa de mercado ni Level 2/OPRA configurado. Bid/ask hits, absorcion y sweeps quedan No disponible.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric label="Tape Pressure" value={pressure} />
        <Metric label="Aggression" value={null} />
        <Metric label="Absorption" value={null} />
        <Metric label="VWAP Reaction" value={vwapReaction} />
        <Metric label="Volume Surge" value={volumeSurge} />
      </div>
      <p className="mt-3 text-sm font-semibold text-sigma-gold">Lectura: {label}</p>
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-lg bg-sigma-soft p-3 text-xs"><p className="eyebrow">{label}</p><p className="mt-1 font-mono">{value === null ? 'No disponible' : `${value > 0 ? '+' : ''}${value}`}</p></div>;
}
