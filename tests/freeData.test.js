import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChain, isMarketOpenET } from '../server/lib/freeData.js';

function rawChain(spot) {
  const strikes = {};
  for (const strike of [90, 95, 100, 105, 110]) {
    strikes[String(strike)] = { oi: 1000, l: 3, b: 2.9, a: 3.1, v: 50 };
  }
  const calls = {}; const puts = {};
  for (const [strike, quote] of Object.entries(strikes)) { calls[strike] = { ...quote }; puts[strike] = { ...quote, b: 1.9, a: 2.1, l: 2 }; }
  return { '2026-12-18': { c: calls, p: puts }, '2027-01-15': { c: calls, p: puts } };
}

test('normaliza la cadena pública con Greeks e IV finitos', () => {
  const now = Date.parse('2026-11-22T15:00:00Z');
  const result = normalizeChain({ symbol: 'TEST', spot: 100, rawOptions: rawChain(100), now, maxExpirations: 2 });
  assert.equal(result.expirations.length, 2);
  const rows = result.chains[result.expirations[0]];
  assert.ok(rows.length >= 8, 'esperaba calls y puts alrededor del spot');
  for (const row of rows) {
    assert.ok(['call', 'put'].includes(row.type));
    assert.ok(row.bid > 0 && row.ask >= row.bid);
    assert.ok(Number.isFinite(row.iv) && row.iv > 0.02 && row.iv < 5);
    assert.ok(Number.isFinite(row.delta) && Math.abs(row.delta) <= 1);
    assert.ok(Number.isFinite(row.gamma) && row.gamma >= 0);
    assert.ok(Number.isFinite(row.theta));
  }
  const call = rows.find((row) => row.type === 'call' && row.strike === 100);
  assert.ok(call.delta > 0.3 && call.delta < 0.9);
  const put = rows.find((row) => row.type === 'put' && row.strike === 100);
  assert.ok(put.delta < 0 && put.delta > -0.9);
});

test('descarta vencimientos fuera de 5..75 días y cadenas vacías', () => {
  const now = Date.parse('2026-11-22T15:00:00Z');
  assert.throws(() => normalizeChain({ symbol: 'X', spot: 100, rawOptions: { '2026-11-23': { c: {}, p: {} } }, now }), /vencimientos/i);
});

test('detecta sesión de mercado en horario de Nueva York', () => {
  assert.equal(isMarketOpenET(new Date('2026-11-20T15:00:00Z')), true);  // viernes 10:00 ET
  assert.equal(isMarketOpenET(new Date('2026-11-21T15:00:00Z')), false); // sábado
  assert.equal(isMarketOpenET(new Date('2026-11-20T23:30:00Z')), false); // viernes 18:30 ET
});
