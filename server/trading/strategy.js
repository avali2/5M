import { ema } from '../lib/indicators.js';

const eastern = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export const names = {
  BULL_PUT: 'Bull put credit spread',
  BEAR_CALL: 'Bear call credit spread',
  IRON_CONDOR: 'Iron condor'
};

export function easternTime(now) {
  const parts = Object.fromEntries(eastern.formatToParts(now).map(({ type, value }) => [type, value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: 60 * Number(parts.hour) + Number(parts.minute) };
}

export function daysLeft(expiration, day) {
  return Math.round((Date.parse(expiration) - Date.parse(day)) / 86400000);
}

export function fresh(value, now, delayMinutes = 0, ageMinutes = 2) {
  const age = now.getTime() - Date.parse(value);
  return age >= delayMinutes * 60000 - 10000 && age <= (delayMinutes + ageMinutes) * 60000;
}

export function trendFromHistory(history, day) {
  const byDate = new Map(history.filter(({ date, close }) => date < day && close > 0).map(bar => [bar.date, bar.close]));
  const points = [...byDate.keys()].sort().slice(-25);
  const closes = points.map(date => byDate.get(date));
  if (closes.length < 25 || daysLeft(day, points.at(-1)) > 5) return null;
  const center = ema(closes, 20);
  const move = closes.at(-1) / closes.at(-6) - 1;
  const distance = closes.at(-1) / center - 1;
  const returns = closes.slice(-21).slice(1).map((close, index) => Math.log(close / closes.at(-21 + index)));
  const average = returns.reduce((acc, item) => acc + item, 0) / returns.length;
  const volatility = Math.sqrt(252 * returns.reduce((acc, item) => acc + (item - average) ** 2, 0) / (returns.length - 1));
  let bias = 'INDEFINIDO';
  if (volatility <= 0.35) {
    if (move >= 0.007 && distance > 0) bias = 'ALCISTA';
    else if (move <= -0.007 && distance < 0) bias = 'BAJISTA';
    else if (Math.abs(move) < 0.007 && Math.abs(distance) <= 0.015) bias = 'LATERAL';
  }
  return { bias, volatility, ema20: center, return5: move };
}

export function hasBook(quote) {
  return quote?.bid > 0 && quote.ask >= quote.bid && quote.ask > 0;
}

function liquid(option) {
  return hasBook(option) && option.openInterest >= 25 && option.volume >= 1
    && (option.ask - option.bid) / ((option.ask + option.bid) / 2) <= 0.30;
}

function standardContract(option, root, expiration) {
  const suffix = `${expiration.slice(2).replaceAll('-', '')}${option.type === 'put' ? 'P' : 'C'}${String(Math.round(option.strike * 1000)).padStart(8, '0')}`;
  return option.contractSize === 100 && option.rootSymbol === root && option.symbol === root + suffix;
}

function verticals(chain, root, expiration, price, shortType, useDelta, now) {
  const legs = chain.filter(option => option.type === shortType && standardContract(option, root, expiration) && liquid(option));
  const candidates = [];
  for (const short of legs) {
    const distance = (shortType === 'put' ? price - short.strike : short.strike - price) / price;
    const delta = shortType === 'put' ? -short.delta : short.delta;
    if (distance < 0.006 || distance > 0.10) continue;
    if (useDelta && (short.delta === null || delta < 0.15 || delta > 0.32 || !fresh(short.greeksAt, now, 0, 100))) continue;
    if (!useDelta && (distance < 0.02 || distance > 0.07)) continue;
    for (const long of legs) {
      const width = shortType === 'put' ? short.strike - long.strike : long.strike - short.strike;
      if (width < 1 || width > 5 || short.bid - long.ask <= 0) continue;
      candidates.push({
        width, credit: short.bid - long.ask,
        legs: [{ ...short, direction: -1 }, { ...long, direction: 1 }]
      });
    }
  }
  return candidates.sort((a, b) => b.credit / b.width - a.credit / a.width).slice(0, 8);
}

export function spreadPricing(idea, minimumCreditRatio = 0.17) {
  const market = idea.legs.reduce((net, leg) => net + (leg.direction === -1 ? leg.bid : -leg.ask), 0);
  const credit = Math.floor(market * 100 + 1e-7) / 100;
  if (credit < 0.15 || credit < idea.width * minimumCreditRatio || credit > idea.width * 0.55) return null;
  const shortP = idea.legs.find(leg => leg.type === 'put' && leg.direction === -1);
  const shortC = idea.legs.find(leg => leg.type === 'call' && leg.direction === -1);
  return {
    ...idea, credit,
    maxProfitUsd: Math.round(credit * 100),
    maxRiskUsd: Math.round((idea.width - credit) * 100),
    breakEvens: [shortP && shortP.strike - credit, shortC && shortC.strike + credit].filter(Boolean),
    greeks: Object.fromEntries(['delta', 'gamma', 'theta', 'vega'].map(name => [
      name,
      idea.legs.every(leg => Number.isFinite(leg[name]))
        ? idea.legs.reduce((sum, leg) => sum + leg.direction * leg[name], 0) : null
    ]))
  };
}

export function buildSpreads({ chain, expiration, root, underlying, bias, now, useDelta, condor }) {
  const args = [chain, root, expiration, underlying.price];
  const puts = bias === 'ALCISTA' || (bias === 'LATERAL' && condor) ? verticals(...args, 'put', useDelta, now) : [];
  const calls = bias === 'BAJISTA' || (bias === 'LATERAL' && condor) ? verticals(...args, 'call', useDelta, now) : [];
  const pairs = [];
  if (bias === 'ALCISTA') pairs.push(...puts.map(item => ({ ...item, strategy: 'BULL_PUT' })));
  if (bias === 'BAJISTA') pairs.push(...calls.map(item => ({ ...item, strategy: 'BEAR_CALL' })));
  if (bias === 'LATERAL' && condor) {
    for (const put of puts) {
      for (const call of calls) {
        if (put.width !== call.width || put.legs[0].strike >= call.legs[0].strike) continue;
        pairs.push({ width: put.width, legs: [...put.legs, ...call.legs], strategy: 'IRON_CONDOR' });
      }
    }
  }
  return pairs.map(pair => spreadPricing({ ...pair, root, expiration, underlying: underlying.price }))
    .filter(Boolean).sort((a, b) => b.credit / b.width - a.credit / a.width);
}

export function repriceSpread(idea, quotes, now, delayMinutes, { closing = false } = {}) {
  const legs = idea.legs.map(leg => {
    const quote = quotes.find(item => item.symbol === leg.symbol);
    const currentBid = quote?.bid > 0 && quote.bidSize >= 1 && fresh(quote.bidAt, now, delayMinutes);
    const currentAsk = quote?.ask > 0 && quote.askSize >= 1 && fresh(quote.askAt, now, delayMinutes);
    if (closing) {
      if (leg.direction === -1 ? !currentAsk : !currentBid && !(quote?.bid === 0 && currentAsk)) return null;
    } else if (!hasBook(quote) || !currentBid || !currentAsk) return null;
    return { ...leg, bid: quote.bid, ask: quote.ask };
  });
  return legs.every(Boolean) ? { ...idea, legs } : null;
}

export function closingQuote(idea, entryCredit, dte) {
  const natural = idea.legs.reduce((net, leg) => net + (leg.direction === -1 ? leg.ask : -leg.bid), 0);
  const debit = Math.max(0.01, Math.ceil(natural * 100 - 1e-7) / 100);
  const reason = dte <= 7 ? 'VENCIMIENTO_CERCANO'
    : debit <= entryCredit * 0.5 ? 'OBJETIVO_DE_PRIMA'
      : debit >= entryCredit * 2 ? 'UMBRAL_DE_PERDIDA' : null;
  if (!reason) return null;
  return { debit: Math.min(idea.width, debit), reason };
}
