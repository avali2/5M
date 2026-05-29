import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllowedReadyStrategies, getBlockedStrategies, STRATEGY_CATALOG } from '../src/data/strategyCatalog.js';

test('strategy catalog includes broad options playbook', () => {
  const names = STRATEGY_CATALOG.map((item) => item.name);
  assert.ok(names.includes('Bull Put Spread / Put Credit Spread'));
  assert.ok(names.includes('Iron Condor'));
  assert.ok(names.includes("Poor Man's Covered Call / PMCC"));
  assert.ok(names.includes('Broken Wing Iron Condor'));
  assert.ok(names.includes('Jade Lizard'));
});

test('undefined-risk strategies are blocked from READY', () => {
  const readyNames = getAllowedReadyStrategies().map((item) => item.name);
  const blockedNames = getBlockedStrategies().map((item) => item.name);
  assert.ok(!readyNames.includes('Naked Call'));
  assert.ok(!readyNames.includes('Short Strangle'));
  assert.ok(blockedNames.includes('Naked Call'));
  assert.ok(blockedNames.includes('Short Strangle'));
});
