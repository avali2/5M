import { buildGuardianEdgeTicketScan } from '../server/guardian/edge-tickets.js';

const sampleScan = {
  asOf: new Date().toISOString(),
  marketDataMode: 'mock/backtest',
  decision: { status: 'eligible', reasons: [] },
  profile: { accountSize: 2000 },
  market: { quotes: [{ symbol: 'SPY', price: 550, source: 'Backtest fixture' }] },
  opportunities: [
    {
      symbol: 'SPY',
      strategy: 'Bull Put Spread',
      expiration: '2026-05-29',
      dte: 2,
      credit: 0.95,
      maxRisk: 405,
      maxProfit: 95,
      collateralRequired: 405,
      pop: 72,
      confidenceScore: 76,
      liquidityScore: 8,
      breakevens: [549.05],
      riskGovernor: { allowedReal: true, blocks: [] },
      legs: [
        { side: 'sell', type: 'put', strike: 550, bid: 1.05, ask: 1.15, delta: -0.28, gamma: 0.04, openInterest: 2500, volume: 320, source: 'Backtest fixture' },
        { side: 'buy', type: 'put', strike: 545, bid: 0.15, ask: 0.2, delta: -0.12, gamma: 0.02, openInterest: 2200, volume: 210, source: 'Backtest fixture' }
      ],
      technicals: { support: 548, resistance: 556, vwap20: 551 }
    }
  ],
  rejected: [],
  conditionalIdeas: []
};

const result = buildGuardianEdgeTicketScan(sampleScan);
console.log(JSON.stringify(result.dailyBest, null, 2));
