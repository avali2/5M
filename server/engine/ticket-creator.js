import { round, clamp, mean } from './math.js';

export function dte(expiration) {
  const exp = new Date(`${expiration}T16:00:00-04:00`);
  return Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86_400_000));
}

export function makeLeg(action, option, qty = 1) {
  return {
    action, quantity: qty, symbol: option.symbol, expiration: option.expiration,
    strike: option.strike, type: option.type, bid: option.bid, ask: option.ask,
    mid: option.mid, delta: option.delta, gamma: option.gamma, theta: option.theta,
    vega: option.vega, iv: option.iv, openInterest: option.openInterest, volume: option.volume
  };
}

export function netPremium(legs) {
  return legs.reduce((sum, l) => {
    const px = Number(l.mid || 0);
    return sum + (l.action === "SELL" ? px : -px) * l.quantity;
  }, 0);
}

export function netGreeksProd(legs) {
  const sign = l => l.action === "SELL" ? -1 : 1;
  return {
    delta: round(legs.reduce((s, l) => s + sign(l) * Number(l.delta || 0) * l.quantity, 0), 4),
    gamma: round(legs.reduce((s, l) => s + sign(l) * Number(l.gamma || 0) * l.quantity, 0), 4),
    theta: round(legs.reduce((s, l) => s + sign(l) * Number(l.theta || 0) * l.quantity, 0), 4),
    vega: round(legs.reduce((s, l) => s + sign(l) * Number(l.vega || 0) * l.quantity, 0), 4)
  };
}

export function estimatePop(strategy, legs) {
  const sp = legs.find(l => l.action === "SELL" && l.type === "PUT");
  const sc = legs.find(l => l.action === "SELL" && l.type === "CALL");
  if ((strategy === "BULL_PUT_CREDIT_SPREAD" || strategy === "CASH_SECURED_PUT") && sp?.delta != null) return round((1 - Math.abs(sp.delta)) * 100, 1);
  if (strategy === "BEAR_CALL_CREDIT_SPREAD" && sc?.delta != null) return round((1 - Math.abs(sc.delta)) * 100, 1);
  if (strategy?.includes("IRON") && sp?.delta != null && sc?.delta != null) return round((1 - Math.abs(sp.delta) - Math.abs(sc.delta)) * 100, 1);
  return null;
}

export function optionQuality(legs, settings) {
  let score = 100; const reasons = [];
  for (const leg of legs) {
    const m = leg.mid; const sp = m ? ((leg.ask - leg.bid) / m) * 100 : 999;
    if (!Number.isFinite(leg.delta) || !Number.isFinite(leg.gamma) || !Number.isFinite(leg.theta) || !Number.isFinite(leg.vega)) { score -= 35; reasons.push(`Greeks incompletos en ${leg.symbol}.`); }
    if (!m || m <= 0 || leg.ask < leg.bid) { score -= 35; reasons.push(`Bid/ask inválido en ${leg.symbol}.`); }
    if (sp > settings.maxBidAskPct) { score -= 20; reasons.push(`Bid/ask amplio ${round(sp, 1)}% en ${leg.symbol}.`); }
    if ((leg.openInterest || 0) < settings.minOpenInterest) { score -= 10; reasons.push(`OI bajo en ${leg.symbol}.`); }
    if ((leg.volume || 0) < settings.minOptionVolume) { score -= 5; reasons.push(`Volumen bajo en ${leg.symbol}.`); }
  }
  return { score: clamp(score, 0, 100), reasons };
}

export function classifyTicket(ticket, settings) {
  const blocked = [...(ticket.blockedReasons || [])];
  const maxTradeRisk = settings.accountSize * settings.maxRiskPct;
  const maxCollateral = settings.accountSize * settings.maxCollateralPct;
  if (!ticket.dataQuality.realData) blocked.push("Sin datos reales suficientes.");
  if (ticket.maxRisk == null || ticket.maxRisk <= 0) blocked.push("Riesgo máximo inválido.");
  if (ticket.maxRisk > maxTradeRisk) blocked.push(`Riesgo ${ticket.maxRisk} supera límite.`);
  if (ticket.collateral && ticket.collateral > maxCollateral) blocked.push(`Colateral supera límite.`);
  if ((ticket.optionsQuality?.score || 100) < 60) blocked.push("Calidad de opciones insuficiente.");
  if (ticket.strategyRisk === "UNDEFINED_RISK") blocked.push("Riesgo indefinido bloqueado.");
  if (blocked.length) return { ...ticket, classification: ticket.strategyRisk === "UNDEFINED_RISK" ? "EDUCATIONAL_ONLY" : "NO_TRADE", blockedReasons: blocked };
  if (ticket.score >= 78 && ticket.pop >= settings.minPopReady) return { ...ticket, classification: "ENTRAR_AHORA" };
  if (ticket.score >= 68 && ticket.pop >= settings.minPopCandidate) return { ...ticket, classification: "ESPERAR_CONFIRMACION" };
  if (ticket.score >= 58) return { ...ticket, classification: "WATCHLIST" };
  return { ...ticket, classification: "NO_TRADE", blockedReasons: ["Score insuficiente."] };
}

import { institutionalScore, technicalScoreForBias } from './scoring.js';

export function createTicket({ symbol, strategy, bias, strategyRisk = "DEFINED_RISK", legs, spot, technicals, wyckoff, tape, volatility, settings, notes = [] }) {
  const premium = netPremium(legs);
  const credit = premium > 0 ? premium : 0; const debit = premium < 0 ? Math.abs(premium) : 0;
  const strikes = legs.map(l => l.strike); const width = Math.max(...strikes) - Math.min(...strikes);
  const isCredit = credit > 0;
  const maxProfit = isCredit ? credit * 100 : Math.max(0, (width - debit) * 100);
  const maxRisk = isCredit ? Math.max(0, (width - credit) * 100) : debit * 100;
  const pop = estimatePop(strategy, legs) ?? 50;
  const ev = (pop / 100) * (isCredit ? maxProfit * 0.5 : maxProfit * 0.6) - (1 - pop / 100) * (isCredit ? Math.min(maxRisk, credit * 200) : maxRisk * 0.5);
  const oq = optionQuality(legs, settings);
  const ts = technicalScoreForBias(technicals, bias);
  const score = institutionalScore({ optionsScore: oq.score, volScore: volatility.score, techScore: ts, tapeScore: tape.score || 0, wyckoffScore: wyckoff.score || 0, macroScore: 70 });

  let breakEven = null;
  if (strategy === "BULL_PUT_CREDIT_SPREAD") { const s = legs.find(l => l.action === "SELL" && l.type === "PUT"); breakEven = s ? s.strike - credit : null; }
  else if (strategy === "BEAR_CALL_CREDIT_SPREAD") { const s = legs.find(l => l.action === "SELL" && l.type === "CALL"); breakEven = s ? s.strike + credit : null; }
  else breakEven = "MULTI_LEG_RANGE";

  const ticket = {
    id: `${symbol}-${strategy}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    symbol, strategy, strategyRisk, bias, spot, expiration: legs[0]?.expiration, dte: legs[0]?.expiration ? dte(legs[0].expiration) : null,
    legs, entry: isCredit ? `Vender por crédito límite ≥ $${round(credit, 2)}` : `Comprar por débito límite ≤ $${round(debit, 2)}`,
    credit: round(credit, 2), debit: round(debit, 2), maxRisk: round(maxRisk, 2), maxProfit: round(maxProfit, 2), collateral: round(maxRisk, 2),
    breakEven: typeof breakEven === "number" ? round(breakEven, 2) : breakEven, pop: round(pop, 1), ev: round(ev, 2), greeks: netGreeksProd(legs),
    score, optionsQuality: oq, volatility, technicals, wyckoff, tape,
    takeProfit: isCredit ? "Cerrar al 40%-60% del crédito recibido." : "Tomar ganancia al 50%-70%.",
    stopLoss: isCredit ? "Cerrar si spread vale 1.8x-2.0x crédito." : "Cerrar si pierde 40%-50% del débito.",
    invalidation: bias === "BULLISH" ? `Invalida si pierde VWAP ${technicals?.vwap} o soporte ${technicals?.support}.` : bias === "BEARISH" ? `Invalida si rompe VWAP ${technicals?.vwap} o resistencia ${technicals?.resistance}.` : `Invalida si rompe rango.`,
    notes, dataQuality: { realData: true, hasGreeks: legs.every(l => Number.isFinite(l.delta) && Number.isFinite(l.gamma) && Number.isFinite(l.theta) && Number.isFinite(l.vega)), hasBidAsk: legs.every(l => Number.isFinite(l.bid) && Number.isFinite(l.ask)), source: "Tradier + optional Polygon" },
    warnings: [], blockedReasons: [], createdAt: new Date().toISOString()
  };
  return classifyTicket(ticket, settings);
}