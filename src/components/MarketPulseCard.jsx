import InfoTooltip from './InfoTooltip';

export function MarketPulseCard({ pulse }) {
  if (!pulse) return null;
  return <section className="market-card p-4 space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-xl font-black text-slate-900">🧭 Dirección del mercado</h2><span className="pill">{pulse.bestModeNow?.replaceAll('_', ' ') || 'ESPERAR'}</span></div>
    <div className="grid grid-cols-2 gap-3">
      <Metric label="SPY Dirección" help="ETF líquido que sigue al S&P 500. Úsalo como referencia del mercado amplio." value={formatTrend(pulse.spyTrend)} />
      <Metric label="QQQ Dirección" help="ETF líquido del Nasdaq 100. Ayuda a leer tecnología y crecimiento." value={formatTrend(pulse.qqqTrend)} />
      <Metric label="VIX" help="Índice de volatilidad implícita del S&P 500. Un VIX alto suele implicar mayor incertidumbre." value={pulse.vix == null ? 'NO DATA' : String(pulse.vix)} />
      <Metric label="Macro" help="Eventos económicos y noticias que pueden bloquear nuevas entradas." value={formatStatus(pulse.macroStatus)} />
    </div>
    <div className="rounded-2xl bg-slate-100 border border-slate-200 p-3 text-slate-900">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold">Proxy de presión institucional <InfoTooltip explanation="No es Time & Sales ni Level 2. Combina tendencia, VWAP, amplitud y presión técnica disponible." position="bottom" /></p><h3 className="text-lg font-black">{pulse.tapeReading?.arrow || '❔'} {pulse.tapeReading?.label || 'Sin datos'}</h3></div><span className="pill">{pulse.tapeReading?.confidence || 0}%</span></div>
      <p className="text-sm mt-2">{pulse.tapeReading?.explanation || 'Esperando datos de mercado.'}</p>
      <p className="text-[11px] text-slate-700 mt-1">Proxy educativo; no equivale a lectura directa del libro de órdenes.</p>
      <ul className="mt-2 space-y-1">{(pulse.tapeReading?.signals || []).slice(0, 4).map((signal, index) => <li key={index} className="text-xs">• {signal}</li>)}</ul>
    </div>
  </section>;
}
function Metric({ label, value, help }) { return <div className="rounded-2xl bg-slate-100 border border-slate-200 p-3 text-slate-900"><p className="text-xs font-bold">{label}<InfoTooltip explanation={help} position="bottom" /></p><p className="text-base font-black mt-1">{value}</p></div>; }
function formatTrend(trend) { if (trend === 'BULL_TREND' || trend === 'bullish') return 'Alcista ↑'; if (trend === 'BEAR_TREND' || trend === 'bearish') return 'Bajista ↓'; if (trend === 'RANGE' || trend === 'range') return 'Lateral ↔'; return 'Sin datos'; }
function formatStatus(status) { if (status === 'CLEAR') return '✅ Limpio'; if (status === 'CAUTION') return '⚠️ Cautela'; if (status === 'DANGER') return '🚨 Peligro'; return 'Sin datos'; }
