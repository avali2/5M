import { cache } from '../lib/cache.js';
import { daysFromNow, requestJson } from '../lib/http.js';

export class FinnhubProvider {
  constructor(settings) {
    this.settings = settings;
    this.name = 'Finnhub';
  }

  get configured() {
    return Boolean(this.settings.apiKey);
  }

  url(path, params = {}) {
    const query = new URLSearchParams({ ...params, token: this.settings.apiKey });
    return `${this.settings.baseUrl}${path}?${query.toString()}`;
  }

  async getEconomicCalendar() {
    return cache.remember('finnhub:economic', 900000, async () => {
      const data = await requestJson(this.name, this.url('/calendar/economic', { from: daysFromNow(-1), to: daysFromNow(7) }));
      return (data.economicCalendar || []).map((event) => ({
        title: event.event,
        country: event.country,
        date: event.time || event.date,
        impact: event.impact,
        source: this.name,
        type: 'economic'
      }));
    });
  }

  async getEarningsCalendar(symbols) {
    return cache.remember(`finnhub:earnings:${symbols.join(',')}`, 3600000, async () => {
      const data = await requestJson(this.name, this.url('/calendar/earnings', { from: daysFromNow(0), to: daysFromNow(60) }));
      const allowed = new Set(symbols);
      return (data.earningsCalendar || []).filter((item) => allowed.has(item.symbol)).map((item) => ({
        symbol: item.symbol,
        date: item.date,
        hour: item.hour,
        source: this.name
      }));
    });
  }

  async getMarketNews() {
    return cache.remember('finnhub:market-news', 300000, async () => {
      const data = await requestJson(this.name, this.url('/news', { category: 'general' }));
      return (data || []).slice(0, 30).map((item) => ({
        headline: item.headline,
        summary: item.summary,
        url: item.url,
        datetime: item.datetime ? new Date(item.datetime * 1000).toISOString() : null,
        source: item.source || this.name
      }));
    });
  }

  async getCompanyNews(symbols) {
    const results = [];
    for (const symbol of symbols.slice(0, 12)) {
      const data = await cache.remember(`finnhub:company-news:${symbol}`, 300000, () =>
        requestJson(this.name, this.url('/company-news', { symbol, from: daysFromNow(-7), to: daysFromNow(0) }))
      );
      results.push(...(data || []).slice(0, 5).map((item) => ({
        symbol,
        headline: item.headline,
        summary: item.summary,
        url: item.url,
        datetime: item.datetime ? new Date(item.datetime * 1000).toISOString() : null,
        source: item.source || this.name
      })));
    }
    return results.sort((left, right) => new Date(right.datetime) - new Date(left.datetime));
  }

  async getInsiderTransactions(symbols) {
    const results = [];
    for (const symbol of symbols.slice(0, 12)) {
      const url = this.url('/stock/insider-transactions', { symbol, from: daysFromNow(-30), to: daysFromNow(0) });
      const data = await requestJson(this.name, url);
      results.push(...(data.data || []).map((item) => ({
        symbol,
        name: item.name,
        change: Number(item.change),
        transactionPrice: Number(item.transactionPrice),
        filingDate: item.filingDate,
        source: this.name
      })));
    }
    return results;
  }
}
