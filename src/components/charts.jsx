import { useId, useMemo } from 'react';
import { payoffAt, valueNow } from '../lib/options.js';
import { money, usd } from '../lib/format.js';

const W = 640;

function niceTicks(min, max, count = 4) {
  if (!(max > min)) return [min];
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, index) => min + step * index);
}

/* ------------------------------- Price chart ------------------------------ */
export function PriceChart({ bars = [], levels = [], expectedMove = null, height = 230, title }) {
  const id = useId();
  const safeBars = bars.filter((bar) => Number.isFinite(bar?.close));
  if (safeBars.length < 5) {
    return <div className="empty" style={{ padding: 16 }}><p className="small">Sin histórico suficiente para el gráfico.</p></div>;
  }
  const slice = safeBars.slice(-90);
  const closes = slice.map((bar) => bar.close);
  const ema = emaSeries(closes, 20);
  const padTop = 26; const padBottom = 22; const padLeft = 8; const padRight = 52;
  const innerH = height - padTop - padBottom;
  const innerW = W - padLeft - padRight;
  const all = [...closes, ...ema.filter(Number.isFinite), ...levels.map((level) => level.price).filter(Number.isFinite)];
  if (expectedMove) { all.push(expectedMove.up, expectedMove.down); }
  let min = Math.min(...all); let max = Math.max(...all);
  const pad = (max - min) * 0.12 || 1;
  min -= pad; max += pad;
  const x = (index) => padLeft + (index / (closes.length - 1)) * innerW;
  const y = (value) => padTop + innerH - ((value - min) / (max - min)) * innerH;
  const line = closes.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(closes.length - 1).toFixed(1)},${padTop + innerH} L${x(0).toFixed(1)},${padTop + innerH} Z`;
  const emaPath = ema.map((value, index) => (Number.isFinite(value) ? `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}` : '')).filter(Boolean).join(' ');
  const last = closes[closes.length - 1];
  const upDay = last >= closes[0];
  const stroke = upDay ? 'var(--up)' : 'var(--down)';
  const ticks = niceTicks(min, max, 4);
  const first = slice[0]?.date ?? slice[0]?.timestamp ?? '';
  const lastDate = slice[slice.length - 1]?.date ?? slice[slice.length - 1]?.timestamp ?? '';
  return (
    <div className="chart-card">
      <svg className="chart-svg" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title || 'Gráfico de precio'}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padLeft} x2={W - padRight} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray="3 5" strokeWidth="1" />
            <text x={W - padRight + 6} y={y(tick) + 3.5} fontSize="9.5" fill="var(--text-3)" fontFamily="var(--mono)">{tick.toFixed(1)}</text>
          </g>
        ))}
        {expectedMove && (
          <rect x={padLeft} y={y(expectedMove.up)} width={innerW} height={Math.max(1, y(expectedMove.down) - y(expectedMove.up))}
            fill="var(--brand)" opacity="0.06" />
        )}
        {levels.filter((level) => Number.isFinite(level.price)).map((level) => (
          <g key={level.label}>
            <line x1={padLeft} x2={W - padRight} y1={y(level.price)} y2={y(level.price)} stroke={level.color || 'var(--brand)'} strokeWidth="1.2" strokeDasharray={level.dash || '5 4'} />
            <rect x={padLeft + 2} y={y(level.price) - 12} width={Math.max(44, level.label.length * 5.2 + 10)} height="12" rx="3" fill="var(--surface)" opacity="0.9" />
            <text x={padLeft + 7} y={y(level.price) - 2.6} fontSize="9" fontWeight="700" fill={level.color || 'var(--brand)'} fontFamily="var(--mono)">{level.label}</text>
          </g>
        ))}
        <path d={area} fill={`url(#g${id})`} />
        {emaPath && <path d={emaPath} fill="none" stroke="var(--brand-2)" strokeWidth="1.4" strokeOpacity="0.8" />}
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(closes.length - 1)} cy={y(last)} r="3.4" fill={stroke} stroke="var(--surface)" strokeWidth="1.5" />
        <text x={padLeft + 2} y={height - 6} fontSize="9" fill="var(--text-3)">{first}</text>
        <text x={W - padRight - 40} y={height - 6} fontSize="9" fill="var(--text-3)">{lastDate}</text>
      </svg>
      <div className="chart-legend">
        <span><i style={{ background: stroke }} />Precio</span>
        <span><i style={{ background: 'var(--brand-2)' }} />EMA 20</span>
        {expectedMove && <span><i style={{ background: 'var(--brand)', opacity: .35 }} />Movimiento esperado 1σ</span>}
        {levels.map((level) => <span key={level.label}><i className="dash" style={{ color: level.color || 'var(--brand)' }} />{level.label}</span>)}
      </div>
    </div>
  );
}

function emaSeries(values, length) {
  const k = 2 / (length + 1);
  let previous = null;
  return values.map((value) => {
    previous = previous === null ? value : value * k + previous * (1 - k);
    return previous;
  });
}

/* ------------------------------- Payoff chart ----------------------------- */
export function PayoffChart({ legs = [], spot, dte = 0, atmIv = 0.3, height = 240 }) {
  const id = useId();
  if (!legs.length || !Number.isFinite(spot)) return null;
  const low = spot * (1 - (dte > 0 ? 0.18 : 0.22));
  const high = spot * (1 + (dte > 0 ? 0.18 : 0.22));
  const points = 140;
  const expiry = []; const now = [];
  for (let i = 0; i <= points; i += 1) {
    const price = low + ((high - low) * i) / points;
    expiry.push({ price, pnl: payoffAt(legs, price) });
    now.push({ price, pnl: dte > 0 ? valueNow(legs, price, dte, atmIv) - valueNow(legs, spot, dte, atmIv) : payoffAt(legs, price) });
  }
  const maxAbs = Math.max(...expiry.map((point) => Math.abs(point.pnl)), ...now.map((point) => Math.abs(point.pnl)), 1) * 1.12;
  const padTop = 16; const padBottom = 20; const padLeft = 8; const padRight = 54;
  const innerH = height - padTop - padBottom; const innerW = W - padLeft - padRight;
  const x = (price) => padLeft + ((price - low) / (high - low)) * innerW;
  const y = (pnl) => padTop + innerH / 2 - (pnl / maxAbs) * (innerH / 2);
  const toPath = (series) => series.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.price).toFixed(1)},${y(point.pnl).toFixed(1)}`).join(' ');
  const zeros = expiry.filter((point, index) => index > 0 && Math.sign(point.pnl) !== Math.sign(expiry[index - 1].pnl)).map((point) => x(point.price));
  const maxProfit = Math.max(...expiry.map((point) => point.pnl));
  const maxLoss = Math.min(...expiry.map((point) => point.pnl));
  return (
    <div className="chart-card">
      <svg className="chart-svg" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Curva de resultado">
        <defs>
          <linearGradient id={`up${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--up)" stopOpacity=".24" /><stop offset="100%" stopColor="var(--up)" stopOpacity=".02" />
          </linearGradient>
        </defs>
        <line x1={padLeft} x2={W - padRight} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth="1" />
        <rect x={padLeft} y={padTop} width={innerW} height={Math.max(0, y(0) - padTop)} fill={`url(#up${id})`} />
        <path d={`${toPath(expiry)} L${x(high)},${y(0)} L${x(low)},${y(0)} Z`} fill="var(--up)" opacity="0.06" />
        <path d={toPath(now)} fill="none" stroke="var(--brand)" strokeWidth="1.4" strokeDasharray="4 4" opacity="0.75" />
        <path d={toPath(expiry)} fill="none" stroke="var(--text)" strokeWidth="2.2" strokeLinejoin="round" />
        <line x1={x(spot)} x2={x(spot)} y1={padTop} y2={padTop + innerH} stroke="var(--brand)" strokeWidth="1.2" strokeDasharray="2 4" />
        <text x={x(spot) + 4} y={padTop + 10} fontSize="9.5" fontWeight="700" fill="var(--brand)">SPOT {spot.toFixed(2)}</text>
        {zeros.map((zx, index) => (<line key={`z${index}`} x1={zx} x2={zx} y1={padTop} y2={padTop + innerH} stroke="var(--warn)" strokeDasharray="3 4" strokeWidth="1" />))}
        <text x={W - padRight + 6} y={y(maxProfit) + 3} fontSize="9" fill="var(--up)" fontFamily="var(--mono)">{usd(maxProfit)}</text>
        <text x={W - padRight + 6} y={y(maxLoss) + 3} fontSize="9" fill="var(--down)" fontFamily="var(--mono)">{usd(maxLoss)}</text>
        <text x={padLeft + 2} y={height - 5} fontSize="9" fill="var(--text-3)" fontFamily="var(--mono)">{low.toFixed(1)}</text>
        <text x={W - padRight - 42} y={height - 5} fontSize="9" fill="var(--text-3)" fontFamily="var(--mono)">{high.toFixed(1)}</text>
      </svg>
      <div className="chart-legend">
        <span><i style={{ background: 'var(--text)' }} />Al vencimiento</span>
        {dte > 0 && <span><i style={{ background: 'var(--brand)' }} />Hoy (T+0)</span>}
        <span><i className="dash" style={{ color: 'var(--warn)' }} />Breakeven</span>
      </div>
    </div>
  );
}

/* ------------------------------ Barras por strike ------------------------- */
export function BarProfile({ rows = [], spot, walls = {}, maxPain, height = 240, valueKey = 'gex', label = 'GEX' }) {
  if (!rows.length || !Number.isFinite(spot)) return null;
  // Nos quedamos con los strikes relevantes alrededor del spot.
  const near = rows
    .filter((row) => Math.abs(row.strike - spot) <= spot * 0.1)
    .slice(0, 48);
  const data = near.length >= 6 ? near : rows.slice(0, 40);
  const values = data.map((row) => row[valueKey] ?? 0);
  const maxAbs = Math.max(...values.map(Math.abs), 1);
  const W2 = W; const padTop = 22; const padBottom = 30;
  const innerH = height - padTop - padBottom;
  const innerW = W2 - 74;
  const step = innerW / Math.max(1, data.length - 1);
  const barW = Math.max(3, Math.min(18, step * 0.72));
  const x = (index) => 40 + index * step;
  const y = (value) => padTop + innerH / 2 - Math.sign(value) * Math.sqrt(Math.abs(value) / maxAbs) * (innerH / 2);
  const last = data.reduce((best, row, index) => (Math.abs(row.strike - spot) < Math.abs(data[best].strike - spot) ? index : best), 0);
  const wallMax = data.reduce((best, row) => (Math.abs(row[valueKey] ?? 0) > Math.abs(data[best][valueKey] ?? 0) ? row : best), data[0]);
  const wallIndex = data.indexOf(wallMax);
  const fmt = (value) => Math.abs(value) >= 1e6 ? (value / 1e6).toFixed(1) + 'M' : Math.abs(value) >= 1e3 ? (value / 1e3).toFixed(0) + 'k' : value.toFixed(0);
  return (
    <div className="chart-card">
      <svg className="chart-svg" viewBox={`0 0 ${W2} ${height}`} role="img" aria-label={`Perfil de ${label} por strike`}>
        <line x1={28} x2={W2 - 20} y1={padTop + innerH / 2} y2={padTop + innerH / 2} stroke="var(--border-strong)" />
        <text x={28} y={padTop + 2} fontSize="8.5" fill="var(--text-3)">+{fmt(maxAbs)}</text>
        <text x={28} y={padTop + innerH + 10} fontSize="8.5" fill="var(--text-3)">-{fmt(maxAbs)}</text>
        {data.map((row, index) => {
          const value = row[valueKey] ?? 0;
          const isCallWall = walls.callWall === row.strike;
          const isPutWall = walls.putWall === row.strike;
          const isSpot = index === last;
          const isMaxPain = Number.isFinite(maxPain) && maxPain === row.strike;
          const top = value >= 0 ? y(value) : padTop + innerH / 2;
          const barHeight = Math.max(1.5, Math.abs(y(value) - (padTop + innerH / 2)));
          return (
            <g key={row.strike}>
              <rect x={x(index) - barW / 2} y={top} width={barW} height={barHeight} rx="2"
                fill={value >= 0 ? 'var(--up)' : 'var(--down)'} opacity={isCallWall || isPutWall ? 1 : 0.55} />
              {isSpot && <line x1={x(index)} x2={x(index)} y1={padTop} y2={padTop + innerH} stroke="var(--brand)" strokeDasharray="2 3" strokeWidth="1.2" />}
              {isMaxPain && <circle cx={x(index)} cy={padTop + innerH + 14} r="2.6" fill="var(--warn)" />}
            </g>
          );
        })}
        {isFinite(wallIndex) && (
          <text x={x(wallIndex)} y={data[wallIndex][valueKey] >= 0 ? padTop - 4 : padTop + innerH + 24} fontSize="9" fontWeight="800"
            textAnchor="middle" fill={data[wallIndex][valueKey] >= 0 ? 'var(--up)' : 'var(--down)'}>MURO</text>
        )}
        {last >= 0 && <text x={x(last)} y={padTop + 10} fontSize="8.5" textAnchor="middle" fill="var(--brand)" fontWeight="800">SPOT</text>}
        {[0, Math.floor(data.length / 2), data.length - 1].map((index) => (
          <text key={index} x={x(index)} y={height - 4} fontSize="9" textAnchor="middle" fill="var(--text-3)" fontFamily="var(--mono)">{data[index].strike}</text>
        ))}
      </svg>
      <div className="chart-legend">
        <span><i style={{ background: 'var(--up)' }} />{label} positivo (calls)</span>
        <span><i style={{ background: 'var(--down)' }} />{label} negativo (puts)</span>
        <span><i className="dash" style={{ color: 'var(--brand)' }} />Spot</span>
        <span><i style={{ background: 'var(--warn)' }} />Max pain</span>
      </div>
    </div>
  );
}

export function Sparkline({ values = [], width = 120, height = 34, tone }) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const min = Math.min(...clean); const max = Math.max(...clean);
  const span = max - min || 1;
  const path = clean.map((value, index) => `${index === 0 ? 'M' : 'L'}${(index / (clean.length - 1)) * width},${height - ((value - min) / span) * height}`).join(' ');
  const color = tone || (clean[clean.length - 1] >= clean[0] ? 'var(--up)' : 'var(--down)');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ScenarioBars({ rows = [], height = 92 }) {
  const data = useMemo(() => rows.filter((row) => Number.isFinite(row.pnlUsd)), [rows]);
  if (!data.length) return null;
  const maxAbs = Math.max(...data.map((row) => Math.abs(row.pnlUsd)), 1);
  return (
    <div className="grid-auto" style={{ alignItems: 'end', minHeight: height }}>
      {data.map((row) => {
        const positive = row.pnlUsd >= 0;
        return (
          <div key={row.movePct} style={{ textAlign: 'center' }}>
            <div style={{ height: 52, display: 'flex', alignItems: positive ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
              <div style={{ width: 18, borderRadius: 3, background: positive ? 'var(--up)' : 'var(--down)', opacity: 0.75,
                height: Math.max(3, (Math.abs(row.pnlUsd) / maxAbs) * 48) }} />
            </div>
            <div className="tiny mono" style={{ marginTop: 3, color: positive ? 'var(--up)' : 'var(--down)' }}>{money(row.pnlUsd)}</div>
            <div className="tiny muted">{row.movePct > 0 ? '+' : ''}{row.movePct}%</div>
          </div>
        );
      })}
    </div>
  );
}