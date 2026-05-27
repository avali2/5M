export const finite = (...values) => values.find((value) => Number.isFinite(Number(value))) ?? null;
export const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
export const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
export const mid = (bid, ask) => Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid ? (bid + ask) / 2 : null;

export function sma(values, period) {
  const recent = values.slice(-period);
  if (recent.length < period) return null;
  return recent.reduce((sum, value) => sum + value, 0) / period;
}

export function trendFromHistory(closes) {
  const last = closes.at(-1);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  if (![last, sma20, sma50].every(Number.isFinite)) return 'unavailable';
  if (last > sma20 && sma20 > sma50) return 'bullish';
  if (last < sma20 && sma20 < sma50) return 'bearish';
  return 'range';
}

export function percentileRank(samples, current, minimum) {
  if (!Number.isFinite(current) || samples.length < minimum) return null;
  const below = samples.filter((sample) => sample.iv <= current).length;
  return round((below / samples.length) * 100, 0);
}

export function ivStatistics(samples, current, minimum) {
  if (!Number.isFinite(current) || samples.length < minimum) return { ivRank: null, ivPercentile: null };
  const values = samples.map((sample) => sample.iv).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const ivRank = max === min ? 50 : round(((current - min) / (max - min)) * 100, 0);
  return {
    ivRank: clamp(ivRank, 0, 100),
    ivPercentile: percentileRank(samples, current, minimum)
  };
}

export function daysTo(date) {
  return Math.ceil((new Date(`${date}T20:00:00Z`).getTime() - Date.now()) / 86400000);
}
