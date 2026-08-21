import { finite, round } from './http.js';

export function sma(values, length) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < length) return null;
  return clean.slice(-length).reduce((sum, value) => sum + value, 0) / length;
}

export function ema(values, length) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < length) return null;
  const multiplier = 2 / (length + 1);
  let result = clean.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  for (const value of clean.slice(length)) result = (value - result) * multiplier + result;
  return result;
}

export function rsi(values, length = 14) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length <= length) return null;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= length; index += 1) {
    const change = clean[index] - clean[index - 1];
    if (change >= 0) gains += change; else losses -= change;
  }
  let averageGain = gains / length;
  let averageLoss = losses / length;
  for (let index = length + 1; index < clean.length; index += 1) {
    const change = clean[index] - clean[index - 1];
    averageGain = ((averageGain * (length - 1)) + Math.max(0, change)) / length;
    averageLoss = ((averageLoss * (length - 1)) + Math.max(0, -change)) / length;
  }
  if (averageLoss === 0) return 100;
  return 100 - (100 / (1 + averageGain / averageLoss));
}

export function buildTechnicalContext(history = [], price = null) {
  const closes = history.map((bar) => finite(bar.close)).filter((value) => value !== null);
  const current = price ?? closes.at(-1) ?? null;
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const previous = closes.at(-6) ?? null;
  const slopePct = current !== null && previous ? ((current - previous) / previous) * 100 : null;
  let trend = 'neutral';
  if (current !== null && ema20 !== null && ema50 !== null) {
    if (current > ema20 && ema20 > ema50 && slopePct > 0) trend = 'bullish';
    else if (current < ema20 && ema20 < ema50 && slopePct < 0) trend = 'bearish';
  }
  return {
    trend,
    price: round(current, 2),
    ema20: round(ema20, 2),
    ema50: round(ema50, 2),
    rsi14: round(rsi14, 1),
    fiveDaySlopePct: round(slopePct, 2),
    bars: closes.length,
    asOf: history.at(-1)?.date || null
  };
}
