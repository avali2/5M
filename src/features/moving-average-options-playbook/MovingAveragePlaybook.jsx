const setups = [
  ['EMA Trend Bull Put Spread', 'Precio sobre SMA 200, EMA 8 > 21 > 50, pullback VWAP/EMA21, IV alta/moderada.', 'Take profit 40-60% credito; invalidar si pierde soporte.'],
  ['EMA Trend Call Debit Spread', 'Ruptura resistencia, VWAP reclaim, MACD positivo, IV baja/moderada.', 'Definir debito maximo y stop tecnico.'],
  ['EMA Rejection Bear Call Spread', 'Bajo VWAP, EMA 8 < 21, rechazo resistencia, RSI falla bajo 50.', 'Cubrir si recupera resistencia.'],
  ['Put Debit Spread Breakdown', 'Pierde soporte/VWAP con volumen vendedor e IV no extrema.', 'Riesgo limitado al debito.'],
  ['Iron Condor Mercado Lateral', 'Cerca VWAP, EMAs mezcladas, ATR bajando, IV moderada/alta.', 'Short strikes fuera expected move.'],
  ['No Trade Setup', 'Evento macro, chain iliquida, tape choppy o datos criticos faltantes.', 'Usar paper para estudiar, no capital real.']
];

export default function MovingAveragePlaybook({ scan }) {
  const spy = scan?.market?.technicals?.SPY || {};
  return (
    <section id="moving-averages" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Medias Moviles para Opciones</p>
      <h2 className="mt-1 text-xl font-bold">Contexto diario y gatillos de entrada</h2>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {[['EMA 8', spy.ema8], ['EMA 21', spy.ema21], ['EMA 50', spy.ema50], ['SMA/EMA 200', spy.ema200], ['VWAP proxy', spy.vwap20]].map(([key, value]) => <Metric label={key} value={Number.isFinite(value) ? value.toFixed(2) : 'No disponible'} key={key} />)}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Timeframes deseados: 1D contexto, 1H estructura, 15M setup, 5M entrada; el feed actual marca VWAP intradia como no disponible hasta conectar barras intradia.</p>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {setups.map(([name, condition, exit]) => <article className="rounded-lg bg-sigma-soft p-3 text-xs" key={name}><h3 className="font-semibold text-sigma-gold">{name}</h3><p className="mt-2 text-slate-300">{condition}</p><p className="mt-2 text-slate-400">{exit}</p></article>)}
      </div>
      <p className="mt-4 rounded-lg bg-blue-500/10 p-3 text-xs text-slate-300">Decision tree: alcista + IV alta = Bull Put; alcista + IV baja = Call Debit; bajista + IV alta = Bear Call; lateral + IV alta = Iron Condor; choppy + evento = Paper / no real.</p>
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-lg bg-sigma-soft p-2 text-xs"><p className="eyebrow">{label}</p><p className="mt-1 font-mono">{value}</p></div>;
}
