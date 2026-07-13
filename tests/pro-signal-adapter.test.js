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

test('frontend adapter exposes only one direction per symbol and follows the technical thesis', () => {
  const signals = professionalSignalsFromScan({
    market: { technicals: { NVDA: { trend: 'bullish' } } },
    guardianEdge: {
      candidateTickets: [
        { symbol: 'NVDA', strategy: 'Bear Call Spread', classification: 'TRADE_CANDIDATE', edgeScore: 92, popEstimated: 70, expiration: '2026-09-18', dte: 30 },
        { symbol: 'NVDA', strategy: 'Bull Put Spread', classification: 'TRADE_CANDIDATE', edgeScore: 78, popEstimated: 65, expiration: '2026-09-18', dte: 30 }
      ]
    }
  });

  assert.equal(signals.length, 1);
  assert.equal(signals[0].bias, 'bullish');
  assert.equal(signals[0].status, 'WATCH');
});

test('capital-heavy Guardian ticket never becomes an implementable signal', () => {
  const signals = professionalSignalsFromScan({
    guardianEdge: {
      actionableTickets: [
        { symbol: 'TSLA', strategy: 'Bull Put Spread', classification: 'CAPITAL_HEAVY', edgeScore: 90, popEstimated: 78, expiration: '2026-09-18', dte: 30 }
      ]
    }
  });
  assert.equal(signals[0].status, 'WATCH');
});

test('frontend keeps unavailable financial values as N/D instead of converting them to zero', () => {
  const signals = professionalSignalsFromScan({
    guardianEdge: {
      candidateTickets: [
        { symbol: 'NU', strategy: 'Bull Put Spread', classification: 'TRADE_CANDIDATE', popEstimated: null, maxRisk: null, expiration: '2026-09-18', dte: 30 }
      ]
    }
  });
  assert.equal(signals[0].pop, null);
  assert.equal(signals[0].maxRiskUsd, null);
  assert.equal(signals[0].profitProbabilityPct, null);
});
