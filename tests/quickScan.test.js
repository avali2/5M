import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuickScan } from '../server/lib/quickScan.js';

function signal(overrides = {}) {
  return {
    id: 'sig-' + Math.random().toString(36).slice(2, 7),
    side: 'CALL', setup: 'TREND', score: 70, grade: 'B',
    contract: { expiration: '2026-12-18', dte: 12, strike: 100 },
    plan: { entryLimit: 3.1, maxEntry: 3.2, stopPrice: 2.0, targets: [{ price: 4.4, underlying: 104 }], maxLossUsd: 310, sizingNote: '1 contrato' },
    probabilities: { pop: 0.55 },
    narrative: { thesis: 'SPY muestra un sesgo alcista con tendencia alineada y flujo positivo en la cadena.' },
    copy: 'COPIA', meta: { operable: true, simulated: false, asOf: '2026-12-01T10:00:00Z' },
    ivContext: { rvRatio: 0.9 },
    ...overrides
  };
}

function idea(overrides = {}) {
  return {
    id: 'idea-' + Math.random().toString(36).slice(2, 7),
    strategy: 'IRON_CONDOR', label: 'Iron condor', aggression: 'AGRESIVO', score: 80, grade: 'A',
    expiration: '2026-12-18', dte: 14,
    pricing: { credit: 3.2, width: 5, maxProfitUsd: 320, maxLossUsd: 180 },
    risk: { pop: 0.72 },
    legs: [{ action: 'SELL', type: 'put', strike: 95 }, { action: 'BUY', type: 'put', strike: 90 }],
    why: [{ label: 'POP modelo', value: '72%' }],
    copy: 'COPIA-SPREAD', meta: { simulated: false, spot: 100 },
    ...overrides
  };
}

test('ordena oportunidades por accionabilidad y respeta el límite', () => {
  const items = [{
    symbol: 'SPY',
    snapshot: { quote: { price: 100 }, marketOpen: true, events: [], simulated: false },
    nito: { signals: [signal({ score: 68 }), signal({ side: 'PUT', score: 90, contract: { expiration: '2026-12-18', dte: 9, strike: 95 } })], gate: { status: 'OPEN', tradeable: true }, meta: { bias: 40 } },
    spreads: { ideas: [idea(), idea({ strategy: 'BULL_PUT_CREDIT', label: 'Bull put spread', score: 60, pricing: { credit: 1.1, width: 5, maxProfitUsd: 110, maxLossUsd: 390 }, risk: { pop: 0.8 } })] }
  }];
  const scan = buildQuickScan({ items, limit: 3 });
  assert.equal(scan.opportunities.length, 3);
  assert.ok(scan.opportunities[0].score >= scan.opportunities[1].score - 12, 'el ranking prioriza score y contexto');
  assert.equal(scan.counts.total, 4);
  assert.ok(scan.summary.includes('SPY'));
  assert.ok(scan.marketOpen);
  assert.ok(scan.bySymbol[0].gate === 'OPEN');
  for (const opportunity of scan.opportunities) {
    assert.ok(['CALL', 'PUT', 'SPREAD'].includes(opportunity.kind));
    assert.ok(['AHORA', 'HOY', 'VIGILAR'].includes(opportunity.urgency));
    assert.ok(opportunity.copy.length > 0);
    assert.ok(opportunity.thesis.length > 10);
  }
});

test('marca mercado cerrado y eventos del día como alertas', () => {
  const today = new Date().toISOString().slice(0, 10);
  const scan = buildQuickScan({
    items: [{
      symbol: 'QQQ', snapshot: { quote: { price: 600 }, marketOpen: false, simulated: false, events: [{ date: today, label: 'FOMC', impact: 'high', type: 'FOMC' }] },
      nito: { signals: [signal({ score: 55 })], gate: { status: 'CLOSED', tradeable: false, reasons: ['Mercado cerrado.'] }, meta: {} }, spreads: { ideas: [] }
    }]
  });
  assert.equal(scan.marketOpen, false);
  assert.ok(scan.alerts.some((alert) => /Mercado cerrado/.test(alert.text)));
  assert.ok(scan.alerts.some((alert) => /FOMC/.test(alert.text)));
});

test('sin oportunidades devuelve mensaje de espera y no rompe', () => {
  const scan = buildQuickScan({ items: [{ symbol: 'AMD', snapshot: { quote: { price: 100 }, marketOpen: true }, nito: { signals: [], gate: { status: 'OPEN' }, meta: {} }, spreads: { ideas: [] } }] });
  assert.equal(scan.empty, true);
  assert.match(scan.summary, /Esperar|esperar/);
  assert.equal(scan.opportunities.length, 0);
});

test('marca datos simulados como no operables', () => {
  const scan = buildQuickScan({
    items: [{ symbol: 'SPY', snapshot: { quote: { price: 100 }, marketOpen: true, simulated: true }, nito: { signals: [signal({ meta: { operable: false, simulated: true } })], gate: { status: 'DEMO', tradeable: false }, meta: {} }, spreads: { ideas: [] } }]
  });
  assert.equal(scan.simulated, true);
  assert.ok(scan.alerts.some((alert) => /simulados/i.test(alert.text)));
  assert.equal(scan.opportunities[0].meta.operable, false);
});
