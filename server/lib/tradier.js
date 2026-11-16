import { config } from '../config.js';
import { fetchJson, finite, round, toArray } from './http.js';

function authHeaders(token, extra = {}) {
  if (!token) throw new Error('TRADIER_TOKEN no está configurado en el servidor.');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...extra
  };
}

function isoTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function easternDateTime(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(value).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function normalizeQuote(quote) {
  const last = finite(quote.last, finite(quote.close, null));
  return {
    symbol: String(quote.symbol || '').toUpperCase(),
    price: last,
    last,
    bid: finite(quote.bid),
    ask: finite(quote.ask),
    close: finite(quote.close),
    changePct: finite(quote.change_percentage, 0),
    volume: finite(quote.volume, 0),
    tradeDate: isoTimestamp(quote.trade_date),
    bidAt: isoTimestamp(quote.bid_date),
    askAt: isoTimestamp(quote.ask_date),
    bidSize: finite(quote.bidsize, 0),
    askSize: finite(quote.asksize, 0),
    rawType: quote.type || null,
    source: 'Tradier'
  };
}

function normalizeOption(option, underlying, expiration) {
  const bid = finite(option.bid);
  const ask = finite(option.ask);
  const last = finite(option.last);
  const mid = bid !== null && ask !== null && ask >= bid ? round((bid + ask) / 2, 4) : last;
  const greeks = option.greeks || {};
  const type = String(option.option_type || option.type || '').toLowerCase();
  if (!['call', 'put'].includes(type)) return null;
  return {
    symbol: option.symbol || null,
    underlying: String(underlying).toUpperCase(),
    expiration,
    rootSymbol: option.root_symbol || null,
    contractSize: finite(option.contract_size),
    greeksAt: isoTimestamp(greeks.updated_at),
    strike: finite(option.strike),
    type,
    bid,
    ask,
    last,
    mid,
    volume: finite(option.volume, 0),
    openInterest: finite(option.open_interest, 0),
    iv: finite(greeks.mid_iv, finite(greeks.smv_vol, finite(greeks.iv, null))),
    delta: finite(greeks.delta),
    gamma: finite(greeks.gamma),
    theta: finite(greeks.theta),
    vega: finite(greeks.vega),
    rho: finite(greeks.rho)
  };
}

export class TradierClient {
  constructor(settings = config.tradier) {
    this.settings = settings;
  }

  async request(path, query = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    }
    const url = `${this.settings.baseUrl}${path}${params.toString() ? `?${params}` : ''}`;
    return fetchJson(url, { headers: authHeaders(this.settings.token) });
  }

  async getMarketClock() {
    const payload = await this.request('/markets/clock');
    return payload.clock || null;
  }

  async getQuotes(symbols) {
    const requested = [...new Set(symbols.map((symbol) => String(symbol).toUpperCase()))];
    if (!requested.length) return [];
    const payload = await this.request('/markets/quotes', { symbols: requested.join(',') });
    return toArray(payload?.quotes?.quote).map(normalizeQuote).filter((quote) => quote.symbol);
  }

  async getHistory(symbol, days = 420, interval = 'daily', now = new Date()) {
    const end = new Date(now);
    const start = new Date(end.getTime() - days * 86400000);
    const iso = (date) => date.toISOString().slice(0, 10);
    const payload = await this.request('/markets/history', {
      symbol,
      interval,
      start: iso(start),
      end: iso(end)
    });
    return toArray(payload?.history?.day).map((day) => ({
      date: day.date,
      open: finite(day.open),
      high: finite(day.high),
      low: finite(day.low),
      close: finite(day.close),
      volume: finite(day.volume, 0)
    })).filter((day) => day.close !== null);
  }

  async getTimeSales(symbol, { interval = '5min', lookbackDays = 8, now = new Date(), sessionFilter = 'open' } = {}) {
    if (!['1min', '5min', '15min'].includes(interval)) throw new Error(`Intervalo Time & Sales no permitido: ${interval}`);
    const end = new Date(now);
    const start = new Date(end.getTime() - Math.min(18, Math.max(1, lookbackDays)) * 86400000);
    const payload = await this.request('/markets/timesales', {
      symbol,
      interval,
      start: easternDateTime(start),
      end: easternDateTime(end),
      session_filter: sessionFilter
    });
    return toArray(payload?.series?.data).map((bar) => {
      const close = finite(bar.close, finite(bar.price));
      const time = bar.time || bar.timestamp || null;
      return {
        time,
        timestamp: isoTimestamp(bar.timestamp) || isoTimestamp(time),
        open: finite(bar.open, close),
        high: finite(bar.high, close),
        low: finite(bar.low, close),
        close,
        price: finite(bar.price, close),
        volume: finite(bar.volume, 0)
      };
    }).filter((bar) => bar.close !== null);
  }

  async getExpirations(symbol) {
    const payload = await this.request('/markets/options/expirations', {
      symbol,
      includeAllRoots: 'true',
      strikes: 'false'
    });
    return toArray(payload?.expirations?.date).filter(Boolean).map(String);
  }

  async getOptionChain(symbol, expiration) {
    const payload = await this.request('/markets/options/chains', {
      symbol,
      expiration,
      greeks: 'true'
    });
    return toArray(payload?.options?.option)
      .map((option) => normalizeOption(option, symbol, expiration))
      .filter((option) => option && option.strike !== null);
  }
}

export function isTradierConfigured() {
  return Boolean(config.tradier.token);
}
