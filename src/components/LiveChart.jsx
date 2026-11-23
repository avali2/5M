import { useMemo } from 'react';

export default function LiveChart({ bars = [], ema50, ema200, position, price, symbol, height = 200 }) {
  const data = useMemo(() => (bars || []).filter((bar) => Number.isFinite(bar.c)).slice(-120), [bars]);
  if (data.length < 5) return <p className="tiny muted">Sin datos suficientes para el gráfico.</p>;
  const W = 340; const H = height; const padX = 40; const padY = 18;
  const values = data.map((bar) => bar.c);
  const min = Math.min(...values, ...(Number.isFinite(ema50) ? [ema50] : []), ...(Number.isFinite(ema200) ? [ema200] : []));
  const max = Math.max(...values, ...(Number.isFinite(ema50) ? [ema50] : []), ...(Number.isFinite(ema200) ? [ema200] : []));
  const span = max - min || 1;
  const x = (index) => padX + (index / Math.max(1, data.length - 1)) * (W - padX - 8);
  const y = (value) => padY + (1 - (value - min) / span) * (H - padY * 2);
  const path = data.map((bar, index) => (index === 0 ? 'M' : 'L') + x(index) + ',' + y(bar.c)).join(' ');
  const area = path + ' L' + x(data.length - 1) + ',' + (H - padY) + ' L' + x(0) + ',' + (H - padY) + ' Z';
  const last = data[data.length - 1];
  const fmt = (value) => { const abs = Math.abs(value); return abs >= 100 ? value.toFixed(2) : abs >= 1 ? value.toFixed(4) : abs >= 0.01 ? value.toFixed(6) : value.toFixed(9); };
  const levels = position ? [
    { value: position.entry, color: 'var(--brand)', label: 'ENTRADA' },
    { value: position.stop, color: 'var(--down)', label: 'STOP' },
    { value: position.target, color: 'var(--up)', label: 'OBJETIVO' }
  ].filter((level) => Number.isFinite(level.value)) : [];
  return (
    <div className="chart-card">
      <svg className="chart-svg" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label={'Precio en vivo de ' + symbol}>
        <defs><linearGradient id="liveFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity="0.25" /><stop offset="100%" stopColor="var(--brand)" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#liveFill)" stroke="none" />
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {Number.isFinite(ema50) && <line x1={padX} x2={W - 8} y1={y(ema50)} y2={y(ema50)} stroke="var(--up)" strokeDasharray="4 4" strokeWidth="1.2" opacity="0.8" />}
        {Number.isFinite(ema200) && <line x1={padX} x2={W - 8} y1={y(ema200)} y2={y(ema200)} stroke="var(--down)" strokeDasharray="2 4" strokeWidth="1.2" opacity="0.7" />}
        {levels.map((level) => (
          <g key={level.label}>
            <line x1={padX} x2={W - 8} y1={y(level.value)} y2={y(level.value)} stroke={level.color} strokeWidth="1" opacity="0.6" />
            <text x={W - 6} y={y(level.value) - 2} fontSize="7.5" textAnchor="end" fill={level.color}>{level.label}</text>
          </g>
        ))}
        <circle cx={x(data.length - 1)} cy={y(last.c)} r="3.2" fill="var(--brand)" />
        <text x={padX} y={12} fontSize="9" fill="var(--text-3)">{fmt(max)}</text>
        <text x={padX} y={H - 3} fontSize="9" fill="var(--text-3)">{fmt(min)}</text>
        <text x={W - 6} y={12} fontSize="9" textAnchor="end" fill="var(--brand)" fontWeight="700">{price ? fmt(price) : fmt(last.c)}</text>
      </svg>
      <div className="chart-legend">
        <span><i style={{ background: 'var(--brand)' }} />Precio</span>
        <span><i className="dash" style={{ color: 'var(--up)' }} />EMA50</span>
        <span><i className="dash" style={{ color: 'var(--down)' }} />EMA200</span>
        <span className="tiny muted">{symbol}</span>
      </div>
    </div>
  );
}
