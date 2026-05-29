import { round } from '../lib/math.js';

export const EDGE_CLASSIFICATIONS = {
  EDGE_READY: 'EDGE_READY',
  AGGRESSIVE_EDGE: 'AGGRESSIVE_EDGE',
  TRADE_CANDIDATE: 'TRADE_CANDIDATE',
  CAPITAL_HEAVY: 'CAPITAL_HEAVY',
  HIGH_POP_BAD_PAYOUT: 'HIGH_POP_BAD_PAYOUT',
  WAIT_TRIGGER: 'WAIT_TRIGGER',
  NO_READY: 'NO_READY',
  NO_TRADE_REAL: 'NO_TRADE_REAL'
};

export const DEFAULT_EDGE_PROFILE = {
  riskProfile: 'moderate_aggressive',
  minPopToNotify: 70,
  minScoreReady: 70,
  minScoreAggressive: 65,
  minScoreCandidate: 60,
  minProfitDollars: 30,
  allowCapitalHeavyAlerts: true,
  allowVeryAggressive: false,
  allow0DTE: false,
  maxAlertsPerHour: 3,
  cooldownSymbolMinutes: 20,
  duplicateCooldownMinutes: 45
};

const CLASSIFICATION_PRIORITY = {
  [EDGE_CLASSIFICATIONS.EDGE_READY]: 1,
  [EDGE_CLASSIFICATIONS.AGGRESSIVE_EDGE]: 2,
  [EDGE_CLASSIFICATIONS.CAPITAL_HEAVY]: 3,
  [EDGE_CLASSIFICATIONS.TRADE_CANDIDATE]: 4,
  [EDGE_CLASSIFICATIONS.HIGH_POP_BAD_PAYOUT]: 5,
  [EDGE_CLASSIFICATIONS.WAIT_TRIGGER]: 6,
  [EDGE_CLASSIFICATIONS.NO_READY]: 7,
  [EDGE_CLASSIFICATIONS.NO_TRADE_REAL]: 8
};

function asNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dollars(value) {
  const amount = asNumber(value);
  return amount === null ? 'No disponible' : `$${round(amount, 2)}`;
}

function pct(value) {
  const amount = asNumber(value);
  return amount === null ? 'No disponible' : `${round(amount, 1)}%`;
}

function optionSide(side) {
  return String(side || '').toLowerCase().startsWith('sell') ? 'Sell' : 'Buy';
}

function optionType(type) {
  return String(type || '').toLowerCase().startsWith('p') ? 'P' : 'C';
}

function legText(leg) {
  return `${optionSide(leg.side)} ${leg.strike}${optionType(leg.type)}`;
}

function isDefinedRiskStrategy(setup) {
  const strategy = String(setup.strategy || '');
  if (/naked|cash secured|covered call|short straddle|short strangle|ratio/i.test(strategy)) return false;
  const allowed = /(Bull Put|Bear Call|Debit Spread|Credit Spread|Iron Condor|Iron Fly|Butterfly|Calendar|Diagonal|0DTE|1DTE)/i.test(strategy);
  if (!allowed) return false;
  const legs = Array.isArray(setup.legs) ? setup.legs : [];
  const hasBuy = legs.some((leg) => optionSide(leg.side) === 'Buy');
  const hasSell = legs.some((leg) => optionSide(leg.side) === 'Sell');
  return hasBuy && hasSell && legs.every((leg) => ['call', 'put'].includes(String(leg.type || '').toLowerCase()));
}

function biasFromStrategy(setup) {
  if (setup.bias) return setup.bias;
  if (/Bull|Call Debit|VWAP Reclaim/i.test(setup.strategy)) return 'Bullish';
  if (/Bear|Put Debit|VWAP Rejection/i.test(setup.strategy)) return 'Bearish';
  if (/Iron|Condor|Fly|Calendar|range/i.test(setup.strategy)) return 'Neutral';
  return setup.trend === 'bearish' ? 'Bearish' : setup.trend === 'bullish' ? 'Bullish' : 'Neutral';
}

function brokerAction(strategy) {
  if (/Bull Put/i.test(strategy)) return 'Open Put Credit Spread';
  if (/Bear Call/i.test(strategy)) return 'Open Call Credit Spread';
  if (/Call Debit/i.test(strategy)) return 'Open Call Debit Spread';
  if (/Put Debit/i.test(strategy)) return 'Open Put Debit Spread';
  if (/Iron Condor/i.test(strategy)) return 'Open Iron Condor';
  if (/Iron Fly/i.test(strategy)) return 'Open Iron Butterfly';
  if (/Calendar/i.test(strategy)) return 'Open Calendar Spread';
  if (/Diagonal/i.test(strategy)) return 'Open Diagonal Spread';
  return 'Open defined-risk options spread';
}

function getPremium(setup) {
  if (asNumber(setup.credit) !== null) return { type: 'credit', value: asNumber(setup.credit), text: `Credit >= ${dollars(setup.credit)}` };
  if (asNumber(setup.debit) !== null) return { type: 'debit', value: asNumber(setup.debit), text: `Debit <= ${dollars(setup.debit)}` };
  const maxProfit = asNumber(setup.maxProfit);
  const maxRisk = asNumber(setup.maxRisk);
  if (/Debit Spread/i.test(setup.strategy) && maxRisk !== null) return { type: 'debit', value: maxRisk / 100, text: `Debit <= ${dollars(maxRisk / 100)}` };
  if (maxProfit !== null) return { type: 'credit', value: maxProfit / 100, text: `Credit >= ${dollars(maxProfit / 100)}` };
  return { type: 'unknown', value: null, text: 'Limit: No disponible' };
}

function getBreakevenText(setup) {
  const breakevens = setup.breakevens || setup.breakEvens || setup.breakEven;
  if (Array.isArray(breakevens) && breakevens.length) return breakevens.map((value) => round(value, 2)).join(' / ');
  const single = asNumber(breakevens);
  return single === null ? 'No disponible' : String(round(single, 2));
}

function estimatePop(setup) {
  const fromEdge = asNumber(setup.edge?.liquidityAdjustedProbability ?? setup.edge?.probabilityOfProfit);
  if (fromEdge !== null) return { value: fromEdge > 1 ? fromEdge : fromEdge * 100, model: setup.edge?.model || 'delta + break-even model' };
  const fromSetup = asNumber(setup.pop ?? setup.probabilityOfProfit);
  if (fromSetup !== null) return { value: fromSetup > 1 ? fromSetup : fromSetup * 100, model: 'short-strike delta approximation' };
  return { value: null, model: 'No disponible' };
}

function estimateEv(setup, popPct, premium) {
  const direct = asNumber(setup.edge?.expectedValue);
  const maxRisk = asNumber(setup.maxRisk);
  const maxProfit = asNumber(setup.maxProfit);
  if (popPct === null || maxRisk === null || maxProfit === null) {
    return { value: direct, model: direct === null ? 'No disponible' : 'scanner EV fallback', expectedProfit: null, expectedLoss: null };
  }
  const probability = popPct / 100;
  let expectedProfit = maxProfit * 0.5;
  let expectedLoss = Math.min(maxRisk, maxProfit * 2);
  if (premium.type === 'debit') {
    expectedProfit = Math.min(maxProfit, maxRisk * 0.8);
    expectedLoss = maxRisk * 0.5;
  }
  const value = probability * expectedProfit - (1 - probability) * expectedLoss;
  return {
    value: round(value, 2),
    model: 'TP/SL expected value approximation',
    expectedProfit: round(expectedProfit, 2),
    expectedLoss: round(expectedLoss, 2)
  };
}

function liquidityScore(setup) {
  const score = asNumber(setup.liquidityScore);
  if (score !== null) return score;
  const legs = Array.isArray(setup.legs) ? setup.legs : [];
  if (!legs.length) return 0;
  const legScores = legs.map((leg) => {
    const bid = asNumber(leg.bid);
    const ask = asNumber(leg.ask);
    const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null;
    const spreadPct = mid > 0 ? (ask - bid) / mid : 1;
    const oi = asNumber(leg.openInterest, 0);
    const volume = asNumber(leg.volume, 0);
    let points = 10;
    if (spreadPct > 0.12) points -= 3;
    if (oi < 100) points -= 3;
    if (volume < 10) points -= 2;
    return Math.max(0, points);
  });
  return round(legScores.reduce((sum, value) => sum + value, 0) / legScores.length, 1);
}

function dataWarnings(setup, settings = DEFAULT_EDGE_PROFILE) {
  const warnings = [];
  const legs = Array.isArray(setup.legs) ? setup.legs : [];
  if (!legs.length) warnings.push('No hay legs suficientes para construir ticket.');
  legs.forEach((leg) => {
    if (![leg.bid, leg.ask, leg.strike].every((value) => Number.isFinite(Number(value)))) {
      warnings.push(`Leg ${legText(leg)} tiene bid/ask/strike incompleto.`);
    }
    if (asNumber(leg.openInterest, 0) < 100) warnings.push(`OI bajo en ${legText(leg)}.`);
    if (asNumber(leg.volume, 0) < 10) warnings.push(`Volumen bajo en ${legText(leg)}.`);
  });
  if (!setup.edge?.available && estimatePop(setup).value === null) warnings.push('POP no disponible.');
  if (getBreakevenText(setup) === 'No disponible') warnings.push('Break-even no disponible.');
  if (asNumber(setup.maxRisk) === null) warnings.push('Max risk no disponible.');
  if (asNumber(setup.maxProfit) === null) warnings.push('Max profit no disponible.');
  if (asNumber(setup.maxProfit) !== null && asNumber(setup.maxProfit) < (settings.minProfitDollars || 30)) {
    warnings.push(`Max profit estimado menor al minimo configurado de $${settings.minProfitDollars || 30}.`);
  }
  if (!setup.expiration) warnings.push('Expiracion no disponible.');
  return [...new Set(warnings)];
}

function riskClassForTicket({ setup, popPct, ev, profile, globalBlocks, dataIssues }) {
  const classes = [];
  const maxRisk = asNumber(setup.maxRisk, 0);
  const liquidity = liquidityScore(setup);
  const accountSize = asNumber(profile?.accountSize, 2000) || 2000;
  if (dataIssues.length) classes.push('Data Risk');
  if (maxRisk > accountSize * 0.05) classes.push('Capital Heavy');
  if (setup.dte <= 1 || /0DTE|1DTE/i.test(setup.strategy)) classes.push('Gamma Risk');
  if (liquidity < 7) classes.push('Liquidity Risk');
  if ((globalBlocks || []).some((block) => /evento|macro|noticia|earnings|resultados/i.test(block))) classes.push('Event Risk');
  if (setup.ivRank >= 85 || setup.ivRank <= 10) classes.push('Volatility Risk');
  if (popPct >= 70 && ev?.value !== null && ev.value < 0) classes.push('High POP / Bad Risk-Reward');
  if (!classes.length) classes.push('Defined Risk');
  return classes;
}

function edgeScoreForTicket({ setup, popPct, ev, dataIssues, globalBlocks }) {
  const popPoints = popPct === null ? 0 : Math.min(20, Math.max(0, (popPct - 50) / 20 * 20));
  const riskReward = asNumber(setup.riskReward) ?? (asNumber(setup.maxProfit) && asNumber(setup.maxRisk) ? asNumber(setup.maxProfit) / asNumber(setup.maxRisk) : null);
  const evPoints = ev?.value === null ? (riskReward >= 0.25 ? 12 : 8) : ev.value > 0 ? 20 : ev.value > -25 ? 10 : 3;
  const liquidityPoints = Math.min(15, liquidityScore(setup) * 1.5);
  const technicalPoints = Math.min(15, Math.max(0, asNumber(setup.scoreFactors?.technical, asNumber(setup.confidenceScore, 60) / 100 * 15)));
  const volPoints = setup.ivRank === null || setup.ivRank === undefined ? 5 : setup.ivRank >= 20 && setup.ivRank <= 80 ? 10 : 7;
  const eventPoints = globalBlocks?.length ? 2 : 10;
  const dataPoints = dataIssues.length ? 4 : 10;
  return round(popPoints + evPoints + liquidityPoints + technicalPoints + volPoints + eventPoints + dataPoints, 0);
}

function classifyTicket({ setup, settings, globalBlocks, dataIssues, popPct, ev, edgeScore, riskClasses }) {
  const minPop = settings.minPopToNotify;
  const maxRisk = asNumber(setup.maxRisk);
  const maxProfit = asNumber(setup.maxProfit);
  const readyData = dataIssues.filter((issue) => /POP|Break-even|Max risk|Max profit|Expiracion|bid\/ask|strike/i.test(issue));
  const lowPayout = maxProfit !== null && maxProfit < (settings.minProfitDollars || 30);
  const criticalBlocks = (setup.blocks || []).filter((block) => /stale|dato|data|noticia|evento macro|kill switch|colateral utilizado sobre 80/i.test(block));
  const criticalGlobal = (globalBlocks || []).filter((block) => /evento macro|noticias sensibles|kill switch|perdida|colateral utilizado sobre 80/i.test(block));
  if (!isDefinedRiskStrategy(setup)) return EDGE_CLASSIFICATIONS.NO_TRADE_REAL;
  if (readyData.length || maxRisk === null || maxProfit === null || popPct === null) return EDGE_CLASSIFICATIONS.NO_READY;
  if (lowPayout) return EDGE_CLASSIFICATIONS.NO_READY;
  if (criticalBlocks.length || criticalGlobal.length) return EDGE_CLASSIFICATIONS.NO_TRADE_REAL;
  const capitalHeavy = riskClasses.includes('Capital Heavy');
  const highPopBad = popPct >= minPop && (ev?.value !== null && ev.value < 0 || maxProfit / Math.max(maxRisk, 1) < 0.18);
  if (highPopBad) return EDGE_CLASSIFICATIONS.HIGH_POP_BAD_PAYOUT;
  if (capitalHeavy && settings.allowCapitalHeavyAlerts && popPct >= minPop && edgeScore >= settings.minScoreAggressive) return EDGE_CLASSIFICATIONS.CAPITAL_HEAVY;
  if (popPct >= minPop && edgeScore >= settings.minScoreReady && setup.riskGovernor?.allowedReal) return EDGE_CLASSIFICATIONS.EDGE_READY;
  if (popPct >= minPop && edgeScore >= settings.minScoreAggressive) return EDGE_CLASSIFICATIONS.AGGRESSIVE_EDGE;
  if (edgeScore >= settings.minScoreCandidate) return EDGE_CLASSIFICATIONS.TRADE_CANDIDATE;
  return EDGE_CLASSIFICATIONS.NO_TRADE_REAL;
}

function takeProfitStop(setup, premium) {
  const maxProfit = asNumber(setup.maxProfit);
  const maxRisk = asNumber(setup.maxRisk);
  if (premium.type === 'credit') {
    const credit = premium.value ?? (maxProfit !== null ? maxProfit / 100 : null);
    return {
      takeProfit: credit === null ? 'Cerrar al 40%-60% del credito.' : `Buy back cerca de ${dollars(credit * 0.5)} (50% del credito).`,
      stopLoss: credit === null ? 'Cerrar si el spread se mueve 1.5x-2x contra ti.' : `Cerrar cerca de ${dollars(credit * 2)} o por invalidacion tecnica.`,
      takeProfitValue: credit === null ? null : round(credit * 0.5, 2),
      stopLossValue: credit === null ? null : round(credit * 2, 2)
    };
  }
  const debit = premium.value ?? (maxRisk !== null ? maxRisk / 100 : null);
  return {
    takeProfit: debit === null ? 'Tomar profit si gana 50%-100% del debito.' : `Vender cerca de ${dollars(debit * 1.6)} o en resistencia/soporte objetivo.`,
    stopLoss: debit === null ? 'Stop si pierde 40%-50% del debito.' : `Cerrar cerca de ${dollars(debit * 0.5)} o por invalidacion tecnica.`,
    takeProfitValue: debit === null ? null : round(debit * 1.6, 2),
    stopLossValue: debit === null ? null : round(debit * 0.5, 2)
  };
}

function invalidationFor(setup) {
  const support = setup.technicals?.support;
  const resistance = setup.technicals?.resistance;
  const vwap = setup.technicals?.vwap20;
  if (/Bull|Call Debit/i.test(setup.strategy)) return `No entrar si pierde VWAP ${vwap ?? 'No disponible'} o soporte ${support ?? 'No disponible'}.`;
  if (/Bear|Put Debit/i.test(setup.strategy)) return `No entrar si recupera VWAP ${vwap ?? 'No disponible'} o rompe resistencia ${resistance ?? 'No disponible'}.`;
  return `No entrar si rompe soporte ${support ?? 'No disponible'} o resistencia ${resistance ?? 'No disponible'}, o si VIX se expande.`;
}

function doNotEnterRules(setup, premium) {
  const minCredit = premium.type === 'credit' && premium.value !== null ? premium.value * 0.9 : null;
  return [
    minCredit === null ? null : `credito debajo de ${dollars(minCredit)}`,
    'bid/ask se ensancha o la cotizacion esta vieja',
    invalidationFor(setup).replace(/^No entrar si /, ''),
    'evento macro/noticia entra en ventana critica',
    'Robinhood muestra max loss distinto al calculado',
    'tienes FOMO o no puedes monitorear el riesgo'
  ].filter(Boolean);
}

export function buildTradeTicket({ setup, scan, profile, settings = DEFAULT_EDGE_PROFILE }) {
  const premium = getPremium(setup);
  const pop = estimatePop(setup);
  const dataIssues = dataWarnings(setup, settings);
  const ev = estimateEv(setup, pop.value, premium);
  const globalBlocks = scan?.decision?.status === 'eligible' ? [] : scan?.decision?.reasons || [];
  const riskClasses = riskClassForTicket({ setup, popPct: pop.value, ev, profile, globalBlocks, dataIssues });
  const edgeScore = edgeScoreForTicket({ setup, popPct: pop.value, ev, dataIssues, globalBlocks });
  const classification = classifyTicket({ setup, settings, globalBlocks, dataIssues, popPct: pop.value, ev, edgeScore, riskClasses });
  const tpSl = takeProfitStop(setup, premium);
  const legs = (setup.legs || []).map((leg) => ({ ...leg, text: legText(leg) }));
  const titleEmoji = classification === EDGE_CLASSIFICATIONS.CAPITAL_HEAVY ? '💰' : classification === EDGE_CLASSIFICATIONS.WAIT_TRIGGER ? '🟡' : '🔥';
  const riskClass = riskClasses.join(' / ');
  const ticket = {
    id: `${setup.symbol}-${String(setup.strategy || 'strategy').replace(/\W+/g, '-')}-${setup.expiration || 'no-exp'}-${legs.map((leg) => `${leg.side}-${leg.strike}-${leg.type}`).join('-')}`,
    symbol: setup.symbol,
    classification,
    riskClass,
    riskClasses,
    bias: biasFromStrategy(setup),
    strategy: setup.strategy,
    robinhoodAction: brokerAction(setup.strategy),
    expiration: setup.expiration,
    dte: setup.dte,
    legs,
    legsText: legs.map((leg) => leg.text).join(' / '),
    orderType: premium.type === 'credit' ? 'Limit Credit' : premium.type === 'debit' ? 'Limit Debit' : 'Limit',
    entryLimit: premium.text,
    entryLimitValue: premium.value,
    maxRisk: asNumber(setup.maxRisk),
    maxProfit: asNumber(setup.maxProfit),
    minProfitDollars: settings.minProfitDollars || 30,
    profitTargetOk: asNumber(setup.maxProfit) !== null && asNumber(setup.maxProfit) >= (settings.minProfitDollars || 30),
    collateralRequired: asNumber(setup.collateralRequired, asNumber(setup.maxRisk)),
    breakEven: getBreakevenText(setup),
    popEstimated: pop.value,
    popModel: pop.model,
    evEstimated: ev.value,
    evModel: ev.model,
    expectedProfit: ev.expectedProfit,
    expectedLoss: ev.expectedLoss,
    riskReward: asNumber(setup.riskReward) ?? (asNumber(setup.maxProfit) && asNumber(setup.maxRisk) ? round(asNumber(setup.maxProfit) / asNumber(setup.maxRisk), 2) : null),
    tapeProxy: setup.tapeProxy || null,
    roc: asNumber(setup.maxProfit) && asNumber(setup.collateralRequired, asNumber(setup.maxRisk)) ? round((asNumber(setup.maxProfit) / asNumber(setup.collateralRequired, asNumber(setup.maxRisk))) * 100, 2) : null,
    edgeScore,
    confidence: edgeScore >= 80 ? 'Alta' : edgeScore >= 65 ? 'Media' : 'Baja',
    takeProfit: tpSl.takeProfit,
    takeProfitValue: tpSl.takeProfitValue,
    stopLoss: tpSl.stopLoss,
    stopLossValue: tpSl.stopLossValue,
    invalidation: invalidationFor(setup),
    doNotEnterIf: doNotEnterRules(setup, premium),
    warnings: [...new Set([...(setup.blocks || []), ...dataIssues])],
    dataSource: setup.legs?.find((leg) => leg.source)?.source || setup.dataSource || scan?.market?.quotes?.find((quote) => quote.symbol === setup.symbol)?.source || 'No disponible',
    timestamp: scan?.asOf || new Date().toISOString(),
    sourceSetup: setup
  };
  ticket.notificationTitle = `${titleEmoji} ${ticket.symbol} — ${classification}`;
  ticket.notificationBody = [
    `${ticket.strategy} | POP ${pct(ticket.popEstimated)} | Risk: ${riskClass}`,
    `Exp: ${ticket.expiration} | ${ticket.legsText}`,
    `${ticket.entryLimit}`,
    `MaxRisk: ${dollars(ticket.maxRisk)} | MaxProfit est.: ${dollars(ticket.maxProfit)} | TP: ${ticket.takeProfitValue === null ? 'plan' : dollars(ticket.takeProfitValue)} | SL: ${ticket.stopLossValue === null ? 'plan' : dollars(ticket.stopLossValue)}`
  ].join('\n');
  return ticket;
}

function waitTriggerTicket(setup, scan, profile, settings) {
  const ticket = buildTradeTicket({ setup, scan, profile, settings });
  if ([EDGE_CLASSIFICATIONS.NO_READY, EDGE_CLASSIFICATIONS.NO_TRADE_REAL].includes(ticket.classification)) return null;
  return {
    ...ticket,
    classification: EDGE_CLASSIFICATIONS.WAIT_TRIGGER,
    notificationTitle: `🟡 ${ticket.symbol} — WAIT / TRIGGER`,
    notificationBody: [
      `${ticket.strategy} tentativa | POP ${pct(ticket.popEstimated)} | Esperar gatillo`,
      `Exp: ${ticket.expiration} | ${ticket.legsText}`,
      `${ticket.entryLimit}`,
      `No entrar antes de confirmacion tecnica.`
    ].join('\n')
  };
}

export function buildGuardianEdgeTicketScan(scan, settings = {}) {
  const edgeSettings = { ...DEFAULT_EDGE_PROFILE, ...(settings.guardian?.edgeMode || settings.edgeMode || {}) };
  const profile = scan.profile || {};
  const directSetups = [...(scan.opportunities || []), ...(scan.rejected || [])];
  const tickets = directSetups
    .filter(isDefinedRiskStrategy)
    .map((setup) => buildTradeTicket({ setup, scan, profile, settings: edgeSettings }))
    .filter((ticket) => ticket.classification !== EDGE_CLASSIFICATIONS.NO_TRADE_REAL)
    .sort((a, b) => CLASSIFICATION_PRIORITY[a.classification] - CLASSIFICATION_PRIORITY[b.classification] || b.edgeScore - a.edgeScore || (b.popEstimated ?? 0) - (a.popEstimated ?? 0));

  const triggerTickets = (scan.conditionalIdeas || [])
    .filter((setup) => setup.status === 'conditional' && isDefinedRiskStrategy(setup))
    .map((setup) => waitTriggerTicket(setup, scan, profile, edgeSettings))
    .filter(Boolean);

  const allTickets = [...tickets, ...triggerTickets]
    .filter((ticket, index, list) => list.findIndex((item) => item.id === ticket.id && item.classification === ticket.classification) === index)
    .sort((a, b) => CLASSIFICATION_PRIORITY[a.classification] - CLASSIFICATION_PRIORITY[b.classification] || b.edgeScore - a.edgeScore);

  const actionable = allTickets.filter((ticket) => [
    EDGE_CLASSIFICATIONS.EDGE_READY,
    EDGE_CLASSIFICATIONS.AGGRESSIVE_EDGE,
    EDGE_CLASSIFICATIONS.CAPITAL_HEAVY,
    EDGE_CLASSIFICATIONS.TRADE_CANDIDATE,
    EDGE_CLASSIFICATIONS.HIGH_POP_BAD_PAYOUT,
    EDGE_CLASSIFICATIONS.WAIT_TRIGGER
  ].includes(ticket.classification));

  const byBias = (bias) => actionable.find((ticket) => ticket.bias === bias) || null;
  return {
    profile: edgeSettings,
    dailyBest: actionable[0] || null,
    bestBullish: byBias('Bullish'),
    bestBearish: byBias('Bearish'),
    bestNeutral: byBias('Neutral'),
    tickets: allTickets,
    actionableTickets: actionable,
    notifyableTickets: actionable.filter((ticket) => {
      if (ticket.classification === EDGE_CLASSIFICATIONS.HIGH_POP_BAD_PAYOUT) return edgeSettings.allowVeryAggressive;
      if (ticket.classification === EDGE_CLASSIFICATIONS.WAIT_TRIGGER) return true;
      return (ticket.popEstimated ?? 0) >= edgeSettings.minPopToNotify || ticket.classification === EDGE_CLASSIFICATIONS.TRADE_CANDIDATE;
    }).slice(0, edgeSettings.maxAlertsPerHour),
    status: actionable[0] ? actionable[0].classification : EDGE_CLASSIFICATIONS.NO_READY,
    generatedAt: scan.asOf || new Date().toISOString()
  };
}
