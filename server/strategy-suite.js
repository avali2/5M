/**
 * VALIDO 1M — Strategy Suite
 * Motor cuantitativo de estrategias de opciones.
 *
 * Prioridad absoluta: Credit Spreads (Bull Put → Bear Call → Iron Condor → Butterfly → Broken Wing)
 * Luego: CSP/CC/Wheel, Debit Spreads, Diagonals, 0DTE
 * Estrategias de riesgo indefinido: solo EDUCATIONAL_ONLY / BLOCKED
 *
 * Orden de ejecución:
 *   1. buildCreditVerticals()
 *   2. buildIronCondor / Butterfly / Broken Wing
 *   3. Cash Secured Put / Covered Call / Wheel
 *   4. buildDebitSpreads()
 *   5. buildDiagonals()
 *   6. build0DTE()
 *   7. buildEducational()
 */

import { clamp, mid, round } from './lib/math.js';

/* -------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------- */

function midpoint(c) {
  if (!c || !Number.isFinite(c.bid) || !Number.isFinite(c.ask)) return null;
  return (c.bid + c.ask) / 2;
}

function netGreeks(legs) {
  const grk = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  for (const l of legs) {
    const sign = l.action === 'SELL' ? -1 : 1;
    if (Number.isFinite(l.delta)) grk.delta += sign * l.delta;
    if (Number.isFinite(l.gamma)) grk.gamma += sign * l.gamma;
    if (Number.isFinite(l.theta)) grk.theta += sign * l.theta;
    if (Number.isFinite(l.vega)) grk.vega += sign * l.vega;
  }
  return {
    delta: round(grk.delta, 3),
    gamma: round(grk.gamma, 5),
    theta: round(grk.theta, 3),
    vega: round(grk.vega, 3)
  };
}

function normalizeChain(chain) {
  return chain
    .filter(o => o && o.strike && o.optionType && midpoint(o) !== null)
    .map(o => ({
      strike: o.strike,
      optionType: o.optionType === 'call' || o.optionType === 'CALL' ? 'call' : 'put',
      bid: o.bid,
      ask: o.ask,
      mid: midpoint(o),
      delta: Number(o.delta) || 0,
      gamma: Number(o.gamma) || 0,
      theta: Number(o.theta) || 0,
      vega: Number(o.vega) || 0,
      iv: Number(o.iv) || null,
      volume: Number(o.volume) || 0,
      openInterest: Number(o.openInterest) || 0,
      symbol: o.symbol || ''
    }));
}

function byDeltaTarget(target) {
  return (a, b) => Math.abs(Math.abs(a.delta) - target) - Math.abs(Math.abs(b.delta) - target);
}

function findLongBelow(shortLeg, options, minDist, maxDist) {
  return options
    .filter(o => o.optionType === shortLeg.optionType)
    .filter(o => o.strike < shortLeg.strike)
    .filter(o => shortLeg.strike - o.strike >= minDist && shortLeg.strike - o.strike <= maxDist)
    .sort((a, b) => b.strike - a.strike)[0] || null;
}

function findLongAbove(shortLeg, options, minDist, maxDist) {
  return options
    .filter(o => o.optionType === shortLeg.optionType)
    .filter(o => o.strike > shortLeg.strike)
    .filter(o => o.strike - shortLeg.strike >= minDist && o.strike - shortLeg.strike <= maxDist)
    .sort((a, b) => a.strike - b.strike)[0] || null;
}

function buildLeg(action, c) {
  return {
    action,
    qty: 1,
    type: c.optionType.toUpperCase(),
    strike: c.strike,
    bid: c.bid,
    ask: c.ask,
    mid: round(c.mid, 2),
    delta: round(c.delta, 3),
    gamma: round(c.gamma, 5),
    theta: round(c.theta, 3),
    vega: round(c.vega, 3),
    iv: c.iv ? round(c.iv, 3) : null,
    oi: c.openInterest,
    volume: c.volume,
    optionSymbol: c.symbol
  };
}

function liquidityScore(shortLeg, longLeg) {
  const shortMid = midpoint(shortLeg);
  const longMid = midpoint(longLeg);
  if (!shortMid || !longMid) return { score: 0, spreadOk: false, oiOk: false, volOk: false };

  const shortSpread = (shortLeg.ask - shortLeg.bid) / shortMid;
  const longSpread = (longLeg.ask - longLeg.bid) / longMid;
  const oiOk = (shortLeg.openInterest || 0) >= 100 && (longLeg.openInterest || 0) >= 50;
  const volOk = (shortLeg.volume || 0) >= 10 || (longLeg.volume || 0) >= 10;
  const spreadOk = shortSpread <= 0.25 && longSpread <= 0.35;

  let score = 0;
  if (spreadOk) score += 45;
  if (oiOk) score += 35;
  if (volOk) score += 20;

  return { score, spreadOk, oiOk, volOk };
}

function riskBudgetFromSettings(settings) {
  const accountSize = Number(settings?.accountSize || 2000);
  const riskPct = Number(settings?.riskPct || 2);
  return accountSize * (riskPct / 100);
}

function classify({ dataQuality, pop, liquidity, maxRisk, riskBudget, technicalOk }) {
  if (dataQuality !== 'OK') return 'NO_TRADE';
  if (!Number.isFinite(maxRisk) || maxRisk <= 0) return 'NO_TRADE';
  if (maxRisk > riskBudget) return 'NO_TRADE';

  const liquid = liquidity?.spreadOk && liquidity?.oiOk;
  const liquidEnough = (liquidity?.score || 0) >= 50;

  if (!liquid || !liquidEnough) return 'CANDIDATE';
  if (!technicalOk) return 'CANDIDATE';
  if (pop >= 0.70 && (liquidity?.score || 0) >= 80) return 'READY';
  if (pop >= 0.67 && (liquidity?.score || 0) >= 65) return 'AGGRESSIVE';
  if (pop >= 0.65) return 'CANDIDATE';

  return 'NO_TRADE';
}

function makeTicket(data) {
  const scoreBasis = Math.round(
    Number(data.pop || 0) * 60 +
    Number(data.liquidity?.score || 0) * 0.4 +
    Number(data.technicalScore || 50) * 0.15
  );

  return {
    ...data,
    score: Math.min(100, scoreBasis),
    dataSource: 'TRADIER',
    tags: data.tags || []
  };
}

/* =========================================================
   STRATEGY PRIORITY MATRIX
========================================================= */

export const OPTION_STRATEGY_CATALOG = [
  { name: "Bull Put Credit Spread",       category: "CREDIT",     priority: 100, riskType: "DEFINED_RISK",                    enabledForRealSignals: true },
  { name: "Bear Call Credit Spread",       category: "CREDIT",     priority: 98,  riskType: "DEFINED_RISK",                    enabledForRealSignals: true },
  { name: "Iron Condor",                  category: "CREDIT",     priority: 94,  riskType: "DEFINED_RISK",                    enabledForRealSignals: true },
  { name: "Iron Butterfly",               category: "CREDIT",     priority: 92,  riskType: "DEFINED_RISK",                    enabledForRealSignals: true },
  { name: "Broken Wing Condor",           category: "CREDIT",     priority: 90,  riskType: "DEFINED_RISK",                    enabledForRealSignals: true },
  { name: "Broken Wing Butterfly",        category: "CREDIT",     priority: 88,  riskType: "DEFINED_RISK",                    enabledForRealSignals: true },
  { name: "Cash Secured Put",            category: "CREDIT",     priority: 86,  riskType: "CASH_SECURED_ASSIGNMENT_RISK",   enabledForRealSignals: true },
  { name: "Covered Call",                category: "CREDIT",     priority: 84,  riskType: "COVERED_ASSIGNMENT_RISK",        enabledForRealSignals: true },
  { name: "Wheel",                       category: "CREDIT",     priority: 82,  riskType: "CASH_SECURED_OR_COVERED",        enabledForRealSignals: true },
  { name: "Jade Lizard",                 category: "CREDIT",     priority: 80,  riskType: "CASH_SECURED_OR_PROTECTED",      enabledForRealSignals: true },
  { name: "Covered Strangle",            category: "CREDIT",     priority: 78,  riskType: "COVERED_AND_CASH_SECURED",       enabledForRealSignals: true },
  { name: "Bull Call Debit Spread",       category: "DEBIT",      priority: 70,  riskType: "DEFINED_RISK",                    enabledForRealSignals: true },
  { name: "Bear Put Debit Spread",        category: "DEBIT",      priority: 68,  riskType: "DEFINED_RISK",                    enabledForRealSignals: true },
  { name: "PMCC",                        category: "DIAGONAL",   priority: 65,  riskType: "DEFINED_OR_ASSIGNMENT_RISK",     enabledForRealSignals: true },
  { name: "Calendar Spread",             category: "CALENDAR",   priority: 60,  riskType: "DEFINED_RISK",                    enabledForRealSignals: true },
  { name: "Diagonal Spread",             category: "DIAGONAL",   priority: 58,  riskType: "DEFINED_OR_ASSIGNMENT_RISK",     enabledForRealSignals: true },
  { name: "0DTE Gamma Engine",           category: "0DTE",       priority: 55,  riskType: "DEFINED_RISK_HIGH_GAMMA",         enabledForRealSignals: true },
  { name: "Long Call",                   category: "DEBIT",      priority: 45,  riskType: "DEFINED_RISK",                    enabledForRealSignals: false },
  { name: "Long Put",                    category: "DEBIT",      priority: 44,  riskType: "DEFINED_RISK",                    enabledForRealSignals: false },
  { name: "Long Straddle",               category: "VOLATILITY",  priority: 42,  riskType: "DEFINED_RISK",                    enabledForRealSignals: false },
  { name: "Long Strangle",               category: "VOLATILITY",  priority: 41,  riskType: "DEFINED_RISK",                    enabledForRealSignals: false },
  { name: "Short Straddle",              category: "CREDIT",     priority: 25,  riskType: "UNDEFINED_RISK",                   enabledForRealSignals: false, status: "EDUCATIONAL_ONLY_BLOCKED" },
  { name: "Short Strangle",              category: "CREDIT",     priority: 24,  riskType: "UNDEFINED_RISK",                   enabledForRealSignals: false, status: "EDUCATIONAL_ONLY_BLOCKED" },
  { name: "Naked Call",                  category: "CREDIT",     priority: 1,   riskType: "UNDEFINED_RISK",                   enabledForRealSignals: false, status: "BLOCKED_UNDEFINED_RISK" },
  { name: "Naked Put",                   category: "CREDIT",     priority: 1,   riskType: "UNDEFINED_RISK",                   enabledForRealSignals: false, status: "BLOCKED_UNDEFINED_RISK" }
];

export function strategyPriority(strategy = '') {
  const s = String(strategy).toLowerCase();
  if (s.includes('bull put credit')) return 100;
  if (s.includes('bear call credit')) return 98;
  if (s.includes('iron condor')) return 94;
  if (s.includes('iron butterfly')) return 92;
  if (s.includes('broken wing')) return 90;
  if (s.includes('cash secured put')) return 86;
  if (s.includes('covered call')) return 84;
  if (s.includes('wheel')) return 82;
  if (s.includes('debit spread') || s.includes('call debit') || s.includes('put debit')) return 70;
  if (s.includes('pmcc')) return 65;
  if (s.includes('calendar')) return 60;
  if (s.includes('diagonal')) return 58;
  if (s.includes('0dte')) return 55;
  if (s.includes('straddle')) return 40;
  if (s.includes('strangle')) return 38;
  if (s.includes('ratio') || s.includes('backspread')) return 35;
  return 20;
}

export function getStrategyMeta(name) {
  return OPTION_STRATEGY_CATALOG.find(s => s.name.toLowerCase() === name.toLowerCase()) || null;
}

/* =========================================================
   CREDIT VERTICALS — PRIORITY #1
   Bull Put Credit Spread + Bear Call Credit Spread
========================================================= */

export function buildCreditVerticals({
  symbol,
  spot,
  chain,
  expiration,
  dte,
  technicals,
  wyckoff,
  settings = {}
}) {
  const options = normalizeChain(chain).filter(
    o => o.delta !== 0 && o.mid !== null && o.bid !== null && o.ask !== null && o.strike !== null
  );

  const riskBudget = riskBudgetFromSettings(settings);
  const tickets = [];

  const trend = technicals?.trend || 'RANGE';
  const momentum = technicals?.momentum || 'NEUTRAL';
  const vwapBias = technicals?.vwapBias || 'VWAP_UNKNOWN';
  const wyckoffBias = wyckoff?.bias || 'NEUTRAL';

  const bullishContext = trend !== 'BEARISH' && momentum !== 'BEARISH' && vwapBias !== 'BELOW_VWAP' && wyckoffBias !== 'BEARISH';
  const bearishContext = trend !== 'BULLISH' && momentum !== 'BULLISH' && vwapBias !== 'ABOVE_VWAP' && wyckoffBias !== 'BULLISH';
  const neutralContext = trend === 'RANGE' || momentum === 'NEUTRAL' || wyckoffBias === 'NEUTRAL';

  const puts = options
    .filter(o => o.optionType === 'put')
    .filter(o => o.delta < 0)
    .filter(o => Math.abs(o.delta) >= 0.12 && Math.abs(o.delta) <= 0.35)
    .sort(byDeltaTarget(0.22));

  const calls = options
    .filter(o => o.optionType === 'call')
    .filter(o => o.delta > 0)
    .filter(o => Math.abs(o.delta) >= 0.12 && Math.abs(o.delta) <= 0.35)
    .sort(byDeltaTarget(0.22));

  function buildOne({ shortLeg, longLeg, side }) {
    if (!shortLeg || !longLeg) return null;

    const credit = shortLeg.mid - longLeg.mid;
    const width = Math.abs(shortLeg.strike - longLeg.strike);
    const maxProfit = credit * 100;
    const maxRisk = width * 100 - maxProfit;

    if (!Number.isFinite(credit) || credit <= 0.05) return null;
    if (!Number.isFinite(width) || width <= 0) return null;
    if (!Number.isFinite(maxRisk) || maxRisk <= 0) return null;

    const isPut = side === 'put';
    const pop = clamp(1 - Math.abs(shortLeg.delta), 0.50, 0.88);
    const liquidity = liquidityScore(shortLeg, longLeg);
    const technicalOk = isPut ? bullishContext || neutralContext : bearishContext || neutralContext;

    const classification = classify({
      dataQuality: 'OK',
      pop,
      liquidity,
      maxRisk,
      riskBudget,
      technicalOk
    });

    const legs = [buildLeg('SELL', shortLeg), buildLeg('BUY', longLeg)];
    const breakeven = isPut ? shortLeg.strike - credit : shortLeg.strike + credit;
    const ev = pop * maxProfit - (1 - pop) * maxRisk;

    const greeks = netGreeks(legs);
    const scoreBasis = Math.round(
      pop * 60 + (liquidity.score || 0) * 0.4 + (technicalOk ? 78 : 42) * 0.15
    );

    return {
      id: `${symbol}-${isPut ? 'BULL-PUT-CREDIT' : 'BEAR-CALL-CREDIT'}-${expiration}-${shortLeg.strike}-${longLeg.strike}`,
      strategy: isPut ? 'Bull Put Credit Spread' : 'Bear Call Credit Spread',
      symbol,
      bias: isPut ? 'Bullish / neutral income' : 'Bearish / neutral income',
      expiration,
      dte,
      entry: `Vender spread por crédito límite ≥ $${credit.toFixed(2)}`,
      legs,
      credit: round(credit, 2),
      debit: null,
      width,
      maxRisk: Math.round(maxRisk),
      maxProfit: Math.round(maxProfit),
      breakeven: round(breakeven, 2),
      pop: round(pop, 2),
      ev: round(ev, 0),
      greeks,
      liquidity,
      technicalScore: technicalOk ? 78 : 42,
      classification,
      score: Math.min(100, scoreBasis),
      takeProfit: 'Cerrar al 40%-60% del crédito recibido. No esperar expiración si ya capturó theta.',
      stopLoss: 'Cerrar si el spread vale 1.8x-2.0x el crédito recibido o si el precio rompe invalidación.',
      invalidation: isPut
        ? `Invalidar si pierde soporte, VWAP o se acerca al breakeven $${round(breakeven, 2)}.`
        : `Invalidar si rompe resistencia, VWAP o se acerca al breakeven $${round(breakeven, 2)}.`,
      thesis: isPut
        ? 'Credit spread principal: vender put OTM y comprar put más abajo para limitar riesgo. Favorece mercado alcista, neutral o soporte institucional.'
        : 'Credit spread principal: vender call OTM y comprar call más arriba para limitar riesgo. Favorece mercado bajista, neutral o resistencia institucional.',
      dataSource: 'TRADIER',
      tags: ['priority-credit', 'defined-risk', 'theta-positive', isPut ? 'bull-put-spread' : 'bear-call-spread']
    };
  }

  // Construir Bull Put Credit Spreads
  for (const shortPut of puts.slice(0, 8)) {
    const longPut = findLongBelow(shortPut, options, 1, 15);
    const ticket = buildOne({ shortLeg: shortPut, longLeg: longPut, side: 'put' });
    if (ticket) tickets.push(ticket);
  }

  // Construir Bear Call Credit Spreads
  for (const shortCall of calls.slice(0, 8)) {
    const longCall = findLongAbove(shortCall, options, 1, 15);
    const ticket = buildOne({ shortLeg: shortCall, longLeg: longCall, side: 'call' });
    if (ticket) tickets.push(ticket);
  }

  return tickets
    .sort((a, b) => {
      const rank = { READY: 4, AGGRESSIVE: 3, CANDIDATE: 2, NO_TRADE: 1 };
      return (rank[b.classification] || 0) - (rank[a.classification] || 0) ||
             (b.score || 0) - (a.score || 0) ||
             (b.pop || 0) - (a.pop || 0);
    })
    .slice(0, 10);
}

/* =========================================================
   RUN FULL STRATEGY SUITE
   Ejecuta todas las estrategias en orden de prioridad
========================================================= */

export function runFullStrategySuite({
  symbol,
  spot,
  chain,
  expirations = [],
  chainsByExpiration = {},
  technicals,
  wyckoff,
  profile,
  settings = {}
}) {
  const allTickets = [];
  const policy = settings.policy || {};

  // 1. Income expiration window (7-45 DTE)
  const incomeExp = expirations.find(e => e.dte >= 7 && e.dte <= 45) || expirations[0];

  if (incomeExp && chainsByExpiration[incomeExp.date]) {
    const chainNormalized = chainsByExpiration[incomeExp.date];

    // PRIORITY #1: Credit Verticals
    const creditVerticals = buildCreditVerticals({
      symbol,
      spot,
      chain: chainNormalized,
      expiration: incomeExp.date,
      dte: incomeExp.dte,
      technicals,
      wyckoff,
      settings
    });
    allTickets.push(...creditVerticals);

    // Iron Condor / Butterfly / Broken Wing (from existing strategies.js)
    if (typeof globalThis.generateDefinedRiskSetups === 'function') {
      const condors = globalThis.generateDefinedRiskSetups({
        symbol, spot, expiration: incomeExp.date, chain: chainNormalized,
        trend: technicals?.trend || 'RANGE',
        policy: { ...policy, minShortDelta: 0.12, maxShortDelta: 0.35 }
      });
      const ironCondors = condors.filter(s => s.strategy?.includes('Iron Condor'));
      allTickets.push(...ironCondors);
    }

    // Cash Secured Put / Covered Call
    if (typeof globalThis.generateCashSecuredPut === 'function') {
      const cashAvailable = (profile?.accountSize || 2000) * (policy.maxCollateralPct || 35) / 100;
      const csp = globalThis.generateCashSecuredPut({
        symbol, spot, expiration: incomeExp.date, chain: chainNormalized,
        trend: technicals?.trend || 'RANGE', policy, cashAvailable
      });
      allTickets.push(...csp);
    }

    if (typeof globalThis.generateCoveredCall === 'function') {
      const cc = globalThis.generateCoveredCall({
        symbol, spot, expiration: incomeExp.date, chain: chainNormalized,
        trend: technicals?.trend || 'RANGE', policy,
        shares: profile?.holdings?.[symbol] || 0
      });
      allTickets.push(...cc);
    }

    // Debit Spreads (volatility expansion)
    if (typeof globalThis.generateVolatilityDebitSpread === 'function') {
      const debits = globalThis.generateVolatilityDebitSpread({
        symbol, spot, expiration: incomeExp.date, chain: chainNormalized,
        trend: technicals?.trend || 'RANGE'
      });
      allTickets.push(...debits.map(d => ({ ...d, classification: d.maxRisk <= riskBudgetFromSettings(settings) ? 'CANDIDATE' : 'NO_TRADE' })));
    }
  }

  // 2. Short DTE (0DTE/1DTE)
  const shortExp = expirations.find(e => e.dte <= 1);
  if (shortExp && chainsByExpiration[shortExp.date]) {
    const shortChain = chainsByExpiration[shortExp.date];
    const shortCredits = buildCreditVerticals({
      symbol, spot, chain: shortChain, expiration: shortExp.date, dte: shortExp.dte,
      technicals, wyckoff, settings
    });
    allTickets.push(...shortCredits.map(t => ({
      ...t,
      strategy: `0DTE ${t.strategy}`,
      classification: t.classification === 'READY' ? 'AGGRESSIVE' : t.classification,
      tags: [...(t.tags || []), '0dte', 'high-gamma', 'guarded'],
      thesis: `${t.thesis || ''} ⚠️ 0DTE: gamma risk elevado, tamaño reducido obligatorio, stop ajustado. No abrir tarde ni sin invalidación clara.`
    })));
  }

  // Ranking final con prioridad de estrategia
  const validTickets = allTickets
    .filter(Boolean)
    .sort((a, b) => {
      const rank = { READY: 4, AGGRESSIVE: 3, CANDIDATE: 2, NO_TRADE: 1 };
      return (
        (rank[b.classification] || 0) - (rank[a.classification] || 0) ||
        strategyPriority(b.strategy) - strategyPriority(a.strategy) ||
        (b.score || 0) - (a.score || 0) ||
        (b.pop || 0) - (a.pop || 0)
      );
    });

  return validTickets;
}