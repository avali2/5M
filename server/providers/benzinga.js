import { cache } from '../lib/cache.js';
import { daysFromNow, requestJson } from '../lib/http.js';

export class BenzingaProvider {
  constructor(settings) {
    this.settings = settings;
    this.name = 'Benzinga';
  }

  get configured() {
    return Boolean(this.settings.apiKey);
  }

  async getUnusualOptions(symbols) {
    return cache.remember(`benzinga:flow:${symbols.join(',')}`, 60000, async () => {
      const query = new URLSearchParams({
        token: this.settings.apiKey,
        pageSize: '100',
        'parameters[date_from]': daysFromNow(-1),
        'parameters[date_to]': daysFromNow(0),
        'parameters[tickers]': symbols.join(',')
      });
      const data = await requestJson(this.name, `${this.settings.baseUrl}/signal/option_activity?${query.toString()}`);
      return (data.option_activity || []).map((item) => ({
        symbol: item.ticker,
        sentiment: item.sentiment,
        putCall: item.put_call,
        costBasis: Number(item.cost_basis),
        volume: Number(item.volume),
        openInterest: Number(item.open_interest),
        description: item.description_extended || item.description,
        source: this.name
      }));
    });
  }

  async getBlockTrades(symbols) {
    return cache.remember(`benzinga:blocks:${symbols.join(',')}`, 60000, async () => {
      const query = new URLSearchParams({
        token: this.settings.apiKey,
        pageSize: '100',
        date_from: daysFromNow(-1),
        date_to: daysFromNow(0),
        tickers: symbols.join(',')
      });
      const data = await requestJson(this.name, `${this.settings.baseUrl}/signal/block_trade?${query.toString()}`);
      return (data.block_trade || data['block-trade'] || []).map((item) => ({
        symbol: item.ticker,
        size: Number(item.size),
        price: Number(item.price),
        importance: Number(item.importance),
        description: item.description,
        source: this.name
      }));
    });
  }
}
