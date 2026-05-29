import { clamp, round } from '../lib/math.js';
const CREDIT_STRATEGY = /(Bull Put Spread|Bear Call Spread|Credit|Iron Condor|Cash Secured Put|Covered Call)/i;
const ADVANCED_PAPER_ONLY = /(Broken Wing|Butterfly|Calendar|Diagonal|Ratio|Strangle|Straddle)/i;

function trendQuality(strategy, trend, technicals) {
  const aligned = /Bull|Cash Secured Put|Call Debit/i.test(strategy) ? trend === 'bullish'
    : /Bear|Put Debit/i.test(strategy) ? trend === 'bearish'
      : trend === 'range';
  const emaStack = [technicals?.ema8, technicals?.ema21, technicals?.ema50, technicals?.ema200].filter(Number.isFinite).length;
  return clamp((aligned ? 13 : 4) + emaStack * 1.75, 0, 20);
}

function structureQuality(strategy, technicals = {}, setup = {}) {
  const hasLevels = Number.isFinite(technicals.support) || Number.isFinite(technicals.resistance);
  const hasExpectedMove = Number.isFinite(setup.expectedMove);
  const hasBreakEven = Array.isArray(setup.breakevens) && setup.breakevens.some(Number.isFinite);
  const shortStrikeKnown = String(setup.strikes || '').length > 0;
  return clamp((hasLevels ? 6 : 2) + (hasExpectedMove ? 3 : 0) + (hasBreakEven ? 3 : 0) + (shortStrikeKnown ? 3 : 0), 0, 15);
}

function momentumQuality(technicals = {}) {
  const rsi = Number(technicals.rsi14);
  const macd = Number(technicals.macd?.histogram);
  const relVol = Number(technicals.relativeVolume20);
  return clamp(
    (Number.isFinite(rsi) ? (rsi >= 40 && rsi <= 70 ? 3 : rsi < 30 || rsi > 75 ? 1 : 2) : 0) +
      (Number.isFinite(macd) ? (Math.abs(macd) > 0 ? 3 : 1) : 0) +
      (Number.isFinite(relVol) ? (relVol >= 1.1 ? 4 : relVol >= 0.8 ? 2 : 1) : 0),
    0,
    10
  );
}

export function scoreSetup({ setup, ivRank, trend, macroBlocked, gamma, flowBias, technicals, riskAllowed, edge }) {
  const premiumSelling = CREDIT_STRATEGY.test(setup.strategy);
  const paperOnlyAdvanced = ADVANCED_PAPER_ONLY.test(setup.strategy);
  const rr = Number(setup.riskReward);
  const riskRewardScore = riskAllowed
    ? (Number.isFinite(rr) && rr >= 0.25 ? 15 : Number.isFinite(rr) && rr >= 0.15 ? 10 : 6)
    : 0;
  const values = {
    primaryTrend: trendQuality(setup.strategy, trend, technicals),
    supportResistanceStructure: structureQuality(setup.strategy, technicals, setup),
    momentum: momentumQuality(technicals),
    volatilityEdge: ivRank === null ? 0 : premiumSelling
      ? (ivRank >= 35 && ivRank <= 80 ? 15 : ivRank > 80 ? 8 : 4)
      : (ivRank <= 45 ? 13 : 6),
    optionsLiquidity: clamp(round(setup.liquidityScore * 1.5, 0), 0, 15),
    riskRewardSizing: riskRewardScore,
    newsEarningsMacro: macroBlocked ? 0 : 10
  };
  if (edge?.available && edge.liquidityAdjustedProbability >= 70) values.riskRewardSizing = clamp(values.riskRewardSizing + 2, 0, 15);
  if (flowBias === 'opposed') values.momentum = clamp(values.momentum - 3, 0, 10);
  if (gamma?.regime && gamma.regime !== 'unavailable' && premiumSelling && gamma.regime !== 'positive') values.volatilityEdge = clamp(values.volatilityEdge - 4, 0, 15);
  if (paperOnlyAdvanced) {
    values.riskRewardSizing = 0;
    values.newsEarningsMacro = Math.min(values.newsEarningsMacro, 4);
  }
  const score = clamp(Object.values(values).reduce((sum, value) => sum + value, 0), 0, 100);
  return {
    score,
    confidenceScore: score,
    factors: values,
    weights: {
      primaryTrend: 20,
      supportResistanceStructure: 15,
      momentum: 10,
      volatilityEdge: 15,
      optionsLiquidity: 15,
      riskRewardSizing: 15,
      newsEarningsMacro: 10
    }
  };
}
