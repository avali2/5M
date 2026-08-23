import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_NEWS_COVERAGE } from '../server/lib/gemini.js';
import { buildCreditCandidates, chooseExpiration, daysToExpiration, scanMarket } from '../server/lib/scanner.js';

function option(type, strike, delta, bid, ask, symbol = `${type}-${strike}`) {
  return { type, strike, delta, bid, ask, mid: (bid + ask) / 2, volume: 500, openInterest: 2000, iv: 0.25, symbol, gamma: 0.01, theta: -0.02, vega: 0.05, rho: 0.01 };
}

function dailyBars(count = 320) {
  const start = new Date('2025-10-01T00:00:00Z');
  return Array.from({ length: count }, (_, index) => {
    const close = 68 + index * 0.1;
    const date = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
    return { date, open: close - 0.2, high: close + 0.4, low: close - 0.5, close, volume: 100000 + index };
  });
}

function intradayBars(now, count = 360) {
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(now.getTime() - (count - 1 - index) * 300000).toISOString();
    const close = 90 + index * 0.027;
    return { time: timestamp, timestamp, open: close - 0.03, high: close + 0.08, low: close - 0.08, close, volume: 1000 + index };
  });
}

function clearMarketRisk(now) {
  return {
    configured: true,
    ok: true,
    model: 'test',
    status: 'CLEAR',
    riskScore: 12,
    summary: 'Sin evento bloqueante en la prueba.',
    tradeInstruction: 'Esperar confirmación del precio.',
    blockers: [], catalysts: [], events: [],
    coverage: [...REQUIRED_NEWS_COVERAGE],
    coverageComplete: true,
    missingCoverage: [],
    sources: [1, 2, 3].map((number) => ({ title: `Fuente ${number}`, uri: `https://example.com/${number}` })),
    searchQueries: [], checkedAt: now.toISOString(), cached: false
  };
}

function policy() {
  return {
    accountSize: 100000,
    riskPerTradePct: 1,
    maxContracts: 3,
    minCredit: 0.1,
    minScore: 0,
    minPop: 0.5,
    maxDailySignals: 3,
    block0Dte: true,
    requireAffordableSignal: true,
    minTimeframes: 3,
    maxDataAgeMinutes: 20,
    profiles: {
      core: { minScore: 0, minPop: 0.5, minLiquidity: 0 },
      aggressive: { minScore: 0, minPop: 0.5, minLiquidity: 0 }
    }
  };
}

function fakeServices({ now, marketRisk = clearMarketRisk(now) } = {}) {
  const chain = [
    option('put', 98, -0.25, 0.80, 0.85),
    option('put', 95, -0.12, 0.35, 0.40),
    option('call', 102, 0.25, 0.80, 0.85),
    option('call', 105, 0.12, 0.35, 0.40)
  ];
  const tradier = {
    async getMarketClock() { return { state: 'open', description: 'Market is open' }; },
    async getQuotes(symbols) { return symbols.map((symbol) => ({ symbol, price: 100, last: 100, bid: 99.99, ask: 100.01, volume: 100000, tradeDate: now.toISOString() })); },
    async getHistory() { return dailyBars(); },
    async getTimeSales() { return intradayBars(now); },
    async getExpirations() { return ['2026-09-04', '2026-09-18']; },
    async getOptionChain() { return chain; }
  };
  const gemini = {
    configured: true,
    async reviewMarketRisk() { return marketRisk; },
    async review(candidates) {
      return { configured: true, ok: true, model: 'test', marketNote: 'Contexto de prueba', reviews: candidates.map((candidate) => ({ candidateId: candidate.candidateId, decision: 'APPROVE', confidence: 88, summary: 'Datos coherentes para revisión manual.', riskFlags: [], entryTrigger: 'Entrar solo con crédito real.', takeProfit: 'Cerrar en objetivo.', stopLoss: 'Cerrar al invalidar.', management: 'No perseguir el precio.' })) };
    }
  };
  return { tradier, gemini };
}

test('elige vencimientos dentro del rango DTE y respeta el objetivo del perfil', () => {
  const now = new Date('2026-08-21T12:00:00Z');
  assert.equal(daysToExpiration('2026-09-18', now), 28);
  assert.deepEqual(chooseExpiration(['2026-08-28', '2026-09-18', '2026-10-16'], { minDte: 21, maxDte: 45, targetDte: 30 }, now), { expiration: '2026-09-18', dte: 28 });
  assert.deepEqual(chooseExpiration(['2026-09-04', '2026-09-18'], { minDte: 7, maxDte: 20, targetDte: 14 }, now), { expiration: '2026-09-04', dte: 14 });
});

test('construye put/call credit spreads con riesgo definido y Greeks netos correctos', () => {
  const chain = [
    option('put', 98, -0.25, 0.80, 0.85),
    option('put', 95, -0.12, 0.35, 0.40),
    option('call', 102, 0.25, 0.80, 0.85),
    option('call', 105, 0.12, 0.35, 0.40)
  ];
  const candidates = buildCreditCandidates({
    symbol: 'TEST', quote: { symbol: 'TEST', price: 100 },
    technical: { trend: 'neutral', timeframeSummary: { available: 4, bullish: 1, bearish: 1, neutral: 2, alignmentPct: 50 }, timeframes: {} },
    chain, expiration: '2026-09-18', dte: 28,
    policy: { minCredit: 0.1, minScore: 0, minPop: 0.5 }, dataQuality: { fresh: true }
  });
  assert.ok(candidates.some((candidate) => candidate.strategy === 'BULL_PUT_CREDIT_SPREAD'));
  assert.ok(candidates.some((candidate) => candidate.strategy === 'BEAR_CALL_CREDIT_SPREAD'));
  const bull = candidates.find((candidate) => candidate.strategy === 'BULL_PUT_CREDIT_SPREAD');
  assert.equal(bull.legs[0].action, 'SELL_TO_OPEN');
  assert.equal(bull.legs[1].action, 'BUY_TO_OPEN');
  assert.ok(bull.maxRiskUsd > 0);
  assert.ok(bull.maxProfitUsd > 0);
  assert.ok(bull.minimumCredit <= bull.credit);
  assert.equal(bull.greeks.delta, 0.13);
});

test('solo marca READY con tiempo real, noticias CLEAR, reglas y revisión Gemini', async () => {
  const now = new Date('2026-08-21T15:00:00Z');
  const { tradier, gemini } = fakeServices({ now });
  const scan = await scanMarket({ tradier, gemini, symbols: ['AMD'], prioritySymbols: ['AMD'], policy: policy(), realtimeEntitled: true, now });
  assert.equal(scan.source, 'Tradier');
  assert.equal(scan.marketRisk.status, 'CLEAR');
  assert.deepEqual(scan.data.historicalTimeframes, ['5m', '15m', '1h', '1D', '1W']);
  assert.ok(scan.signals.some((signal) => signal.profile.id === 'CORE'));
  assert.ok(scan.signals.some((signal) => signal.profile.id === 'AGGRESSIVE'));
  assert.ok(scan.signals.every((signal) => signal.legs.every((leg) => leg.strike)));
  assert.ok(scan.signals.every((signal) => signal.instanceId.startsWith(`${scan.id}:`)));
  assert.deepEqual(scan.market.contextIndices.map((quote) => quote.symbol), ['SPX', 'NDX', 'RUT', 'VIX']);
  assert.ok(scan.signals.some((signal) => signal.status === 'READY'));
  assert.ok(scan.signals.filter((signal) => signal.status === 'READY').every((signal) => signal.sizing.contractsAtWorstRisk >= 1));
});

test('bloquea todas las señales cuando el contexto de noticias no está limpio', async () => {
  const now = new Date('2026-08-21T15:00:00Z');
  const caution = { ...clearMarketRisk(now), status: 'CAUTION', riskScore: 55, blockers: ['FOMC cercano.'] };
  const { tradier, gemini } = fakeServices({ now, marketRisk: caution });
  const scan = await scanMarket({ tradier, gemini, symbols: ['AMD'], prioritySymbols: ['AMD'], policy: policy(), realtimeEntitled: true, now });
  assert.equal(scan.summary.ready, 0);
  assert.ok(scan.signals.length > 0);
  assert.ok(scan.signals.every((signal) => signal.readiness.news === false));
});

test('bloquea READY si el entitlement de tiempo real no está confirmado', async () => {
  const now = new Date('2026-08-21T15:00:00Z');
  const { tradier, gemini } = fakeServices({ now });
  const scan = await scanMarket({ tradier, gemini, symbols: ['SPY'], prioritySymbols: ['SPY'], policy: policy(), realtimeEntitled: false, now });
  assert.equal(scan.summary.ready, 0);
  assert.ok(scan.signals.every((signal) => signal.readiness.data === false));
});

test('no permite una señal que excede el presupuesto de riesgo', async () => {
  const now = new Date('2026-08-21T15:00:00Z');
  const { tradier, gemini } = fakeServices({ now });
  const smallAccountPolicy = { ...policy(), accountSize: 2000, riskPerTradePct: 1 };
  const scan = await scanMarket({ tradier, gemini, symbols: ['AMD'], prioritySymbols: ['AMD'], policy: smallAccountPolicy, realtimeEntitled: true, now });
  assert.equal(scan.summary.ready, 0);
  assert.ok(scan.signals.every((signal) => signal.sizing.contractsAtWorstRisk === 0));
  assert.ok(scan.signals.every((signal) => signal.deterministic.rules.affordable === false));
});
