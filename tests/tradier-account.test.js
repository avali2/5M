import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTradierAccountSnapshot,
  normalizeTradierBalances,
  parseOccOptionSymbol,
  selectTradierAccountId
} from '../server/services/tradierAccount.js';
import { applyTradierAccountSizing, positionSizeForSetup } from '../server/services/accountSizing.js';

test('Tradier account discovery selects an active account without exposing its id', () => {
  const profile = {
    profile: {
      account: [
        { account_number: 'VA000001', status: 'closed' },
        { account_number: 'VA000002', status: 'active' }
      ]
    }
  };
  assert.equal(selectTradierAccountId(profile), 'VA000002');
});

test('Tradier balances normalize margin and option buying power', () => {
  const balances = normalizeTradierBalances({
    balances: {
      account_type: 'margin',
      total_equity: 10000,
      total_cash: 3500,
      open_pl: 125.5,
      margin: { option_buying_power: 3000, stock_buying_power: 6000, fed_call: 0, maintenance_call: 0 }
    }
  });
  assert.equal(balances.totalEquity, 10000);
  assert.equal(balances.optionBuyingPower, 3000);
  assert.equal(balances.marginCall, false);
});

test('Tradier OCC positions are grouped into a defined-risk spread', () => {
  assert.deepEqual(parseOccOptionSymbol('SOFI260918P00010000'), {
    underlying: 'SOFI', expiration: '2026-09-18', optionType: 'put', strike: 10
  });
  const snapshot = buildTradierAccountSnapshot({
    accountId: 'VA000002',
    balances: { balances: { account_type: 'cash', total_equity: 10000, total_cash: 5000, cash: { cash_available: 4500 } } },
    positions: [
      { id: 1, symbol: 'SOFI260918P00010000', quantity: -1, cost_basis: -120 },
      { id: 2, symbol: 'SOFI260918P00009000', quantity: 1, cost_basis: 40 }
    ],
    quotes: [
      { symbol: 'SOFI260918P00010000', bid: 1, ask: 1.1 },
      { symbol: 'SOFI260918P00009000', bid: 0.2, ask: 0.3 }
    ]
  });
  assert.equal(snapshot.accountIdMasked, '****0002');
  assert.equal(snapshot.positions.length, 1);
  assert.equal(snapshot.positions[0].strategy, 'Bull Put Credit Spread');
  assert.equal(snapshot.positions[0].maxRiskUsd, 20);
  assert.deepEqual(snapshot.activeSymbols, ['SOFI']);
});

test('a short call backed by 100 broker shares is recognized as a covered call', () => {
  const snapshot = buildTradierAccountSnapshot({
    accountId: 'VA000002',
    balances: { balances: { account_type: 'margin', total_equity: 5000, total_cash: 500 } },
    positions: [
      { id: 1, symbol: 'F', quantity: 100, cost_basis: 1200 },
      { id: 2, symbol: 'F260918C00015000', quantity: -1, cost_basis: -45 }
    ],
    quotes: [
      { symbol: 'F', bid: 12.2, ask: 12.22 },
      { symbol: 'F260918C00015000', bid: 0.4, ask: 0.5 }
    ]
  });
  const covered = snapshot.positions.find((position) => position.expiration);
  assert.equal(covered.strategy, 'Covered Call');
  assert.equal(covered.definedRisk, true);
});

test('account sizing uses live Tradier equity and caps contracts by buying power', () => {
  const snapshot = {
    status: 'ONLINE',
    balances: { totalEquity: 10000, optionBuyingPower: 3000, cashAvailable: 3000, optionRequirement: 0, currentRequirement: 0, closePl: 0 },
    positions: [], activeSymbols: [], holdings: {}, accountIdMasked: '****0002', accountType: 'margin', asOf: new Date().toISOString()
  };
  const profile = applyTradierAccountSizing({
    storedProfile: { accountSize: 2000, riskPct: 1, maxCollateralPct: 20, activeSymbols: [] },
    policy: { accountSize: 2000, riskPct: 2, maxCollateralPct: 35 },
    snapshot,
    syncLimitsFromEnv: true
  });
  assert.equal(profile.accountSize, 10000);
  assert.equal(profile.riskPct, 2);
  assert.equal(profile.maxRiskDollars, 200);
  assert.equal(positionSizeForSetup({ maxRisk: 90, collateralRequired: 90 }, profile), 2);
});

test('an empty connected Tradier account never falls back to configured paper capital', () => {
  const profile = applyTradierAccountSizing({
    storedProfile: { accountSize: 2000, riskPct: 2, maxCollateralPct: 35, activeSymbols: [] },
    policy: { accountSize: 2000, riskPct: 2, maxCollateralPct: 35 },
    snapshot: {
      status: 'ONLINE',
      balances: { totalEquity: 0, totalCash: 0, optionBuyingPower: 0 },
      positions: [], activeSymbols: [], holdings: {}
    }
  });
  assert.equal(profile.accountSize, 0);
  assert.equal(profile.maxRiskDollars, 0);
  assert.equal(profile.capitalSource, 'tradier_live');
  assert.equal(positionSizeForSetup({ maxRisk: 25, collateralRequired: 25 }, profile), 0);
});
