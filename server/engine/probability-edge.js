import { clamp, round } from '../lib/math.js';

function normalCdf(value) {
  const absolute = Math.abs(value);
  const t = 1 / (1 + 0.2316419 * absolute);
  const density = Math.exp(-0.5 * absolute * absolute) / Math.sqrt(2 * Math.PI);
  const polynomial = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - density * polynomial;
  return value >= 0 ? cdf : 1 - cdf;
}

function lognormalProbabilityAbove({ spot, level, iv, dte, rate = 0.043 }) {
  if (![spot, level, iv, dte].every(Number.isFinite) || spot <= 0 || level <= 0 || iv <= 0 || dte <= 0) return null;
  const time = dte / 365;
  const deviation = iv * Math.sqrt(time);
  const d2 = (Math.log(spot / level) + (rate - (iv * iv) / 2) * time) / deviation;
  return normalCdf(d2);
}

function shortDeltaProbability(setup) {
  const shorts = (setup.legs || []).filter((leg) => leg.side === 'SELL' && Number.isFinite(leg.delta));
  if (!shorts.length) return null;
  if (/Iron Condor/i.test(setup.strategy) && shorts.length >= 2) {
    return clamp(1 - shorts.reduce((total, leg) => total + Math.abs(leg.delta), 0), 0.01, 0.99);
  }
  return clamp(1 - Math.abs(shorts[0].delta), 0.01, 0.99);
}

function modelProbability(setup, spot, iv, dte) {
  const breakevens = setup.breakevens || [];
  if (/Bull Put|Cash Secured Put|Call Debit|Long Call/i.test(setup.strategy) && breakevens[0]) {
    return lognormalProbabilityAbove({ spot, level: breakevens[0], iv, dte });
  }
  if (/Bear Call|Put Debit|Long Put/i.test(setup.strategy) && breakevens[0]) {
    const above = lognormalProbabilityAbove({ spot, level: breakevens[0], iv, dte });
    return above === null ? null : 1 - above;
  }
  if (/Iron Condor|Iron Butterfly/i.test(setup.strategy) && breakevens.length >= 2) {
    const aboveLower = lognormalProbabilityAbove({ spot, level: breakevens[0], iv, dte });
    const aboveUpper = lognormalProbabilityAbove({ spot, level: breakevens[1], iv, dte });
    return aboveLower === null || aboveUpper === null ? null : clamp(aboveLower - aboveUpper, 0.01, 0.99);
  }
  return null;
}

function estimatedSlippage(setup) {
  const halfSpreads = (setup.legs || []).map((leg) =>
    Number.isFinite(leg.ask) && Number.isFinite(leg.bid) && leg.ask >= leg.bid ? (leg.ask - leg.bid) / 2 : null
  );
  if (!halfSpreads.length || halfSpreads.some((value) => value === null)) return null;
  return round(halfSpreads.reduce((sum, value) => sum + value, 0) * 100, 2);
}

export function calculateProbabilityEdge(setup, timestamp = new Date().toISOString()) {
  const spot = Number(setup.underlyingPrice);
  const iv = Number(setup.iv) / 100;
  const dte = Number(setup.dte);
  const hasGreeks = (setup.legs || []).every((leg) => Number.isFinite(leg.delta));
  const missing = [];
  if (!Number.isFinite(spot)) missing.push('precio subyacente');
  if (!(Number.isFinite(iv) && iv > 0)) missing.push('IV');
  if (!(Number.isFinite(dte) && dte > 0)) missing.push('DTE');
  if (!hasGreeks) missing.push('Greeks/delta');
  if (!setup.legs?.length) missing.push('cadena/legs');
  if (missing.length) {
    return {
      available: false,
      label: 'No disponible',
      missing,
      disclaimer: 'La probabilidad requiere IV, DTE, Greeks y una cadena valida.'
    };
  }
  const deltaEstimate = shortDeltaProbability(setup);
  const bsEstimate = modelProbability(setup, spot, iv, dte);
  const availableModels = [deltaEstimate, bsEstimate].filter(Number.isFinite);
  if (!availableModels.length) {
    return { available: false, label: 'No disponible', missing: ['break-even o modelo compatible'], disclaimer: 'No se pudo calcular POP sin supuestos excesivos.' };
  }
  const pop = clamp(availableModels.reduce((sum, value) => sum + value, 0) / availableModels.length, 0.01, 0.99);
  const slippage = estimatedSlippage(setup);
  const adjustedPop = Number.isFinite(slippage) && Number.isFinite(setup.maxRisk) && setup.maxRisk > 0
    ? clamp(pop - Math.min(slippage / setup.maxRisk * 0.25, 0.08), 0.01, 0.99)
    : pop;
  const expectedValue = Number.isFinite(setup.maxProfit) && Number.isFinite(setup.maxRisk)
    ? round((adjustedPop * setup.maxProfit) - ((1 - adjustedPop) * setup.maxRisk) - (slippage || 0), 2)
    : null;
  return {
    available: true,
    label: 'Estimado por modelo',
    probabilityOfProfit: round(pop * 100, 1),
    probabilityOtm: round(pop * 100, 1),
    probabilityItm: round((1 - pop) * 100, 1),
    liquidityAdjustedProbability: round(adjustedPop * 100, 1),
    expectedMove: setup.expectedMove ?? null,
    expectedValue,
    riskReward: setup.riskReward ?? (setup.maxRisk ? round(setup.maxProfit / setup.maxRisk, 2) : null),
    returnOnCapital: setup.collateralRequired > 0 ? round(setup.maxProfit / setup.collateralRequired * 100, 1) : null,
    estimatedSlippage: slippage,
    slippageRisk: !Number.isFinite(slippage) ? 'No disponible' : slippage > setup.maxProfit * 0.2 ? 'Alto' : slippage > setup.maxProfit * 0.1 ? 'Medio' : 'Bajo',
    model: bsEstimate !== null && deltaEstimate !== null ? 'Delta short strike + lognormal/Black-Scholes aproximado hasta break-even' : bsEstimate !== null ? 'Lognormal/Black-Scholes aproximado hasta break-even' : 'Delta short strike',
    inputs: ['precio subyacente', 'IV', 'DTE', 'delta', 'break-even', 'bid/ask'],
    rateAssumption: 'Tasa anual aproximada 4.3% para modelo educativo.',
    timestamp,
    disclaimer: 'Esta probabilidad es una estimacion basada en IV, DTE, delta y break-even. No garantiza resultado ni predice gaps o cambios bruscos de IV.'
  };
}
