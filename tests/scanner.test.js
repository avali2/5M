import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_NEWS_COVERAGE } from '../server/lib/gemini.js';
import { buildWheelCandidates, chooseExpiration, daysToExpiration, scanMarket } from '../server/lib/scanner.js';

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
  const domains = ['federalreserve.gov', 'bls.gov', 'reuters.com'];
  return {
    configured: true, ok: true, status: 'CLEAR', riskScore: 12,
    summary: 'Sin evento bloqueante en la prueba.', tradeInstruction: 'Revisar el precio actual.',
    blockers: [], catalysts: [], events: [], coverage: [...REQUIRED_NEWS_COVERAGE], coverageComplete: true,
    missingCoverage: [], uniqueSourceDomains: domains,
    sources: domains.map((domain) => ({ title: domain, uri: `https://${domain}/markets` })),
    searchQueries: [], checkedAt: now.toISOString(), cached: false
  };
}

function policy() {
  return {
    minDte: 14, maxDte: 45, minCredit: 0.1, maxDailySignals: 3, minTimeframes: 3,
    minOptionVolume: 10, minOpenInterest: 100, maxOptionSpreadPct: 0.25,
    maxDataAgeMinutes: 5, portfolioFreshHours: 24,
    profiles: { wheel: { enabled: true, minDte: 14, maxDte: 45, targetDte: 30, shortDeltaMin: 0.15, shortDeltaMax: 0.30, minLiquidity: 0, minScore: 0, takeProfitPct: 0.5, stopMultiple: 2, timeStopDte: 7 } },
    institutionalFlow: { enabled: true, minimumConfidence: 55, minimumUnusualVolume: 100, minimumVolumeOiRatio: 0.5 }
  };
}

function fakeServices({ now, marketRisk = clearMarketRisk(now), quoteAgeMinutes = 0 } = {}) {
  const chain = [
    option('put', 98, -0.25, 0.80, 0.85),
    option('put', 95, -0.12, 0.35, 0.40),
    option('call', 102, 0.25, 0.80, 0.85),
    option('call', 105, 0.12, 0.35, 0.40)
  ];
  const tradier = {
    async getMarketClock() { return { state: 'open' }; },
    async getQuotes(symbols) { return symbols.map((symbol) => ({ symbol, price: 100, last: 100, bid: 99.99, ask: 100.01, volume: 100000, tradeDate: new Date(now.getTime() - quoteAgeMinutes * 60000).toISOString() })); },
    async getHistory() { return dailyBars(); },
    async getTimeSales() { return intradayBars(now); },
    async getExpirations() { return ['2026-09-04', '2026-09-18']; },
    async getOptionChain() { return chain; }
  };
  const gemini = {
    configured: true,
    async reviewMarketRisk() { return marketRisk; },
    async review(candidates) {
      return { configured: true, ok: true, model: 'test', marketNote: 'Contexto de prueba', reviews: candidates.map((candidate) => ({ candidateId: candidate.candidateId, decision: 'APPROVE', confidence: 88, summary: 'Candidato coherente para revisión manual.', riskFlags: [], entryTrigger: 'Confirma precio real.', takeProfit: 'Evalúa cierre en objetivo.', stopLoss: 'Revisa si cambia la tesis.', management: 'No rolar para aplazar pérdidas.' })) };
    }
  };
  return { tradier, gemini };
}

test('elige vencimientos dentro del rango y bloquea 0DTE', () => {
  const now = new Date('2026-08-21T12:00:00Z');
  assert.equal(daysToExpiration('2026-09-18', now), 28);
  assert.deepEqual(chooseExpiration(['2026-08-21', '2026-09-04', '2026-09-18'], { minDte: 14, maxDte: 45, targetDte: 30 }, now), { expiration: '2026-09-18', dte: 28 });
});

test('construye solo Cash-Secured Put y Covered Call con colateral manual vigente', () => {
  const now = new Date('2026-08-21T15:00:00Z');
  const chain = [option('put', 18, -0.25, 0.75, 0.8, 'SOFI-P18'), option('call', 22, 0.25, 0.7, 0.75, 'SOFI-C22')];
  const candidates = buildWheelCandidates({
    symbol: 'SOFI', quote: { symbol: 'SOFI', price: 20 },
    technical: { trend: 'bullish', timeframeSummary: { available: 4, bullish: 3 }, timeframes: {} },
    chain, expiration: '2026-09-18', dte: 28, policy: policy(),
    profile: policy().profiles.wheel,
    dataQuality: { fresh: true },
    portfolioState: { cashAvailableUsd: 2000, sharesBySymbol: { SOFI: 100 }, updatedAt: now.toISOString() }, now
  });
  const put = candidates.find((candidate) => candidate.strategy === 'CASH_SECURED_PUT');
  const call = candidates.find((candidate) => candidate.strategy === 'COVERED_CALL');
  assert.equal(put.requirements.collateralUsd, put.shortStrike * 100);
  assert.equal(put.deterministic.rules.portfolio, true);
  assert.equal(call.requirements.sharesRequired, 100);
  assert.equal(call.deterministic.rules.portfolio, true);
  assert.equal(put.legs.length, 1);
  assert.equal(call.legs.length, 1);
});

test('sin estado de colateral, el escaneo nunca presenta READY', async () => {
  const now = new Date('2026-08-21T15:00:00Z');
  const { tradier, gemini } = fakeServices({ now });
  const scan = await scanMarket({ tradier, gemini, symbols: ['AMD'], prioritySymbols: ['AMD'], policy: policy(), realtimeEntitled: true, now });
  assert.equal(scan.source, 'Tradier');
  assert.equal(scan.marketRisk.status, 'CLEAR');
  assert.deepEqual(scan.data.historicalTimeframes, ['5m', '15m', '1h', '1D', '1W']);
  assert.ok(scan.signals.length > 0);
  assert.ok(scan.signals.every((signal) => ['CASH_SECURED_PUT', 'COVERED_CALL'].includes(signal.strategy)));
  assert.ok(scan.signals.every((signal) => signal.status !== 'READY'));
  assert.ok(scan.signals.every((signal) => signal.readiness.portfolio === false));
  assert.ok(scan.signals.every((signal) => signal.legs.length === 1));
  assert.ok(scan.signals.every((signal) => signal.instanceId.startsWith(`${scan.id}:`)));
});

test('un escaneo con efectivo y acciones vigentes permite revisar señales cubiertas', async () => {
  const now = new Date('2026-08-21T15:00:00Z');
  const { tradier, gemini } = fakeServices({ now });
  const portfolioState = { cashAvailableUsd: 10000, sharesBySymbol: { AMD: 100 }, updatedAt: now.toISOString() };
  const scan = await scanMarket({ tradier, gemini, symbols: ['AMD'], prioritySymbols: ['AMD'], policy: policy(), realtimeEntitled: true, portfolioState, now });
  assert.ok(scan.summary.ready > 0);
  assert.ok(scan.signals.filter((signal) => signal.status === 'READY').every((signal) => signal.deterministic.pass && signal.readiness.final));
});

test('las señales concurrentes no reutilizan el mismo efectivo de puts', async () => {
  const now = new Date('2026-08-21T15:00:00Z');
  const { tradier, gemini } = fakeServices({ now });
  const portfolioState = { cashAvailableUsd: 9800, sharesBySymbol: {}, updatedAt: now.toISOString() };
  const scan = await scanMarket({ tradier, gemini, symbols: ['AMD', 'MSFT'], prioritySymbols: ['AMD', 'MSFT'], policy: policy(), realtimeEntitled: true, portfolioState, now });
  const readyPuts = scan.signals.filter((signal) => signal.strategy === 'CASH_SECURED_PUT' && signal.status === 'READY');
  assert.equal(readyPuts.length, 1);
  const blocked = scan.signals.find((signal) => signal.strategy === 'CASH_SECURED_PUT' && signal.status === 'WATCH');
  assert.match(blocked.readiness.reasons.join(' '), /ya está asignado/i);
});

test('bloquea una cotización de 15 minutos aunque el entitlement esté marcado', async () => {
  const now = new Date('2026-08-21T15:00:00Z');
  const { tradier, gemini } = fakeServices({ now, quoteAgeMinutes: 15 });
  const portfolioState = { cashAvailableUsd: 10000, sharesBySymbol: { AMD: 100 }, updatedAt: now.toISOString() };
  const scan = await scanMarket({ tradier, gemini, symbols: ['AMD'], prioritySymbols: ['AMD'], policy: policy(), realtimeEntitled: true, portfolioState, now });
  assert.equal(scan.summary.ready, 0);
  assert.ok(scan.signals.every((signal) => signal.readiness.data === false));
});

test('bloquea señales si noticias o entitlement de tiempo real no están listos', async () => {
  const now = new Date('2026-08-21T15:00:00Z');
  const caution = { ...clearMarketRisk(now), status: 'CAUTION', riskScore: 55, blockers: ['Evento macro cercano.'] };
  const portfolioState = { cashAvailableUsd: 10000, sharesBySymbol: { AMD: 100 }, updatedAt: now.toISOString() };
  const { tradier, gemini } = fakeServices({ now, marketRisk: caution });
  const cautionScan = await scanMarket({ tradier, gemini, symbols: ['AMD'], prioritySymbols: ['AMD'], policy: policy(), realtimeEntitled: true, portfolioState, now });
  assert.equal(cautionScan.summary.ready, 0);
  assert.ok(cautionScan.signals.every((signal) => signal.readiness.news === false));
  const { tradier: noEntitlementTradier, gemini: noEntitlementGemini } = fakeServices({ now });
  const noEntitlementScan = await scanMarket({ tradier: noEntitlementTradier, gemini: noEntitlementGemini, symbols: ['AMD'], prioritySymbols: ['AMD'], policy: policy(), realtimeEntitled: false, portfolioState, now });
  assert.equal(noEntitlementScan.summary.ready, 0);
  assert.ok(noEntitlementScan.signals.every((signal) => signal.readiness.data === false));
});
