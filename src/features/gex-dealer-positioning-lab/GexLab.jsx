import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const chartTheme = {
  grid: '#d7e2ef',
  axis: '#64748b',
  tooltip: {
    background: 'var(--chart-tooltip-bg)',
    border: '1px solid var(--border-soft)',
    borderRadius: 12,
    boxShadow: '0 14px 36px rgba(15, 23, 42, .12)',
    color: 'var(--chart-tooltip-text)'
  },
  label: { color: 'var(--text-muted)', fontWeight: 700 },
  item: { color: 'var(--text-main)' },
  cursor: { fill: 'rgba(37, 99, 235, 0.08)' }
};

export default function GexLab({ scan }) {
  const surface = scan?.gammaSurfaces?.find((item) => item.symbol === 'SPY') || scan?.gammaSurfaces?.[0];
  const profile = surface?.profile?.slice(-22) || [];
  const callWall = profile.slice().sort((a, b) => (b.callGamma || 0) - (a.callGamma || 0))[0];
  const putWall = profile.slice().sort((a, b) => Math.abs(b.putGamma || 0) - Math.abs(a.putGamma || 0))[0];
  return (
    <section id="gex-lab" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">GEX / Dealer Positioning Lab</p>
      <h2 className="mt-1 text-xl font-bold">GEX aproximado, no posicionamiento confirmado</h2>
      <p className="mt-2 text-xs leading-5 text-slate-400">Formula educativa: call gamma * OI * 100 * spot^2 * 0.01; puts se muestran con signo negativo. Sin OPRA y trade conditions completos esto es contexto, no gatillo unico.</p>
      {profile.length ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Simbolo" value={surface.symbol} />
            <Metric label="Regimen proxy" value={surface.regime} />
            <Metric label="Possible call wall" value={callWall?.strike ?? 'No disponible'} />
            <Metric label="Possible put wall" value={putWall?.strike ?? 'No disponible'} />
          </div>
          <div className="mt-4 h-64 rounded-xl bg-sigma-soft p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profile}><CartesianGrid stroke={chartTheme.grid} vertical={false} /><XAxis dataKey="strike" tick={{ fill: chartTheme.axis, fontSize: 10 }} /><YAxis tick={{ fill: chartTheme.axis, fontSize: 10 }} /><Tooltip cursor={chartTheme.cursor} contentStyle={chartTheme.tooltip} labelStyle={chartTheme.label} itemStyle={chartTheme.item} /><Bar dataKey="netGamma" fill="#4f8ff7" /></BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : <p className="mt-4 rounded-lg border border-dashed border-sigma-line p-4 text-xs text-slate-400">No disponible: se necesita chain con gamma y open interest.</p>}
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-lg bg-sigma-soft p-3 text-xs"><p className="eyebrow">{label}</p><p className="mt-1 font-mono">{value}</p></div>;
}
