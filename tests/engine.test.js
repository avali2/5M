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
const { classifyEventRisk } = await import('../server/engine/market-intelligence.js');
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
    { title: 'Fed Chair Speech', country: 'US', date: soon, impact: 'medium' }
  ]);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].country, 'US');
});

test('keeps SOFI in the focused options universe', () => {
  assert.ok(UNIVERSE.focusEquities.includes('SOFI'));
});

test('protects public dashboard APIs when an access key is configured', async () => {
  const app = createApp({
    clientOrigin: 'https://valido.example',
    security: { accessKey: 'long-private-mobile-key' },
    refreshSeconds: 60,
    policy
  }, {}, { startBackground: false });
  await request(app).get('/api/explainers').expect(401);
  await request(app).get('/api/explainers').set('X-Valido-Key', 'long-private-mobile-key').expect(200);
});

test('fails closed in public hosting when the required access key is missing', async () => {
  const app = createApp({
    clientOrigin: 'https://valido.example',
    security: { accessKey: '', requireAccessKey: true },
    refreshSeconds: 60,
    policy
  }, {}, { startBackground: false });
  const health = await request(app).get('/api/health').expect(200);
  assert.equal(health.body.securityStatus, 'configuration_required');
  assert.equal(health.body.providers, undefined);
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
  const scan = await runAutonomousScan({
    providers: { market: marketProvider, options: marketProvider, calendar, finnhub, benzinga: flow, openai: flow },
    settings: { policy, refreshSeconds: 60 }
  });
  assert.equal(scan.decision.status, 'eligible');
  assert.ok(scan.opportunities.length > 0);
  assert.equal(scan.opportunities[0].strategy, 'Bull Put Spread');
});
