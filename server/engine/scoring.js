import { clamp, round } from '../lib/math.js';

const CREDIT_STRATEGY = /(Bull Put Spread|Bear Call Spread|Credit|Iron Condor|Cash Secured Put|Covered Call)/i;
const ADVANCED_PAPER_ONLY = /(Broken Wing|Butterfly|Calendar|Diagonal|Ratio|Strangle|Straddle)/i;
const DEBIT_STRATEGY = /(Call Debit|Put Debit|Long Call|Long Put)/i;

// Umbrales de clasificación
const THRESHOLDS = {
  ENTER_NOW: { minScore: 75, minPop: 70, requireLiquidity: 7, requireIvRank: true },
  WAIT_CONFIRMATION: { minScore: 60, minPop: 55, requireLiquidity: 5 },
  WATCH_ONLY: { minScore: 40, minPop: 40 },
  NO_CHASE: { maxExtension: 0.05, maxRsi: 75, minRsi: 25 },
  BLOCKED: { maxScore: 39 }
};

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
  const hasMaxRisk = Number.isFinite(setup.maxRisk) && setup.maxRisk > 0;
  const hasTakeProfit = String(setup.takeProfit || '').length > 3;
  const hasStopLoss = String(setup.stopLoss || '').length > 3;
  return clamp(
    (hasLevels ? 4 : 1) +
    (hasExpectedMove ? 2 : 0) +
    (hasBreakEven ? 2 : 0) +
    (shortStrikeKnown ? 2 : 0) +
    (hasMaxRisk ? 3 : -5) +
    (hasTakeProfit ? 2 : -3) +
    (hasStopLoss ? 2 : -3),
    0,
    15
  );
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

function vwapExtensionCheck(technicals = {}, setup = {}) {
  const vwap = Number(technicals.vwap20);
  const spot = Number(setup.underlyingPrice);
  if (!Number.isFinite(vwap) || !Number.isFinite(spot) || vwap <= 0) return null;
  return Math.abs(spot - vwap) / vwap;
}

export function classifySignal({
  score,
  pop,
  liquidityScore,
  ivRank,
  trend,
  technicals,
  setup,
  blocks = [],
  macroBlocked = false,
  globalBlocks = [],
  riskGovernor
}) {
  const hasBlocks = blocks.length > 0 || globalBlocks.length > 0 || macroBlocked;
  const hasRealBlock = hasBlocks && (macroBlocked || globalBlocks.length > 0);
  const vwapExtension = vwapExtensionCheck(technicals, setup);
  const rsi = Number(technicals?.rsi14);

  // BLOCKED: datos faltantes o riesgo indefinido
  if (hasRealBlock || !setup?.maxRisk || setup.maxRisk <= 0) {
    return {
      classification: 'BLOCKED',
      label: 'BLOQUEADO',
      reason: hasRealBlock
        ? (blocks.slice(0, 3).join('; ') || globalBlocks[0] || 'Contexto del mercado bloquea')
        : 'Riesgo máximo no definido o inválido',
      canTrade: false,
      canWatch: false
    };
  }

  // NO_CHASE: precio extendido
  if (Number.isFinite(vwapExtension) && vwapExtension > THRESHOLDS.NO_CHASE.maxExtension) {
    return {
      classification: 'NO_CHASE',
      label: 'NO PERSEGUIR',
      reason: `Precio extendido ${(vwapExtension * 100).toFixed(1)}% del VWAP. Esperar retroceso.`,
      canTrade: false,
      canWatch: true
    };
  }

  if (Number.isFinite(rsi) && (rsi >= THRESHOLDS.NO_CHASE.maxRsi || rsi <= THRESHOLDS.NO_CHASE.minRsi)) {
    const direction = rsi >= THRESHOLDS.NO_CHASE.maxRsi ? 'sobrecompra' : 'sobreventa';
    return {
      classification: 'NO_CHASE',
      label: 'NO PERSEGUIR',
      reason: `RSI ${rsi} en zona de ${direction}. Esperar normalización.`,
      canTrade: false,
      canWatch: true
    };
  }

  // Verificar plan de salida
  const hasExitPlan = String(setup?.takeProfit || '').length > 3 && String(setup?.stopLoss || '').length > 3;
  if (!hasExitPlan) {
    return {
      classification: 'BLOCKED',
      label: 'BLOQUEADO',
      reason: 'No hay plan de salida definido (take profit / stop loss)',
      canTrade: false,
      canWatch: false
    };
  }

  // Verificar DTE
  const dte = Number(setup?.dte);
  if (Number.isFinite(dte)) {
    if (dte === 0) {
      // Validar ventana 0DTE
      return {
        classification: 'WATCH_ONLY',
        label: 'SOLO OBSERVAR',
        reason: '0DTE requiere confirmación de ventana, liquidez y aprobación Gemini.',
        canTrade: false,
        canWatch: true
      };
    }
    if (dte === 1 && !THRESHOLDS.ENTER_NOW.requireLiquidity) {
      return {
        classification: 'WAIT_CONFIRMATION',
        label: 'ESPERAR CONFIRMACIÓN',
        reason: '1DTE requiere aprobación expresa en el mandato.',
        canTrade: false,
        canWatch: true
      };
    }
  }

  // Verificar liquidez
  if (liquidityScore < THRESHOLDS.ENTER_NOW.requireLiquidity) {
    if (liquidityScore < THRESHOLDS.WAIT_CONFIRMATION.requireLiquidity) {
      return {
        classification: 'BLOCKED',
        label: 'BLOQUEADO',
        reason: `Liquidez insuficiente (${liquidityScore}/10). Bid/ask spread o volumen bajo.`,
        canTrade: false,
        canWatch: false
      };
    }
    return {
      classification: 'WATCH_ONLY',
      label: 'SOLO OBSERVAR',
      reason: `Liquidez media (${liquidityScore}/10). Esperar mejora de spread.`,
      canTrade: false,
      canWatch: true
    };
  }

  // Clasificar por score
  if (score >= THRESHOLDS.ENTER_NOW.minScore && pop >= THRESHOLDS.ENTER_NOW.minPop) {
    return {
      classification: 'ENTER_NOW',
      label: 'ENTRAR AHORA',
      reason: `Score ${score}/100, POP ${pop}%. Riesgo definido y liquidez buena.`,
      canTrade: true,
      canWatch: true
    };
  }

  if (score >= THRESHOLDS.WAIT_CONFIRMATION.minScore) {
    return {
      classification: 'WAIT_CONFIRMATION',
      label: 'ESPERAR CONFIRMACIÓN',
      reason: `Score ${score}/100. Falta confirmación de precio, volumen o tape.`,
      canTrade: false,
      canWatch: true
    };
  }

  if (score >= THRESHOLDS.WATCH_ONLY.minScore) {
    return {
      classification: 'WATCH_ONLY',
      label: 'SOLO OBSERVAR',
      reason: `Score ${score}/100. Hay idea pero falta borde estadístico.`,
      canTrade: false,
      canWatch: true
    };
  }

  return {
    classification: 'BLOCKED',
    label: 'BLOQUEADO',
    reason: blocks.length ? blocks[0] : `Score ${score}/100 insuficiente para cualquier clasificación.`,
    canTrade: false,
    canWatch: false
  };
}

function tapeReadingQuality(technicals = {}, setup = {}) {
  const relVol = Number(technicals.relativeVolume20);
  const macd = Number(technicals.macd?.histogram);
  const vwap = Number(technicals.vwap20);
  const spot = Number(setup.underlyingPrice);
  let score = 0;

  // Volumen relativo
  if (Number.isFinite(relVol)) {
    if (relVol >= 1.5) score += 8;
    else if (relVol >= 1.2) score += 5;
    else if (relVol >= 0.8) score += 3;
    else score += 1;
  }

  // MACD momentum
  if (Number.isFinite(macd)) {
    if (macd > 0 && Math.abs(macd) > 0.5) score += 4;
    else if (macd > 0) score += 2;
    else if (macd < 0 && Math.abs(macd) > 0.5) score += 2; // momentum bajista también es información
  }

  // VWAP alignment
  if (Number.isFinite(vwap) && Number.isFinite(spot)) {
    const distance = Math.abs(spot - vwap) / vwap;
    if (distance < 0.01) score += 5; // muy cerca de VWAP
    else if (distance < 0.02) score += 3;
  }

  return clamp(score, 0, 15);
}

export function scoreSetup({ setup, ivRank, trend, macroBlocked, gamma, flowBias, technicals, riskAllowed, edge }) {
  const premiumSelling = CREDIT_STRATEGY.test(setup.strategy);
  const paperOnlyAdvanced = ADVANCED_PAPER_ONLY.test(setup.strategy);
  const debitStrategy = DEBIT_STRATEGY.test(setup.strategy);
  const rr = Number(setup.riskReward);
  const riskRewardScore = riskAllowed
    ? (Number.isFinite(rr) && rr >= 0.25 ? 15 : Number.isFinite(rr) && rr >= 0.15 ? 10 : 6)
    : 0;

  const values = {
    primaryTrend: trendQuality(setup.strategy, trend, technicals),
    supportResistanceStructure: structureQuality(setup.strategy, technicals, setup),
    momentum: momentumQuality(technicals),
    tapeReading: tapeReadingQuality(technicals, setup),
    volatilityEdge: ivRank === null ? 0 : premiumSelling
      ? (ivRank >= 35 && ivRank <= 80 ? 12 : ivRank > 80 ? 6 : 3)
      : debitStrategy
        ? (ivRank <= 45 ? 10 : ivRank <= 60 ? 6 : 3)
        : 6,
    optionsLiquidity: clamp(round(setup.liquidityScore * 1.5, 0), 0, 15),
    riskRewardSizing: riskRewardScore,
    newsEarningsMacro: macroBlocked ? 0 : 10
  };

  // Ajustes por edge
  if (edge?.available && edge.liquidityAdjustedProbability >= 70) {
    values.riskRewardSizing = clamp(values.riskRewardSizing + 2, 0, 15);
  }

  // Penalización por flujo opuesto
  if (flowBias === 'opposed') {
    values.momentum = clamp(values.momentum - 3, 0, 10);
  }

  // Penalización por gamma desfavorable
  if (gamma?.regime && gamma.regime !== 'unavailable' && premiumSelling && gamma.regime !== 'positive') {
    values.volatilityEdge = clamp(values.volatilityEdge - 4, 0, 15);
  }

  // Penalización por estructura avanzada (solo paper)
  if (paperOnlyAdvanced) {
    values.riskRewardSizing = 0;
    values.newsEarningsMacro = Math.min(values.newsEarningsMacro, 4);
  }

  const score = clamp(Object.values(values).reduce((sum, value) => sum + value, 0), 0, 100);

  // Clasificación final
  const pop = Number.isFinite(setup.pop) ? setup.pop : (edge?.liquidityAdjustedProbability ?? 0);
  const liquidityScore = setup.liquidityScore ?? 0;
  const classification = classifySignal({
    score,
    pop,
    liquidityScore,
    ivRank,
    trend,
    technicals,
    setup,
    blocks: setup.blocks || [],
    macroBlocked
  });

  return {
    score,
    confidenceScore: score,
    factors: values,
    weights: {
      primaryTrend: 20,
      supportResistanceStructure: 15,
      momentum: 10,
      tapeReading: 15,
      volatilityEdge: 12,
      optionsLiquidity: 15,
      riskRewardSizing: 15,
      newsEarningsMacro: 10
    },
    classification
  };
}