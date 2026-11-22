/**
 * 5M · Proveedor de datos reales sin clave (fallback de Tradier).
 *
 * - Cotización e histórico: StockAnalysis (API pública) con respaldo de Yahoo.
 * - Cadena de opciones y spot: OptionsProfitCalculator (delayed).
 * - IV y Greeks: se calculan localmente con optionsMath.
 *
 * Si una fuente falla se lanza el error y marketData cae a modo demo con
 * advertencia explícita; nunca se mezclan datos reales con simulados.
 */
import { config } from '../config.js';
import { fetchJson } from './http.js';
import { impliedVol, bsGreeks, atmIvFor, round2, round4 } from './optionsMath.js';

const UA = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Accept: 'application/json, text/plain, */*'
};
const TIMEOUT = 12000;
let requestId = 1;

const cache = new Map();
function cached(key, ttlMs, producer) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < ttlMs) return entry.value;
  const value = producer();
  cache.set(key, { at: Date.now(), value });
  value?.catch?.(() => cache.delete(key));
  return value;
}

export function freeDataEnabled() {
  return Boolean(config.freeData?.enabled);
}

async function getJson(url, { timeout = TIMEOUT } = {}) {
  return fetchJson(url, { headers: UA }, timeout);
}

export function isMarketOpenET(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5 && minutes >= 570 && minutes < 960;
}

/* --------------------------------- Quote ---------------------------------- */
function quoteFromStockAnalysis(symbol, data, fallbackPrice) {
  const price = Number.isFinite(data?.p) ? data.p : fallbackPrice;
  const previous = Number.isFinite(data?.cl) ? data.cl : price;
  return {
    symbol,
    name: symbol,
    price: round2(price),
    bid: round2(price * 0.9999),
    ask: round2(price * 1.0001),
    change: round2(price - previous),
    changePct: previous > 0 ? round2(((price - previous) / previous) * 100) : 0,
    open: Number.isFinite(data?.o) ? round2(data.o) : round2(price),
    high: Number.isFinite(data?.h) ? round2(data.h) : round2(price),
    low: Number.isFinite(data?.l) ? round2(data.l) : round2(price),
    prevClose: round2(previous),
    volume: Number.isFinite(data?.v) ? Math.round(data.v) : 0,
    tradeDate: new Date().toISOString(),
    afterHoursPrice: Number.isFinite(data?.ep) ? round2(data.ep) : null,
    marketState: typeof data?.es === 'string' && data.es ? data.es : null,
    source: 'StockAnalysis (delayed)'
  };
}

async function fetchHistory(symbol) {
  const payload = await getJson(`https://stockanalysis.com/api/symbol/s/${encodeURIComponent(symbol)}/history?range=1Y&period=Day`);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const bars = rows
    .filter((row) => Number.isFinite(row?.c))
    .map((row) => ({
      date: String(row.t || '').slice(0, 10),
      open: Number.isFinite(row.o) ? row.o : row.c,
      high: Number.isFinite(row.h) ? row.h : row.c,
      low: Number.isFinite(row.l) ? row.l : row.c,
      close: row.c,
      volume: Number.isFinite(row.v) ? row.v : 0
    }))
    .reverse();
  if (bars.length < 60) throw new Error('Histórico insuficiente en StockAnalysis.');
  return bars;
}

async function fetchIntraday(symbol) {
  try {
    const payload = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=5m&includePrePost=false`);
    const result = payload?.chart?.result?.[0];
    if (!result?.timestamp?.length) return [];
    const quote = result.indicators?.quote?.[0] || {};
    const bars = [];
    for (let index = 0; index < result.timestamp.length; index += 1) {
      const close = quote.close?.[index];
      if (!Number.isFinite(close)) continue;
      const stamp = new Date(result.timestamp[index] * 1000);
      bars.push({
        time: stamp.toISOString(), timestamp: stamp.toISOString(),
        open: Number.isFinite(quote.open?.[index]) ? quote.open[index] : close,
        high: Number.isFinite(quote.high?.[index]) ? quote.high[index] : close,
        low: Number.isFinite(quote.low?.[index]) ? quote.low[index] : close,
        close,
        volume: Number.isFinite(quote.volume?.[index]) ? quote.volume[index] : 0
      });
    }
    return bars;
  } catch { return []; }
}

/* ------------------------------- OPC chain -------------------------------- */
export async function fetchFreeChain(symbol) {
  const id = requestId++;
  const payload = await getJson(`https://www.optionsprofitcalculator.com/ajax/getOptions?stock=${encodeURIComponent(symbol)}&reqId=${id}`);
  if (!payload?.options || typeof payload.options !== 'object') throw new Error('OptionsProfitCalculator no devolvió cadena.');
  return payload.options;
}

export async function fetchOpcSpot(symbol) {
  const id = requestId++;
  const payload = await getJson(`https://www.optionsprofitcalculator.com/ajax/getStockPrice?stock=${encodeURIComponent(symbol)}&reqId=${id}`);
  const price = payload?.price;
  if (!price) return null;
  return {
    last: Number.isFinite(price.last) ? price.last : null,
    bid: Number.isFinite(price.bid) ? price.bid : null,
    ask: Number.isFinite(price.ask) ? price.ask : null,
    close: Number.isFinite(price.close) ? price.close : null,
    ivHist: Number.isFinite(price.ivHist) ? price.ivHist : null
  };
}

export function normalizeChain({ symbol, spot, rawOptions, now = Date.now(), maxExpirations = 4 }) {
  const allExpirations = Object.keys(rawOptions)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .map((date) => ({ date, dte: Math.round((Date.parse(`${date}T21:00:00Z`) - now) / 86400000) }))
    .filter((entry) => entry.dte >= 5 && entry.dte <= 75)
    .sort((left, right) => left.dte - right.dte);
  // Mezcla vencimientos cercanos y de 30-45 días para que NiTo, spreads y el bot tengan su rango.
  const picked = new Map();
  for (const entry of allExpirations.slice(0, 2)) picked.set(entry.date, entry);
  for (const target of [21, 35, 45, 60]) {
    const closest = allExpirations.reduce((best, entry) => (Math.abs(entry.dte - target) < Math.abs((best?.dte ?? 999) - target) ? entry : best), null);
    if (closest) picked.set(closest.date, closest);
  }
  const expirations = [...picked.values()].sort((left, right) => left.dte - right.dte).slice(0, Math.max(maxExpirations, 5));
  if (!expirations.length) throw new Error('Sin vencimientos utilizables en la cadena pública.');
  const chains = {};
  const dteByExpiration = {};
  for (const expiry of expirations) {
    const raw = rawOptions[expiry.date] || {};
    const rows = [];
    const T = Math.max(1 / 365, expiry.dte / 365);
    for (const type of ['call', 'put']) {
      const source = type === 'call' ? raw.c : raw.p;
      if (!source) continue;
      for (const [strikeText, quote] of Object.entries(source)) {
        const strike = Number(strikeText);
        const bid = Number(quote?.b);
        const ask = Number(quote?.a);
        if (!Number.isFinite(strike) || !Number.isFinite(bid) || !Number.isFinite(ask)) continue;
        if (bid <= 0 || ask <= 0 || ask < bid) continue;
        const mid = (bid + ask) / 2;
        let iv = impliedVol({ type, S: spot, K: strike, T, price: mid });
        if (!Number.isFinite(iv) || iv <= 0.02 || iv > 5) iv = null;
        const greeks = iv ? bsGreeks({ type, S: spot, K: strike, T, sigma: iv }) : null;
        rows.push({
          symbol: `${symbol}${expiry.date.replaceAll('-', '')}${type === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`,
          underlying: symbol,
          expiration: expiry.date,
          strike,
          type,
          bid: round2(bid),
          ask: round2(ask),
          mid: round2(mid),
          last: round2(Number(quote?.l) > 0 ? quote.l : mid),
          volume: Math.max(0, Math.round(Number(quote?.v) || 0)),
          openInterest: Math.max(0, Math.round(Number(quote?.oi) || 0)),
          iv: iv ? round4(iv) : null,
          delta: greeks ? round4(greeks.delta) : null,
          gamma: greeks ? round4(greeks.gamma) : null,
          theta: greeks ? round4(greeks.theta) : null,
          vega: greeks ? round4(greeks.vega) : null,
          rho: greeks ? round4(greeks.rho) : null,
          greeksAt: new Date(now).toISOString(),
          source: 'OPC'
        });
      }
    }
    const atm = atmIvFor({ chain: rows.filter((row) => Number.isFinite(row.iv)), spot });
    if (atm) {
      for (const row of rows) {
        if (row.iv) continue;
        const greeks = bsGreeks({ type: row.type, S: spot, K: row.strike, T, sigma: atm });
        row.iv = round4(atm);
        if (greeks) {
          row.delta = round4(greeks.delta); row.gamma = round4(greeks.gamma);
          row.theta = round4(greeks.theta); row.vega = round4(greeks.vega); row.rho = round4(greeks.rho);
        }
      }
    }
    if (rows.length) { chains[expiry.date] = rows; dteByExpiration[expiry.date] = expiry.dte; }
  }
  if (!Object.keys(chains).length) throw new Error('La cadena pública quedó vacía tras normalizar.');
  return { chains, dteByExpiration, expirations: Object.keys(chains) };
}

/* ------------------------------- Snapshot --------------------------------- */
export async function freeSnapshot(symbolInput, { now = new Date() } = {}) {
  const symbol = String(symbolInput || '').toUpperCase();
  const warnings = [];
  const [history, rawOptions, opcSpot] = await Promise.all([
    cached('history:' + symbol, 6 * 3600000, () => fetchHistory(symbol)),
    cached('chain:' + symbol, 60000, () => fetchFreeChain(symbol)),
    cached('spot:' + symbol, 20000, () => fetchOpcSpot(symbol).catch(() => null))
  ]);
  const lastClose = history[history.length - 1]?.close;
  let quoteData = null;
  try {
    const payload = await cached('quote:' + symbol, 20000, () => getJson(`https://stockanalysis.com/api/quotes/s/${encodeURIComponent(symbol)}`));
    quoteData = payload?.data || null;
  } catch (error) { warnings.push('Cotización de StockAnalysis no disponible: ' + error.message); }
  const regularPrice = Number.isFinite(quoteData?.p) ? quoteData.p : lastClose;
  const marketOpen = isMarketOpenET(now);
  let spot = marketOpen && Number.isFinite(opcSpot?.last) ? opcSpot.last : regularPrice;
  let spotSource = spot === opcSpot?.last && marketOpen ? 'opc' : 'stockanalysis';
  if (Number.isFinite(regularPrice) && Number.isFinite(opcSpot?.last) && regularPrice > 0) {
    const gap = Math.abs(opcSpot.last - regularPrice) / regularPrice;
    if (gap > 0.015) {
      warnings.push(`El precio de OPC (${round2(opcSpot.last)}) difiere ${round2(gap * 100)}% de la cotización (${round2(regularPrice)}): se usa la cotización.`);
      spot = regularPrice;
      spotSource = 'stockanalysis';
    }
  }
  if (!Number.isFinite(spot) || spot <= 0) throw new Error('Sin precio de subyacente verificable.');
  const quote = quoteFromStockAnalysis(symbol, { ...(quoteData || {}), p: spot }, lastClose);
  quote.spotSource = spotSource;
  const intraday = await fetchIntraday(symbol);
  if (!intraday.length) warnings.push('Sin intradía: tendencia basada en diario y semanal.');
  const normalized = normalizeChain({ symbol, spot, rawOptions, now: now.getTime(), maxExpirations: 4 });
  return {
    symbol,
    asOf: now.toISOString(),
    source: 'free',
    simulated: false,
    marketOpen,
    marketState: quote.marketState || (isMarketOpenET(now) ? 'open' : 'closed'),
    quote,
    history,
    intraday,
    expirations: normalized.expirations,
    dteByExpiration: normalized.dteByExpiration,
    chains: normalized.chains,
    events: [],
    rate: config.tradier.rate,
    warnings
  };
}

export async function freeProbe(symbol = 'SPY') {
  const steps = [];
  const started = Date.now();
  try {
    const payload = await getJson(`https://stockanalysis.com/api/quotes/s/${encodeURIComponent(symbol)}`);
    steps.push({ name: 'stockanalysis-quote', ok: Boolean(payload?.data), price: payload?.data?.p ?? null, ms: Date.now() - started });
  } catch (error) { steps.push({ name: 'stockanalysis-quote', ok: false, error: error.message.slice(0, 120) }); }
  const histStart = Date.now();
  try {
    const bars = await fetchHistory(symbol);
    steps.push({ name: 'stockanalysis-history', ok: true, bars: bars.length, last: bars[bars.length - 1]?.close, ms: Date.now() - histStart });
  } catch (error) { steps.push({ name: 'stockanalysis-history', ok: false, error: error.message.slice(0, 120) }); }
  const chainStart = Date.now();
  try {
    const raw = await fetchFreeChain(symbol);
    const dates = Object.keys(raw);
    steps.push({ name: 'opc-chain', ok: true, expirations: dates.length, strikes: Object.keys(raw[dates[0]]?.c || {}).length, ms: Date.now() - chainStart });
  } catch (error) { steps.push({ name: 'opc-chain', ok: false, error: error.message.slice(0, 120) }); }
  const spotStart = Date.now();
  try {
    const spot = await fetchOpcSpot(symbol);
    steps.push({ name: 'opc-spot', ok: Boolean(spot?.last), last: spot?.last ?? null, ms: Date.now() - spotStart });
  } catch (error) { steps.push({ name: 'opc-spot', ok: false, error: error.message.slice(0, 120) }); }
  return { symbol, ok: steps.every((step) => step.ok), steps, ms: Date.now() - started };
}