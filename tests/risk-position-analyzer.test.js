import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePositionRisk } from '../server/services/positionRiskAnalyzer.js';

test('position near stop becomes CRITICAL_RISK', () => {
  const result = analyzePositionRisk(
    { id: 'p1', symbol: 'SPY', strategy: 'Bull Put Spread', plannedExit: 'Stop 100' },
    { quotes: [{ symbol: 'SPY', price: 104 }] }
  );
  assert.equal(result.health, 'CRITICAL_RISK');
  assert.equal(result.status, 'CRITICAL_RISK');
});
