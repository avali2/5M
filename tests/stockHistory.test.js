import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBars } from '../server/lib/stockHistory.js';

function bars(direction = 1, count = 300) {
  const result = [];
  let price = 100;
  for (let index = 0; index < count; index += 1) {
    price *= 1 + direction * 0.001;
    result.push({ open: price, high: price * 1.01, low: price * 0.99, close: price, volume: 1e6 });
  }
  return result;
}

test('resume tendencia alcista y bajista con contexto', () => {
  const up = summarizeBars(bars(1));
  assert.equal(up.trend, 'ALCISTA');
  assert.ok(up.ema50 > up.ema200);
  assert.ok(up.rsi14 > 50);
  const down = summarizeBars(bars(-1));
  assert.equal(down.trend, 'BAJISTA');
  assert.ok(down.ema50 < down.ema200);
});

test('sin datos suficientes devuelve null', () => {
  assert.equal(summarizeBars([]), null);
  assert.equal(summarizeBars([{ close: 1 }]), null);
});
