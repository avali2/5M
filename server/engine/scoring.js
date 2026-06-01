import { round, clamp } from './math.js';

export function technicalScoreForBias(technicals, bias) {
  let score = 50;
  if (bias === "BULLISH") {
    if (technicals?.trend === "BULL_TREND") score += 20;
    if (technicals?.vwapBias === "ABOVE_VWAP") score += 10;
    if (technicals?.momentum === "bullish") score += 10;
    if (technicals?.structure === "HH_HL") score += 10;
  }
  if (bias === "BEARISH") {
    if (technicals?.trend === "BEAR_TREND") score += 20;
    if (technicals?.vwapBias === "BELOW_VWAP") score += 10;
    if (technicals?.momentum === "bearish") score += 10;
    if (technicals?.structure === "LH_LL") score += 10;
  }
  if (bias === "NEUTRAL") {
    if (technicals?.trend === "RANGE") score += 20;
    if (technicals?.rsi14 && technicals.rsi14 > 40 && technicals.rsi14 < 60) score += 10;
  }
  return clamp(score, 0, 100);
}

export function volatilityRegimeScore({ avgIvValue, ivRank, ivPercentile, realizedVolValue, vix }) {
  let score = 50; const reasons = [];
  if (ivRank != null) {
    if (ivRank >= 50) { score += 25; reasons.push("IV Rank alto: favorece estrategias de crédito."); }
    else if (ivRank <= 20) { score -= 10; reasons.push("IV Rank bajo."); }
    else { score += 10; }
  }
  if (avgIvValue && realizedVolValue && avgIvValue > realizedVolValue * 1.05) { score += 10; reasons.push("IV > HV."); }
  if (vix && vix >= 12 && vix <= 25) score += 5;
  if (vix && vix > 30) score -= 15;
  return { score: clamp(score, 0, 100), reasons };
}

export function institutionalScore({ optionsScore, volScore, techScore, tapeScore, wyckoffScore, macroScore }) {
  return Math.round(
    (optionsScore || 50) * 0.25 +
    (volScore || 50) * 0.20 +
    (techScore || 50) * 0.20 +
    (tapeScore || 50) * 0.15 +
    (wyckoffScore || 50) * 0.10 +
    (macroScore || 70) * 0.10
  );
}