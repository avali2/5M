import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProbabilityEdge } from '../server/engine/probability-edge.js';
import { evaluateRiskGovernor } from '../server/engine/risk-governor.js';

const setup = {
  symbol: 'SPY',
  strategy: 'Bull Put Spread',
  underlyingPrice: 100,
  iv: 25,
  dte: 14,
  breakevens: [94.5],
  expectedMove: 4,
  maxProfit: 50,
  maxRisk: 450,
  collateralRequired: 450,
  liquidityScore: 9,
  legs: [
    { side: 'SELL', type: 'PUT', strike: 95, delta: -0.2, bid: 0.79, ask: 0.81 },
    { side: 'BUY', type: 'PUT', strike: 90, delta: -0.08, bid: 0.29, ask: 0.31 }
  ],
  strikes: '95 / 90',
  takeProfit: 'Close at 50% of credit',
  stopLoss: 'Close at 2x credit or risk gate breach',
  blocks: [],
  tradeQualityScore: 86
};

test('probability engine labels modeled edge and computes finite risk metrics', () => {
  const edge = calculateProbabilityEdge(setup, '2026-05-27T10:00:00.000Z');
  assert.equal(edge.available, true);
  assert.ok(edge.probabilityOfProfit > 50);
  assert.ok(Number.isFinite(edge.expectedValue));
  assert.match(edge.disclaimer, /estimacion/i);
});

test('risk governor permits validated defined-risk setup and blocks excessive collateral', () => {
  const profile = { accountSize: 10000, collateralUsedPct: 10, consecutiveDailyLosses: 0, dailyLossPct: 0, maxDailyLossPct: 5, weeklyLossPct: 0, maxWeeklyLossPct: 8, allow0Dte: false };
  const accepted = evaluateRiskGovernor({ setup, profile, dataHealthy: true });
  assert.equal(accepted.classification, 'Trade Validado');
  assert.equal(accepted.allowedReal, true);
  const blocked = evaluateRiskGovernor({ setup, profile: { ...profile, collateralUsedPct: 85 }, dataHealthy: true });
  assert.equal(blocked.allowedReal, false);
  assert.equal(blocked.classification, 'Paper Trade / solo estudio');
});
