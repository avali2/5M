import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseStateText, authorized } from '../server/lib/mt5Bridge.js';

test('parsea estado MT5 con cuenta, posiciones y quotes', () => {
  const text = ['account|ICMarkets|12345678|10000|10050|500|USD', 'position|111|EURUSD|0|0.10|1.0987|1.0975|1.1011|12.5', 'quote|EURUSD|1.09825|1.09835'].join('\n');
  const state = parseStateText(text);
  assert.equal(state.account.login, '12345678');
  assert.equal(state.account.equity, 10050);
  assert.equal(state.positions.length, 1);
  assert.equal(state.positions[0].side, 'BUY');
  assert.equal(state.quotes.EURUSD.bid, 1.09825);
});

test('validación de token del puente', () => {
  assert.equal(authorized('abc', { MT5_BRIDGE_TOKEN: 'abc' }), true);
  assert.equal(authorized('otro', { MT5_BRIDGE_TOKEN: 'abc' }), false);
  assert.equal(authorized('abc', {}), false);
});
