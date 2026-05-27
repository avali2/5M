import { cache } from '../lib/cache.js';
import { daysFromNow, requestJson } from '../lib/http.js';

export class FmpProvider {
  constructor(settings) {
    this.settings = settings;
    this.name = 'Financial Modeling Prep';
  }

  get configured() {
    return Boolean(this.settings.apiKey);
  }

  url(path, params = {}) {
    const query = new URLSearchParams({ ...params, apikey: this.settings.apiKey });
    return `${this.settings.baseUrl}${path}?${query.toString()}`;
  }

  async getEconomicCalendar() {
    return cache.remember('fmp:economic', 900000, async () => {
      const events = await requestJson(this.name, this.url('/economic-calendar', { from: daysFromNow(-1), to: daysFromNow(7) }));
      return (events || []).map((event) => ({
        title: event.event,
        country: event.country,
        date: event.date,
        impact: event.impact,
        source: this.name,
        type: 'economic'
      }));
    });
  }

  async getEarningsCalendar(symbols) {
    return cache.remember(`fmp:earnings:${symbols.join(',')}`, 3600000, async () => {
      const earnings = await requestJson(this.name, this.url('/earnings-calendar', { from: daysFromNow(0), to: daysFromNow(60) }));
      const allowed = new Set(symbols);
      return (earnings || []).filter((item) => allowed.has(item.symbol)).map((item) => ({
        symbol: item.symbol,
        date: item.date,
        hour: item.time || null,
        source: this.name
      }));
    });
  }
}
