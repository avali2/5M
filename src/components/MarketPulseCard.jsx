export function MarketPulseCard({ pulse }) {
  if (!pulse) return null;

  return (
    <section className="market-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">Market Pulse</h2>
        <span className="pill">{pulse.bestModeNow?.replaceAll("_", " ") || "ESPERAR"}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="SPY Sesgo" value={formatTrend(pulse.spyTrend)} />
        <Metric label="QQQ Sesgo" value={formatTrend(pulse.qqqTrend)} />
        <Metric label="VIX" value={pulse.vix == null ? "NO DATA" : String(pulse.vix)} />
        <Metric label="Macro" value={formatStatus(pulse.macroStatus)} />
      </div>

      <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400 font-bold">Tape Reading institucional</p>
            <h3 className="text-lg font-black text-white">
              {pulse.tapeReading?.arrow || "❔"} {pulse.tapeReading?.label || "Sin datos"}
            </h3>
          </div>
          <span className="pill">{pulse.tapeReading?.confidence || 0}%</span>
        </div>
        <p className="text-sm text-slate-300 mt-2">{pulse.tapeReading?.explanation || "Esperando datos de mercado."}</p>
        <ul className="mt-2 space-y-1">
          {(pulse.tapeReading?.signals || []).slice(0, 4).map((s, i) => (
            <li key={i} className="text-xs text-slate-300">• {s}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-950/28 border border-white/10 p-3">
      <p className="text-xs text-slate-400 font-bold">{label}</p>
      <p className="text-base font-black text-white mt-1">{value}</p>
    </div>
  );
}

function formatTrend(t) {
  if (t === "BULL_TREND") return "Alcista";
  if (t === "BEAR_TREND") return "Bajista";
  if (t === "RANGE") return "Lateral";
  return "Sin datos";
}

function formatStatus(s) {
  if (s === "CLEAR") return "Limpio";
  if (s === "CAUTION") return "Cautela";
  if (s === "DANGER") return "Peligro";
  return "Sin datos";
}