/**
 * 5M · Datos crypto (Binance.US público, fallback Kraken).
 * Sin claves para datos; las claves Binance.US solo se usarán para ejecución real.
 */
const BINANCE_US = 'https://api.binance.us/api/v3';
const KRAKEN = 'https://api.kraken.com/0/public';
const cache = new Map();

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

async function getJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': '5M/1.0' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function ema(values, length) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < length) return null;
  const k = 2 / (length + 1);
  let result = clean.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  for (const value of clean.slice(length)) result = value * k + result * (1 - k);
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
  let avgGain = gains / length;
  let avgLoss = losses / length;
  for (let index = length + 1; index < clean.length; index += 1) {
    const change = clean[index] - clean[index - 1];
    avgGain = (avgGain * (length - 1) + Math.max(0, change)) / length;
    avgLoss = (avgLoss * (length - 1) + Math.max(0, -change)) / length;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

export function atr(bars, length = 14) {
  const clean = bars.filter((bar) => [bar.high, bar.low, bar.close].every((value) => Number.isFinite(value)));
  if (clean.length < length + 2) return null;
  const ranges = [];
  for (let index = 1; index < clean.length; index += 1) {
    ranges.push(Math.max(clean[index].high - clean[index].low, Math.abs(clean[index].high - clean[index - 1].close), Math.abs(clean[index].low - clean[index - 1].close)));
  }
  return ranges.slice(-length).reduce((sum, value) => sum + value, 0) / length;
}

export async function getBinanceKlines(symbol = 'SOLUSDT', interval = '1h', limit = 500) {
  return cached('binance:' + symbol + ':' + interval, 60000, async () => {
    const rows = await getJson(BINANCE_US + '/klines?symbol=' + encodeURIComponent(symbol) + '&interval=' + interval + '&limit=' + limit);
    if (!Array.isArray(rows) || !rows.length) throw new Error('Binance.US sin velas para ' + symbol);
    return rows.map((row) => ({ time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }));
  });
}

export async function getBinanceTicker(symbol = 'SOLUSDT') {
  return cached('binance-ticker:' + symbol, 30000, async () => {
    const json = await getJson(BINANCE_US + '/ticker/24hr?symbol=' + encodeURIComponent(symbol));
    return { price: num(json.lastPrice), change24h: num(json.priceChangePercent), high24h: num(json.highPrice), low24h: num(json.lowPrice), volume24h: num(json.quoteVolume) };
  });
}

async function getKrakenBars(pair = 'SOLUSD', interval = 60) {
  const json = await getJson(KRAKEN + '/OHLC?pair=' + pair + '&interval=' + interval);
  if (Array.isArray(json.error) && json.error.length) throw new Error(json.error[0]);
  const result = json.result || {};
  const key = Object.keys(result).find((name) => name !== 'last');
  const rows = key ? result[key] : [];
  if (!Array.isArray(rows) || !rows.length) throw new Error('Kraken sin velas');
  return rows.map((row) => ({ time: Number(row[0]) * 1000, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[6]) }));
}

export async function getCryptoSnapshot(options = {}) {
  const symbol = String(options.symbol || 'SOLUSDT');
  const interval = String(options.interval || '1h');
  let bars = null;
  let ticker = null;
  let source = 'binance.us';
  try {
    bars = await getBinanceKlines(symbol, interval, 500);
    ticker = await getBinanceTicker(symbol);
  } catch (error) {
    const krakenPair = symbol.replace('USDT', 'USD').replace('USDC', 'USD');
    bars = await getKrakenBars(krakenPair, interval === '1h' ? 60 : interval);
    source = 'kraken';
  }
  const closes = bars.map((bar) => bar.close);
  const price = ticker?.price ?? closes[closes.length - 1];
  const last = bars[bars.length - 1];
  const change24h = ticker?.change24h ?? (closes.length > 24 ? ((price / closes[closes.length - 25] - 1) * 100) : null);
  return {
    symbol, source, interval, price,
    bars, ema20: ema(closes, 20), ema50: ema(closes, 50), ema200: ema(closes, 200),
    rsi14: rsi(closes, 14), atr14: atr(bars, 14), change24h,
    high24h: ticker?.high24h ?? last.high, low24h: ticker?.low24h ?? last.low,
    volume24h: ticker?.volume24h ?? null,
    updatedAt: new Date().toISOString()
  };
}
