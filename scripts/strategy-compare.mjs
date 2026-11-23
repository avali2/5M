import fs from 'node:fs';
const COINS = ['PEPEUSDT', 'NEARUSDT', 'INJUSDT'];
const FEE = 0.001;
const MAX_HOLD = 48;

function ema(values, length) {
  if (values.length < length) return null;
  const k = 2 / (length + 1);
  let result = values.slice(0, length).reduce((a, b) => a + b, 0) / length;
  for (const v of values.slice(length)) result = v * k + result * (1 - k);
  return result;
}
function rsi(values, length = 14) {
  if (values.length <= length) return 50;
  let gains = 0; let losses = 0;
  for (let i = 1; i <= length; i += 1) { const c = values[i] - values[i - 1]; if (c >= 0) gains += c; else losses -= c; }
  let ag = gains / length; let al = losses / length;
  for (let i = length + 1; i < values.length; i += 1) { const c = values[i] - values[i - 1]; ag = (ag * (length - 1) + Math.max(0, c)) / length; al = (al * (length - 1) + Math.max(0, -c)) / length; }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}
function atr(bars, length = 14) {
  const ranges = [];
  for (let i = 1; i < bars.length; i += 1) ranges.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)));
  const tail = ranges.slice(-length);
  return tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : null;
}
async function fetchBars(symbol, barsTarget = 4300) {
  let end = Date.now(); const all = [];
  while (all.length < barsTarget) {
    const url = 'https://api.binance.us/api/v3/klines?symbol=' + symbol + '&interval=1h&limit=1000&endTime=' + end;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) break;
    const parsed = rows.map((r) => ({ time: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) }));
    all.unshift(...parsed);
    end = parsed[0].time - 1;
    if (parsed.length < 1000) break;
  }
  return all;
}
function variantSignal(name, bars, i, closes) {
  const close = closes[i];
  const e50 = ema(closes.slice(0, i + 1), 50);
  const e20 = ema(closes.slice(0, i + 1), 20);
  const r = rsi(closes.slice(0, i + 1), 14);
  if (name === 'trend_ema50' || name === 'trend_ema50_2R') return close > e50 && r >= 30 && r <= 82;
  if (name === 'cross_ema20_50') return e20 > e50 && r < 75;
  if (name === 'breakout20') { const hi = Math.max(...bars.slice(i - 20, i).map((b) => b.high)); return close > hi; }
  if (name === 'meanrev_rsi30') return r < 30;
  return false;
}
function simulate(bars, name) {
  const targetR = name === 'trend_ema50_2R' ? 2 : 3;
  const closes = bars.map((b) => b.close);
  const trades = [];
  let i = 60;
  while (i < bars.length - 1) {
    if (!variantSignal(name, bars, i, closes)) { i += 1; continue; }
    const a = atr(bars.slice(Math.max(0, i - 30), i + 1), 14);
    if (!a || a <= 0) { i += 1; continue; }
    const entry = closes[i] * (1 + FEE);
    const stop = entry - a;
    const target = entry + a * targetR;
    let exit = null; let reason = null;
    for (let j = i + 1; j < Math.min(bars.length, i + 1 + MAX_HOLD); j += 1) {
      if (bars[j].low <= stop) { exit = stop * (1 - FEE); reason = 'STOP'; break; }
      if (bars[j].high >= target) { exit = target * (1 - FEE); reason = 'TARGET'; break; }
    }
    if (exit === null) { exit = bars[Math.min(i + MAX_HOLD, bars.length - 1)].close * (1 - FEE); reason = 'TIME'; }
    trades.push({ r: (exit - entry) / a, reason });
    i += MAX_HOLD + 1;
  }
  const rList = trades.map((t) => t.r);
  const wins = rList.filter((r) => r > 0).length;
  let cum = 0; let peak = 0; let maxDD = 0;
  for (const r of rList) { cum += r; peak = Math.max(peak, cum); maxDD = Math.min(maxDD, cum - peak); }
  return { trades: rList.length, winRate: rList.length ? Math.round((wins / rList.length) * 1000) / 10 : null, avgR: rList.length ? Math.round((cum / rList.length) * 100) / 100 : null, totalR: Math.round(cum * 100) / 100, maxDD: Math.round(maxDD * 100) / 100, pf: rList.filter((r) => r > 0).reduce((a, b) => a + b, 0) / Math.abs(rList.filter((r) => r <= 0).reduce((a, b) => a + b, 0) || -1) };
}
const variants = ['trend_ema50', 'trend_ema50_2R', 'cross_ema20_50', 'breakout20', 'meanrev_rsi30'];
const results = [];
const perCoin = {};
for (const coin of COINS) {
  const bars = await fetchBars(coin);
  perCoin[coin] = bars.length;
  for (const v of variants) results.push({ coin, variant: v, ...simulate(bars, v) });
}
fs.mkdirSync('exports', { recursive: true });
const header = 'coin,variant,trades,winRate,avgR,totalR,maxDD,pf';
const lines = results.map((r) => [r.coin, r.variant, r.trades, r.winRate, r.avgR, r.totalR, r.maxDD, Math.round(r.pf * 100) / 100].join(','));
fs.writeFileSync('exports/strategy-comparison.csv', [header, ...lines].join('\n'));
console.log('bares por coin:', JSON.stringify(perCoin));
for (const v of variants) {
  const rows = results.filter((r) => r.variant === v);
  const trades = rows.reduce((s, r) => s + r.trades, 0);
  const wins = rows.reduce((s, r) => s + (r.winRate / 100) * r.trades, 0);
  const totalR = Math.round(rows.reduce((s, r) => s + r.totalR, 0) * 100) / 100;
  const maxDD = Math.min(...rows.map((r) => r.maxDD));
  console.log(v.padEnd(18), 'trades', String(trades).padStart(4), 'win', String(trades ? Math.round((wins / trades) * 1000) / 10 : 0).padStart(5) + '%', 'totalR', String(totalR).padStart(7), 'maxDD', String(maxDD).padStart(7));
}
