import { requestJson, toArray } from '../lib/http.js';
import { buildTradierAccountSnapshot, selectTradierAccountId } from './tradierAccount.js';
import { encodeTradierOrder } from './tradierOrders.js';

const SANDBOX_HOST = 'sandbox.tradier.com';

export function validateTradierSandboxUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === SANDBOX_HOST && /^\/v1\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export class TradierPaperBroker {
  constructor(settings = {}) {
    this.settings = settings;
    this.name = 'Tradier Paper';
    this.resolvedAccountId = null;
  }

  get sandboxSafe() {
    return validateTradierSandboxUrl(this.settings.baseUrl);
  }

  get configured() {
    return this.settings.enabled !== false && Boolean(this.settings.token) && this.sandboxSafe;
  }

  status() {
    return {
      configured: this.configured,
      enabled: this.settings.enabled !== false,
      environment: 'paper',
      sandboxSafe: this.sandboxSafe,
      host: this.sandboxSafe ? SANDBOX_HOST : null,
      accountIdMasked: this.resolvedAccountId ? `****${this.resolvedAccountId.slice(-4)}` : null,
      error: !this.sandboxSafe
        ? 'TRADIER_PAPER_BASE_URL must be exactly https://sandbox.tradier.com/v1'
        : !this.settings.token ? 'TRADIER_PAPER_TOKEN is not configured.' : null
    };
  }

  assertConfigured() {
    if (!this.sandboxSafe) throw new Error('Paper trading blocked: destination is not sandbox.tradier.com.');
    if (!this.settings.token) throw new Error('Paper trading blocked: TRADIER_PAPER_TOKEN is missing.');
  }

  headers(form = false) {
    return {
      Authorization: `Bearer ${this.settings.token}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    };
  }

  url(pathname) {
    this.assertConfigured();
    return `${String(this.settings.baseUrl).replace(/\/$/, '')}${pathname}`;
  }

  async resolveAccountId() {
    this.assertConfigured();
    if (this.settings.accountId) return String(this.settings.accountId);
    if (this.resolvedAccountId) return this.resolvedAccountId;
    const profile = await requestJson(this.name, this.url('/user/profile'), { headers: this.headers() });
    const accountId = selectTradierAccountId(profile);
    if (!accountId) throw new Error('Tradier Sandbox profile has no active paper account.');
    this.resolvedAccountId = accountId;
    return accountId;
  }

  async getBalances(accountId = null) {
    const id = accountId || await this.resolveAccountId();
    return requestJson(this.name, this.url(`/accounts/${encodeURIComponent(id)}/balances`), { headers: this.headers() });
  }

  async getPositions(accountId = null) {
    const id = accountId || await this.resolveAccountId();
    const data = await requestJson(this.name, this.url(`/accounts/${encodeURIComponent(id)}/positions`), { headers: this.headers() });
    return toArray(data.positions?.position);
  }

  async getOrders(accountId = null) {
    const id = accountId || await this.resolveAccountId();
    const data = await requestJson(this.name, this.url(`/accounts/${encodeURIComponent(id)}/orders?limit=1000&includeTags=true`), { headers: this.headers() });
    return toArray(data.orders?.order);
  }

  async getQuotes(symbols = []) {
    const requested = [...new Set(symbols.map((symbol) => String(symbol || '').trim()).filter(Boolean))];
    if (!requested.length) return [];
    const data = await requestJson(
      this.name,
      this.url(`/markets/quotes?symbols=${encodeURIComponent(requested.join(','))}`),
      { headers: this.headers() }
    );
    return toArray(data.quotes?.quote).map((quote) => ({
      symbol: quote.symbol,
      price: Number(quote.last ?? quote.close),
      last: Number(quote.last),
      bid: Number(quote.bid),
      ask: Number(quote.ask),
      close: Number(quote.close),
      timestamp: quote.trade_date || Date.now(),
      source: this.name
    }));
  }

  async getMarketClock() {
    const data = await requestJson(this.name, this.url('/markets/clock'), { headers: this.headers() });
    return data.clock || null;
  }

  async getAccountSnapshot() {
    if (!this.configured) {
      return { status: 'NOT_CONFIGURED', source: 'tradier_paper', paperTrading: true, readOnly: false, error: this.status().error };
    }
    try {
      const accountId = await this.resolveAccountId();
      const [balances, positions] = await Promise.all([this.getBalances(accountId), this.getPositions(accountId)]);
      const quotes = [];
      const symbols = [...new Set(positions.map((position) => String(position.symbol || '').trim()).filter(Boolean))];
      for (let index = 0; index < symbols.length; index += 50) {
        quotes.push(...await this.getQuotes(symbols.slice(index, index + 50)));
      }
      const snapshot = buildTradierAccountSnapshot({ accountId, balances, positions, quotes });
      return { ...snapshot, source: 'tradier_paper', paperTrading: true, readOnly: false };
    } catch (error) {
      return { status: 'ERROR', source: 'tradier_paper', paperTrading: true, readOnly: false, error: error.message, asOf: new Date().toISOString() };
    }
  }

  async previewOrder(order) {
    const accountId = await this.resolveAccountId();
    return requestJson(this.name, this.url(`/accounts/${encodeURIComponent(accountId)}/orders`), {
      method: 'POST',
      headers: this.headers(true),
      body: encodeTradierOrder(order, true)
    });
  }

  async placeOrder(order) {
    const accountId = await this.resolveAccountId();
    return requestJson(this.name, this.url(`/accounts/${encodeURIComponent(accountId)}/orders`), {
      method: 'POST',
      headers: this.headers(true),
      body: encodeTradierOrder(order, false)
    });
  }

  async cancelOrder(orderId) {
    const accountId = await this.resolveAccountId();
    return requestJson(this.name, this.url(`/accounts/${encodeURIComponent(accountId)}/orders/${encodeURIComponent(orderId)}`), {
      method: 'DELETE',
      headers: this.headers()
    });
  }
}
