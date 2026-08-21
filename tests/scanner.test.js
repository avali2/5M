import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreditCandidates, chooseExpiration, daysToExpiration, scanMarket } from '../server/lib/scanner.js';

function option(type, strike, delta, bid, ask, symbol = `${type}-${strike}`) {
  return { type, strike, delta, bid, ask, mid: (bid + ask) / 2, volume: 500, openInterest: 2000, iv: 0.25, symbol, gamma: 0.01, theta: -0.02, vega: 0.05, rho: 0.01 };
}

test('elige vencimientos dentro del rango DTE y calcula los días', () => {
  const now = new Date('2026-08-21T12:00:00Z');
  assert.equal(daysToExpiration('2026-09-18', now), 28);
  assert.deepEqual(chooseExpiration(['2026-08-28', '2026-09-18', '2026-10-16'], { minDte: 21, maxDte: 45 }, now), { expiration: '2026-09-18', dte: 28 });
});

test('construye bull put y bear call con riesgo definido y crédito conservador', () => {
  const chain = [
    option('put', 98, -0.25, 0.80, 0.85),
    option('put', 95, -0.12, 0.35, 0.40),
    option('call', 102, 0.25, 0.80, 0.85),
    option('call', 105, 0.12, 0.35, 0.40)
  ];
  const candidates = buildCreditCandidates({
    symbol: 'TEST', quote: { symbol: 'TEST', price: 100 }, technical: { trend: 'neutral' }, chain,
    expiration: '2026-09-18', dte: 28,
    policy: { minCredit: 0.1, minScore: 0, minPop: 0.5 }
  });
  assert.ok(candidates.some((candidate) => candidate.strategy === 'BULL_PUT_CREDIT_SPREAD'));
  assert.ok(candidates.some((candidate) => candidate.strategy === 'BEAR_CALL_CREDIT_SPREAD'));
  const bull = candidates.find((candidate) => candidate.strategy === 'BULL_PUT_CREDIT_SPREAD');
  assert.equal(bull.legs[0].action, 'SELL_TO_OPEN');
  assert.equal(bull.legs[1].action, 'BUY_TO_OPEN');
  assert.ok(bull.maxRiskUsd > 0);
  assert.ok(bull.maxProfitUsd > 0);
  assert.ok(bull.minimumCredit <= bull.credit);
});

test('el escáner no inventa una señal: solo marca READY con revisión Gemini', async () => {
  const chain = [
    option('put', 98, -0.25, 0.80, 0.85),
    option('put', 95, -0.12, 0.35, 0.40),
    option('call', 102, 0.25, 0.80, 0.85),
    option('call', 105, 0.12, 0.35, 0.40)
  ];
  const tradier = {
    async getMarketClock() { return { state: 'open', description: 'Market is open' }; },
    async getQuotes() { return [{ symbol: 'TEST', price: 100, last: 100, bid: 99.99, ask: 100.01, volume: 100000 }]; },
    async getHistory() { return Array.from({ length: 90 }, (_, index) => ({ date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`, close: 85 + index * 0.18, volume: 100000 })); },
    async getExpirations() { return ['2026-09-18']; },
    async getOptionChain() { return chain; }
  };
  const gemini = {
    async review(candidates) {
      return { configured: true, ok: true, model: 'test', marketNote: 'Contexto de prueba', reviews: candidates.map((candidate) => ({ candidateId: candidate.candidateId, decision: 'APPROVE', confidence: 88, summary: 'Datos coherentes para revisión manual.', riskFlags: [], entryTrigger: 'Entrar solo con crédito real.', takeProfit: 'Cerrar al 50%.', stopLoss: 'Cerrar si se duplica el débito.', management: 'No perseguir el precio.' })) };
    }
  };
  const scan = await scanMarket({ tradier, gemini, symbols: ['TEST'], now: new Date('2026-08-21T12:00:00Z') });
  assert.equal(scan.source, 'Tradier');
  assert.ok(scan.signals.length > 0);
  assert.ok(scan.signals.every((signal) => signal.legs.every((leg) => leg.strike)));
  assert.ok(scan.signals.some((signal) => signal.status === 'READY'));
});
