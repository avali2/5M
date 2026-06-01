const TRADIER_BASE = process.env.TRADIER_BASE_URL || "https://api.tradier.com/v1";
const TRADIER_TOKEN = process.env.TRADIER_TOKEN || process.env.VITE_TRADIER_TOKEN;

export { TRADIER_BASE, TRADIER_TOKEN };

export function tradierHeaders() {
  if (!TRADIER_TOKEN) throw new Error("Falta TRADIER_TOKEN en variables de entorno.");
  return { Authorization: `Bearer ${TRADIER_TOKEN}`, Accept: "application/json" };
}

export async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Respuesta no JSON: ${text.slice(0, 300)}`); }
}

export function toArray(x) { if (!x) return []; return Array.isArray(x) ? x : [x]; }

export async function getQuote(symbol) {
  const url = `${TRADIER_BASE}/markets/quotes?symbols=${encodeURIComponent(symbol)}`;
  const json = await fetchJson(url, { headers: tradierHeaders() });
  const q = toArray(json?.quotes?.quote)[0];
  if (!q) throw new Error(`Sin quote para ${symbol}`);
  return {
    symbol, price: Number(q.last || q.close || q.bid || q.ask),
    bid: Number(q.bid), ask: Number(q.ask), volume: Number(q.volume || 0),
    changePct: Number(q.change_percentage || 0), raw: q
  };
}

export async function getTimesales(symbol, interval = "1min") {
  const end = new Date();
  const start = new Date(Date.now() - 6.5 * 60 * 60 * 1000);
  const qs = new URLSearchParams({
    symbol, interval,
    start: start.toISOString().slice(0, 19),
    end: end.toISOString().slice(0, 19),
    session_filter: "open"
  });
  const url = `${TRADIER_BASE}/markets/timesales?${qs}`;
  const json = await fetchJson(url, { headers: tradierHeaders() });
  return toArray(json?.series?.data).map(b => ({
    time: b.time, timestamp: Number(b.timestamp) * 1000 || new Date(b.time).getTime(),
    open: Number(b.open), high: Number(b.high), low: Number(b.low),
    close: Number(b.close || b.price), price: Number(b.price || b.close),
    volume: Number(b.volume || 0), vwap: Number(b.vwap)
  })).filter(b => Number.isFinite(b.close));
}

export async function getExpirations(symbol) {
  const url = `${TRADIER_BASE}/markets/options/expirations?symbol=${encodeURIComponent(symbol)}&includeAllRoots=true&strikes=false`;
  const json = await fetchJson(url, { headers: tradierHeaders() });
  return toArray(json?.expirations?.date).filter(Boolean);
}

export async function getOptionChain(symbol, expiration) {
  const url = `${TRADIER_BASE}/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${expiration}&greeks=true`;
  const json = await fetchJson(url, { headers: tradierHeaders() });
  return toArray(json?.options?.option).map(normalizeOption).filter(Boolean);
}

export function normalizeOption(o) {
  const bid = Number(o.bid), ask = Number(o.ask), last = Number(o.last);
  const mid = Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid ? (bid + ask) / 2 : Number.isFinite(last) ? last : null;
  const g = o.greeks || {};
  const type = String(o.option_type || o.type || "").toUpperCase();
  if (!["CALL", "PUT"].includes(type)) return null;
  return {
    symbol: o.symbol, underlying: o.root_symbol, expiration: o.expiration_date,
    strike: Number(o.strike), type, bid, ask, last, mid,
    volume: Number(o.volume || 0), openInterest: Number(o.open_interest || 0),
    delta: Number(g.delta), gamma: Number(g.gamma), theta: Number(g.theta),
    vega: Number(g.vega), rho: Number(g.rho), iv: Number(g.mid_iv || g.iv || g.smv_vol || 0), raw: o
  };
}