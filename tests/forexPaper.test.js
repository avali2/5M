import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ForexPaper } from '../server/trading/forexPaper.js';

const NOW = new Date('2026-11-23T16:00:00Z');

function snapshot(overrides = {}) {
  return { symbol: 'EURUSD', source: 'test', price: 1.1, bid: 1.09996, ask: 1.10004, spreadPips: 0.8, ema50: 1.095, ema200: 1.09, rsi14: 55, atr14: 0.001, marketOpen: true, updatedAt: NOW.toISOString(), ...overrides };
}

function makeBot(fetcher) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '5m-fx-'));
  const bot = new ForexPaper({ env: {}, now: () => NOW, fetcher, stateFile: 'state.json', dataDir });
  bot.arm();
  return bot;
}

test('abre long forex con riesgo acotado y spread', async () => {
  const bot = makeBot(async () => snapshot());
  const status = await bot.runCycle();
  assert.equal(status.cycle.state, 'ABIERTO');
  assert.equal(status.position.side, 'LONG');
  assert.ok(status.position.riskUsd <= 250 + 0.01);
  assert.ok(status.position.units > 0);
});

test('abre short cuando la tendencia es bajista', async () => {
  const bot = makeBot(async () => snapshot({ price: 1.1, ema50: 1.105, ema200: 1.11, rsi14: 45 }));
  const status = await bot.runCycle();
  assert.equal(status.position.side, 'SHORT');
});

test('cierra en stop', async () => {
  let price = 1.1;
  const bot = makeBot(async () => snapshot({ price, bid: price - 0.00004, ask: price + 0.00004 }));
  await bot.runCycle();
  price = 1.095;
  const status = await bot.runCycle();
  assert.equal(status.position, null);
  assert.ok(/STOP/i.test(status.cycle.note));
  assert.ok(status.stats.totalPnlUsd < 0);
});

test('cierra en objetivo', async () => {
  let price = 1.1;
  const bot = makeBot(async () => snapshot({ price, bid: price - 0.00004, ask: price + 0.00004 }));
  await bot.runCycle();
  price = 1.106;
  const status = await bot.runCycle();
  assert.equal(status.position, null);
  assert.ok(/OBJETIVO/i.test(status.cycle.note));
  assert.ok(status.stats.totalPnlUsd > 0);
});

test('no opera con mercado cerrado', async () => {
  const bot = makeBot(async () => snapshot({ marketOpen: false }));
  const status = await bot.runCycle();
  assert.equal(status.position, null);
  assert.equal(status.cycle.state, 'ESPERANDO');
});
test('opera XAUUSD con pip y spread propios', async () => {
  const bot = makeBot(async () => snapshot({ symbol: 'XAUUSD', price: 3608.7, bid: 3608.525, ask: 3608.875, spreadPips: 35, spreadPrice: 0.35, pipSize: 0.01, ema50: 3600, ema200: 3500, rsi14: 55, atr14: 10 }));
  const status = await bot.runCycle();
  assert.equal(status.position.side, 'LONG');
  assert.ok(status.position.riskUsd <= 250 + 0.01);
  assert.ok(status.position.units > 0);
});
