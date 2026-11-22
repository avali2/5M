import test from 'node:test';
import assert from 'node:assert/strict';
import { decideOpportunityAlerts, decidePositionAlerts, AlertCenter } from '../server/lib/alerts.js';

function scanFixture(overrides = {}) {
  return {
    simulated: false,
    opportunities: [
      { kind: 'PUT', symbol: 'SPY', score: 80, action: 'COMPRAR', expiry: '2026-12-18', contract: { strike: 700 }, entry: 8.2, pop: 0.6, meta: { operable: true } },
      { kind: 'CALL', symbol: 'QQQ', score: 60, action: 'COMPRAR', expiry: '2026-12-18', contract: { strike: 620 }, entry: 4.1, pop: 0.5, meta: { operable: true } },
      { kind: 'SPREAD', symbol: 'AMD', strategy: 'IRON_CONDOR', score: 90, dte: 14, credit: 3.2, pop: 0.7, meta: { operable: true } },
      { kind: 'PUT', symbol: 'TSLA', score: 95, action: 'COMPRAR', expiry: '2026-12-18', contract: { strike: 300 }, entry: 9, pop: 0.5, meta: { operable: false } }
    ],
    ...overrides
  };
}

test('notifica solo oportunidades operables por encima del umbral', () => {
  const alerts = decideOpportunityAlerts({ scan: scanFixture(), minScore: 75 });
  assert.equal(alerts.length, 2);
  const symbols = alerts.map((alert) => alert.symbol).sort();
  assert.deepEqual(symbols, ['AMD', 'SPY']);
  for (const alert of alerts) {
    assert.ok(alert.title.includes('5M'));
    assert.ok(alert.body.length > 20);
    assert.equal(alert.url, '/#quick');
    assert.ok(alert.key.startsWith('opp:'));
  }
});

test('no alerta en modo simulado', () => {
  const alerts = decideOpportunityAlerts({ scan: scanFixture({ simulated: true }), minScore: 50 });
  assert.deepEqual(alerts, []);
});

test('alerta posiciones de prioridad alta', () => {
  const analysis = {
    positions: [
      { id: 'a', symbol: 'SPY', strategy: 'BULL_PUT_CREDIT', action: 'CERRAR por stop', priority: 'ALTA', pnlUsd: -220, dte: 4 },
      { id: 'b', symbol: 'QQQ', strategy: 'IRON_CONDOR', action: 'MANTENER', priority: 'BAJA', pnlUsd: 40, dte: 20 }
    ]
  };
  const alerts = decidePositionAlerts({ analysis });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].symbol, 'SPY');
  assert.ok(alerts[0].body.includes('stop'));
});

test('el enfriamiento evita repetir el mismo aviso', () => {
  const center = new AlertCenter({ cooldownMinutes: 60 });
  const alerts = decideOpportunityAlerts({ scan: scanFixture(), minScore: 75 });
  const now = Date.now();
  assert.equal(center.due(alerts, now).length, 2);
  assert.equal(center.due(alerts, now + 60000).length, 0);
  assert.equal(center.due(alerts, now + 61 * 60000).length, 2);
  assert.ok(center.peek().length >= 2);
});
