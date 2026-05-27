import { round, trendFromHistory } from '../lib/math.js';

function ema(values, period) {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  values.slice(period).forEach((value) => {
    current = (value - current) * multiplier + current;
  });
  return round(current);
}

function atr(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const ranges = bars.slice(1).map((bar, index) => {
    const previousClose = bars[index].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });
  return round(ranges.slice(-period).reduce((sum, value) => sum + value, 0) / period);
}

function rollingVwap(bars, period = 20) {
  const recent = bars.slice(-period).filter((bar) => Number.isFinite(bar.volume) && bar.volume > 0);
  const volume = recent.reduce((sum, bar) => sum + bar.volume, 0);
  if (!volume) return null;
  return round(recent.reduce((sum, bar) => sum + ((bar.high + bar.low + bar.close) / 3) * bar.volume, 0) / volume);
}

function realizedVolatility(bars, period = 20) {
  const closes = bars.slice(-(period + 1)).map((bar) => bar.close);
  if (closes.length < period + 1) return null;
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1);
  return round(Math.sqrt(variance) * Math.sqrt(252) * 100, 1);
}

function priceLevels(bars) {
  const recent = bars.slice(-20);
  if (!recent.length) return { support: null, resistance: null };
  return {
    support: round(Math.min(...recent.map((bar) => bar.low))),
    resistance: round(Math.max(...recent.map((bar) => bar.high)))
  };
}

function volumeProfile(bars) {
  const usable = bars.slice(-40).filter((bar) => Number.isFinite(bar.volume) && bar.volume > 0);
  if (!usable.length) return [];
  const range = Math.max(...usable.map((bar) => bar.high)) - Math.min(...usable.map((bar) => bar.low));
  const bucketSize = Math.max(range / 10, 0.01);
  const buckets = new Map();
  usable.forEach((bar) => {
    const typical = (bar.high + bar.low + bar.close) / 3;
    const level = Math.round(typical / bucketSize) * bucketSize;
    buckets.set(level, (buckets.get(level) || 0) + bar.volume);
  });
  return [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([price, volume]) => ({
    price: round(price),
    volume
  }));
}

export function deriveTechnicals(bars) {
  const closeBars = bars.filter((bar) => Number.isFinite(bar.close));
  const valid = bars.filter((bar) => [bar.close, bar.high, bar.low].every(Number.isFinite));
  const closes = closeBars.map((bar) => bar.close);
  const levels = priceLevels(valid);
  return {
    trend: trendFromHistory(closes),
    ema9: ema(closes, 9),
    ema21: ema(closes, 21),
    ema50: ema(closes, 50),
    atr14: atr(valid),
    vwap20: rollingVwap(valid),
    realizedVolatility20: realizedVolatility(valid),
    support: levels.support,
    resistance: levels.resistance,
    volumeProfile: volumeProfile(valid),
    source: 'daily OHLCV provider bars'
  };
}
