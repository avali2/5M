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
    tradeDate: quote.trade_date || null,
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

  async getHistory(symbol, days = 90) {
    const end = new Date();
    const start = new Date(Date.now() - days * 86400000);
    const iso = (date) => date.toISOString().slice(0, 10);
    const payload = await this.request('/markets/history', {
      symbol,
      interval: 'daily',
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
