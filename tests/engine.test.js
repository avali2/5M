import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';

const testStore = await mkdtemp(path.join(tmpdir(), 'sigma-os-test-'));
process.env.SIGMA_DATA_DIR = testStore;
process.env.DATABASE_URL = '';
process.env.DATABASE_SSL = 'false';
const { generateDefinedRiskSetups } = await import('../server/engine/strategies.js');
const { runAutonomousScan } = await import('../server/engine/scanner.js');
const { classifyEventRisk, classifySoftEventRisk } = await import('../server/engine/market-intelligence.js');
const { UNIVERSE } = await import('../server/config.js');
const { createApp } = await import('../server/index.js');

test.after(async () => {
  await rm(testStore, { recursive: true, force: true });
});

const policy = {
  accountSize: 10000,
  riskPct: 10,
  maxCollateralPct: 20,
  maxDailyLossPct: 5,
  maxOpenTrades: 3,
  minScore: 75,
  minDte: 21,
  maxDte: 45,
  minOpenInterest: 100,
  minVolume: 10,
  maxBidAskPct: 0.2,
  maxShortDelta: 0.3,
  minShortDelta: 0.12,
  maxVix: 30,
  ivRankMinObservations: 1,
  allow1DteApproval: false,
  workMode: true
};

const contract = (type, strike, delta, gamma, bid, ask, oi = 800) => ({
  symbol: `OPT-${type}-${strike}`,
  type,
  strike,
  delta,
  gamma,
  theta: -0.04,
  vega: 0.1,
  bid,
  ask,
  iv: 0.3,
  volume: 150,
  openInterest: oi
});

const chain = [
  contract('put', 95, -0.2, 0.01, 0.7, 0.72, 700),
  contract('put', 94, -0.08, 0.004, 0.2, 0.22, 400),
  contract('call', 105, 0.2, 0.02, 0.65, 0.67, 1500),
  contract('call', 106, 0.08, 0.008, 0.18, 0.2, 700)
];

test('builds a defined-risk bull put spread only from quoted liquid legs', () => {
  const setups = generateDefinedRiskSetups({
    symbol: 'TEST',
    spot: 100,
    expiration: '2026-06-26',
    chain,
    trend: 'bullish',
    policy
  });
  const bullPut = setups.find((setup) => setup.strategy === 'Bull Put Spread');
  assert.ok(bullPut);
  assert.equal(bullPut.strikes, '95 / 94');
  assert.equal(bullPut.maxRisk, 50);
  assert.ok(bullPut.pop >= 75);
});

test('fails closed when required live providers are absent', async () => {
  const unavailable = { configured: false };
  const scan = await runAutonomousScan({
    providers: { market: null, options: null, calendar: null, finnhub: unavailable, benzinga: unavailable, openai: unavailable },
    settings: { policy, refreshSeconds: 60 }
  });
  assert.equal(scan.decision.status, 'configuration_required');
  assert.equal(scan.opportunities.length, 0);
});

test('blocks United States macro risk without treating foreign CPI as a US gate', () => {
  const soon = new Date(Date.now() + 3600000).toISOString();
  const blocked = classifyEventRisk([
    { title: 'CPI', country: 'AU', date: soon, impact: 'high' },
    { title: 'US CPI', country: 'US', date: soon, impact: 'medium' }
  ]);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].country, 'US');
});

test('macro events outside critical window are soft warnings instead of hard blocks', () => {
  const tomorrow = new Date(Date.now() + 24 * 3600000).toISOString();
  const events = [{ title: 'FOMC minutes', country: 'US', date: tomorrow, impact: 'high' }];
  assert.equal(classifyEventRisk(events).length, 0);
  assert.equal(classifySoftEventRisk(events).length, 1);
});

test('keeps SOFI in the focused options universe', () => {
  assert.ok(UNIVERSE.focusEquities.includes('SOFI'));
});

test('protects public dashboard APIs when an access key is configured', async () => {
  const app = createApp({
    clientOrigin: 'https://valido.example',
    security: { accessKey: 'long-private-mobile-key' },
    refreshSeconds: 300,
    policy
  }, {}, { startBackground: false });
  await request(app).get('/api/explainers').expect(401);
  await request(app).get('/api/explainers').set('X-Valido-Key', 'long-private-mobile-key').expect(200);
});

test('agent endpoints expose guarded status without requiring AI', async () => {
  const app = createApp({
    clientOrigin: 'https://valido.example',
    security: { accessKey: 'long-private-mobile-key' },
    refreshSeconds: 300,
    agent: { enabled: true, name: 'Gemini Guardian' },
    ai: { fallbackToDeterministic: true },
    signals: { maxPerDay: 3, minScore: 82, minPop: 0.7 },
    guards: { allowUnverifiedMacroWhenFeedsMissing: false, allowUnverifiedNewsWhenFeedsMissing: false },
    ui: { hidePremiumFeedsIfUnconfigured: true },
    webPush: { enabled: false },
    database: {},
    policy
  }, {}, { startBackground: false });
  const status = await request(app).get('/api/agent/status').set('X-Valido-Key', 'long-private-mobile-key').expect(200);
  assert.equal(status.body.name, 'Gemini Guardian');
  assert.ok(['ACTIVE', 'CAUTION', 'BLOCKED', 'SLEEPING'].includes(status.body.state));
  assert.ok(status.body.guards.macro);
  const macro = await request(app).get('/api/macro/guard').set('X-Valido-Key', 'long-private-mobile-key').expect(200);
  assert.equal(macro.body.ok, true);
  assert.ok(macro.body.guard);
  const news = await request(app).get('/api/news/guard').set('X-Valido-Key', 'long-private-mobile-key').expect(200);
  assert.equal(news.body.ok, true);
  assert.ok(news.body.geopolitical);
  const verify = await request(app).post('/api/agent/verify-signal').set('X-Valido-Key', 'long-private-mobile-key').send({ dryRun: true, symbol: 'SPY' }).expect(200);
  assert.equal(verify.body.review.agent, 'SIGMA_GUARDIAN');
  assert.equal(verify.body.aiCalled, false);
  const push = await request(app).post('/api/push/test').set('X-Valido-Key', 'long-private-mobile-key').send({ dryRun: true }).expect(200);
  assert.equal(push.body.dryRun, true);
  const signals = await request(app).get('/api/signals').set('X-Valido-Key', 'long-private-mobile-key').expect(200);
  assert.ok(Array.isArray(signals.body.signals));
  assert.equal(signals.body.signals.length <= 3, true);
});

test('fails closed in public hosting when the required access key is missing', async () => {
  const app = createApp({
    clientOrigin: 'https://valido.example',
    security: { accessKey: '', requireAccessKey: true },
    refreshSeconds: 60,
    policy
  }, {}, { startBackground: false });
  const health = await request(app).get('/api/health').expect(200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.app, 'VALIDO 1M');
  assert.equal(health.body.providers.openai, 'manual_only');
  assert.equal(health.body.securityStatus, 'configuration_required');
  await request(app).get('/api/explainers').expect(503);
});

test('ranks a live sourced credit spread when all work-mode gates pass', async () => {
  const quote = (symbol) => ({ symbol, price: symbol === 'VIX' ? 18 : 100, changePercent: 0.2, source: 'fixture' });
  const history = Array.from({ length: 60 }, (_, index) => {
    const close = 80 + index / 2;
    return {
      date: new Date(Date.UTC(2026, 1, index + 1)).toISOString().slice(0, 10),
      open: close - 0.25,
      high: close + 0.7,
      low: close - 0.7,
      close,
      volume: 1_000_000 + index * 2_000
    };
  });
  const marketProvider = {
    async getQuotes(symbols) { return symbols.map(quote); },
    async getHistory() { return history; },
    async getExpirations() { return ['2026-06-26']; },
    async getOptionChain() { return chain; }
  };
  const calendar = {
    async getEconomicCalendar() { return []; },
    async getEarningsCalendar() { return []; }
  };
  const finnhub = { configured: true, async getMarketNews() { return []; } };
  const flow = { configured: false };
  let aiCalls = 0;
  const ai = { configured: true, status() { return { configured: true, enabled: true, automaticCalls: false }; }, async summarize() { aiCalls += 1; return 'Should not be called by scan'; } };
  const scan = await runAutonomousScan({
    providers: { market: marketProvider, options: marketProvider, calendar, finnhub, benzinga: flow, openai: ai },
    settings: { policy, refreshSeconds: 60 }
  });
  assert.equal(scan.decision.status, 'eligible');
  assert.ok(scan.opportunities.length > 0);
  assert.equal(scan.opportunities[0].strategy, 'Bull Put Spread');
  assert.equal(scan.conditionalIdeas.length, 3);
  assert.ok(scan.conditionalIdeas.every((idea) => ['Trade Condicional', 'Agresivo / tamano reducido', 'Paper Trade / solo estudio'].includes(idea.classification)));
  assert.ok(scan.dataHealth.metrics.some((metric) => metric.name === 'VIX9D' && metric.available === false));
  assert.equal(scan.summarySource, 'Motor deterministico');
  assert.equal(aiCalls, 0);
  assert.ok(scan.opportunities[0].edge.available);
  assert.equal(scan.opportunities[0].classification, 'Trade Validado');
});
