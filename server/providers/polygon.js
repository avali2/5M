import { cache } from '../lib/cache.js';
import { daysFromNow, requestJson } from '../lib/http.js';

export class PolygonProvider {
  constructor(settings) {
    this.settings = settings;
    this.name = 'Polygon';
  }

  get configured() {
    return Boolean(this.settings.apiKey);
  }

  keyed(url) {
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}apiKey=${encodeURIComponent(this.settings.apiKey)}`;
  }

  async getQuotes(symbols) {
    return Promise.all(symbols.map(async (symbol) => {
      const ticker = symbol === 'VIX' ? 'I:VIX' : symbol;
      const url = this.keyed(`${this.settings.baseUrl}/v2/snapshot/locale/us/markets/${symbol === 'VIX' ? 'indices' : 'stocks'}/tickers/${ticker}`);
      const data = await requestJson(this.name, url);
      const item = data.ticker || {};
      return {
        symbol,
        price: Number(item.lastTrade?.p ?? item.value ?? item.day?.c ?? item.prevDay?.c),
        changePercent: Number(item.todaysChangePerc),
        volume: Number(item.day?.v || 0),
        source: this.name,
        timestamp: item.updated || Date.now()
      };
    }));
  }

  async getHistory(symbol) {
    const ticker = symbol === 'VIX' ? 'I:VIX' : symbol;
    return cache.remember(`polygon:history:${ticker}`, 900000, async () => {
      const url = this.keyed(`${this.settings.baseUrl}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${daysFromNow(-100)}/${daysFromNow(0)}?adjusted=true&sort=asc&limit=120`);
      const data = await requestJson(this.name, url);
      return (data.results || []).map((bar) => ({
        date: new Date(bar.t).toISOString().slice(0, 10),
        open: Number(bar.o),
        high: Number(bar.h),
        low: Number(bar.l),
        close: Number(bar.c),
        volume: Number(bar.v || 0)
      }));
    });
  }

  async getExpirations(symbol) {
    return cache.remember(`polygon:expirations:${symbol}`, 3600000, async () => {
      let next = this.keyed(`${this.settings.baseUrl}/v3/reference/options/contracts?underlying_ticker=${encodeURIComponent(symbol)}&expired=false&expiration_date.gte=${daysFromNow(14)}&expiration_date.lte=${daysFromNow(60)}&limit=1000`);
      const contracts = [];
      for (let page = 0; next && page < 4; page += 1) {
        const data = await requestJson(this.name, next);
        contracts.push(...(data.results || []));
        next = data.next_url ? this.keyed(data.next_url) : null;
      }
      return [...new Set(contracts.map((contract) => contract.expiration_date))].sort();
    });
  }

  async getOptionChain(symbol, expiration) {
    return cache.remember(`polygon:chain:${symbol}:${expiration}`, 30000, async () => {
      let next = this.keyed(`${this.settings.baseUrl}/v3/snapshot/options/${encodeURIComponent(symbol)}?expiration_date=${expiration}&limit=250`);
      const results = [];
      for (let page = 0; next && page < 8; page += 1) {
        const data = await requestJson(this.name, next);
        results.push(...(data.results || []));
        next = data.next_url ? this.keyed(data.next_url) : null;
      }
      return results.map((item) => ({
        symbol: item.details?.ticker,
        underlying: symbol,
        expiration,
        strike: Number(item.details?.strike_price),
        type: item.details?.contract_type === 'call' ? 'call' : 'put',
        bid: Number(item.last_quote?.bid),
        ask: Number(item.last_quote?.ask),
        last: Number(item.last_trade?.price),
        volume: Number(item.day?.volume || 0),
        openInterest: Number(item.open_interest || 0),
        iv: Number(item.implied_volatility),
        delta: Number(item.greeks?.delta),
        gamma: Number(item.greeks?.gamma),
        theta: Number(item.greeks?.theta),
        vega: Number(item.greeks?.vega),
        source: this.name
      }));
    });
  }
}
