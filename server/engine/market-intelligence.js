import { trendFromHistory, round } from '../lib/math.js';
import { deriveTechnicals } from './technicals.js';

const HIGH_IMPACT = /(fomc|federal reserve|powell|fed .*?(speech|speaks|minutes|meeting|decision|rate)|cpi|consumer price|nonfarm|nfp|payroll|employment|jobless|pce|interest rate|ppi|producer price)/i;
const CRITICAL_MACRO = /(fomc|cpi|consumer price|nonfarm|nfp|payroll|pce)/i;
const BREAKING_RISK = /(war|missile|attack|invasion|tariff|sanction|emergency|fed|powell|inflation|cpi|jobs report|payroll|fomc|iran|israel|russia|ukraine|china|taiwan|red sea|bank crisis|liquidity crisis|sec|doj|downgrade|upgrade|lawsuit|investigation|oil)/i;
const GEOPOLITICAL_RISK = /(war|missile|attack|invasion|sanction|iran|israel|russia|ukraine|china|taiwan|red sea|oil)/i;

function isHighImpactUnitedStatesEvent(event) {
  const country = String(event.country || '').toUpperCase().trim();
  const isUnitedStates = !country || ['US', 'USA', 'USD', 'UNITED STATES'].includes(country);
  const highImpact = String(event.impact || '').toLowerCase() === 'high' || HIGH_IMPACT.test(event.title || '');
  return isUnitedStates && highImpact;
}

export function classifyEventRisk(events, options = {}) {
  const now = Date.now();
  const blackoutMs = Number.isFinite(options.highImpactBlackoutHours) ? options.highImpactBlackoutHours * 3600000 : 90 * 60000;
  return events.filter((event) => {
    const timestamp = new Date(event.date).getTime();
    const withinCriticalWindow = Number.isFinite(timestamp) && timestamp >= now - 2 * 3600000 && timestamp <= now + blackoutMs;
    return isHighImpactUnitedStatesEvent(event) && CRITICAL_MACRO.test(event.title || '') && withinCriticalWindow;
  });
}

export function classifySoftEventRisk(events, options = {}) {
  const now = Date.now();
  const blackoutMs = Number.isFinite(options.highImpactBlackoutHours) ? options.highImpactBlackoutHours * 3600000 : 90 * 60000;
  const fedMs = Number.isFinite(options.fedEventCautionHours) ? options.fedEventCautionHours * 3600000 : 48 * 3600000;
  const cautionMs = Math.max(fedMs, Number.isFinite(options.mediumImpactCautionHours) ? options.mediumImpactCautionHours * 3600000 : 48 * 3600000);
  return events.filter((event) => {
    const timestamp = new Date(event.date).getTime();
    const withinSoftWindow = Number.isFinite(timestamp) && timestamp > now + blackoutMs && timestamp <= now + cautionMs;
    return isHighImpactUnitedStatesEvent(event) && withinSoftWindow;
  });
}

export function classifyNewsRisk(news, options = {}) {
  const cutoff = Date.now() - (Number.isFinite(options.newsLookbackHours) ? options.newsLookbackHours : 24) * 3600000;
  const blockScore = Number.isFinite(options.newsBlockScore) ? options.newsBlockScore : 80;
  const cautionScore = Number.isFinite(options.newsCautionScore) ? options.newsCautionScore : 65;
  return news.filter((item) => {
    const time = new Date(item.datetime).getTime();
    return Number.isFinite(time) && time >= cutoff && BREAKING_RISK.test(`${item.headline || ''} ${item.summary || ''}`);
  }).map((item) => {
    const text = `${item.headline || ''} ${item.summary || ''}`;
    const geopolitical = GEOPOLITICAL_RISK.test(text);
    const riskScore = geopolitical ? Math.max(blockScore, 85) : Math.max(cautionScore, /fed|powell|cpi|fomc|payroll/i.test(text) ? 75 : cautionScore);
    return {
      ...item,
      riskScore,
      riskType: geopolitical ? 'geopolitical' : 'market_news',
      blocksSignal: riskScore >= blockScore,
      caution: riskScore >= cautionScore
    };
  }).slice(0, 8);
}

export function computeGammaProxy(chain, spot) {
  if (!Number.isFinite(spot)) return { value: null, regime: 'unavailable', label: 'No chain data' };
  const usable = chain.filter((contract) => Number.isFinite(contract.gamma) && Number.isFinite(contract.openInterest));
  if (!usable.length) return { value: null, regime: 'unavailable', label: 'Greeks/OI unavailable' };
  const byStrike = new Map();
  const value = usable.reduce((sum, contract) => {
    const signed = contract.type === 'call' ? 1 : -1;
    const exposure = contract.gamma * contract.openInterest * 100 * spot * spot * 0.01;
    const row = byStrike.get(contract.strike) || { strike: contract.strike, callGamma: 0, putGamma: 0, netGamma: 0, callOi: 0, putOi: 0 };
    if (contract.type === 'call') {
      row.callGamma += exposure;
      row.callOi += contract.openInterest;
    } else {
      row.putGamma += exposure;
      row.putOi += contract.openInterest;
    }
    row.netGamma = row.callGamma - row.putGamma;
    byStrike.set(contract.strike, row);
    return sum + signed * exposure;
  }, 0);
  const profile = [...byStrike.values()].sort((a, b) => a.strike - b.strike).map((row) => ({
    ...row,
    callGamma: round(row.callGamma, 0),
    putGamma: round(row.putGamma, 0),
    netGamma: round(row.netGamma, 0)
  }));
  const callWall = profile.slice().sort((a, b) => b.callGamma - a.callGamma)[0] || null;
  const putWall = profile.slice().sort((a, b) => b.putGamma - a.putGamma)[0] || null;
  let gammaFlipLevel = null;
  for (let index = 1; index < profile.length; index += 1) {
    if (Math.sign(profile[index - 1].netGamma) !== Math.sign(profile[index].netGamma)) {
      const candidates = [profile[index - 1], profile[index]];
      gammaFlipLevel = candidates.sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0].strike;
      break;
    }
  }
  const pinningZones = profile.filter((row) => row.netGamma > 0)
    .sort((a, b) => Math.abs(b.netGamma) - Math.abs(a.netGamma))
    .slice(0, 3).map((row) => row.strike);
  return {
    value: round(value, 0),
    regime: value > 0 ? 'positive' : 'negative',
    callGamma: round(profile.reduce((sum, row) => sum + row.callGamma, 0), 0),
    putGamma: round(profile.reduce((sum, row) => sum + row.putGamma, 0), 0),
    gammaFlipLevel,
    walls: { call: callWall?.strike || null, put: putWall?.strike || null },
    pinningZones,
    profile,
    label: 'OI-weighted gamma proxy; not verified dealer positioning'
  };
}

export const REGIMES = {
  BULL_TREND: 'BULL_TREND',
  BEAR_TREND: 'BEAR_TREND',
  RANGE_BOUND: 'RANGE_BOUND',
  HIGH_VOLATILITY: 'HIGH_VOLATILITY',
  LOW_VOLATILITY: 'LOW_VOLATILITY',
  RISK_OFF: 'RISK_OFF',
  PANIC: 'PANIC',
  GAMMA_PINNED: 'GAMMA_PINNED'
};

export function detectMarketRegime({ vix, breadth, spyTechnical, qqqTechnical, gamma, macroRisk }) {
  if (vix >= 35) return REGIMES.PANIC;
  if (macroRisk && vix >= 25) return REGIMES.RISK_OFF;
  if (vix >= 25 || gamma?.regime === 'negative') return REGIMES.HIGH_VOLATILITY;
  if (gamma?.regime === 'positive' && spyTechnical?.trend === 'range') return REGIMES.GAMMA_PINNED;
  if (spyTechnical?.trend === 'bullish' && qqqTechnical?.trend === 'bullish' && breadth >= 55) return REGIMES.BULL_TREND;
  if (spyTechnical?.trend === 'bearish' && breadth < 45) return REGIMES.BEAR_TREND;
  if (vix < 14) return REGIMES.LOW_VOLATILITY;
  return REGIMES.RANGE_BOUND;
}

export async function loadMarketOverview({ providers, symbols }) {
  if (!providers.market) {
    return {
      quotes: [],
      breadth: null,
      sectorRotation: [],
      spyTrend: 'unavailable',
      vix: null,
      volatility: 'unavailable',
      regime: 'unavailable',
      errors: ['No market-data provider configured']
    };
  }
  const errors = [];
  let quotes = [];
  try {
    quotes = await providers.market.getQuotes([...new Set([...symbols, 'VIX'])]);
  } catch (error) {
    errors.push(error.message);
  }
  const quoteBySymbol = Object.fromEntries(quotes.map((quote) => [quote.symbol, quote]));
  const historicalSymbols = [...new Set(['SPY', 'QQQ', ...symbols.filter((symbol) => symbol.startsWith('XL'))])];
  const histories = {};
  await Promise.all(historicalSymbols.map(async (symbol) => {
    try {
      histories[symbol] = await providers.market.getHistory(symbol);
    } catch (error) {
      errors.push(error.message);
    }
  }));
  const spyTrend = trendFromHistory((histories.SPY || []).map((bar) => bar.close));
  const technicals = {
    SPY: deriveTechnicals(histories.SPY || []),
    QQQ: histories.QQQ ? deriveTechnicals(histories.QQQ) : null
  };
  const sectorRotation = Object.entries(histories).filter(([symbol]) => symbol !== 'SPY').map(([symbol, history]) => {
    const first = history.at(-21)?.close;
    const last = history.at(-1)?.close;
    return {
      symbol,
      return20d: Number.isFinite(first) && Number.isFinite(last) ? round(((last - first) / first) * 100) : null,
      trend: trendFromHistory(history.map((bar) => bar.close))
    };
  }).sort((a, b) => (b.return20d ?? -Infinity) - (a.return20d ?? -Infinity));
  const breadthHistories = await Promise.all(symbols.slice(0, 12).map(async (symbol) => {
    try {
      const history = histories[symbol] || await providers.market.getHistory(symbol);
      const closes = history.map((bar) => bar.close);
      const trend = trendFromHistory(closes);
      return trend === 'bullish';
    } catch {
      return null;
    }
  }));
  const resolvedBreadth = breadthHistories.filter((value) => value !== null);
  const breadth = resolvedBreadth.length ? round(resolvedBreadth.filter(Boolean).length / resolvedBreadth.length * 100, 0) : null;
  const vix = quoteBySymbol.VIX?.price ?? null;
  const volatility = !Number.isFinite(vix) ? 'unavailable' : vix >= 30 ? 'extreme' : vix >= 23 ? 'high' : vix <= 14 ? 'low' : 'normal';
  const regime = volatility === 'extreme' ? 'risk-off' :
    spyTrend === 'bullish' && volatility !== 'high' ? 'risk-on-trend' :
    spyTrend === 'bearish' ? 'defensive-trend' :
    volatility === 'high' ? 'volatile-transition' : 'range';
  return { quotes, breadth, sectorRotation, spyTrend, vix, volatility, regime, technicals, errors };
}
