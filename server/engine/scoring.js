import { clamp, round } from '../lib/math.js';
import { REGIMES } from './market-intelligence.js';

const CREDIT_STRATEGY = /(Bull Put Spread|Bear Call Spread|Credit|Iron Condor|Cash Secured Put|Covered Call|Broken Wing)/i;

function regimeAlignment(strategy, regime, trend) {
  if (/Iron Condor/i.test(strategy)) return [REGIMES.RANGE_BOUND, REGIMES.GAMMA_PINNED, REGIMES.LOW_VOLATILITY].includes(regime) ? 20 : 3;
  if (/Bull Put|Cash Secured Put/i.test(strategy)) return regime === REGIMES.BULL_TREND && trend === 'bullish' ? 20 : trend === 'bullish' ? 12 : 3;
  if (/Bear Call/i.test(strategy)) return regime === REGIMES.BEAR_TREND && trend === 'bearish' ? 20 : trend === 'bearish' ? 12 : 3;
  if (/Debit Spread/i.test(strategy)) return regime === REGIMES.HIGH_VOLATILITY ? 18 : 7;
  return 8;
}

function gammaAlignment(strategy, gamma) {
  if (gamma.regime === 'unavailable') return 0;
  if (CREDIT_STRATEGY.test(strategy)) return gamma.regime === 'positive' ? 20 : 0;
  if (/Debit Spread/i.test(strategy)) return gamma.regime === 'negative' ? 20 : 5;
  return 8;
}

export function scoreSetup({ setup, ivRank, trend, macroBlocked, gamma, flowBias, regime, technicals, riskAllowed }) {
  const premiumSelling = CREDIT_STRATEGY.test(setup.strategy);
  const values = {
    regimeAlignment: regimeAlignment(setup.strategy, regime, trend),
    gexAlignment: gammaAlignment(setup.strategy, gamma),
    liquidity: clamp(round(setup.liquidityScore * 1.5, 0), 0, 15),
    ivConditions: ivRank === null ? 0 : premiumSelling
      ? (ivRank >= 35 && ivRank <= 80 ? 15 : ivRank > 80 ? 8 : 4)
      : (ivRank <= 45 ? 13 : 6),
    institutionalFlow: flowBias === 'aligned' ? 10 : flowBias === 'opposed' ? 0 : 5,
    technicalStructure: technicals?.trend === trend && Number.isFinite(technicals?.atr14) ? 10 : technicals?.trend === trend ? 7 : 3,
    macroSafety: macroBlocked || !riskAllowed ? 0 : 10
  };
  const score = clamp(Object.values(values).reduce((sum, value) => sum + value, 0), 0, 100);
  return {
    score,
    confidenceScore: score,
    factors: values,
    weights: {
      regimeAlignment: 20,
      gexAlignment: 20,
      liquidity: 15,
      ivConditions: 15,
      institutionalFlow: 10,
      technicalStructure: 10,
      macroSafety: 10
    }
  };
}
