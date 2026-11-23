/**
 * 5M · Datos forex gratuitos (Yahoo chart con fallback Stooq diario).
 */
const cache = new Map();
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const STOOQ = 'https://stooq.com/q/d/l/?s=';

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

function ema(values, length) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < length) return null;
  const k = 2 / (length + 1);
  let result = clean.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  for (const value of clean.slice(length)) result = value * k + result * (1 - k);
  return result;
}

function rsi(values, length = 14) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length <= length) return null;
  let gains = 0; let losses = 0;
  for (let index = 1; index <= length; index += 1) {
    const change = clean[index] - clean[index - 1];
    if (change >= 0) gains += change; else losses -= change;
  }
  let avgGain = gains / length; let avgLoss = losses / length;
  for (let index = length + 1; index < clean.length; index += 1) {
    const change = clean[index] - clean[index - 1];
    avgGain = (avgGain * (length - 1) + Math.max(0, change)) / length;
    avgLoss = (avgLoss * (length - 1) + Math.max(0, -change)) / length;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(bars, length = 14) {
  const clean = bars.filter((bar) => [bar.high, bar.low, bar.close].every((value) => Number.isFinite(value)));
  if (clean.length < length + 2) return null;
  const ranges = [];
  for (let index = 1; index < clean.length; index += 1) {
    ranges.push(Math.max(clean[index].high - clean[index].low, Math.abs(clean[index].high - clean[index - 1].close), Math.abs(clean[index].low - clean[index - 1].close)));
  }
  return ranges.slice(-length).reduce((sum, value) => sum + value, 0) / length;
}

function cached(key, ttl, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function isForexOpen(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const day = parts.weekday;
  const hour = Number(parts.hour);
  if (day === 'Sat') return false;
  if (day === 'Fri' && hour >= 17) return false;
  if (day === 'Sun' && hour < 17) return false;
  return true;
}

export async function getYahooBars(symbol, interval = '1h', range = '1mo') {
  const yahooSymbol = (PAIRS[symbol] && PAIRS[symbol].yahoo) || (symbol + '=X');
  const url = YAHOO + encodeURIComponent(yahooSymbol) + '?interval=' + interval + '&range=' + range;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 5M/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('Yahoo HTTP ' + res.status);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  const bars = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const close = num(quote?.close?.[index]);
    const high = num(quote?.high?.[index]);
    const low = num(quote?.low?.[index]);
    if (![close, high, low].every((value) => Number.isFinite(value) && value > 0)) continue;
    if (high < low || high / close > 1.05 || low / close < 0.95) continue;
    bars.push({ time: timestamps[index] * 1000, open: num(quote?.open?.[index]) ?? close, high, low, close });
  }
  const clean = bars.filter((bar, index) => index === 0 || Math.abs(bar.close / bars[index - 1].close - 1) <= 0.02);
  if (clean.length < 60) throw new Error('Yahoo sin velas suficientes');
  return clean;
}

export async function getStooqBars(pair) {
  const url = STOOQ + pair.toLowerCase() + '&i=d';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 5M/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('Stooq HTTP ' + res.status);
  const text = await res.text();
  const lines = text.trim().split('\\n').slice(1);
  const bars = [];
  for (const line of lines) {
    const [date, open, high, low, close] = line.split(',');
    const bar = { time: Date.parse(date + 'T00:00:00Z'), open: num(open), high: num(high), low: num(low), close: num(close) };
    if ([bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) && bar.high >= bar.low && bar.high / bar.close < 1.05 && bar.low / bar.close > 0.95) bars.push(bar);
  }
  if (bars.length < 60) throw new Error('Stooq sin velas suficientes');
  return bars;
}

const PAIRS = {
  EURUSD: { yahoo: 'EURUSD=X', spread: 0.00008, pip: 0.0001 },
  GBPUSD: { yahoo: 'GBPUSD=X', spread: 0.00012, pip: 0.0001 },
  AUDUSD: { yahoo: 'AUDUSD=X', spread: 0.00010, pip: 0.0001 },
  XAUUSD: { yahoo: 'GC=F', spread: 0.35, pip: 0.01 }
};

export async function getForexSnapshot(options = {}) {
  const symbol = String(options.symbol || 'EURUSD').toUpperCase();
  const pair = PAIRS[symbol] || PAIRS.EURUSD;
  const spreadPrice = pair.spread;
  const pipSize = pair.pip;
  let bars = null;
  let source = 'yahoo';
  try { bars = await cached('fx:yahoo:' + symbol, 60000, () => getYahooBars(symbol)); }
  catch { bars = await cached('fx:stooq:' + symbol, 600000, () => getStooqBars(symbol)); source = 'stooq'; }
  const closes = bars.map((bar) => bar.close);
  const price = closes[closes.length - 1];
  return {
    symbol, source, price,
    bid: price - spreadPrice / 2,
    ask: price + spreadPrice / 2,
    spreadPips: Math.round((spreadPrice / pipSize) * 10) / 10,
    spreadPrice, pipSize,
    bars, ema50: ema(closes, 50), ema200: ema(closes, 200), rsi14: rsi(closes, 14),
    atr14: (() => {
      const raw = atr(bars, 14);
      if (Number.isFinite(raw) && raw / price < 0.02) return raw;
      const diffs = [];
      for (let index = Math.max(1, closes.length - 15); index < closes.length; index += 1) diffs.push(Math.abs(closes[index] - closes[index - 1]));
      return diffs.length ? diffs.reduce((sum, value) => sum + value, 0) / diffs.length : raw;
    })(),
    marketOpen: isForexOpen(), updatedAt: new Date().toISOString()
  };
}