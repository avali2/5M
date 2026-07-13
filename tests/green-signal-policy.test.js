import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGreenSignal, enrichSignalForGreenPolicy } from '../server/engine/greenSignalPolicy.js';

const base = {
  symbol: 'SPY',
  strategy: 'Bull Put Spread',
  expiration: '2026-07-17',
  dte: 30,
  strikes: '500 / 495',
  credit: 1.1,
  maxRisk: 390,
  maxProfit: 110,
  liquidityScore: 9,
  confidenceScore: 76,
  pop: 63,
  legs: [
    { side: 'sell', type: 'put', strike: 500, bid: 1.8, ask: 1.84, delta: -0.22, gamma: 0.01, theta: -0.03, vega: 0.1, openInterest: 1000, volume: 100 },
    { side: 'buy', type: 'put', strike: 495, bid: 0.7, ask: 0.74, delta: -0.11, gamma: 0.004, theta: -0.01, vega: 0.05, openInterest: 900, volume: 90 }
  ],
  riskGovernor: { allowedReal: true, blocks: [] }
};

const context = {
  settings: { policy: { accountSize: 25000, riskPct: 2, maxCollateralPct: 35, maxBidAskPct: 0.2 }, signals: { minReadyScore: 72 } },
  profile: { accountSize: 25000, riskPct: 2, maxCollateralPct: 35, allow0Dte: true },
  globalBlocks: []
};

test('valid complete setup becomes READY_GREEN', () => {
  assert.equal(classifyGreenSignal(base, context).status, 'READY_GREEN');
  const enriched = enrichSignalForGreenPolicy(base, context);
  assert.equal(enriched.status, 'READY_GREEN');
  assert.equal(enriched.orderType, 'LIMIT');
  assert.ok(enriched.breakeven);
});

test('missing option chain data becomes DATA_ERROR', () => {
  assert.equal(classifyGreenSignal({ ...base, legs: [] }, context).status, 'DATA_ERROR');
});

test('null bid or ask never counts as a real quoted option leg', () => {
  const legs = base.legs.map((leg, index) => index === 0 ? { ...leg, bid: null } : leg);
  assert.equal(classifyGreenSignal({ ...base, legs }, context).status, 'DATA_ERROR');
});

test('zero-price option structures cannot become green signals', () => {
  assert.equal(classifyGreenSignal({ ...base, credit: 0 }, context).status, 'DATA_ERROR');
  assert.equal(classifyGreenSignal({ ...base, maxProfit: 0 }, context).status, 'DATA_ERROR');
});

test('risk above account budget blocks green signal', () => {
  assert.equal(classifyGreenSignal({ ...base, maxRisk: 900 }, context).status, 'BLOCKED');
});

test('cash-secured and covered single-leg structures accept one quoted leg', () => {
  const csp = {
    ...base,
    strategy: 'Cash Secured Put',
    strikes: '500',
    collateralRequired: 5000,
    legs: [base.legs[0]]
  };
  assert.equal(classifyGreenSignal(csp, context).status, 'READY_GREEN');
});

test('one DTE is allowed independently from zero DTE', () => {
  const oneDteContext = {
    ...context,
    settings: { ...context.settings, policy: { ...context.settings.policy, allow0Dte: false, allow1DteApproval: true } },
    profile: { ...context.profile, allow0Dte: false, allow1DteApproval: true }
  };
  assert.equal(classifyGreenSignal({ ...base, dte: 1 }, oneDteContext).status, 'READY_GREEN');
});
