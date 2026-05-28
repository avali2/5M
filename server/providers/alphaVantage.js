import { cache } from '../lib/cache.js';
import { requestJson } from '../lib/http.js';

export class AlphaVantageProvider {
  constructor(settings = {}) {
    this.settings = settings;
    this.name = 'Alpha Vantage';
  }

  get configured() {
    return Boolean(this.settings.apiKey);
  }

  url(params = {}) {
    const query = new URLSearchParams({ ...params, apikey: this.settings.apiKey });
    return `${this.settings.baseUrl}?${query.toString()}`;
  }

  async getMarketNews(symbols = []) {
    if (!this.configured) return [];
    const tickers = symbols.slice(0, 25).join(',');
    return cache.remember(`alpha:news:${tickers || 'market'}`, 15 * 60 * 1000, async () => {
      const data = await requestJson(this.name, this.url({
        function: 'NEWS_SENTIMENT',
        tickers,
        sort: 'LATEST',
        limit: '50'
      }));
      return (data.feed || []).map((item) => ({
        headline: item.title,
        summary: item.summary,
        url: item.url,
        datetime: item.time_published,
        source: item.source || this.name,
        related: (item.ticker_sentiment || []).map((ticker) => ticker.ticker),
        sentiment: item.overall_sentiment_label || null,
        sentimentScore: Number(item.overall_sentiment_score),
        impact: Math.abs(Number(item.overall_sentiment_score) || 0) > 0.35 ? 'high' : 'medium'
      }));
    });
  }

  async getCompanyNews(symbols = []) {
    return this.getMarketNews(symbols);
  }
}
