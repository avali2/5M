import { toArray } from '../lib/http.js';

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstFinite(...values) {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function round(value, digits = 2) {
  const parsed = finiteNumber(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

export function maskTradierAccountId(accountId) {
  const value = String(accountId || '').trim();
  if (!value) return null;
  return `****${value.slice(-4)}`;
}

export function selectTradierAccountId(profile = {}, preferredAccountId = '') {
  if (String(preferredAccountId || '').trim()) return String(preferredAccountId).trim();
  const accounts = toArray(profile?.profile?.account || profile?.account);
  const active = accounts.find((account) => String(account?.status || '').toLowerCase() === 'active');
  return String(active?.account_number || accounts[0]?.account_number || '').trim() || null;
}

export function parseOccOptionSymbol(value) {
  const compact = String(value || '').toUpperCase().replaceAll(' ', '');
  const match = compact.match(/^([A-Z0-9./-]{1,6})(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  const [, root, date, callPut, strikeCode] = match;
  return {
    underlying: root.replaceAll('.', '/'),
    expiration: `20${date.slice(0, 2)}-${date.slice(2, 4)}-${date.slice(4, 6)}`,
    optionType: callPut === 'C' ? 'call' : 'put',
    strike: Number(strikeCode) / 1000
  };
}

export function normalizeTradierBalances(payload = {}) {
  const balances = payload?.balances || payload || {};
  const margin = balances.margin || {};
  const pdt = balances.pdt || {};
  const cash = balances.cash || {};
  const optionBuyingPower = firstFinite(
    margin.option_buying_power,
    pdt.option_buying_power,
    cash.cash_available,
    balances.total_cash
  );
  const stockBuyingPower = firstFinite(
    margin.stock_buying_power,
    pdt.stock_buying_power,
    cash.cash_available,
    balances.total_cash
  );
  const fedCall = firstFinite(margin.fed_call, pdt.fed_call, 0);
  const maintenanceCall = firstFinite(margin.maintenance_call, pdt.maintenance_call, 0);
  return {
    accountType: String(balances.account_type || (balances.margin ? 'margin' : balances.pdt ? 'pdt' : 'cash')).toLowerCase(),
    totalEquity: round(balances.total_equity),
    totalCash: round(balances.total_cash),
    cashAvailable: round(firstFinite(cash.cash_available, balances.total_cash)),
    optionBuyingPower: round(optionBuyingPower),
    stockBuyingPower: round(stockBuyingPower),
    openPl: round(balances.open_pl),
    closePl: round(balances.close_pl),
    marketValue: round(balances.market_value),
    optionLongValue: round(balances.option_long_value),
    optionShortValue: round(balances.option_short_value),
    currentRequirement: round(balances.current_requirement),
    optionRequirement: round(balances.option_requirement),
    pendingCash: round(balances.pending_cash),
    unclearedFunds: round(balances.uncleared_funds),
    pendingOrdersCount: Math.max(0, finiteNumber(balances.pending_orders_count, 0)),
    fedCall: round(fedCall),
    maintenanceCall: round(maintenanceCall),
    marginCall: fedCall > 0 || maintenanceCall > 0
  };
}

function quoteMark(quote = {}) {
  const bid = finiteNumber(quote.bid);
  const ask = finiteNumber(quote.ask);
  if (bid !== null && ask !== null && ask >= bid && (bid > 0 || ask > 0)) return (bid + ask) / 2;
  return firstFinite(quote.last, quote.price, quote.close);
}

export function normalizeTradierPosition(position = {}, quote = {}) {
  const brokerSymbol = String(position.symbol || '').trim().toUpperCase();
  const option = parseOccOptionSymbol(brokerSymbol);
  const quantity = finiteNumber(position.quantity, 0);
  const multiplier = option ? 100 : 1;
  const costBasis = finiteNumber(position.cost_basis);
  const mark = quoteMark(quote);
  const calculatedMarketValue = mark === null ? null : mark * quantity * multiplier;
  const marketValue = firstFinite(position.market_value, calculatedMarketValue);
  const openPnl = firstFinite(
    position.open_pl,
    marketValue !== null && costBasis !== null ? marketValue - costBasis : null
  );
  const units = Math.abs(quantity) * multiplier;
  return {
    id: String(position.id || brokerSymbol),
    brokerSymbol,
    symbol: option?.underlying || brokerSymbol,
    underlying: option?.underlying || brokerSymbol,
    securityType: option ? 'option' : 'equity',
    optionType: option?.optionType || null,
    expiration: option?.expiration || null,
    strike: option?.strike ?? null,
    quantity,
    side: quantity < 0 ? 'SHORT' : 'LONG',
    multiplier,
    costBasis: round(costBasis),
    entryPrice: units > 0 && costBasis !== null ? round(Math.abs(costBasis) / units, 4) : null,
    bid: round(quote.bid, 4),
    ask: round(quote.ask, 4),
    mark: round(mark, 4),
    marketValue: round(marketValue),
    openPnl: round(openPnl),
    dateAcquired: position.date_acquired || null,
    quoteTimestamp: quote.timestamp || null,
    source: 'tradier'
  };
}

function inferOptionStrategy(legs) {
  if (legs.length === 1) {
    const leg = legs[0];
    return `${leg.side === 'SHORT' ? 'Short' : 'Long'} ${leg.optionType === 'put' ? 'Put' : 'Call'}`;
  }
  if (legs.length === 2 && new Set(legs.map((leg) => leg.optionType)).size === 1) {
    const short = legs.find((leg) => leg.side === 'SHORT');
    const long = legs.find((leg) => leg.side === 'LONG');
    if (!short || !long) return 'Option vertical';
    if (short.optionType === 'put') return short.strike > long.strike ? 'Bull Put Credit Spread' : 'Bear Put Debit Spread';
    return short.strike < long.strike ? 'Bear Call Credit Spread' : 'Bull Call Debit Spread';
  }
  const puts = legs.filter((leg) => leg.optionType === 'put');
  const calls = legs.filter((leg) => leg.optionType === 'call');
  if (legs.length === 4 && puts.length === 2 && calls.length === 2 && legs.filter((leg) => leg.side === 'SHORT').length === 2) {
    return 'Iron Condor';
  }
  return `Multi-leg options (${legs.length} legs)`;
}

function optionGroupRisk(legs, costBasis, contracts) {
  if (!contracts || costBasis === null) return { maxRiskUsd: null, maxProfitUsd: null, definedRisk: false };
  const strategy = inferOptionStrategy(legs);
  const entryAmount = Math.abs(costBasis);
  if (legs.length === 1) {
    return legs[0].side === 'LONG'
      ? { maxRiskUsd: round(entryAmount), maxProfitUsd: null, definedRisk: true }
      : { maxRiskUsd: null, maxProfitUsd: null, definedRisk: false };
  }
  const putStrikes = legs.filter((leg) => leg.optionType === 'put').map((leg) => leg.strike);
  const callStrikes = legs.filter((leg) => leg.optionType === 'call').map((leg) => leg.strike);
  const widths = [putStrikes, callStrikes]
    .filter((strikes) => strikes.length >= 2)
    .map((strikes) => Math.max(...strikes) - Math.min(...strikes));
  const widthDollars = widths.length ? Math.max(...widths) * contracts * 100 : null;
  if (widthDollars === null) return { maxRiskUsd: null, maxProfitUsd: null, definedRisk: false };
  const creditStructure = /Credit|Iron Condor/i.test(strategy) || costBasis < 0;
  return creditStructure
    ? {
        maxRiskUsd: round(Math.max(0, widthDollars - entryAmount)),
        maxProfitUsd: round(entryAmount),
        definedRisk: true
      }
    : {
        maxRiskUsd: round(entryAmount),
        maxProfitUsd: round(Math.max(0, widthDollars - entryAmount)),
        definedRisk: true
      };
}

export function groupTradierPositions(positions = []) {
  const equityPositions = positions.filter((position) => position.securityType === 'equity');
  const longShares = new Map(equityPositions
    .filter((position) => position.quantity > 0)
    .map((position) => [position.symbol, position.quantity]));
  const equities = equityPositions.map((position) => ({
    id: `tradier-equity-${position.brokerSymbol}`,
    symbol: position.symbol,
    strategy: 'Equity position',
    source: 'tradier',
    readOnly: true,
    quantity: position.quantity,
    entryMark: position.entryPrice,
    currentMark: position.mark,
    costBasis: position.costBasis,
    marketValue: position.marketValue,
    openPnL: position.openPnl,
    openPnLPct: position.costBasis ? round(position.openPnl / Math.abs(position.costBasis) * 100) : null,
    expiration: null,
    legs: [position],
    definedRisk: position.quantity > 0
  }));
  const buckets = new Map();
  for (const position of positions.filter((item) => item.securityType === 'option')) {
    const key = `${position.underlying}|${position.expiration}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(position);
  }
  const optionGroups = [...buckets.entries()].map(([key, unsorted]) => {
    const legs = unsorted.slice().sort((left, right) =>
      String(left.optionType).localeCompare(String(right.optionType)) || Number(left.strike) - Number(right.strike)
    );
    const contracts = Math.min(...legs.map((leg) => Math.abs(leg.quantity)).filter((quantity) => quantity > 0));
    const costBasis = legs.every((leg) => leg.costBasis !== null) ? legs.reduce((sum, leg) => sum + leg.costBasis, 0) : null;
    const marketValue = legs.every((leg) => leg.marketValue !== null) ? legs.reduce((sum, leg) => sum + leg.marketValue, 0) : null;
    const openPnl = legs.every((leg) => leg.openPnl !== null) ? legs.reduce((sum, leg) => sum + leg.openPnl, 0) : null;
    const [symbol, expiration] = key.split('|');
    const inferredStrategy = inferOptionStrategy(legs);
    const coveredCall = legs.length === 1 &&
      legs[0].side === 'SHORT' &&
      legs[0].optionType === 'call' &&
      Number(longShares.get(symbol) || 0) >= contracts * 100;
    const strategy = coveredCall ? 'Covered Call' : inferredStrategy;
    const risk = coveredCall
      ? { maxRiskUsd: null, maxProfitUsd: round(Math.abs(costBasis || 0)), definedRisk: true }
      : optionGroupRisk(legs, costBasis, contracts);
    return {
      id: `tradier-options-${symbol}-${expiration}-${legs.map((leg) => leg.brokerSymbol).join('-')}`,
      symbol,
      underlying: symbol,
      strategy,
      source: 'tradier',
      readOnly: true,
      expiration,
      quantity: Number.isFinite(contracts) ? contracts : 1,
      strikes: legs.map((leg) => `${leg.side} ${leg.strike}${leg.optionType === 'put' ? 'P' : 'C'}`).join(' / '),
      entryMark: costBasis === null || !contracts ? null : round(Math.abs(costBasis) / (contracts * 100), 4),
      currentMark: marketValue === null || !contracts ? null : round(Math.abs(marketValue) / (contracts * 100), 4),
      costBasis: round(costBasis),
      marketValue: round(marketValue),
      openPnL: round(openPnl),
      openPnLPct: risk.maxRiskUsd && openPnl !== null ? round(openPnl / risk.maxRiskUsd * 100) : null,
      maxRiskUsd: risk.maxRiskUsd,
      maxProfitUsd: risk.maxProfitUsd,
      definedRisk: risk.definedRisk,
      legs
    };
  });
  return [...optionGroups, ...equities];
}

export function buildTradierAccountSnapshot({ accountId, balances, positions = [], quotes = [] } = {}) {
  const normalizedBalances = normalizeTradierBalances(balances);
  const quoteMap = new Map(toArray(quotes).map((quote) => [String(quote.symbol || '').toUpperCase(), quote]));
  const normalizedPositions = toArray(positions)
    .map((position) => normalizeTradierPosition(position, quoteMap.get(String(position.symbol || '').toUpperCase()) || {}))
    .filter((position) => position.brokerSymbol && position.quantity !== 0);
  const groupedPositions = groupTradierPositions(normalizedPositions);
  const holdings = Object.fromEntries(normalizedPositions
    .filter((position) => position.securityType === 'equity' && position.quantity > 0)
    .map((position) => [position.symbol, position.quantity]));
  return {
    status: 'ONLINE',
    source: 'tradier_read_only',
    readOnly: true,
    accountIdMasked: maskTradierAccountId(accountId),
    accountType: normalizedBalances.accountType,
    balances: normalizedBalances,
    positions: groupedPositions,
    rawPositions: normalizedPositions,
    holdings,
    activeSymbols: [...new Set(groupedPositions
      .filter((position) => position.expiration)
      .map((position) => position.symbol)
      .filter(Boolean))],
    asOf: new Date().toISOString()
  };
}
