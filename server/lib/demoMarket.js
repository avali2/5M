/**
 * 5M · Mercado simulado (modo DEMO).
 *
 * Genera datos DETERMINISTAS y realistas (precio, historia, cadena con Greeks,
 * volatilidad implícita por strike y vencimiento) para poder probar la app sin
 * TRADIER_TOKEN. Todo snapshot lleva `simulated: true` y la UI debe mostrar
 * el banner de datos simulados. Nunca se mezcla con datos reales.
 */
import { bsGreeks, impliedVol, yearFraction, clamp, DEFAULT_RATE } from './optionsMath.js';

const SYMBOL_PROFILE = {
  AMD: { price: 168, vol: 0.48, drift: 0.16, step: 2.5, div: 0, sector: 'Semiconductores', name: 'Advanced Micro Devices' },
  SPY: { price: 612, vol: 0.14, drift: 0.09, step: 1, div: 0.012, sector: 'Índice S&P 500', name: 'SPDR S&P 500 ETF' },
  QQQ: { price: 528, vol: 0.19, drift: 0.13, step: 1, div: 0.006, sector: 'Índice Nasdaq 100', name: 'Invesco QQQ Trust' },
  IWM: { price: 232, vol: 0.22, drift: 0.07, step: 1, div: 0.011, sector: 'Índice Russell 2000', name: 'iShares Russell 2000' },
  DIA: { price: 445, vol: 0.13, drift: 0.07, step: 1, div: 0.017, sector: 'Índice Dow Jones', name: 'SPDR Dow Jones ETF' },
  NVDA: { price: 142, vol: 0.52, drift: 0.21, step: 2.5, div: 0.001, sector: 'Semiconductores', name: 'NVIDIA Corp' },
  MSFT: { price: 468, vol: 0.23, drift: 0.12, step: 5, div: 0.008, sector: 'Software', name: 'Microsoft Corp' },
  AAPL: { price: 254, vol: 0.26, drift: 0.1, step: 2.5, div: 0.005, sector: 'Hardware', name: 'Apple Inc' },
  TSLA: { price: 322, vol: 0.55, drift: 0.05, step: 5, div: 0, sector: 'Automotriz / EV', name: 'Tesla Inc' },
  META: { price: 618, vol: 0.31, drift: 0.14, step: 5, div: 0.003, sector: 'Internet', name: 'Meta Platforms' },
  AMZN: { price: 226, vol: 0.28, drift: 0.11, step: 2.5, div: 0, sector: 'E-commerce / Cloud', name: 'Amazon.com' },
  GOOGL: { price: 198, vol: 0.27, drift: 0.1, step: 2.5, div: 0.004, sector: 'Internet', name: 'Alphabet Inc' },
  PLTR: { price: 74, vol: 0.62, drift: 0.19, step: 1, div: 0, sector: 'Software / Defensa', name: 'Palantir' },
  COIN: { price: 312, vol: 0.68, drift: 0.12, step: 5, div: 0, sector: 'Cripto', name: 'Coinbase' },
  SOFI: { price: 15.4, vol: 0.58, drift: 0.06, step: 0.5, div: 0, sector: 'Fintech', name: 'SoFi Technologies' },
  MARA: { price: 19.2, vol: 0.85, drift: 0.02, step: 0.5, div: 0, sector: 'Cripto minería', name: 'MARA Holdings' },
  XSP: { price: 615, vol: 0.14, drift: 0.09, step: 1, div: 0.012, sector: 'Índice S&P 500 (minis)', name: 'Mini-SPX Index' }
};

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TRADING_DAYS = 252;
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const iso = (date) => date.toISOString().slice(0, 10);

function etParts(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return parts;
}

export function isMarketOpen(now = new Date()) {
  const parts = etParts(now);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5 && minutes >= 570 && minutes < 960;
}

export function profileFor(symbol) {
  return SYMBOL_PROFILE[String(symbol).toUpperCase()] || { price: 120, vol: 0.45, drift: 0.1, step: 2.5, div: 0, sector: 'Acciones', name: String(symbol).toUpperCase() };
}

/** Lunes a viernes hábiles desde hoy. */
function nextTradingDays(now, count) {
  const days = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (days.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(new Date(cursor));
  }
  return days;
}

function fridaysUntil(now, limit = 6) {
  const result = [];
  const days = nextTradingDays(now, 80);
  for (const day of days) {
    if (day.getUTCDay() === 5) {
      result.push(iso(day));
      if (result.length >= limit) break;
    }
  }
  return result;
}

/** Superficie de volatilidad: base por símbolo + sesgo por moneyness + término. */
function ivSurface({ symbol, moneyness, dte, rand }) {
  const profile = profileFor(symbol);
  const base = profile.vol * (1 + (rand() - 0.5) * 0.08);
  const term = 1 + 0.22 * (1 - Math.min(1, dte / 60));
  const skew = 1 + Math.max(-0.45, Math.min(0.65, -moneyness * 2.4)) * 0.55;
  const noise = 1 + (rand() - 0.5) * 0.06;
  return clamp(base * term * skew * noise, 0.06, 3.5);
}

function buildHistory({ symbol, now, rand, regime = 'range' }) {
  const profile = profileFor(symbol);
  const trendSign = regime === 'up' ? 1 : regime === 'down' ? -1 : 0;
  const days = [];
  const cursor = new Date(now.getTime());
  while (days.length < 260) {
    cursor.setDate(cursor.getDate() - 1);
    const weekday = cursor.getDay();
    if (weekday === 0 || weekday === 6) continue;
    days.push(new Date(cursor));
  }
  days.reverse();
  const volatility = (profile.vol / Math.sqrt(TRADING_DAYS)) * (regime === 'range' ? 1 : 0.78);
  let price = profile.price * (1 - profile.drift * 0.35) * (trendSign === 0 ? 1 : (trendSign > 0 ? 0.9 : 1.1));
  const bars = [];
  for (const day of days) {
    const shock = (rand() - 0.5) * 2;
    const drift = (profile.drift + trendSign * profile.vol * 0.55) / TRADING_DAYS;
    price = Math.max(1, price * Math.exp(drift - 0.5 * volatility * volatility + volatility * shock));
    const open = price * (1 + (rand() - 0.5) * 0.004);
    const close = price;
    const high = Math.max(open, close) * (1 + rand() * 0.012);
    const low = Math.min(open, close) * (1 - rand() * 0.012);
    bars.push({
      date: iso(day),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round((profile.price * 1e5) * (0.55 + rand()) * (1 / Math.sqrt(profile.price / 100)))
    });
  }
  // Superpone una tendencia suave y determinista para que las señales tengan dirección.
  const overlayStart = Math.max(0, bars.length - 45);
  for (let index = overlayStart; index < bars.length; index += 1) {
    const factor = Math.exp(trendSign * 0.0017 * (index - (bars.length - 1)));
    const bar = bars[index];
    bar.open = round(bar.open * factor); bar.high = round(bar.high * factor);
    bar.low = round(bar.low * factor); bar.close = round(bar.close * factor);
  }
  return bars;
}

function buildIntraday({ symbol, price, now, rand, regime = 'range' }) {
  const profile = profileFor(symbol);
  const trendSign = regime === 'up' ? 1 : regime === 'down' ? -1 : 0;
  const bars = [];
  const sessionMinutes = 78; // 6.5h en velas de 5 minutos
  const volatility = (profile.vol / Math.sqrt(TRADING_DAYS) / Math.sqrt(sessionMinutes)) * 0.85;
  let cursor = price * (1 - trendSign * 0.006 - (rand() - 0.5) * 0.004);
  const end = new Date(now.getTime());
  for (let i = 0; i < sessionMinutes * 2; i += 1) {
    const shock = (rand() - 0.5) * 2;
    const intradayDrift = trendSign * 0.00022;
    cursor = cursor * Math.exp(intradayDrift - 0.5 * volatility * volatility + volatility * shock);
    const open = cursor;
    const close = cursor * (1 + (rand() - 0.5) * 0.0008);
    const rawStamp = end.getTime() - (sessionMinutes * 2 - i) * 5 * 60000;
    const stamp = new Date(Math.floor(rawStamp / 300000) * 300000);
    bars.push({
      time: stamp.toISOString(),
      timestamp: stamp.toISOString(),
      open: round(open),
      high: round(Math.max(open, close) * (1 + rand() * 0.0016)),
      low: round(Math.min(open, close) * (1 - rand() * 0.0016)),
      close: round(close),
      volume: Math.round(35000 * (0.4 + rand()))
    });
  }
  const overlayStart = Math.max(0, bars.length - 78);
  let lastClose = null;
  for (let index = overlayStart; index < bars.length; index += 1) {
    const factor = Math.exp(trendSign * 0.00055 * (index - (bars.length - 1)));
    const bar = bars[index];
    bar.open = round(bar.open * factor); bar.high = round(bar.high * factor);
    bar.low = round(bar.low * factor); bar.close = round(bar.close * factor);
    lastClose = bar.close;
  }
  if (lastClose && lastClose > 0) {
    const scale = price / lastClose;
    for (const bar of bars) {
      bar.open = round(bar.open * scale); bar.high = round(bar.high * scale);
      bar.low = round(bar.low * scale); bar.close = round(bar.close * scale);
    }
  }
  return bars;
}

function strikesAround(spot, step, count = 18) {
  const base = Math.round(spot / step) * step;
  const strikes = new Set();
  for (let i = -count; i <= count; i += 1) {
    const strike = round(base + i * step);
    if (strike > 0) strikes.add(strike);
  }
  return [...strikes].sort((a, b) => a - b).filter((strike) => strike >= spot * 0.72 && strike <= spot * 1.34);
}

function buildChain({ symbol, spot, expiration, dte, now, rand, r = DEFAULT_RATE }) {
  const profile = profileFor(symbol);
  const T = Math.max(1 / 365, dte / 365);
  const rows = [];
  const strikes = strikesAround(spot, stepFor(symbol));
  const atm = strikes.reduce((best, strike) => (Math.abs(strike - spot) < Math.abs(best - spot) ? strike : best), strikes[0]);
  for (const strike of strikes) {
    for (const type of ['call', 'put']) {
      const moneyness = Math.log(strike / spot);
      const sigma = ivSurface({ symbol, moneyness, dte, rand });
      const greeks = bsGreeks({ type, S: spot, K: strike, T, sigma, r, q: profile.div });
      if (!greeks) continue;
      const theoretical = Math.max(0.01, (greeks ? (type === 'call'
        ? spot * Math.exp(-profile.div * T) * (0.5 + 0.5 * Math.tanh((Math.log(spot / strike) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T))))
        : strike * Math.exp(-r * T) * (0.5 + 0.5 * Math.tanh((Math.log(strike / spot) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T))))) : 0.5));
      // Prima por BS (consistente con Greeks) y spread de mercado.
      const mid = Math.max(0.01, round(bsMid({ type, spot, strike, T, sigma, r, q: profile.div }), 2));
      const spreadPct = clamp(0.012 + 0.05 * Math.abs(moneyness), 0.01, 0.18);
      const half = Math.max(0.01, mid * spreadPct / 2);
      const bid = Math.max(0.01, round(mid - half, 2));
      const ask = round(mid + half, 2);
      const distance = Math.abs(strike - atm) / Math.max(0.01, stepFor(symbol));
      const oi = Math.max(0, Math.round((8200 * Math.exp(-distance / 5) + rand() * 900) * (distance < 1 ? 1.7 : 1)));
      const volume = Math.max(0, Math.round(oi * (0.08 + rand() * 0.55)));
      rows.push({
        symbol: `${symbol}${expiration.replaceAll('-', '')}${type === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`,
        underlying: symbol,
        expiration,
        strike,
        type,
        bid,
        ask,
        mid,
        last: round(rand() > 0.5 ? mid : Math.max(0.01, mid * (0.85 + rand() * 0.3)), 2),
        volume,
        openInterest: oi,
        iv: round(sigma, 4),
        delta: round(greeks.delta, 4),
        gamma: round(greeks.gamma, 4),
        theta: round(greeks.theta, 4),
        vega: round(greeks.vega, 4),
        rho: round(greeks.rho, 4),
        greeksAt: now.toISOString()
      });
      void theoretical;
    }
  }
  return rows;
}

function bsMid({ type, spot, strike, T, sigma, r, q }) {
  const d1 = (Math.log(spot / strike) + (r - q + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const norm = (x) => 0.5 * (1 + erfLocal(x / Math.SQRT2));
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  return type === 'call'
    ? spot * dfQ * norm(d1) - strike * dfR * norm(d2)
    : strike * dfR * norm(-d2) - spot * dfQ * norm(-d1);
}
function erfLocal(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - y * Math.exp(-ax * ax));
}

function stepFor(symbol) {
  return profileFor(symbol).step || 2.5;
}

function upcomingEvents(symbol, now) {
  const events = [];
  const days = nextTradingDays(now, 60);
  const day = (offset) => iso(days[offset] || days[days.length - 1]);
  events.push({ date: day(2), type: 'CPI', label: 'Inflación CPI (8:30 ET)', impact: 'high' });
  events.push({ date: day(9), type: 'FOMC', label: 'Decisión Fed + conferencia', impact: 'high' });
  events.push({ date: day(14), type: 'OPEX', label: 'Vencimiento mensual de opciones', impact: 'medium' });
  events.push({ date: day(21), type: 'NFP', label: 'Nóminas no agrícolas', impact: 'high' });
  if (['AMD', 'NVDA', 'MSFT', 'AAPL', 'TSLA', 'META', 'AMZN', 'GOOGL', 'PLTR', 'COIN', 'SOFI', 'MARA'].includes(symbol)) {
    events.push({ date: day(6), type: 'EARNINGS', label: `Reporte trimestral de ${symbol} (fecha estimada)`, impact: 'high' });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

const cache = new Map();

/** Snapshot completo simulado, determinista por símbolo y día. */
export function demoSnapshot(symbolInput, { now = new Date(), expirationsCount = 4 } = {}) {
  const symbol = String(symbolInput || 'SPY').toUpperCase();
  const seedBase = `${symbol}|${now.toISOString().slice(0, 10)}`;
  const cached = cache.get(seedBase);
  if (cached && Date.now() - cached.at < 30000) return cached.value;
  const rand = mulberry32(hash(seedBase));
  const regimeRoll = hash(seedBase + '|regime') % 100;
  const regime = regimeRoll < 48 ? 'up' : regimeRoll < 88 ? 'down' : 'range';
  const history = buildHistory({ symbol, now, rand, regime });
  const spot = history[history.length - 1].close;
  const intraday = buildIntraday({ symbol, price: spot, now, rand, regime });
  const profile = profileFor(symbol);
  const expirations = fridaysUntil(now, 8).map((date, index) => ({ date, dte: Math.max(1, Math.round((Date.parse(`${date}T21:00:00Z`) - now.getTime()) / 86400000)) }))
    .filter((entry) => entry.dte >= 1 && entry.dte <= 60)
    .filter((entry, index, list) => index < 2 || entry.dte >= 7 || list.length < 3)
    .slice(0, expirationsCount);
  const chains = {};
  for (const expiry of expirations) {
    chains[expiry.date] = buildChain({ symbol, spot, expiration: expiry.date, dte: expiry.dte, now, rand });
  }
  const previous = history[history.length - 2]?.close ?? spot;
  const volumeFactor = isMarketOpen(now) ? 0.55 : 0.28;
  const quote = {
    symbol,
    name: profile.name,
    sector: profile.sector,
    price: spot,
    bid: round(spot - 0.02, 2),
    ask: round(spot + 0.02, 2),
    changePct: round(((spot - previous) / previous) * 100, 2),
    change: round(spot - previous, 2),
    open: history[history.length - 1].open,
    high: history[history.length - 1].high,
    low: history[history.length - 1].low,
    prevClose: previous,
    volume: Math.round(profile.price * 1e5 * (0.6 + rand()) * volumeFactor),
    tradeDate: now.toISOString()
  };
  const value = {
    symbol,
    asOf: now.toISOString(),
    source: 'demo',
    simulated: true,
    regime,
    marketOpen: isMarketOpen(now),
    quote,
    history,
    intraday,
    expirations: expirations.map((entry) => entry.date),
    dteByExpiration: Object.fromEntries(expirations.map((entry) => [entry.date, entry.dte])),
    chains,
    events: upcomingEvents(symbol, now),
    rate: DEFAULT_RATE
  };
  cache.set(seedBase, { at: Date.now(), value });
  return value;
}

export function demoExpirationInfo(symbol, now = new Date()) {
  const snapshot = demoSnapshot(symbol, { now });
  return snapshot.expirations;
}

export function demoGreeks({ type, spot, strike, dte, sigma }) {
  return bsGreeks({ type, S: spot, K: strike, T: yearFraction(dte), sigma });
}

export function demoImpliedVol({ type, spot, strike, dte, price }) {
  return impliedVol({ type, S: spot, K: strike, T: yearFraction(dte), price });
}