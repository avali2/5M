import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { validateTradierSandboxUrl } from '../server/services/tradierPaperBroker.js';
import { buildTradierOptionOrder, encodeTradierOrder } from '../server/services/tradierOrders.js';
import { capitalBand, selectBestStrategyForCapital } from '../server/services/capitalStrategySelector.js';
import { PaperAutopilot } from '../server/services/paperAutopilot.js';
import { migratePaperBotSettings, paperBotDefaults } from '../server/services/paperBotStore.js';
import { createTradierRouter } from '../server/routes/tradierRoutes.js';

const setup = {
  symbol: 'SOFI',
  strategy: 'Bull Put Spread',
  expiration: '2026-09-18',
  dte: 30,
  strikes: '10 / 9',
  status: 'READY_GREEN',
  score: 84,
  confidenceScore: 84,
  pop: 69,
  liquidityScore: 9,
  maxRisk: 50,
  maxProfit: 50,
  collateralRequired: 50,
  positionSizeContracts: 1,
  credit: 0.5,
  creditDebit: { type: 'credit', value: 0.5 },
  aiVerificationStatus: 'APPROVED_BY_GEMINI_GUARDIAN',
  geminiReview: { verdict: 'APPROVED', confidence: 82, summary: 'Defined risk and liquid paper setup.' },
  legs: [
    { side: 'sell', type: 'put', strike: 10, symbol: 'SOFI260918P00010000' },
    { side: 'buy', type: 'put', strike: 9, symbol: 'SOFI260918P00009000' }
  ]
};

test('paper broker accepts only the exact Tradier Sandbox v1 host', () => {
  assert.equal(validateTradierSandboxUrl('https://sandbox.tradier.com/v1'), true);
  assert.equal(validateTradierSandboxUrl('https://sandbox.tradier.com/v1/'), true);
  assert.equal(validateTradierSandboxUrl('https://api.tradier.com/v1'), false);
  assert.equal(validateTradierSandboxUrl('https://sandbox.tradier.com.evil.example/v1'), false);
  assert.equal(validateTradierSandboxUrl('http://sandbox.tradier.com/v1'), false);
});

test('multileg paper orders are limit tickets and encode preview explicitly', () => {
  const order = buildTradierOptionOrder(setup, 1);
  assert.equal(order.class, 'multileg');
  assert.equal(order.type, 'credit');
  assert.equal(order['side[0]'], 'sell_to_open');
  assert.equal(order['side[1]'], 'buy_to_open');
  const encoded = new URLSearchParams(encodeTradierOrder(order, true));
  assert.equal(encoded.get('preview'), 'true');
  assert.equal(encoded.get('option_symbol[0]'), 'SOFI260918P00010000');
});

test('capital strategy selector chooses only a funded READY_GREEN defined-risk setup', () => {
  assert.equal(capitalBand(10_000).id, 'GROWTH');
  const selected = selectBestStrategyForCapital({
    scan: { opportunities: [setup] },
    profile: {
      accountSize: 10_000,
      maxRiskDollars: 100,
      maxCollateralDollars: 1_000,
      optionBuyingPower: 1_000,
      openPositionCount: 0,
      accountSync: {}
    },
    settings: { minScore: 75, minPop: 60, maxContracts: 1, maxOpenPositions: 3 }
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.recommendation.symbol, 'SOFI');
  assert.equal(selected.recommendation.contracts, 1);

  const tooShort = selectBestStrategyForCapital({
    scan: { opportunities: [{ ...setup, dte: 1 }] },
    profile: { accountSize: 10_000, maxRiskDollars: 100, maxCollateralDollars: 1_000, optionBuyingPower: 1_000 },
    settings: { minScore: 75, minPop: 60, maxContracts: 1, maxOpenPositions: 3 }
  });
  assert.equal(tooShort.ok, false);

  const aggressiveOneDte = selectBestStrategyForCapital({
    scan: { opportunities: [{ ...setup, dte: 1 }] },
    profile: { accountSize: 10_000, maxRiskDollars: 100, maxCollateralDollars: 1_000, optionBuyingPower: 1_000 },
    settings: { allow1Dte: true, minScore: 68, minPop: 52, minLiquidityScore: 6, maxContracts: 3, maxOpenPositions: 5 }
  });
  assert.equal(aggressiveOneDte.ok, true);
});

test('legacy paper settings migrate once to the autonomous aggressive profile', () => {
  const defaults = paperBotDefaults({
    profile: 'AGGRESSIVE_DEFINED_RISK',
    defaultBotEnabled: true,
    defaultAutoExecute: true,
    maxRiskPct: 2,
    maxDailyLossPct: 5,
    maxOpenPositions: 5,
    maxContracts: 3,
    maxEntriesPerDay: 6,
    minScore: 68,
    minPop: 52,
    minLiquidityScore: 6,
    takeProfitPct: 35,
    stopLossPct: 65,
    allow1Dte: true,
    requireGeminiApproval: false
  });
  const migrated = migratePaperBotSettings({ enabled: false, autoExecute: false }, defaults);
  assert.equal(migrated.settingsVersion, 2);
  assert.equal(migrated.profile, 'AGGRESSIVE_DEFINED_RISK');
  assert.equal(migrated.enabled, true);
  assert.equal(migrated.autoExecute, true);
  assert.equal(migrated.requireGeminiApproval, false);

  const stopped = migratePaperBotSettings({ killSwitch: true }, defaults);
  assert.equal(stopped.killSwitch, true);
  assert.equal(stopped.enabled, false);
  assert.equal(stopped.autoExecute, false);
});

function createStore(settings) {
  const state = { runs: [], orders: [] };
  return {
    state,
    async getSettings() { return settings; },
    async saveSettings(value) { Object.assign(settings, value); return settings; },
    async recentRuns() { return state.runs; },
    async saveRun(payload, mode) { state.runs.unshift({ payload, mode }); },
    async listOrders() { return state.orders; },
    async hasRecentSignal() { return false; },
    async learning() { return { sampleSize: 0, entries: state.orders.length, exits: 0, wins: 0, losses: 0, winRate: null, realizedPnl: 0, confidence: 'LOW_SAMPLE' }; },
    async recordOrder(value) {
      const order = { id: 'tracked-1', createdAt: new Date().toISOString(), realizedPnl: null, ...value };
      state.orders.unshift(order);
      return order;
    },
    async updateOrder(id, patch) {
      const order = state.orders.find((item) => item.id === id);
      Object.assign(order, patch);
      return order;
    }
  };
}

function createAutopilot({ gemini = 'approved', requireGeminiApproval = true } = {}) {
  let placed = 0;
  const botSettings = {
    enabled: true,
    autoExecute: true,
    killSwitch: false,
    maxRiskPct: 1,
    maxDailyLossPct: 2,
    maxOpenPositions: 3,
    maxContracts: 1,
    maxEntriesPerDay: 6,
    minScore: 75,
    minPop: 60,
    minLiquidityScore: 6,
    takeProfitPct: 50,
    stopLossPct: 50,
    allow1Dte: true,
    requireGeminiApproval
  };
  const store = createStore(botSettings);
  const account = {
    status: 'ONLINE',
    source: 'tradier_paper',
    paperTrading: true,
    readOnly: false,
    balances: { totalEquity: 10_000, optionBuyingPower: 1_000, cashAvailable: 1_000, closePl: 0 },
    positions: [],
    rawPositions: [],
    activeSymbols: [],
    holdings: {},
    asOf: new Date().toISOString()
  };
  const paper = {
    configured: true,
    status() { return { configured: true, sandboxSafe: true, environment: 'paper' }; },
    async getMarketClock() { return { state: 'open', description: 'Market is open' }; },
    async getAccountSnapshot() { return account; },
    async getOrders() { return []; },
    async previewOrder() { return { order: { result: true, status: 'ok' } }; },
    async placeOrder() { placed += 1; return { order: { id: 987, status: 'pending' } }; }
  };
  const guardedSetup = gemini === 'approved'
    ? setup
    : gemini === 'veto'
      ? { ...setup, aiVerificationStatus: 'REQUIRES_MANUAL_REVIEW', geminiReview: { verdict: 'REJECTED', decision: 'BLOCKED', approved: false, summary: 'Guardian veto.' } }
      : gemini === 'invalid-approve'
        ? { ...setup, aiVerificationStatus: 'REQUIRES_MANUAL_REVIEW', geminiReview: { verdict: 'APPROVED', decision: 'APPROVE', approved: false, hallucination_check: 'FAILED', summary: 'Approval failed structured validation.' } }
      : { ...setup, aiVerificationStatus: 'DETERMINISTIC_APPROVED_AI_UNAVAILABLE', geminiReview: { aiStatus: 'UNAVAILABLE', verdict: 'UNAVAILABLE', approved: false, summary: 'Gemini unavailable.' } };
  const autopilot = new PaperAutopilot({
    providers: { tradierPaper: paper, tradier: { configured: false }, ai: {} },
    settings: {
      tradierPaper: { intervalMinutes: 3 },
      database: {},
      policy: { accountSize: 10_000, riskPct: 1, maxCollateralPct: 35 },
      signals: {},
      ai: {},
      agent: {},
      tradier: {},
      watchlist: { core: ['SOFI'] }
    },
    store,
    lock: { async withLock(_name, _ttl, callback) { return { skipped: false, value: await callback() }; } },
    scanRunner: async () => ({ profile: { accountSize: 10_000, maxRiskDollars: 100, maxCollateralDollars: 1_000, optionBuyingPower: 1_000, openPositionCount: 0, activeSymbols: [], accountSync: {} }, opportunities: [guardedSetup], rejected: [], asOf: new Date().toISOString() }),
    guardianGate: async (scan) => scan
  });
  return { autopilot, store, placed: () => placed };
}

test('autopilot submits an order only to the paper broker after preview and Gemini approval', async () => {
  const context = createAutopilot({ gemini: 'approved', requireGeminiApproval: true });
  const result = await context.autopilot.run({ mode: 'manual' });
  assert.equal(result.status, 'PAPER_ORDER_SUBMITTED');
  assert.equal(context.placed(), 1);
  assert.equal(context.store.state.orders[0].brokerOrderId, '987');
});

test('autopilot fails closed when Gemini has not explicitly approved the setup', async () => {
  const context = createAutopilot({ gemini: 'veto', requireGeminiApproval: true });
  const result = await context.autopilot.run({ mode: 'manual' });
  assert.equal(result.status, 'GEMINI_BLOCKED');
  assert.equal(context.placed(), 0);
});

test('autonomous paper mode keeps trading a deterministic green setup when Gemini is unavailable', async () => {
  const context = createAutopilot({ gemini: 'unavailable', requireGeminiApproval: false });
  const result = await context.autopilot.run({ mode: 'manual' });
  assert.equal(result.status, 'PAPER_ORDER_SUBMITTED');
  assert.match(result.reason, /deterministic READY_GREEN engine/i);
  assert.equal(context.placed(), 1);
});

test('autonomous paper mode honors an explicit Gemini veto', async () => {
  const context = createAutopilot({ gemini: 'veto', requireGeminiApproval: false });
  const result = await context.autopilot.run({ mode: 'manual' });
  assert.equal(result.status, 'GEMINI_VETO');
  assert.equal(context.placed(), 0);
});

test('an APPROVED label cannot bypass a failed structured Gemini validation', async () => {
  const context = createAutopilot({ gemini: 'invalid-approve', requireGeminiApproval: false });
  const result = await context.autopilot.run({ mode: 'manual' });
  assert.equal(result.status, 'GEMINI_VETO');
  assert.equal(context.placed(), 0);
});

test('live route exposes preview only and never submits a production order', async () => {
  let previews = 0;
  const app = express();
  app.use(express.json());
  app.use('/api/tradier', createTradierRouter({
    scheduler: { async snapshot() { return { opportunities: [setup] }; } },
    providers: {
      tradier: {
        async previewOptionOrder() { previews += 1; return { order: { result: true, status: 'ok' } }; },
        async getAccountSnapshot() { return { status: 'ONLINE', positions: [], balances: {} }; }
      },
      tradierPaper: {}
    },
    paperAutopilot: {
      async status() { return { ok: true }; },
      async applyAggressivePreset() { return { profile: 'AGGRESSIVE_DEFINED_RISK', enabled: true, autoExecute: true }; }
    }
  }));
  const response = await request(app)
    .post('/api/tradier/live/preview')
    .send({ signalKey: signalKeyForTest(setup), contracts: 1 })
    .expect(200);
  assert.equal(previews, 1);
  assert.equal(response.body.submitted, false);
  assert.equal(response.body.environment, 'TRADIER_PRODUCTION_PREVIEW_ONLY');
});

test('paper route activates the aggressive autonomous preset without exposing a live submit route', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/tradier', createTradierRouter({
    scheduler: {},
    providers: { tradier: {}, tradierPaper: {} },
    paperAutopilot: {
      async status() { return { ok: true }; },
      async applyAggressivePreset() { return { profile: 'AGGRESSIVE_DEFINED_RISK', enabled: true, autoExecute: true }; }
    }
  }));
  const response = await request(app).post('/api/tradier/paper/preset/aggressive').expect(200);
  assert.equal(response.body.settings.profile, 'AGGRESSIVE_DEFINED_RISK');
  assert.equal(response.body.settings.autoExecute, true);
  await request(app).post('/api/tradier/live/submit').send({}).expect(404);
});

function signalKeyForTest(value) {
  return [value.symbol, value.strategy, value.expiration, value.strikes].join('|');
}
