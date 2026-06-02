import React, { useEffect, useState } from 'react';
import InfoTooltip from './InfoTooltip';

const FALLBACK = {
  overall: 'SIN DATOS',
  bias: 'NEUTRAL',
  vix: 'N/A',
  spyChange: 0,
  technicals: { ema9: null, rsi: null, vwapBias: null },
  tapePressure: 'Sin datos',
  score: 50
};

export default function MarketSentiment() {
  const [sentiment, setSentiment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSentiment();
    const interval = setInterval(fetchSentiment, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchSentiment = async () => {
    try {
      const res = await fetch('/api/market/sentiment');
      if (!res.ok) {
        console.warn('Market sentiment HTTP', res.status);
        setSentiment(FALLBACK);
        setError(null);
        setLoading(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const overall = data?.overall || 'SIN DATOS';
      const bias = data?.bias || 'NEUTRAL';
      const details = data?.details || '';
      const vixMatch = details.match(/VIX\s+([\d.]+)/);
      const rsiMatch = details.match(/RSI\s+([\d.]+)/);
      const vwapMatch = details.match(/VWAP\s+(\w+)/);
      setSentiment({
        overall,
        bias,
        score: overall === 'BULLISH' ? 75 : overall === 'BEARISH' ? 25 : 50,
        vix: data?.vix ?? (vixMatch ? vixMatch[1] : 'N/A'),
        spyChange: data?.spyChange ?? 0,
        technicals: {
          ema9: null,
          rsi: data?.technicals?.rsi ?? (rsiMatch ? Number(rsiMatch[1]) : null),
          vwapBias: data?.technicals?.vwapBias ?? (vwapMatch ? vwapMatch[1] : null)
        },
        tapePressure: 'Proxy técnico actualizado desde /api/market/sentiment',
        regime: overall === 'BULLISH' ? '🟢 Alcista' : overall === 'BEARISH' ? '🔴 Bajista' : '🟡 Lateral'
      });
      setError(null);
    } catch (err) {
      console.error('Error fetching sentiment:', err);
      setSentiment(FALLBACK);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="animate-pulse h-32 bg-white rounded-xl shadow-sm"></div>;

  const s = sentiment || FALLBACK;

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4 border border-slate-200">
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg flex items-center text-slate-900">
          🌍 Sentimiento de Mercado
          <InfoTooltip explanation="Basado en tendencia SPY, Wyckoff, tape reading y VIX. Actualizado cada minuto." />
        </h3>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
          s.overall === 'BULLISH' ? 'bg-green-100 text-green-800' :
          s.overall === 'BEARISH' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {s.overall === 'BULLISH' ? '🟢 ALCISTA' : s.overall === 'BEARISH' ? '🔴 BAJISTA' : s.overall === 'SIN DATOS' ? '🟡 SIN DATOS' : '🟡 RANGO'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
        <div>
          <p className="text-slate-500 flex items-center">VIX <InfoTooltip explanation="Índice de volatilidad. >20 = miedo, <15 = complacencia" /></p>
          <p className="font-mono font-bold text-slate-900">{s.vix || 'N/A'}</p>
        </div>
        <div>
          <p className="text-slate-500 flex items-center">SPY cambio <InfoTooltip explanation="Variación porcentual del día" /></p>
          <p className={`font-mono font-bold ${(s.spyChange || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {(s.spyChange || 0) > 0 ? `+${s.spyChange}%` : `${s.spyChange || 0}%`}
          </p>
        </div>
        <div>
          <p className="text-slate-500 flex items-center">RSI (SPY) <InfoTooltip explanation=">70 sobrecompra, <30 sobreventa" /></p>
          <p className="font-mono text-slate-900">{s.technicals?.rsi || 'N/A'}</p>
        </div>
        <div>
          <p className="text-slate-500 flex items-center">VWAP sesgo <InfoTooltip explanation="Precio respecto al VWAP" /></p>
          <p className="font-mono text-slate-900">{s.technicals?.vwapBias === 'ABOVE_VWAP' ? '⬆️ Por encima' : s.technicals?.vwapBias || '⬇️ Sin datos'}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500 flex items-center">Fuente de presión <InfoTooltip explanation="Proxy técnico. No equivale a Time & Sales ni Level 2." /></p>
          <p className="text-xs text-slate-600">{s.tapePressure || 'Sin datos'}</p>
        </div>
        <div className="col-span-2">
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div className={`h-2 rounded-full ${(s.score || 50) > 66 ? 'bg-green-500' : (s.score || 50) < 34 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${s.score || 50}%` }}></div>
          </div>
          <p className="text-xs text-center mt-1 text-slate-500">Puntuación: {s.score || 50}%</p>
        </div>
      </div>
    </div>
  );
}
