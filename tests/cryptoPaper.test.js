import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CryptoPaper } from '../server/trading/cryptoPaper.js';

const NOW = new Date('2026-11-24T16:00:00Z');

function snapshot(overrides = {}) {
  return { symbol: 'SOLUSDT', source: 'test', price: 100, ema20: 99, ema50: 98, ema200: 90, rsi14: 55, atr14: 2, change24h: 1, ...overrides };
}

function makeBot(fetcher, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '5m-crypto-'));
  const bot = new CryptoPaper({ env, now: () => NOW, fetcher, stateFile: 'state.json', dataDir });
  bot.arm();
  return bot;
}

test('abre long paper con riesgo y stop por ATR cuando hay tendencia', async () => {
  const bot = makeBot(async () => snapshot());
  const status = await bot.runCycle();
  assert.equal(status.cycle.state, 'ABIERTO');
  const position = status.position;
  assert.equal(position.side, 'LONG');
  assert.equal(position.stop, 98);
  assert.equal(position.target, 106);
  assert.ok(position.riskUsd <= 250 + 0.01);
  assert.ok(position.units > 0 && position.units <= 100);
});

test('abre short paper cuando la tendencia es bajista', async () => {
  const bot = makeBot(async () => snapshot({ price: 100, ema50: 102, ema200: 110, rsi14: 45 }), { CRYPTO_ALLOW_SHORT: 'true' });
  const status = await bot.runCycle();
  assert.equal(status.cycle.state, 'ABIERTO');
  assert.equal(status.position.side, 'SHORT');
  assert.equal(status.position.stop, 102);
});

test('cierra en stop cuando el precio cae', async () => {
  let price = 100;
  const bot = makeBot(async () => snapshot({ price }));
  await bot.runCycle();
  price = 97;
  const status = await bot.runCycle();
  assert.equal(status.position, null);
  assert.equal(status.cycle.state, 'CERRADO');
  assert.ok(/STOP/i.test(status.cycle.note));
  assert.equal(status.stats.trades, 1);
  assert.ok(status.stats.totalPnlUsd < 0);
});

test('cierra en objetivo cuando llega a 3R', async () => {
  let price = 100;
  const bot = makeBot(async () => snapshot({ price }));
  await bot.runCycle();
  price = 107;
  const status = await bot.runCycle();
  assert.equal(status.position, null);
  assert.ok(/OBJETIVO/i.test(status.cycle.note));
  assert.ok(status.stats.totalPnlUsd > 0);
});

test('no opera sin tendencia clara', async () => {
  const bot = makeBot(async () => snapshot({ price: 100, ema50: 100, ema200: 100 }));
  const status = await bot.runCycle();
  assert.equal(status.position, null);
  assert.equal(status.cycle.state, 'ESPERANDO');
});