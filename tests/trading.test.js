import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PAPER_URL, TradingBroker, orderForm, reconcileFill } from '../server/trading/broker.js';
import { TradingJournal } from '../server/trading/journal.js';
import { TradingDesk } from '../server/trading/desk.js';
import { buildSpreads, closingQuote, repriceSpread, trendFromHistory } from '../server/trading/strategy.js';

const now = new Date('2026-11-16T16:00:00Z');
const expiration = '2026-12-18';
const day = '2026-11-16';

function leg(type, strike, bid, ask, delta, root = 'XSP') {
  return {
    type, strike, bid, ask, delta, symbol: root + '261218' + type[0].toUpperCase() + String(strike * 1000).padStart(8, '0'),
    volume: 4, openInterest: 100, rootSymbol: root, contractSize: 100, greeksAt: now.toISOString(),
    gamma: strike / 10000, vega: strike / 1000, theta: -0.1
  };
}

function build(bias, extra = {}) {
  return buildSpreads({
    chain: [leg('put', 487, 1.2, 1.25, -0.23), leg('put', 485, 0.65, 0.70, -0.17),
      leg('call', 513, 1.2, 1.25, 0.23), leg('call', 515, 0.65, 0.70, 0.17)],
    root: 'XSP', expiration, underlying: { price: 500 }, bias, now, useDelta: true, condor: true, ...extra
  });
}

function withJournal(t) {
  const folder = mkdtempSync(path.join(tmpdir(), '5m-trading-'));
  const db = path.join(folder, 'bot.sqlite');
  const journal = new TradingJournal(db);
  t.after(() => {
    journal.db.close();
    rmSync(folder, { recursive: true, force: true });
  });
  return { journal, db };
}

test('construye spreads y condor con patas estándar, pérdida teórica y Greeks netos', () => {
  const [bull] = build('ALCISTA');
  assert.equal(bull.strategy, 'BULL_PUT');
  assert.equal(bull.credit, 0.50);
  assert.equal(bull.maxRiskUsd, 150);
  assert.equal(bull.maxProfitUsd, 50);
  assert.deepEqual(bull.breakEvens, [486.5]);
  assert.ok(bull.greeks.delta > 0);
  assert.equal(build('BAJISTA')[0].strategy, 'BEAR_CALL');
  const [condor] = build('LATERAL');
  assert.equal(condor.strategy, 'IRON_CONDOR');
  assert.equal(condor.legs.length, 4);
  assert.equal(condor.maxRiskUsd, 100);
  assert.deepEqual(condor.breakEvens, [486, 514]);
  assert.deepEqual(build('LATERAL', { condor: false }), []);
  assert.deepEqual(build('ALCISTA', { chain: [
    leg('put', 487, 1.2, 1.25, -0.23), { ...leg('put', 485, 0.65, 0.70, -0.17), contractSize: 10 }
  ] }), []);
  assert.deepEqual(build('ALCISTA', { now: new Date('2026-11-16T19:00:00Z') }), []);
});

test('usa cierres completos y valida bid, ask, tamaño y demoras por modo', () => {
  const history = Array.from({ length: 26 }, (_, i) => ({
    date: new Date(now.getTime() - (26 - i) * 86400000).toISOString().slice(0, 10), close: 500 + i * 1.2
  }));
  assert.equal(trendFromHistory([...history, { date: day, close: 200 }], day).bias, 'ALCISTA');
  const [idea] = build('ALCISTA');
  const quote = idea.legs.map(item => ({ ...item, bidAt: now.toISOString(), askAt: now.toISOString(), bidSize: 1, askSize: 1 }));
  assert.ok(repriceSpread(idea, quote, now, 0));
  assert.equal(repriceSpread(idea, quote, new Date(now.getTime() + 16 * 60000), 0), null);
  assert.ok(repriceSpread(idea, quote, new Date(now.getTime() + 16 * 60000), 15));
  assert.equal(repriceSpread(idea, [{ ...quote[0], askSize: 0 }, quote[1]], now, 0), null);
  const noLongBid = [quote[0], { ...quote[1], bid: 0, bidSize: 0, bidAt: null }];
  assert.equal(repriceSpread(idea, noLongBid, now, 0), null);
  assert.equal(closingQuote(repriceSpread(idea, noLongBid, now, 0, { closing: true }), 0.5, 7).debit, 1.25);
  assert.deepEqual(closingQuote(idea, 0.50, 7), { debit: 0.60, reason: 'VENCIMIENTO_CERCANO' });
  assert.deepEqual(closingQuote(idea, 0.25, 14), { debit: 0.60, reason: 'UMBRAL_DE_PERDIDA' });
  assert.deepEqual(closingQuote(idea, 1.25, 14), { debit: 0.60, reason: 'OBJETIVO_DE_PRIMA' });
});

test('la previsualización nunca envía una orden y la ejecución paper usa el host Sandbox', async t => {
  const [idea] = build('LATERAL');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return Response.json(options.body.has('preview')
      ? { order: { status: 'ok', result: true, fees: 0.24, commission: 0 } }
      : { order: { status: 'ok', id: 1234 } });
  });
  const broker = new TradingBroker({ mode: 'paper', account: 'AB1234567', token: 'fake' });
  assert.deepEqual(await broker.preview(idea, 'OPEN', 1, '5mtest'), { fees: 0.24 });
  assert.equal(await broker.submit(idea, 'OPEN', 1, '5mtest'), '1234');
  assert.equal(requests[0].url, PAPER_URL + '/accounts/AB1234567/orders');
  assert.equal(requests[0].options.body.get('class'), 'multileg');
  assert.equal(requests[0].options.body.get('side[0]'), 'sell_to_open');
  assert.equal(requests[0].options.body.get('side[3]'), 'buy_to_open');
  assert.equal(requests[0].options.body.get('preview'), 'true');
  assert.equal(requests[1].options.body.has('preview'), false);
  assert.equal(requests[1].options.body.get('tag'), '5mtest');
  assert.equal(orderForm(idea, 'CLOSE', 0.5, 'close', false).get('side[0]'), 'buy_to_close');
});

test('el registro conserva una orden ambigua, excluye otro proceso y evita una segunda entrada', t => {
  const [plan] = build('ALCISTA');
  const { journal, db } = withJournal(t);
  const competing = new TradingJournal(db);
  t.after(() => competing.db.close());
  assert.equal(journal.renew(), true);
  assert.equal(competing.renew(), false);
  const entry = { tag: 'entry', plan, action: 'OPEN', day, now, price: 0.50, reason: 'reglas', fees: 0.25 };
  assert.equal(journal.reserve(entry), 'entry');
  assert.equal(journal.reserve({ ...entry, tag: 'duplicate' }), null);
  journal.release();
  assert.equal(competing.renew(), true);
  const [pending] = competing.pending();
  assert.equal(pending.status, 'intent');
  competing.submitted(pending.tag, '1234');
  const fill = { status: 'filled', leg: [
    { option_symbol: plan.legs[0].symbol, side: 'sell_to_open', exec_quantity: 1, avg_fill_price: 1.2 },
    { option_symbol: plan.legs[1].symbol, side: 'buy_to_open', exec_quantity: 1, avg_fill_price: 0.65 }
  ] };
  assert.equal(reconcileFill({ ...fill, leg: fill.leg.slice(0, 1) }, plan, 'OPEN'), null);
  competing.finalize(pending, fill.status, reconcileFill(fill, plan, 'OPEN'));
  const [trade] = competing.activeTrades();
  assert.equal(trade.state, 'OPEN');
  assert.equal(trade.entry_credit, 0.55);
  competing.setPaused(true);
  assert.equal(journal.paused(), true);
  const close = { ...entry, tag: 'exit', tradeId: trade.id, action: 'CLOSE', price: 0.24 };
  assert.equal(competing.reserve(close), 'exit');
  competing.finalize(competing.pending()[0], 'filled', { filled: true, price: 0.25 });
  assert.equal(competing.activeTrades().length, 0);
  assert.equal(competing.realized(day), 29.5);
  competing.setPaused(false);
  assert.equal(competing.reserve({ ...entry, tag: 'another' }), null);
});

test('modo real bloqueado sin disco y modo sombra nunca crea cliente de órdenes', async () => {
  const setting = {
    tradier: { token: 'fake', baseUrl: 'https://api.tradier.com/v1', realtimeEntitled: true },
    security: { requireAccessKey: true, accessKey: 'fake' }, dataDir: '/nonexistent'
  };
  const live = new TradingDesk(setting, { configured: true }, { BOT_MODE: 'live', BOT_MAX_RISK_USD: '250', BOT_ACCOUNT_ID: 'AB1234567' });
  assert.equal(live.status().state, 'BLOQUEADO');
  assert.equal(live.broker, undefined);
  const shadow = new TradingDesk(setting, {}, { BOT_MODE: 'shadow' });
  assert.equal(shadow.status().mode, 'shadow');
  assert.equal(shadow.broker, undefined);
  assert.equal(shadow.pause(true), false);
});

test('ciclo autónomo paper recupera un envío ambiguo y cierra aun con entradas pausadas', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const folder = mkdtempSync(path.join(tmpdir(), '5m-desk-'));
  const desk = new TradingDesk({
    tradier: { baseUrl: 'https://api.tradier.com/v1' },
    security: { requireAccessKey: true, accessKey: 'fake' }, dataDir: folder
  }, {}, { BOT_MODE: 'paper', BOT_SANDBOX_ACCOUNT_ID: 'AB1234567', TRADIER_SANDBOX_TOKEN: 'fake' });
  t.after(() => {
    desk.journal.db.close();
    rmSync(folder, { recursive: true, force: true });
  });
  const chain = [leg('put', 487, 1.2, 1.25, null, 'SPY'), leg('put', 485, 0.65, 0.70, null, 'SPY')];
  const dates = Array.from({ length: 26 }, (_, i) => ({
    date: new Date(now.getTime() - (26 - i) * 86400000).toISOString().slice(0, 10), close: 500 + i * 1.2
  }));
  let exitPrices = false;
  let positions = [];
  const orders = [];
  const previews = [];
  t.mock.method(desk.broker, 'getMarketClock', async () => ({ state: 'open' }));
  t.mock.method(desk.broker, 'request', async () => ({ calendar: { days: { day: [
    { date: day, status: 'open', open: { start: '09:30', end: '16:00' } }
  ] } } }));
  t.mock.method(desk.broker, 'getHistory', async () => dates);
  t.mock.method(desk.broker, 'getExpirations', async () => [expiration]);
  t.mock.method(desk.broker, 'getOptionChain', async () => chain);
  t.mock.method(desk.broker, 'getQuotes', async symbols => {
    const stamp = new Date(Date.now() - 15 * 60000).toISOString();
    const quote = (option, index) => ({
      ...option, bid: exitPrices ? [0.52, 0.34][index] : option.bid,
      ask: exitPrices ? [0.55, 0.36][index] : option.ask, bidAt: stamp, askAt: stamp, bidSize: 1, askSize: 1
    });
    return [{ symbol: 'SPY', price: 500, tradeDate: stamp }, ...chain.map(quote)].filter(item => symbols.includes(item.symbol));
  });
  t.mock.method(desk.broker, 'orders', async () => orders);
  t.mock.method(desk.broker, 'getOrder', async id => orders.find(order => Number(order.id) === Number(id)));
  t.mock.method(desk.broker, 'positions', async () => positions);
  t.mock.method(desk.broker, 'balance', async () => ({ equity: 50000, optionBuyingPower: 5000 }));
  t.mock.method(desk.broker, 'preview', async (_plan, action) => {
    previews.push(action);
    return { fees: 0.18 };
  });
  t.mock.method(desk.broker, 'submit', async (plan, action, _price, tag) => {
    const entry = action === 'OPEN';
    const id = orders.length + 1;
    orders.push({
      id, tag, class: 'multileg', symbol: 'SPY', status: 'filled',
      leg: plan.legs.map((item, index) => ({
        option_symbol: item.symbol, side: (entry ? ['sell_to_open', 'buy_to_open'] : ['buy_to_close', 'sell_to_close'])[index],
        exec_quantity: 1, avg_fill_price: (entry ? [1.20, 0.68] : [0.55, 0.34])[index]
      }))
    });
    positions = entry ? plan.legs.map(item => ({ symbol: item.symbol, quantity: item.direction })) : [];
    if (entry) throw new Error('Broker timeout after receiving the order');
    return String(id);
  });
  await desk.tick();
  assert.equal(desk.status().state, 'REVISIÓN');
  assert.equal(desk.status().orders[0].status, 'intent');
  await desk.tick();
  assert.equal(desk.status().trades[0].state, 'OPEN');
  desk.pause(true);
  exitPrices = true;
  t.mock.timers.tick(60000);
  await desk.tick();
  assert.equal(desk.status().trades[0].state, 'EXIT_PENDING');
  await desk.tick();
  assert.equal(desk.status().trades[0].state, 'CLOSED');
  assert.equal(desk.status().trades[0].realizedUsd, 30.64);
  assert.deepEqual(previews, ['OPEN', 'CLOSE']);
  assert.equal(orders.length, 2);
});
