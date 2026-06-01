import React, { useEffect, useState } from 'react';
import InfoTooltip from './InfoTooltip';

export default function MarketSentiment() {
  const [sentiment, setSentiment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSentiment();
    const interval = setInterval(fetchSentiment, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchSentiment = async () => {
    try {
      const res = await fetch('/api/guardian/scan?symbols=SPY,VIX,QQQ');
      const data = await res.json();
      const spyResult = data.results?.find(r => r.symbol === 'SPY');
      const vixResult = data.results?.find(r => r.symbol === 'VIX');

      if (spyResult) {
        const technicals = spyResult.technicals;
        const wyckoff = spyResult.wyckoff;
        const tape = spyResult.tape;

        let overall = 'NEUTRAL';
        let score = 50;
        if (technicals.trend === 'BULL_TREND' && wyckoff.bias === 'BULLISH') { overall = 'BULLISH'; score = 75; }
        else if (technicals.trend === 'BEAR_TREND' && wyckoff.bias === 'BEARISH') { overall = 'BEARISH'; score = 25; }
        else if (technicals.trend === 'RANGE') { overall = 'RANGE'; score = 50; }

        setSentiment({
          overall, score,
          vix: vixResult?.quote?.price || 'N/A',
          spyChange: spyResult.quote?.changePct || 0,
          technicals: { ema9: technicals.ema9, rsi: technicals.rsi14, vwapBias: technicals.vwapBias },
          tapePressure: tape ? `${tape.buyPressure}% compra / ${tape.sellPressure}% venta` : 'Sin datos',
          regime: technicals.trend === 'BULL_TREND' ? '🟢 Alcista' : technicals.trend === 'BEAR_TREND' ? '🔴 Bajista' : '🟡 Lateral'
        });
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching sentiment:', err);
      setLoading(false);
    }
  };

  if (loading) return <div className="animate-pulse h-32 bg-white rounded-xl shadow-sm"></div>;

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4 border border-slate-200">
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg flex items-center text-slate-900">
          🌍 Sentimiento de Mercado
          <InfoTooltip explanation="Basado en tendencia SPY, Wyckoff, tape reading y VIX. Actualizado cada minuto." />
        </h3>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
          sentiment.overall === 'BULLISH' ? 'bg-green-100 text-green-800' :
          sentiment.overall === 'BEARISH' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {sentiment.overall === 'BULLISH' ? '🟢 ALCISTA' : sentiment.overall === 'BEARISH' ? '🔴 BAJISTA' : '🟡 RANGO'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
        <div>
          <p className="text-slate-500 flex items-center">VIX <InfoTooltip explanation="Índice de volatilidad. >20 = miedo, <15 = complacencia" /></p>
          <p className="font-mono font-bold text-slate-900">{sentiment.vix}</p>
        </div>
        <div>
          <p className="text-slate-500 flex items-center">SPY cambio <InfoTooltip explanation="Variación porcentual del día" /></p>
          <p className={`font-mono font-bold ${sentiment.spyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {sentiment.spyChange > 0 ? `+${sentiment.spyChange}%` : `${sentiment.spyChange}%`}
          </p>
        </div>
        <div>
          <p className="text-slate-500 flex items-center">RSI (SPY) <InfoTooltip explanation=">70 sobrecompra, <30 sobreventa" /></p>
          <p className="font-mono text-slate-900">{sentiment.technicals.rsi}</p>
        </div>
        <div>
          <p className="text-slate-500 flex items-center">VWAP sesgo <InfoTooltip explanation="Precio respecto al VWAP" /></p>
          <p className="font-mono text-slate-900">{sentiment.technicals.vwapBias === 'ABOVE_VWAP' ? '⬆️ Por encima' : '⬇️ Por debajo'}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500 flex items-center">Tape real <InfoTooltip explanation="Presión de compra/venta en ticks" /></p>
          <p className="text-xs text-slate-600">{sentiment.tapePressure}</p>
        </div>
        <div className="col-span-2">
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div className={`h-2 rounded-full ${sentiment.score > 66 ? 'bg-green-500' : sentiment.score < 34 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${sentiment.score}%` }}></div>
          </div>
          <p className="text-xs text-center mt-1 text-slate-500">Puntuación: {sentiment.score}%</p>
        </div>
      </div>
    </div>
  );
}