import test from 'node:test';
import assert from 'node:assert/strict';
import { professionalSignalsFromScan } from '../src/utils/proSignalAdapter.js';

test('frontend adapter maps READY_GREEN opportunities as READY signals', () => {
  const signals = professionalSignalsFromScan({
    asOf: '2026-06-04T12:00:00.000Z',
    opportunities: [{
      symbol: 'SOFI',
      strategy: 'Bull Put Spread',
      status: 'READY_GREEN',
      expiration: '2026-07-17',
      dte: 43,
      pop: 0.64,
      maxRisk: 120,
      maxProfit: 45,
      legs: [
        { side: 'sell', type: 'put', strike: 8, delta: -0.24 },
        { side: 'buy', type: 'put', strike: 7, delta: -0.12 }
      ]
    }]
  });

  assert.equal(signals.length, 1);
  assert.equal(signals[0].status, 'READY');
  assert.equal(signals[0].profitProbabilityPct, 64);
});

test('frontend adapter hides rejected avoid tickets but keeps useful no-data diagnostics', () => {
  const signals = professionalSignalsFromScan({
    rejected: [
      { symbol: 'TSLA', strategy: 'Bull Put Spread', status: 'BLOCKED', blocks: ['Risk budget exceeded'] },
      { symbol: 'NU', strategy: 'Bull Put Spread', status: 'DATA_ERROR', blocks: ['No option chain'] }
    ]
  });

  assert.deepEqual(signals.map((signal) => signal.symbol), ['NU']);
  assert.equal(signals[0].status, 'NO_DATA');
});
