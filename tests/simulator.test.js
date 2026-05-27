import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  calculateBreakEven,
  calculateMaxProfit,
  calculateMaxRisk,
  calculateNetGreeks,
  estimateEdge,
  estimateProbability,
  validateStrategy
} from '../src/features/options-simulator/calculations.js';

const bullPut = [
  { side: 'SELL', type: 'PUT', strike: 95, price: 0.8, quantity: 1, delta: -0.2, theta: -0.04, gamma: 0.01, vega: 0.1 },
  { side: 'BUY', type: 'PUT', strike: 90, price: 0.3, quantity: 1, delta: -0.08, theta: -0.02, gamma: 0.004, vega: 0.05 }
];

test('simulator computes contractual bull put spread risk and profit', () => {
  assert.equal(calculateMaxProfit({ legs: bullPut, spot: 100 }), 50);
  assert.equal(calculateMaxRisk({ legs: bullPut, spot: 100 }), 450);
  const breakEven = calculateBreakEven({ legs: bullPut, spot: 100 });
  assert.ok(Math.abs(breakEven[0] - 94.5) < 0.2);
  assert.equal(calculateNetGreeks(bullPut).theta, 0.02);
});

test('simulator blocks naked short calls by default', () => {
  const legs = [{ side: 'SELL', type: 'CALL', strike: 105, price: 1, quantity: 1 }];
  const warnings = validateStrategy({ legs, strategy: 'Custom', spot: 100, accountSize: 2000, riskPercent: 2 });
  assert.ok(warnings.some((warning) => warning.includes('naked calls')));
  assert.equal(calculateMaxRisk({ legs, spot: 100 }), Infinity);
});

test('simulator estimates EV and ROC from deterministic inputs', () => {
  const pop = estimateProbability(bullPut).probability;
  const edge = estimateEdge({ maxRisk: 450, maxProfit: 50, probability: pop, legs: bullPut });
  assert.equal(pop, 80);
  assert.equal(edge.returnOnCapital, 11.1);
  assert.ok(Number.isFinite(edge.expectedValue));
});

test('manual templates do not fabricate POP or Greeks without numeric inputs', () => {
  const manual = [
    { side: 'SELL', type: 'PUT', strike: 95, price: 0.8, quantity: 1, delta: '', theta: '', gamma: '', vega: '' },
    { side: 'BUY', type: 'PUT', strike: 90, price: 0.3, quantity: 1, delta: '', theta: '', gamma: '', vega: '' }
  ];
  assert.equal(estimateProbability(manual).probability, null);
  assert.equal(calculateNetGreeks(manual).theta, null);
});

test('iron condor bought call wing does not imply unlimited profit', () => {
  const condor = [
    { side: 'BUY', type: 'PUT', strike: 90, price: 0.2, quantity: 1 },
    { side: 'SELL', type: 'PUT', strike: 95, price: 0.6, quantity: 1 },
    { side: 'SELL', type: 'CALL', strike: 105, price: 0.6, quantity: 1 },
    { side: 'BUY', type: 'CALL', strike: 110, price: 0.2, quantity: 1 }
  ];
  assert.equal(calculateMaxProfit({ legs: condor, spot: 100 }), 80);
  assert.equal(calculateMaxRisk({ legs: condor, spot: 100 }), 420);
});

test('page notification code never invokes the unsafe Notification constructor', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/services/notifications.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /new\s+Notification\s*\(/);
  assert.doesNotMatch(service, /new\s+Notification\s*\(/);
  assert.match(service, /registration\.showNotification\(/);
});
