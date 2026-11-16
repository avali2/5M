import { TradierClient } from '../lib/tradier.js';

export const LIVE_URL = 'https://api.tradier.com/v1';
export const PAPER_URL = 'https://sandbox.tradier.com/v1';
export const terminal = new Set(['filled', 'canceled', 'expired', 'rejected', 'error']);

function brokerArray(container, key) {
  if (container === 'null' || container === null) return [];
  if (!container || !(key in container)) throw new Error('Tradier devolvió una lista de cuenta incompleta.');
  const rows = container[key];
  if (rows === null || rows === 'null') return [];
  if (Array.isArray(rows)) return rows;
  if (typeof rows === 'object') return [rows];
  throw new Error('Tradier devolvió una lista de cuenta inválida.');
}

function orderSide(leg, action) {
  if (action === 'OPEN') return leg.direction === -1 ? 'sell_to_open' : 'buy_to_open';
  return leg.direction === -1 ? 'buy_to_close' : 'sell_to_close';
}

export function orderForm(trade, action, price, tag, preview) {
  if (!['OPEN', 'CLOSE'].includes(action) || ![2, 4].includes(trade.legs.length)
    || !Number.isFinite(price) || price < 0.01) throw new Error('Ticket multileg inválido.');
  const form = new URLSearchParams({
    class: 'multileg', symbol: trade.root, type: action === 'OPEN' ? 'credit' : 'debit',
    duration: 'day', price: price.toFixed(2), tag
  });
  trade.legs.forEach((leg, index) => {
    form.set(`option_symbol[${index}]`, leg.symbol);
    form.set(`side[${index}]`, orderSide(leg, action));
    form.set(`quantity[${index}]`, '1');
  });
  if (preview) form.set('preview', 'true');
  return form;
}

export function reconcileFill(order, trade, action) {
  const rows = order.leg;
  if (!Array.isArray(rows) || rows.length !== trade.legs.length) return null;
  const matched = trade.legs.map(leg => rows.find(row =>
    row.option_symbol === leg.symbol && row.side === orderSide(leg, action)));
  if (matched.some(row => !row || row.exec_quantity === null || row.exec_quantity === undefined
    || row.exec_quantity === '' || ![0, 1].includes(Number(row.exec_quantity)))) return null;
  if (matched.every(row => Number(row.exec_quantity) === 0) && order.status !== 'filled') return { filled: false };
  if (!matched.every(row => Number(row.exec_quantity) === 1 && row.avg_fill_price !== null
    && row.avg_fill_price !== undefined && row.avg_fill_price !== '' && Number(row.avg_fill_price) >= 0)) return null;
  const net = matched.reduce((sum, row) => sum + (row.side.startsWith('sell') ? 1 : -1) * Number(row.avg_fill_price), 0);
  const price = Math.round((action === 'OPEN' ? net : -net) * 100) / 100;
  if (price > trade.width || (action === 'OPEN' && price <= 0)) return null;
  return { filled: true, price };
}

export class TradingBroker extends TradierClient {
  constructor({ mode, account, token }) {
    if (!['paper', 'live'].includes(mode) || !/^[A-Z0-9]{4,20}$/i.test(account) || !token) {
      throw new Error('Configuración de la cuenta de ejecución incompleta.');
    }
    super({ token, baseUrl: mode === 'live' ? LIVE_URL : PAPER_URL });
    this.account = account;
    this.path = `/accounts/${account}`;
  }

  async accountCall(path, { method = 'GET', query, form } = {}) {
    const params = new URLSearchParams(query);
    const url = this.settings.baseUrl + this.path + path + (params.size ? '?' + params : '');
    let response;
    try {
      response = await fetch(url, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${this.settings.token}`, Accept: 'application/json',
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
        },
        body: form
      });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      throw new Error('Tradier no confirmó la solicitud de cuenta' + (response ? ` (HTTP ${response.status}).` : '.'));
    }
  }

  async positions() {
    return brokerArray((await this.accountCall('/positions')).positions, 'position');
  }

  async orders() {
    const payload = await this.accountCall('/orders', { query: { includeTags: 'true', limit: '1000' } });
    if (Number(payload.orders?.total_pages ?? payload.total_pages ?? 1) > 1) {
      throw new Error('La lista de órdenes de la sesión está paginada y requiere reconciliación.');
    }
    return brokerArray(payload.orders, 'order');
  }

  async balance() {
    const { balances } = await this.accountCall('/balances');
    if (balances?.account_number !== this.account) throw new Error('Tradier devolvió un saldo de otra cuenta.');
    return {
      equity: Number(balances.total_equity),
      optionBuyingPower: Number(balances.margin?.option_buying_power ?? balances.pdt?.option_buying_power)
    };
  }

  async getOrder(id) {
    const payload = await this.accountCall(`/orders/${Number(id)}`, { query: { includeTags: 'true' } });
    if (Number(payload.order?.id) !== Number(id)) throw new Error('Tradier no devolvió la orden solicitada.');
    return payload.order;
  }

  async preview(trade, action, price, tag) {
    const result = await this.accountCall('/orders', { method: 'POST', form: orderForm(trade, action, price, tag, true) });
    const order = result.order;
    if (result.errors || order?.status !== 'ok' || order.result !== true) return null;
    if (order.fees == null || order.commission == null) return null;
    const fees = Number(order.fees) + Number(order.commission);
    return Number.isFinite(fees) && fees >= 0 ? { fees } : null;
  }

  async submit(trade, action, price, tag) {
    const { order } = await this.accountCall('/orders', { method: 'POST', form: orderForm(trade, action, price, tag, false) });
    if (!Number.isSafeInteger(Number(order?.id)) || Number(order.id) <= 0) throw new Error('Tradier no confirmó el ID de la orden.');
    return String(order.id);
  }

  async cancel(id) {
    await this.accountCall(`/orders/${Number(id)}`, { method: 'DELETE' });
  }
}
