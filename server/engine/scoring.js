import { clamp, round } from '../lib/math.js';
const CREDIT_STRATEGY = /(Bull Put Spread|Bear Call Spread|Credit|Iron Condor|Cash Secured Put|Covered Call|Broken Wing)/i;

function technicalQuality(strategy, trend, technicals) {
  const aligned = /Bull|Cash Secured Put|Call Debit/i.test(strategy) ? trend === 'bullish'
    : /Bear|Put Debit/i.test(strategy) ? trend === 'bearish'
      : trend === 'range';
  const indicators = [technicals?.ema8, technicals?.ema21, technicals?.ema50, technicals?.atr14].filter(Number.isFinite).length;
  return clamp((aligned ? 9 : 3) + indicators, 0, 15);
}

export function scoreSetup({ setup, ivRank, trend, macroBlocked, gamma, flowBias, technicals, riskAllowed, edge }) {
  const premiumSelling = CREDIT_STRATEGY.test(setup.strategy);
  const values = {
    liquidity: clamp(round(setup.liquidityScore * 2, 0), 0, 20),
    technicalContext: technicalQuality(setup.strategy, trend, technicals),
    volatilityEdge: ivRank === null ? 0 : premiumSelling
      ? (ivRank >= 35 && ivRank <= 80 ? 15 : ivRank > 80 ? 8 : 4)
      : (ivRank <= 45 ? 13 : 6),
    estimatedProbability: edge?.available
      ? edge.liquidityAdjustedProbability >= 70 ? 15 : edge.liquidityAdjustedProbability >= 60 ? 10 : 4
      : 0,
    expectedValue: edge?.available ? edge.expectedValue > 0 ? 10 : 2 : 0,
    eventNewsRisk: macroBlocked ? 0 : 10,
    tapeGexFlow: gamma?.regime === 'unavailable'
      ? flowBias === 'aligned' ? 5 : 2
      : ((premiumSelling && gamma.regime === 'positive') || (!premiumSelling && gamma.regime === 'negative'))
          ? (flowBias === 'opposed' ? 5 : 10)
          : 1,
    riskCollateralFit: riskAllowed ? 5 : 0
  };
  const score = clamp(Object.values(values).reduce((sum, value) => sum + value, 0), 0, 100);
  return {
    score,
    confidenceScore: score,
    factors: values,
    weights: {
      liquidity: 20,
      technicalContext: 15,
      volatilityEdge: 15,
      estimatedProbability: 15,
      expectedValue: 10,
      eventNewsRisk: 10,
      tapeGexFlow: 10,
      riskCollateralFit: 5
    }
  };
}
