/**
 * 5M · Fachada de datos de mercado.
 *
 * Selecciona la fuente (Tradier real o mercado simulado), normaliza el snapshot
 * que consumen los motores de señales, aplica caché corta y deja advertencias
 * explícitas cuando algo falta. Nunca mezcla datos reales con simulados.
 */
import { config } from '../config.js';
import { buildTechnicalContext, buildMultiTimeframeContext } from './indicators.js';
import { analyzeInstitutionalFlow } from './institutionalFlow.js';
import { demoSnapshot, isMarketOpen as demoMarketOpen } from './demoMarket.js';
import { freeSnapshot, freeDataEnabled } from './freeData.js';

const CACHE_TTL_MS = 45000;
const MAX_EXPIRATIONS = 5;
const cache = new Map();
const inflight = new Map();

export function isDemoActive() {
  return !config.tradier.token && !freeDataEnabled();
}

export function dataSourceLabel() {
  if (config.tradier.token) return 'Tradier';
  if (freeDataEnabled()) return 'Yahoo/OPC';
  return 'SIMULADO';
}

export function providerStatus() {
  return {
    tradier: Boolean(config.tradier.token),
    free: freeDataEnabled(),
    demoActive: isDemoActive(),
    source: dataSourceLabel()
  };
}

function pickExpirations(expirations, now = new Date()) {
  const parsed = (expirations || [])
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    .map((value) => ({ date: value, dte: Math.round((Date.parse(`${value}T21:00:00Z`) - now.getTime()) / 86400000) }))
    .filter((entry) => entry.dte >= 1 && entry.dte <= 75)
    .sort((a, b) => a.dte - b.dte);
  // Mezcla vencimientos cercanos y de 30-45 días (el bot de crédito necesita ese rango).
  const filtered = parsed.filter((entry) => entry.dte >= 5);
  const picked = new Map();
  for (const entry of filtered.slice(0, 2)) picked.set(entry.date, entry);
  for (const target of [21, 35, 45, 60]) {
    const closest = filtered.reduce((best, entry) => (Math.abs(entry.dte - target) < Math.abs((best?.dte ?? 999) - target) ? entry : best), null);
    if (closest) picked.set(closest.date, closest);
  }
  return [...picked.values()].sort((left, right) => left.dte - right.dte).slice(0, MAX_EXPIRATIONS);
}

function tradingStatus({ clock, simulated }) {
  if (simulated) return demoMarketOpen() ? 'open' : 'closed';
  const state = String(clock?.state || '').toLowerCase();
  if (state === 'open') return 'open';
  if (state === 'closed') return 'closed';
  return 'unknown';
}

function macroEvents(now = new Date()) {
  const events = [];
  const iso = (date) => date.toISOString().slice(0, 10);
  const cursor = new Date(now.getTime());
  for (let i = 1; i <= 45; i += 1) {
    const day = new Date(now.getTime() + i * 86400000);
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    // Tercer viernes del mes: vencimiento mensual.
    if (weekday === 5 && Math.ceil(day.getUTCDate() / 7) === 3) {
      events.push({ date: iso(day), type: 'OPEX', label: 'Vencimiento mensual de opciones (OPEX)', impact: 'medium' });
      break;
    }
    void cursor;
  }
  return events;
}

async function tradierSnapshot(symbol, tradier, warnings) {
  const now = new Date();
  const [clock, quotes, history, intraday, expirations] = await Promise.all([
    tradier.getMarketClock().catch(() => null),
    tradier.getQuotes([symbol]),
    tradier.getHistory(symbol, 260, 'daily', now),
    tradier.getTimeSales(symbol, { interval: '5min', lookbackDays: 5, now }).catch(() => []),
    tradier.getExpirations(symbol)
  ]);
  const quote = quotes.find((item) => item.symbol === symbol);
  if (!quote || !Number.isFinite(quote.price)) throw new Error(`Sin cotización verificable para ${symbol}.`);
  const expirationsSelected = pickExpirations(expirations, now);
  if (!expirationsSelected.length) throw new Error(`${symbol} no tiene vencimientos negociables entre 5 y 75 días.`);
  const chains = {};
  const dteByExpiration = {};
  for (const expiry of expirationsSelected) {
    try {
      const chain = await tradier.getOptionChain(symbol, expiry.date);
      chains[expiry.date] = chain;
      dteByExpiration[expiry.date] = expiry.dte;
    } catch (error) {
      warnings.push(`Cadena ${expiry.date} no disponible: ${error.message}`);
    }
  }
  if (!Object.keys(chains).length) throw new Error(`No se pudo cargar ninguna cadena de opciones para ${symbol}.`);
  return {
    symbol,
    asOf: now.toISOString(),
    source: 'tradier',
    simulated: false,
    marketOpen: tradingStatus({ clock, simulated: false }) === 'open',
    marketState: tradingStatus({ clock, simulated: false }),
    quote,
    history,
    intraday,
    expirations: Object.keys(chains),
    dteByExpiration,
    chains,
    events: macroEvents(now),
    rate: config.tradier.rate
  };
}

function demoAdapter(symbol, warnings) {
  const snapshot = demoSnapshot(symbol);
  if (!snapshot.expirations?.length) throw new Error('El mercado simulado no tiene vencimientos disponibles.');
  warnings.push('Datos simulados de demostración. No son cotizaciones reales y no deben usarse para operar.');
  return { ...snapshot, marketState: snapshot.marketOpen ? 'open' : 'closed', events: snapshot.events || [] };
}

function enrich(snapshot) {
  const technicalDaily = snapshot.history?.length >= 60
    ? buildTechnicalContext(snapshot.history, snapshot.quote?.price)
    : null;
  const multi = snapshot.history?.length >= 60
    ? buildMultiTimeframeContext({ daily: snapshot.history, intraday5m: snapshot.intraday || [], price: snapshot.quote?.price })
    : null;
  const primaryExpiration = snapshot.expirations?.[0] || null;
  const primaryChain = primaryExpiration ? snapshot.chains[primaryExpiration] || [] : [];
  const flow = primaryChain.length
    ? analyzeInstitutionalFlow({ chain: primaryChain, quote: snapshot.quote, history: snapshot.history, technical: technicalDaily, now: new Date(snapshot.asOf) })
    : null;
  return {
    ...snapshot,
    technical: {
      ...(technicalDaily || {}),
      support: technicalDaily?.support20 ?? multi?.timeframes?.d1?.support20 ?? null,
      resistance: technicalDaily?.resistance20 ?? multi?.timeframes?.d1?.resistance20 ?? null,
      atr: technicalDaily?.atr14 ?? multi?.timeframes?.m5?.atr14 ?? null,
      timeframes: multi?.timeframes || null,
      trend: multi?.trend ?? technicalDaily?.trend ?? 'neutral'
    },
    flow
  };
}

/** Snapshot normalizado y cacheado por símbolo. */
export async function getSnapshot(symbolInput, { tradier, force = false } = {}) {
  const symbol = String(symbolInput || '').toUpperCase();
  if (!/^[A-Z.^]{1,12}$/.test(symbol)) throw new Error('Símbolo inválido.');
  const now = Date.now();
  const cached = cache.get(symbol);
  if (!force && cached && now - cached.at < CACHE_TTL_MS) return cached.value;
  if (!force && inflight.has(symbol)) return inflight.get(symbol);
  const job = (async () => {
    const warnings = [];
    let snapshot;
    if (config.tradier.token) {
      if (!tradier) throw new Error('Cliente Tradier no disponible en este proceso.');
      snapshot = await tradierSnapshot(symbol, tradier, warnings);
    } else if (freeDataEnabled()) {
      try {
        snapshot = await freeSnapshot(symbol);
        warnings.push('Datos gratuitos con retraso (Yahoo + cadena pública). Verificá el precio en tu bróker antes de operar.');
      } catch (error) {
        warnings.push(`Proveedor gratuito no disponible (${error.message}). Se usa mercado simulado.`);
        snapshot = demoAdapter(symbol, warnings);
      }
    } else {
      snapshot = demoAdapter(symbol, warnings);
    }
    const enriched = enrich({ ...snapshot, warnings: [...(snapshot.warnings || []), ...warnings] });
    cache.set(symbol, { at: Date.now(), value: enriched });
    return enriched;
  })().finally(() => inflight.delete(symbol));
  if (!force) inflight.set(symbol, job);
  return job;
}

export function clearMarketCache() {
  cache.clear();
}

export function cacheInfo() {
  return [...cache.entries()].map(([symbol, entry]) => ({ symbol, ageMs: Date.now() - entry.at }));
}

export function optionChainFor(snapshot, expiration) {
  const date = expiration || snapshot?.expirations?.[0];
  return (snapshot?.chains?.[date] || []).filter((option) => Number.isFinite(option.strike));
}

export function dteFor(snapshot, expiration) {
  if (!expiration) return null;
  if (snapshot?.dteByExpiration?.[expiration] !== undefined) return snapshot.dteByExpiration[expiration];
  const parsed = Math.round((Date.parse(`${expiration}T21:00:00Z`) - Date.parse(snapshot.asOf)) / 86400000);
  return Number.isFinite(parsed) ? parsed : null;
}

export function atmIv(snapshot) {
  const chain = optionChainFor(snapshot);
  const spot = snapshot?.quote?.price;
  if (!chain.length || !Number.isFinite(spot)) return null;
  const near = chain
    .filter((option) => Number.isFinite(option.iv) && option.iv > 0)
    .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
    .slice(0, 4);
  if (!near.length) return null;
  return near.reduce((sum, option) => sum + option.iv, 0) / near.length;
}