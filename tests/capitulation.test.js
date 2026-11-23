import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCapitulation } from '../server/lib/capitulation.js';

function put(strike, delta, mid) { return { symbol: 'P' + strike, type: 'put', strike, delta, iv: 0.6, bid: mid - 0.02, ask: mid + 0.02, openInterest: 500, volume: 50, expiration: '2026-12-29' }; }

function snapshot(drop = true) {
  const bars = [];
  let price = 120;
  for (let index = 0; index < 220; index += 1) {
    if (drop && index === 218) price *= 0.95;
    if (drop && index === 219) price *= 0.93;
    if (!drop || index < 218) price *= 1.0005;
    bars.push({ date: '2026-01-01', open: price, high: price * 1.01, low: price * 0.99, close: price, volume: 1e6 });
  }
  return { symbol: 'AMD', quote: { price, asOf: new Date().toISOString() }, history: bars, expirations: ['2026-12-29'], dteByExpiration: { '2026-12-29': 35 }, chains: { '2026-12-29': [put(95, -0.3, 2.0), put(92, -0.2, 1.0), put(90, -0.15, 0.6)] }, simulated: false };
}

test('detecta caída fuerte y propone put credit spread', () => {
  const { candidate } = evaluateCapitulation(snapshot(true));
  assert.ok(candidate);
  assert.equal(candidate.strategy, 'PUT_CREDIT_CAPITULACION');
  assert.ok(candidate.credit > 0);
  assert.ok(candidate.maxLoss <= 300);
  assert.ok(candidate.creditWidth >= 0.18);
});

test('sin caída no propone nada', () => {
  const { candidate, notes } = evaluateCapitulation(snapshot(false));
  assert.equal(candidate, null);
  assert.ok(notes.some((note) => note.includes('Sin caída')));
});