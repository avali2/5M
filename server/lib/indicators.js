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

export function atr(bars = [], length = 14) {
  const ranges = [];
  for (let index = 0; index < bars.length; index += 1) {
    const high = finite(bars[index]?.high);
    const low = finite(bars[index]?.low);
    const previousClose = finite(bars[index - 1]?.close);
    if (high === null || low === null) continue;
    ranges.push(previousClose === null
      ? high - low
      : Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
  }
  return sma(ranges, length);
}

function timestampOf(bar) {
  const raw = bar?.timestamp ?? bar?.time ?? bar?.date;
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') {
    const milliseconds = raw < 1e12 ? raw * 1000 : raw;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedBars(bars = []) {
  return bars.map((bar, index) => ({
    ...bar,
    close: finite(bar.close, finite(bar.price)),
    open: finite(bar.open, finite(bar.price)),
    high: finite(bar.high, finite(bar.price)),
    low: finite(bar.low, finite(bar.price)),
    volume: finite(bar.volume, 0),
    _timestamp: timestampOf(bar),
    _index: index
  })).filter((bar) => bar.close !== null)
    .sort((left, right) => (left._timestamp ?? left._index) - (right._timestamp ?? right._index));
}

function mergeBars(group) {
  const first = group[0];
  const last = group.at(-1);
  return {
    time: last.timestamp ?? last.time ?? last.date ?? null,
    open: first.open,
    high: Math.max(...group.map((bar) => bar.high ?? bar.close)),
    low: Math.min(...group.map((bar) => bar.low ?? bar.close)),
    close: last.close,
    volume: group.reduce((sum, bar) => sum + (bar.volume || 0), 0)
  };
}

export function aggregateBars(bars = [], factor = 1) {
  // A provider correction replaces the earlier observation for the same interval.
  const byTime = new Map();
  for (const bar of normalizedBars(bars)) {
    if (bar._timestamp !== null && bar._timestamp % 300000 === 0) byTime.set(bar._timestamp, bar);
  }
  const clean = [...byTime.values()];
  if (factor <= 1) return clean.map(({ _timestamp, _index, ...bar }) => bar);
  const buckets = new Map();
  // Regular US sessions start on the half-hour in both standard and daylight time.
  for (const bar of clean) {
    const bucket = Math.floor((bar._timestamp - 1800000) / (factor * 300000));
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(bar);
  }
  const aggregated = [];
  for (const group of buckets.values()) {
    if (group.length === factor) aggregated.push(mergeBars(group));
  }
  return aggregated;
}

function weekKey(bar) {
  const timestamp = timestampOf(bar);
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

export function aggregateWeekly(bars = []) {
  const clean = normalizedBars(bars);
  const weeks = new Map();
  for (const bar of clean) {
    const key = weekKey(bar) || `unknown-${bar._index}`;
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(bar);
  }
  return [...weeks.values()].map(mergeBars);
}

function timeframeContext(bars = [], label) {
  const clean = normalizedBars(bars);
  const closes = clean.map((bar) => bar.close);
  const last = closes.at(-1) ?? null;
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const prior = closes.at(-6) ?? null;
  const slopePct = last !== null && prior ? ((last - prior) / prior) * 100 : null;
  const sufficient = closes.length >= 21 && ema9 !== null && ema21 !== null;
  let trend = 'neutral';
  if (sufficient && last > ema9 && ema9 > ema21 && (rsi14 ?? 50) >= 50 && (slopePct ?? 0) >= 0) trend = 'bullish';
  if (sufficient && last < ema9 && ema9 < ema21 && (rsi14 ?? 50) <= 50 && (slopePct ?? 0) <= 0) trend = 'bearish';
  const recent = clean.slice(-20);
  const recentWindow = clean.slice(-21);
  const windowStartTimestamp = recentWindow[0]?._timestamp ?? null;
  const windowEndTimestamp = clean.at(-1)?._timestamp ?? null;
  const windowSpanMinutes = windowStartTimestamp !== null && windowEndTimestamp !== null
    ? round((windowEndTimestamp - windowStartTimestamp) / 60000, 1)
    : null;
  return {
    label,
    trend,
    sufficient,
    bars: closes.length,
    last: round(last, 2),
    ema9: round(ema9, 2),
    ema21: round(ema21, 2),
    ema20: round(ema20, 2),
    ema50: round(ema50, 2),
    sma20: round(sma20, 2),
    sma50: round(sma50, 2),
    rsi14: round(rsi14, 1),
    atr14: round(atr(clean, 14), 2),
    slopePct: round(slopePct, 2),
    windowSpanMinutes,
    support20: recent.length ? round(Math.min(...recent.map((bar) => bar.low ?? bar.close)), 2) : null,
    resistance20: recent.length ? round(Math.max(...recent.map((bar) => bar.high ?? bar.close)), 2) : null,
    asOf: clean.at(-1)?.timestamp ?? clean.at(-1)?.time ?? clean.at(-1)?.date ?? null
  };
}

export function buildMultiTimeframeContext({ daily = [], intraday5m = [], price = null } = {}) {
  const normalizedDaily = normalizedBars(daily);
  if (price !== null && normalizedDaily.length) {
    const current = finite(price, normalizedDaily.at(-1).close);
    const last = normalizedDaily[normalizedDaily.length - 1];
    last.close = current;
    last.high = Math.max(last.high ?? current, current);
    last.low = Math.min(last.low ?? current, current);
  }
  const m5Bars = aggregateBars(intraday5m, 1);
  const m15Bars = aggregateBars(intraday5m, 3);
  const h1Bars = aggregateBars(intraday5m, 12);
  const d1Bars = normalizedDaily.map(({ _timestamp, _index, ...bar }) => bar);
  const w1Bars = aggregateWeekly(daily);
  const timeframes = {
    m5: timeframeContext(m5Bars, '5m'),
    m15: timeframeContext(m15Bars, '15m'),
    h1: timeframeContext(h1Bars, '1h'),
    d1: timeframeContext(d1Bars, '1D'),
    w1: timeframeContext(w1Bars, '1W')
  };
  const available = Object.values(timeframes).filter((timeframe) => timeframe.sufficient);
  const bullish = available.filter((timeframe) => timeframe.trend === 'bullish').length;
  const bearish = available.filter((timeframe) => timeframe.trend === 'bearish').length;
  const neutral = available.length - bullish - bearish;
  let trend = 'neutral';
  if (bullish >= 3 && bearish <= 1) trend = 'bullish';
  if (bearish >= 3 && bullish <= 1) trend = 'bearish';
  const dominant = Math.max(bullish, bearish, neutral);
  const dailyContext = timeframes.d1;
  return {
    trend,
    price: round(finite(price, dailyContext.last), 2),
    ema20: dailyContext.ema20,
    ema50: dailyContext.ema50,
    rsi14: dailyContext.rsi14,
    fiveDaySlopePct: dailyContext.slopePct,
    bars: dailyContext.bars,
    asOf: dailyContext.asOf,
    intradayAsOf: timeframes.m5.asOf,
    timeframes,
    timeframeSummary: {
      available: available.length,
      bullish,
      bearish,
      neutral,
      alignmentPct: available.length ? Math.round((dominant / available.length) * 100) : 0
    },
    support: dailyContext.support20,
    resistance: dailyContext.resistance20,
    atr14: dailyContext.atr14
  };
}

export function buildTechnicalContext(history = [], price = null) {
  return buildMultiTimeframeContext({ daily: history, intraday5m: [], price });
}
