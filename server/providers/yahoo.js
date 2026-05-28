import YahooFinance from 'yahoo-finance2';
import { cache } from '../lib/cache.js';
import { daysFromNow } from '../lib/http.js';

const RISK_FREE_RATE = 0.045;

function symbolForYahoo(symbol) {
  if (symbol === 'VIX') return '^VIX';
  if (symbol === 'SPX') return '^GSPC';
  return symbol;
}

function symbolFromYahoo(symbol, requested) {
  if (requested === 'VIX') return 'VIX';
  if (requested === 'SPX') return 'SPX';
  return symbol?.replace(/^\^GSPC$/, 'SPX')?.replace(/^\^VIX$/, 'VIX') || requested;
}

function asNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalPdf(value) {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * abs);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-abs * abs);
  return 0.5 * (1 + sign * erf);
}

function optionDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value < 10000000000 ? value * 1000 : value);
  return new Date(value);
}

function dateString(value) {
  const date = optionDate(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function daysTo(expiration) {
  const target = new Date(`${expiration}T16:00:00-04:00`).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / 86400000));
}

function approximateGreeks({ spot, strike, iv, dte, type }) {
  if (![spot, strike, iv].every(Number.isFinite) || spot <= 0 || strike <= 0 || iv <= 0 || dte <= 0) {
    return { delta: null, gamma: null, theta: null, vega: null };
  }
  const t = Math.max(dte / 365, 1 / 365);
  const sigmaRootT = iv * Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (RISK_FREE_RATE + 0.5 * iv * iv) * t) / sigmaRootT;
  const d2 = d1 - sigmaRootT;
  const pdf = normalPdf(d1);
  const callDelta = normalCdf(d1);
  const delta = type === 'call' ? callDelta : callDelta - 1;
  const gamma = pdf / (spot * sigmaRootT);
  const vega = spot * pdf * Math.sqrt(t) / 100;
  const callTheta = (-(spot * pdf * iv) / (2 * Math.sqrt(t)) - RISK_FREE_RATE * strike * Math.exp(-RISK_FREE_RATE * t) * normalCdf(d2)) / 365;
  const putTheta = (-(spot * pdf * iv) / (2 * Math.sqrt(t)) + RISK_FREE_RATE * strike * Math.exp(-RISK_FREE_RATE * t) * normalCdf(-d2)) / 365;
  return {
    delta,
    gamma,
    theta: type === 'call' ? callTheta : putTheta,
    vega
  };
}

function normalizeOption(option, { symbol, expiration, type, spot }) {
  const strike = asNumber(option.strike);
  const iv = asNumber(option.impliedVolatility ?? option.iv);
  const dte = daysTo(expiration);
  const greeks = approximateGreeks({ spot, strike, iv, dte, type });
  return {
    symbol: option.contractSymbol || option.contractSymbolLong || `${symbol}${expiration.replaceAll('-', '')}${type[0].toUpperCase()}${strike}`,
    underlying: symbol,
    expiration,
    strike,
    type,
    bid: asNumber(option.bid),
    ask: asNumber(option.ask),
    last: asNumber(option.lastPrice ?? option.last),
    volume: asNumber(option.volume, 0),
    openInterest: asNumber(option.openInterest, 0),
    iv,
    delta: asNumber(option.delta, greeks.delta),
    gamma: asNumber(option.gamma, greeks.gamma),
    theta: asNumber(option.theta, greeks.theta),
    vega: asNumber(option.vega, greeks.vega),
    source: 'Yahoo Finance',
    isDelayed: true,
    dataQuality: 'delayed/yahoo'
  };
}

function normalizeNews(item, symbol = null) {
  const provider = item.publisher || item.providerPublishTime ? 'Yahoo Finance' : 'Yahoo Finance';
  return {
    headline: item.title || item.headline || 'Yahoo Finance news',
    summary: item.summary || '',
    source: provider,
    url: item.link || item.url || null,
    datetime: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : item.pubDate || new Date().toISOString(),
    related: symbol ? [symbol] : [],
    impact: 'informational',
    sentiment: 'neutral'
  };
}

export class YahooProvider {
  constructor(settings = {}) {
    this.settings = settings;
    this.name = 'Yahoo Finance';
    this.client = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  }

  get configured() {
    return this.settings.enabled !== false;
  }

  async getQuotes(symbols) {
    const requested = [...new Set(symbols)];
    return cache.remember(`yahoo:quotes:${requested.join(',')}`, 20000, async () => {
      const rows = await Promise.all(requested.map(async (requestedSymbol) => {
        const yahooSymbol = symbolForYahoo(requestedSymbol);
        try {
          const quote = await this.client.quote(yahooSymbol);
          return {
            symbol: symbolFromYahoo(quote.symbol, requestedSymbol),
            price: asNumber(quote.regularMarketPrice ?? quote.postMarketPrice ?? quote.preMarketPrice ?? quote.previousClose),
            changePercent: asNumber(quote.regularMarketChangePercent),
            volume: asNumber(quote.regularMarketVolume, 0),
            bid: asNumber(quote.bid),
            ask: asNumber(quote.ask),
            source: this.name,
            isDelayed: true,
            timestamp: quote.regularMarketTime ? new Date(quote.regularMarketTime).toISOString() : new Date().toISOString()
          };
        } catch (error) {
          return { symbol: requestedSymbol, error: error.message, source: this.name, isDelayed: true };
        }
      }));
      return rows.filter((row) => Number.isFinite(row.price));
    });
  }

  async getHistory(symbol) {
    const yahooSymbol = symbolForYahoo(symbol);
    return cache.remember(`yahoo:history:${yahooSymbol}`, 900000, async () => {
      const data = await this.client.chart(yahooSymbol, {
        period1: daysFromNow(-340),
        period2: daysFromNow(0),
        interval: '1d'
      });
      return (data.quotes || []).map((bar) => ({
        date: dateString(bar.date) || bar.date,
        open: asNumber(bar.open),
        high: asNumber(bar.high),
        low: asNumber(bar.low),
        close: asNumber(bar.close),
        volume: asNumber(bar.volume, 0)
      })).filter((bar) => Number.isFinite(bar.close));
    });
  }

  async getExpirations(symbol) {
    return cache.remember(`yahoo:expirations:${symbol}`, 3600000, async () => {
      const data = await this.client.options(symbolForYahoo(symbol));
      return (data.expirationDates || []).map(dateString).filter(Boolean);
    });
  }

  async getOptionChain(symbol, expiration) {
    return cache.remember(`yahoo:chain:${symbol}:${expiration}`, 30000, async () => {
      const [quote] = await this.getQuotes([symbol]);
      const spot = quote?.price;
      const data = await this.client.options(symbolForYahoo(symbol), {
        date: new Date(`${expiration}T00:00:00.000Z`)
      });
      const chain = data.options?.[0] || data.optionChain?.result?.[0]?.options?.[0] || {};
      const calls = (chain.calls || []).map((option) => normalizeOption(option, { symbol, expiration, type: 'call', spot }));
      const puts = (chain.puts || []).map((option) => normalizeOption(option, { symbol, expiration, type: 'put', spot }));
      return [...calls, ...puts].filter((option) => Number.isFinite(option.strike));
    });
  }

  async getMarketNews() {
    return cache.remember('yahoo:market-news', 300000, async () => {
      const data = await this.client.search('SPY QQQ market stocks', { newsCount: 12, quotesCount: 0 });
      return (data.news || []).map((item) => normalizeNews(item));
    });
  }

  async getCompanyNews(symbols) {
    const requested = [...new Set(symbols)].slice(0, 12);
    return cache.remember(`yahoo:company-news:${requested.join(',')}`, 300000, async () => {
      const rows = await Promise.all(requested.map(async (symbol) => {
        try {
          const data = await this.client.search(symbol, { newsCount: 5, quotesCount: 0 });
          return (data.news || []).map((item) => normalizeNews(item, symbol));
        } catch {
          return [];
        }
      }));
      return rows.flat();
    });
  }
}
