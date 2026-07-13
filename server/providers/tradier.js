import { cache } from '../lib/cache.js';
import { daysFromNow, requestJson, toArray } from '../lib/http.js';
import { buildTradierAccountSnapshot, selectTradierAccountId } from '../services/tradierAccount.js';

const symbolForTradier = (symbol) => {
  if (symbol === 'VIX') return 'VIX';
  if (symbol === 'SPX') return 'SPX';
  return symbol;
};

export class TradierProvider {
  constructor(settings) {
    this.settings = settings;
    this.name = 'Tradier';
  }

  get configured() {
    return Boolean(this.settings.token);
  }

  get accountSyncEnabled() {
    return this.configured && this.settings.accountSync !== false;
  }

  headers() {
    return { Authorization: `Bearer ${this.settings.token}` };
  }

  async getQuotes(symbols) {
    const requested = symbols.map(symbolForTradier).join(',');
    return cache.remember(`tradier:quotes:${requested}`, 20000, async () => {
      const url = `${this.settings.baseUrl}/markets/quotes?symbols=${encodeURIComponent(requested)}`;
      const data = await requestJson(this.name, url, { headers: this.headers() });
      return toArray(data.quotes?.quote).map((quote) => ({
        symbol: quote.symbol,
        price: Number(quote.last ?? quote.close),
        last: Number(quote.last),
        bid: Number(quote.bid),
        ask: Number(quote.ask),
        close: Number(quote.close),
        changePercent: Number(quote.change_percentage),
        volume: Number(quote.volume),
        source: this.name,
        timestamp: quote.trade_date || Date.now()
      }));
    });
  }

  async getMarketClock() {
    return cache.remember('tradier:market-clock', 15000, async () => {
      const data = await requestJson(this.name, `${this.settings.baseUrl}/markets/clock`, { headers: this.headers() });
      return data.clock || null;
    });
  }

  async resolveAccountId() {
    if (this.settings.accountId) return this.settings.accountId;
    return cache.remember('tradier:account-id', 3600000, async () => {
      const data = await requestJson(this.name, `${this.settings.baseUrl}/user/profile`, { headers: this.headers() });
      const accountId = selectTradierAccountId(data);
      if (!accountId) throw new Error('Tradier profile has no active brokerage account.');
      return accountId;
    });
  }

  async getAccountBalances(accountId = null) {
    const resolved = accountId || await this.resolveAccountId();
    return cache.remember(`tradier:balances:${resolved}`, 15000, async () => {
      const url = `${this.settings.baseUrl}/accounts/${encodeURIComponent(resolved)}/balances`;
      return requestJson(this.name, url, { headers: this.headers() });
    });
  }

  async getAccountPositions(accountId = null) {
    const resolved = accountId || await this.resolveAccountId();
    return cache.remember(`tradier:positions:${resolved}`, 15000, async () => {
      const url = `${this.settings.baseUrl}/accounts/${encodeURIComponent(resolved)}/positions`;
      const data = await requestJson(this.name, url, { headers: this.headers() });
      return toArray(data.positions?.position);
    });
  }

  async getAccountSnapshot() {
    if (!this.accountSyncEnabled) {
      return { status: 'NOT_CONFIGURED', source: 'configured_fallback', readOnly: true, error: 'Tradier account sync is disabled.' };
    }
    try {
      const accountId = await this.resolveAccountId();
      const [balances, positions] = await Promise.all([
        this.getAccountBalances(accountId),
        this.getAccountPositions(accountId)
      ]);
      const quotes = [];
      const symbols = [...new Set(positions.map((position) => String(position.symbol || '').trim()).filter(Boolean))];
      for (let index = 0; index < symbols.length; index += 50) {
        quotes.push(...await this.getQuotes(symbols.slice(index, index + 50)));
      }
      return buildTradierAccountSnapshot({ accountId, balances, positions, quotes });
    } catch (error) {
      return {
        status: 'ERROR',
        source: 'configured_fallback',
        readOnly: true,
        error: error.message,
        asOf: new Date().toISOString()
      };
    }
  }

  async getHistory(symbol) {
    const ticker = symbolForTradier(symbol);
    return cache.remember(`tradier:history:${ticker}`, 900000, async () => {
      const url = `${this.settings.baseUrl}/markets/history?symbol=${encodeURIComponent(ticker)}&start=${daysFromNow(-340)}&end=${daysFromNow(0)}&interval=daily`;
      const data = await requestJson(this.name, url, { headers: this.headers() });
      return toArray(data.history?.day).map((day) => ({
        date: day.date,
        open: Number(day.open),
        high: Number(day.high),
        low: Number(day.low),
        close: Number(day.close),
        volume: Number(day.volume || 0)
      }));
    });
  }

  async getExpirations(symbol) {
    return cache.remember(`tradier:expirations:${symbol}`, 3600000, async () => {
      const url = `${this.settings.baseUrl}/markets/options/expirations?symbol=${encodeURIComponent(symbol)}&includeAllRoots=true`;
      const data = await requestJson(this.name, url, { headers: this.headers() });
      return toArray(data.expirations?.date);
    });
  }

  async getOptionChain(symbol, expiration) {
    return cache.remember(`tradier:chain:${symbol}:${expiration}`, 30000, async () => {
      const url = `${this.settings.baseUrl}/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${expiration}&greeks=true`;
      const data = await requestJson(this.name, url, { headers: this.headers() });
      return toArray(data.options?.option).map((option) => ({
        symbol: option.symbol,
        underlying: symbol,
        expiration,
        strike: Number(option.strike),
        type: option.option_type,
        bid: Number(option.bid),
        ask: Number(option.ask),
        last: Number(option.last),
        volume: Number(option.volume || 0),
        openInterest: Number(option.open_interest || 0),
        iv: Number(option.greeks?.mid_iv ?? option.greeks?.smv_vol),
        delta: Number(option.greeks?.delta),
        gamma: Number(option.greeks?.gamma),
        theta: Number(option.greeks?.theta),
        vega: Number(option.greeks?.vega),
        source: this.name
      }));
    });
  }
}
