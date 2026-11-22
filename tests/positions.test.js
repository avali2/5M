import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePositions } from '../server/lib/positions.js';

function isoInDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function trade(overrides = {}) {
  return {
    id: 'trade-1', state: 'OPEN', entry_credit: 2,
    plan: {
      root: 'SPY', strategy: 'BULL_PUT_CREDIT', expiration: isoInDays(10), width: 5,
      legs: [{ type: 'put', strike: 100, direction: -1 }, { type: 'put', strike: 95, direction: 1 }]
    },
    ...overrides
  };
}

function snapshot(price) {
  return { quote: { price }, chains: {}, expirations: [] };
}

test('calcula P/L y sugiere cerrar al 50% del crédito', () => {
  const analysis = analyzePositions({ trades: [trade()], snapshots: { SPY: snapshot(110) } });
  assert.equal(analysis.positions.length, 1);
  const position = analysis.positions[0];
  assert.ok(position.pnlUsd > 0, 'un spread OTM debe estar en ganancia');
  assert.ok(position.pnlPct >= 50);
  assert.match(position.action, /CERRAR/);
  assert.equal(position.shortStrike, 100);
  assert.ok(position.distanceToShortPct > 0);
  assert.equal(position.shortItm, false);
  assert.equal(analysis.summary.win, 1);
});

test('alerta asignación cuando el strike corto queda ITM', () => {
  const analysis = analyzePositions({ trades: [trade()], snapshots: { SPY: snapshot(94) } });
  const position = analysis.positions[0];
  assert.equal(position.shortItm, true);
  assert.equal(position.priority, 'ALTA');
  assert.match(position.action, /ATENCIÓN/);
});

test('cierra por vencimiento cuando faltan dos días o menos', () => {
  const analysis = analyzePositions({ trades: [trade({ plan: { root: 'SPY', strategy: 'IRON_CONDOR', expiration: isoInDays(1), width: 5, legs: [{ type: 'put', strike: 90, direction: -1 }, { type: 'put', strike: 85, direction: 1 }] } })], snapshots: { SPY: snapshot(100) } });
  assert.equal(analysis.positions[0].priority, 'ALTA');
  assert.match(analysis.positions[0].action, /vencimiento/i);
});

test('sin snapshot de mercado deja la posición visible con marca nula', () => {
  const analysis = analyzePositions({ trades: [trade()], snapshots: {} });
  const position = analysis.positions[0];
  assert.equal(position.markValueUsd, null);
  assert.equal(position.pnlUsd, null);
  assert.equal(position.spot, null);
  assert.equal(analysis.positions.length, 1);
});

test('resume varias posiciones con métricas agregadas', () => {
  const analysis = analyzePositions({
    trades: [trade({ id: 'a' }), trade({ id: 'b', plan: { root: 'QQQ', strategy: 'BEAR_CALL_CREDIT', expiration: isoInDays(15), width: 5, legs: [{ type: 'call', strike: 700, direction: -1 }, { type: 'call', strike: 705, direction: 1 }] } })],
    snapshots: { SPY: snapshot(110), QQQ: snapshot(650) }
  });
  assert.equal(analysis.positions.length, 2);
  assert.equal(analysis.summary.total, 2);
  assert.ok(analysis.summary.win + analysis.summary.loss <= 2);
});
