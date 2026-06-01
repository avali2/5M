import { round } from './math.js';
import { netPremium, netGreeksProd, estimatePop, makeLeg, optionQuality } from './ticket-creator.js';

function byAbsDeltaTarget(target) {
  return (a, b) => Math.abs(Math.abs(a.delta) - target) - Math.abs(Math.abs(b.delta) - target);
}

function findLongBelow(shortOpt, puts, minW = 1, maxW = 20) {
  return puts.filter(p => p.strike < shortOpt.strike && shortOpt.strike - p.strike >= minW && shortOpt.strike - p.strike <= maxW)
    .sort((a, b) => Math.abs(shortOpt.strike - a.strike - 5) - Math.abs(shortOpt.strike - b.strike - 5))[0];
}

function findLongAbove(shortOpt, calls, minW = 1, maxW = 20) {
  return calls.filter(c => c.strike > shortOpt.strike && c.strike - shortOpt.strike >= minW && c.strike - shortOpt.strike <= maxW)
    .sort((a, b) => Math.abs(a.strike - shortOpt.strike - 5) - Math.abs(b.strike - shortOpt.strike - 5))[0];
}

export function buildCreditVerticals(ctx) {
  const { symbol, chain, spot, technicals, wyckoff, tape, volatility, settings, createTicket } = ctx;
  const puts = chain.filter(o => o.type === "PUT" && o.strike < spot && o.mid > 0.03).sort(byAbsDeltaTarget(0.22));
  const calls = chain.filter(o => o.type === "CALL" && o.strike > spot && o.mid > 0.03).sort(byAbsDeltaTarget(0.22));
  const tickets = [];
  const bullishOk = technicals.trend !== "BEAR_TREND" && wyckoff.bias !== "BEARISH";
  const bearishOk = technicals.trend !== "BULL_TREND" && wyckoff.bias !== "BULLISH";

  if (bullishOk) {
    for (const shortPut of puts.filter(p => Math.abs(p.delta) >= settings.creditDeltaMin && Math.abs(p.delta) <= settings.creditDeltaMax).slice(0, 5)) {
      const longPut = findLongBelow(shortPut, puts);
      if (!longPut) continue;
      tickets.push(createTicket({ symbol, strategy: "BULL_PUT_CREDIT_SPREAD", bias: "BULLISH", legs: [makeLeg("SELL", shortPut), makeLeg("BUY", longPut)], spot, technicals, wyckoff, tape, volatility, settings, notes: ["Prioridad #1: credit spread con riesgo definido."] }));
    }
  }

  if (bearishOk) {
    for (const shortCall of calls.filter(c => Math.abs(c.delta) >= settings.creditDeltaMin && Math.abs(c.delta) <= settings.creditDeltaMax).slice(0, 5)) {
      const longCall = findLongAbove(shortCall, calls);
      if (!longCall) continue;
      tickets.push(createTicket({ symbol, strategy: "BEAR_CALL_CREDIT_SPREAD", bias: "BEARISH", legs: [makeLeg("SELL", shortCall), makeLeg("BUY", longCall)], spot, technicals, wyckoff, tape, volatility, settings, notes: ["Prioridad #2: credit spread bajista."] }));
    }
  }
  return tickets;
}

export function buildIronCondors(ctx) {
  const { symbol, chain, spot, technicals, wyckoff, tape, volatility, settings, createTicket } = ctx;
  if (technicals.trend !== "RANGE" && technicals.momentum !== "neutral") return [];
  const puts = chain.filter(o => o.type === "PUT" && o.strike < spot).sort(byAbsDeltaTarget(0.16));
  const calls = chain.filter(o => o.type === "CALL" && o.strike > spot).sort(byAbsDeltaTarget(0.16));
  const tickets = [];
  for (const sp of puts.slice(0, 3)) {
    const lp = findLongBelow(sp, puts); if (!lp) continue;
    for (const sc of calls.slice(0, 3)) {
      const lc = findLongAbove(sc, calls); if (!lc) continue;
      tickets.push(createTicket({ symbol, strategy: "IRON_CONDOR", bias: "NEUTRAL", legs: [makeLeg("BUY", lp), makeLeg("SELL", sp), makeLeg("SELL", sc), makeLeg("BUY", lc)], spot, technicals, wyckoff, tape, volatility, settings, notes: ["Iron Condor: bull put + bear call."] }));
    }
  }
  return tickets;
}

export function buildDebitSpreads(ctx) {
  const { symbol, chain, spot, technicals, wyckoff, tape, volatility, settings, createTicket } = ctx;
  const tickets = [];
  if (technicals.trend === "BULL_TREND" || wyckoff.bias === "BULLISH") {
    const calls = chain.filter(o => o.type === "CALL" && o.strike >= spot).sort(byAbsDeltaTarget(0.55));
    const lc = calls[0], sc = calls.find(c => lc && c.strike > lc.strike);
    if (lc && sc) tickets.push(createTicket({ symbol, strategy: "CALL_DEBIT_SPREAD", bias: "BULLISH", legs: [makeLeg("BUY", lc), makeLeg("SELL", sc)], spot, technicals, wyckoff, tape, volatility, settings, notes: ["Debit spread alcista."] }));
  }
  if (technicals.trend === "BEAR_TREND" || wyckoff.bias === "BEARISH") {
    const puts = chain.filter(o => o.type === "PUT" && o.strike <= spot).sort(byAbsDeltaTarget(0.55));
    const lp = puts[0], sp = puts.find(p => lp && p.strike < lp.strike);
    if (lp && sp) tickets.push(createTicket({ symbol, strategy: "PUT_DEBIT_SPREAD", bias: "BEARISH", legs: [makeLeg("BUY", lp), makeLeg("SELL", sp)], spot, technicals, wyckoff, tape, volatility, settings, notes: ["Debit spread bajista."] }));
  }
  return tickets;
}

export { makeLeg };