import { mean, round } from './math.js';

export function ema(values, period) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length < period) return null;
  const k = 2 / (period + 1);
  let e = mean(clean.slice(0, period));
  for (let i = period; i < clean.length; i++) e = clean[i] * k + e * (1 - k);
  return e;
}

export function rsi(values, period = 14) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = clean[i] - clean[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < clean.length; i++) {
    const diff = clean[i] - clean[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function macd(values) {
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  if (e12 == null || e26 == null) return null;
  const clean = values.map(Number).filter(Number.isFinite);
  const macdSeries = [];
  for (let i = 26; i <= clean.length; i++) {
    const sub = clean.slice(0, i);
    const a = ema(sub, 12), b = ema(sub, 26);
    if (a != null && b != null) macdSeries.push(a - b);
  }
  const signal = ema(macdSeries, 9);
  return {
    line: round(e12 - e26, 4),
    signal: signal == null ? null : round(signal, 4),
    histogram: signal == null ? null : round(e12 - e26 - signal, 4)
  };
}

export function vwap(bars) {
  let pv = 0, vol = 0;
  for (const b of bars) {
    const typical = ((b.high ?? b.close) + (b.low ?? b.close) + b.close) / 3;
    const v = Number(b.volume || 0);
    if (Number.isFinite(typical) && v > 0) { pv += typical * v; vol += v; }
  }
  return vol > 0 ? pv / vol : null;
}

import { std } from './math.js';
export function realizedVol(closes, barsPerYear = 252) {
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const s = std(returns);
  return s == null ? null : s * Math.sqrt(barsPerYear);
}

export function detectStructure(bars) {
  const last = bars.slice(-20);
  if (last.length < 10) return "UNKNOWN";
  const highs = last.map(b => Number(b.high || b.close));
  const lows = last.map(b => Number(b.low || b.close));
  const fh = mean(highs.slice(0, 5)), lh = mean(highs.slice(-5));
  const fl = mean(lows.slice(0, 5)), ll = mean(lows.slice(-5));
  if (lh > fh && ll > fl) return "HH_HL";
  if (lh < fh && ll < fl) return "LH_LL";
  return "RANGE";
}

export function computeTechnicals(symbol = '', quote = {}, bars = []) {
  const closes = bars.map(b => Number(b.close)).filter(Number.isFinite);
  const volumes = bars.map(b => Number(b.volume || 0));
  const last = quote.price || closes.at(-1);
  const vw = vwap(bars);
  const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const recentHigh = Math.max(...bars.slice(-50).map(b => Number(b.high || b.close)));
  const recentLow = Math.min(...bars.slice(-50).map(b => Number(b.low || b.close)));
  const avgVol20 = mean(volumes.slice(-20));
  const lastVol = volumes.at(-1) || 0;
  const relVol = avgVol20 ? lastVol / avgVol20 : null;

  let trend = "RANGE";
  if (e9 && e21 && e50 && last > e9 && e9 > e21 && e21 > e50) trend = "BULL_TREND";
  if (e9 && e21 && e50 && last < e9 && e9 < e21 && e21 < e50) trend = "BEAR_TREND";

  let momentum = "neutral";
  if (r != null && r > 55 && m?.histogram != null && m.histogram > 0) momentum = "bullish";
  if (r != null && r < 45 && m?.histogram != null && m.histogram < 0) momentum = "bearish";

  return {
    symbol, price: round(last, 2),
    ema9: round(e9, 2), ema21: round(e21, 2), ema50: round(e50, 2), ema200: round(e200, 2),
    rsi14: round(r, 2), macd: m,
    vwap: round(vw, 2), vwapBias: vw == null ? "VWAP_UNKNOWN" : last >= vw ? "ABOVE_VWAP" : "BELOW_VWAP",
    relativeVolume: round(relVol, 2), volumeSpike: relVol != null && relVol >= 1.7,
    support: round(recentLow, 2), resistance: round(recentHigh, 2),
    trend, momentum, structure: detectStructure(bars),
    realizedVol: round(realizedVol(closes), 4)
  };
}

// The autonomous scanner predates computeTechnicals' symbol/quote arguments.
export function deriveTechnicals(bars = [], symbol = '', quote = {}) {
  const technicals = computeTechnicals(symbol, quote, Array.isArray(bars) ? bars : []);
  const trend = technicals.trend === 'BULL_TREND'
    ? 'bullish'
    : technicals.trend === 'BEAR_TREND'
      ? 'bearish'
      : 'range';
  return {
    ...technicals,
    trend,
    vwap20: technicals.vwap,
    relativeVolume20: technicals.relativeVolume
  };
}
