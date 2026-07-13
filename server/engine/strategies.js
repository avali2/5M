import { clamp, mid, round } from '../lib/math.js';

const midpoint = (contract) => mid(contract.bid, contract.ask);

function contractLiquidity(contract, policy) {
  const price = midpoint(contract);
  if (!Number.isFinite(price) || price <= 0) return null;
  const spread = contract.ask - contract.bid;
  const spreadPct = spread / price;
  const score = clamp(
    10 - (spreadPct > 0.08 ? 3 : 0) - (contract.openInterest < 500 ? 2 : 0) - (contract.volume < 50 ? 2 : 0),
    0,
    10
  );
  return {
    acceptable: contract.openInterest >= policy.minOpenInterest &&
      contract.volume >= policy.minVolume &&
      spreadPct <= policy.maxBidAskPct,
    score,
    midpoint: price,
    spreadPct
  };
}

function targetShort(contracts, type, spot, policy) {
  const eligible = contracts.filter((contract) =>
    contract.type === type &&
    (type === 'put' ? contract.strike < spot : contract.strike > spot) &&
    Number.isFinite(contract.delta) &&
    Math.abs(contract.delta) >= policy.minShortDelta &&
    Math.abs(contract.delta) <= policy.maxShortDelta &&
    contractLiquidity(contract, policy)?.acceptable
  );
  const target = policy.targetDelta || 0.2;
  return eligible.sort((a, b) => Math.abs(Math.abs(a.delta) - target) - Math.abs(Math.abs(b.delta) - target))[0] || null;
}

function protectiveLong(contracts, short, minWidth, policy) {
  const targetType = short.type;
  const choices = contracts.filter((contract) =>
    contract.type === targetType &&
    (targetType === 'put' ? contract.strike <= short.strike - minWidth : contract.strike >= short.strike + minWidth) &&
    contractLiquidity(contract, { ...policy, minOpenInterest: 1, minVolume: 0 })?.midpoint
  );
  return choices.sort((a, b) => Math.abs(a.strike - short.strike) - Math.abs(b.strike - short.strike))[0] || null;
}

function minimumWingWidth(contracts, type, policy) {
  const strikes = [...new Set(contracts
    .filter((contract) => contract.type === type && Number.isFinite(contract.strike))
    .map((contract) => Number(contract.strike)))]
    .sort((left, right) => left - right);
  const spacings = strikes.slice(1).map((strike, index) => strike - strikes[index]).filter((spacing) => spacing > 0);
  const chainSpacing = spacings.length ? Math.min(...spacings) : 0.5;
  const configured = Number(policy.minSpreadWidth);
  return Number.isFinite(configured) && configured > 0 ? Math.max(chainSpacing, configured) : chainSpacing;
}

function leg(side, contract) {
  return {
    side,
    type: contract.type.toUpperCase(),
    strike: contract.strike,
    symbol: contract.symbol,
    bid: contract.bid,
    ask: contract.ask,
    mid: round(midpoint(contract)),
    delta: round(contract.delta, 3),
    gamma: round(contract.gamma, 5),
    theta: round(contract.theta, 3),
    vega: round(contract.vega, 3),
    openInterest: contract.openInterest,
    volume: contract.volume
  };
}

function baseCreditSetup({ symbol, strategy, expiration, legs, credit, width, pop, theta, liquidityScore, bias }) {
  const maxProfit = round(credit * 100, 0);
  const maxRisk = round((width - credit) * 100, 0);
  const signedGreek = (greek) => round(legs.reduce((sum, item) => sum + (item.side === 'BUY' ? 1 : -1) * (item[greek] || 0), 0), greek === 'gamma' ? 5 : 3);
  let breakevens = [];
  if (strategy.includes('Bull Put') || strategy === 'Cash Secured Put') breakevens = [round(legs[0].strike - credit)];
  if (strategy.includes('Bear Call')) breakevens = [round(legs[0].strike + credit)];
  if (strategy.includes('Iron Condor')) breakevens = [round(legs[0].strike - credit), round(legs[2].strike + credit)];
  return {
    symbol,
    strategy,
    expiration,
    strikes: legs.map((item) => item.strike).join(' / '),
    legs,
    credit: round(credit),
    maxProfit,
    maxRisk,
    maxLoss: maxRisk,
    collateralRequired: maxRisk,
    returnOnRisk: maxRisk > 0 ? round(maxProfit / maxRisk * 100, 1) : null,
    riskReward: maxRisk > 0 ? round(maxProfit / maxRisk, 2) : null,
    pop: round(pop, 0),
    probabilityOfProfit: round(pop, 0),
    delta: round(Math.max(...legs.filter((item) => item.side === 'SELL').map((item) => Math.abs(item.delta))), 3),
    netDelta: signedGreek('delta'),
    gamma: signedGreek('gamma'),
    theta: Number.isFinite(theta) ? round(theta, 3) : signedGreek('theta'),
    vega: signedGreek('vega'),
    breakevens,
    creditWidthRatio: round(credit / width * 100, 1),
    liquidityScore: round(liquidityScore, 1),
    institutionalBias: bias,
    takeProfit: 'Close at 50% of credit',
    stopLoss: 'Close at 2x credit or risk gate breach'
  };
}

export function generateDefinedRiskSetups({ symbol, spot, expiration, chain, trend, policy, condorOnly = false, strategyPrefix = '' }) {
  const putWidth = minimumWingWidth(chain, 'put', policy);
  const callWidth = minimumWingWidth(chain, 'call', policy);
  const putShort = targetShort(chain, 'put', spot, policy);
  const callShort = targetShort(chain, 'call', spot, policy);
  const setups = [];
  let bullPut = null;
  let bearCall = null;

  if (putShort) {
    const putLong = protectiveLong(chain, putShort, putWidth, policy);
    if (putLong) {
      const credit = midpoint(putShort) - midpoint(putLong);
      const width = putShort.strike - putLong.strike;
      if (credit > 0.04 && credit < width) {
        const liquidityScore = (contractLiquidity(putShort, policy).score + contractLiquidity(putLong, { ...policy, minOpenInterest: 1, minVolume: 0 }).score) / 2;
        bullPut = baseCreditSetup({
          symbol,
          strategy: `${strategyPrefix}Bull Put Spread`.trim(),
          expiration,
          legs: [leg('SELL', putShort), leg('BUY', putLong)],
          credit,
          width,
          pop: (1 - Math.abs(putShort.delta)) * 100,
          theta: -(putShort.theta - putLong.theta),
          liquidityScore,
          bias: trend === 'bullish' ? 'Bullish' : 'Neutral-to-bullish'
        });
        if (!condorOnly) setups.push(bullPut);
      }
    }
  }
  if (callShort) {
    const callLong = protectiveLong(chain, callShort, callWidth, policy);
    if (callLong) {
      const credit = midpoint(callShort) - midpoint(callLong);
      const width = callLong.strike - callShort.strike;
      if (credit > 0.04 && credit < width) {
        const liquidityScore = (contractLiquidity(callShort, policy).score + contractLiquidity(callLong, { ...policy, minOpenInterest: 1, minVolume: 0 }).score) / 2;
        bearCall = baseCreditSetup({
          symbol,
          strategy: `${strategyPrefix}Bear Call Spread`.trim(),
          expiration,
          legs: [leg('SELL', callShort), leg('BUY', callLong)],
          credit,
          width,
          pop: (1 - Math.abs(callShort.delta)) * 100,
          theta: -(callShort.theta - callLong.theta),
          liquidityScore,
          bias: trend === 'bearish' ? 'Bearish' : 'Neutral-to-bearish'
        });
        if (!condorOnly) setups.push(bearCall);
      }
    }
  }
  if (bullPut && bearCall && trend === 'range') {
    const totalCredit = bullPut.credit + bearCall.credit;
    const maxWidth = Math.max(
      bullPut.legs[0].strike - bullPut.legs[1].strike,
      bearCall.legs[1].strike - bearCall.legs[0].strike
    );
    setups.push(baseCreditSetup({
      symbol,
      strategy: `${strategyPrefix}Iron Condor`.trim(),
      expiration,
      legs: [...bullPut.legs, ...bearCall.legs],
      credit: totalCredit,
      width: maxWidth,
      pop: 100 - ((100 - bullPut.pop) + (100 - bearCall.pop)),
      theta: bullPut.theta + bearCall.theta,
      liquidityScore: (bullPut.liquidityScore + bearCall.liquidityScore) / 2,
      bias: 'Neutral / range'
    }));
  }
  return setups;
}

export function generateBrokenWingCondor({ symbol, spot, expiration, chain, trend, policy }) {
  if (trend !== 'range') return [];
  const condor = generateDefinedRiskSetups({ symbol, spot, expiration, chain, trend, policy })
    .find((setup) => setup.strategy === 'Iron Condor');
  if (!condor) return [];
  const shortPut = chain.find((contract) => contract.type === 'put' && contract.strike === condor.legs[0].strike);
  const originalPutLong = condor.legs[1];
  const shortCall = chain.find((contract) => contract.type === 'call' && contract.strike === condor.legs[2].strike);
  const callLong = chain.find((contract) => contract.type === 'call' && contract.strike === condor.legs[3].strike);
  const widerPutLong = chain.filter((contract) =>
    contract.type === 'put' &&
    contract.strike < originalPutLong.strike &&
    midpoint(contract) > 0
  ).sort((a, b) => b.strike - a.strike)[0];
  if (![shortPut, widerPutLong, shortCall, callLong].every(Boolean)) return [];
  const credit = midpoint(shortPut) + midpoint(shortCall) - midpoint(widerPutLong) - midpoint(callLong);
  const putWidth = shortPut.strike - widerPutLong.strike;
  const callWidth = callLong.strike - shortCall.strike;
  const maxWidth = Math.max(putWidth, callWidth);
  if (!(credit > 0.04 && credit < maxWidth)) return [];
  const setup = baseCreditSetup({
    symbol,
    strategy: 'Broken Wing Iron Condor',
    expiration,
    legs: [leg('SELL', shortPut), leg('BUY', widerPutLong), leg('SELL', shortCall), leg('BUY', callLong)],
    credit,
    width: maxWidth,
    pop: condor.pop,
    theta: condor.theta,
    liquidityScore: condor.liquidityScore,
    bias: 'Neutral / asymmetric range'
  });
  return [{ ...setup, wingWidths: { put: putWidth, call: callWidth } }];
}

function longDebitTarget(contracts, type, spot) {
  return contracts.filter((contract) =>
    contract.type === type && Number.isFinite(contract.delta) && Math.abs(contract.delta) >= 0.45 &&
    Math.abs(contract.delta) <= 0.6 && (type === 'call' ? contract.strike >= spot * 0.98 : contract.strike <= spot * 1.02) &&
    midpoint(contract) > 0
  ).sort((a, b) => Math.abs(Math.abs(a.delta) - 0.52) - Math.abs(Math.abs(b.delta) - 0.52))[0] || null;
}

export function generateVolatilityDebitSpread({ symbol, spot, expiration, chain, trend }) {
  if (!['bullish', 'bearish'].includes(trend)) return [];
  const type = trend === 'bullish' ? 'call' : 'put';
  const long = longDebitTarget(chain, type, spot);
  if (!long) return [];
  const short = chain.filter((contract) =>
    contract.type === type &&
    (type === 'call' ? contract.strike > long.strike : contract.strike < long.strike) &&
    Number.isFinite(midpoint(contract)) && Math.abs(contract.delta) >= 0.18 && Math.abs(contract.delta) <= 0.35
  ).sort((a, b) => Math.abs(Math.abs(a.delta) - 0.25) - Math.abs(Math.abs(b.delta) - 0.25))[0];
  if (!short) return [];
  const debit = midpoint(long) - midpoint(short);
  const width = Math.abs(short.strike - long.strike);
  if (!(debit > 0 && debit < width)) return [];
  const legs = [leg('BUY', long), leg('SELL', short)];
  const maxLoss = round(debit * 100, 0);
  const maxProfit = round((width - debit) * 100, 0);
  return [{
    symbol,
    strategy: trend === 'bullish' ? 'Call Debit Spread' : 'Put Debit Spread',
    expiration,
    strikes: legs.map((item) => item.strike).join(' / '),
    legs,
    debit: round(debit),
    credit: null,
    maxProfit,
    maxRisk: maxLoss,
    maxLoss,
    collateralRequired: maxLoss,
    returnOnRisk: round(maxProfit / maxLoss * 100, 1),
    riskReward: round(maxProfit / maxLoss, 2),
    pop: round(Math.abs(long.delta) * 100, 0),
    probabilityOfProfit: round(Math.abs(long.delta) * 100, 0),
    delta: round(Math.abs(long.delta), 3),
    netDelta: round(legs.reduce((sum, item) => sum + (item.side === 'BUY' ? 1 : -1) * item.delta, 0), 3),
    gamma: round((long.gamma || 0) - (short.gamma || 0), 5),
    theta: round((long.theta || 0) - (short.theta || 0), 3),
    vega: round((long.vega || 0) - (short.vega || 0), 3),
    breakevens: [round(type === 'call' ? long.strike + debit : long.strike - debit)],
    liquidityScore: 7,
    institutionalBias: trend === 'bullish' ? 'Bullish volatility expansion' : 'Bearish volatility expansion',
    takeProfit: 'Scale at 50% of max profit',
    stopLoss: 'Close at 50% of debit lost'
  }];
}

export function generateCashSecuredPut({ symbol, spot, expiration, chain, trend, policy, cashAvailable }) {
  const short = targetShort(chain, 'put', spot, policy);
  if (!short || short.strike * 100 > cashAvailable || trend === 'bearish') return [];
  const credit = midpoint(short);
  return [{
    symbol,
    strategy: 'Cash Secured Put',
    expiration,
    strikes: String(short.strike),
    legs: [leg('SELL', short)],
    credit: round(credit),
    maxProfit: round(credit * 100, 0),
    maxRisk: round((short.strike - credit) * 100, 0),
    maxLoss: round((short.strike - credit) * 100, 0),
    collateralRequired: round(short.strike * 100, 0),
    returnOnRisk: round(credit / (short.strike - credit) * 100, 1),
    pop: round((1 - Math.abs(short.delta)) * 100, 0),
    probabilityOfProfit: round((1 - Math.abs(short.delta)) * 100, 0),
    delta: round(Math.abs(short.delta), 3),
    theta: round(-short.theta, 3),
    gamma: round(-short.gamma, 5),
    vega: round(-short.vega, 3),
    breakevens: [round(short.strike - credit)],
    liquidityScore: contractLiquidity(short, policy).score,
    institutionalBias: trend === 'bullish' ? 'Bullish income' : 'Neutral income',
    takeProfit: 'Close at 50% of credit',
    stopLoss: 'Assignment-ready cash only; exit on thesis breach'
  }];
}

export function generateCoveredCall({ symbol, spot, expiration, chain, trend, policy, shares }) {
  if (Number(shares) < 100 || trend === 'bullish') return [];
  const short = targetShort(chain, 'call', spot, policy);
  if (!short) return [];
  const credit = midpoint(short);
  return [{
    symbol,
    strategy: 'Covered Call',
    expiration,
    strikes: String(short.strike),
    legs: [leg('SELL', short)],
    credit: round(credit),
    maxProfit: round(((short.strike - spot) + credit) * 100, 0),
    maxRisk: round((spot - credit) * 100, 0),
    maxLoss: round((spot - credit) * 100, 0),
    collateralRequired: 0,
    returnOnRisk: round(credit / spot * 100, 1),
    pop: round((1 - Math.abs(short.delta)) * 100, 0),
    probabilityOfProfit: round((1 - Math.abs(short.delta)) * 100, 0),
    delta: round(Math.abs(short.delta), 3),
    theta: round(-short.theta, 3),
    gamma: round(-short.gamma, 5),
    vega: round(-short.vega, 3),
    breakevens: [round(spot - credit)],
    liquidityScore: contractLiquidity(short, policy).score,
    institutionalBias: 'Income on existing shares',
    takeProfit: 'Close at 50% of credit or manage assignment',
    stopLoss: 'Covered shares required; do not convert to naked call'
  }];
}
