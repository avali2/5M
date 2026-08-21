import crypto from 'node:crypto';
import { config } from '../config.js';
import { buildTechnicalContext } from './indicators.js';
import { finite, round } from './http.js';

const DAY = 86400000;

export function dateOnly(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function daysToExpiration(expiration, now = new Date()) {
  const expiry = dateOnly(`${expiration}T00:00:00Z`);
  const today = dateOnly(now);
  if (!expiry || !today) return null;
  return Math.round((expiry.getTime() - today.getTime()) / DAY);
}

export function chooseExpiration(expirations, policy = config.policy, now = new Date()) {
  const eligible = expirations
    .map((expiration) => ({ expiration, dte: daysToExpiration(expiration, now) }))
    .filter((item) => item.dte !== null && item.dte >= policy.minDte && item.dte <= policy.maxDte)
    .sort((left, right) => Math.abs(left.dte - 30) - Math.abs(right.dte - 30));
  return eligible[0] || null;
}

function validLeg(option) {
  return option && Number.isFinite(option.strike) && Number.isFinite(option.bid) && Number.isFinite(option.ask) &&
    option.bid > 0 && option.ask >= option.bid && option.ask - option.bid <= Math.max(0.2, option.mid * 0.35) &&
    Number.isFinite(option.delta);
}

function nearestStrike(options, target, direction) {
  const candidates = options.filter(validLeg).filter((option) => direction === 'lower' ? option.strike < target : option.strike > target);
  if (!candidates.length) return null;
  return candidates.sort((left, right) => Math.abs(left.strike - target) - Math.abs(right.strike - target))[0];
}

function creditMath(shortLeg, longLeg) {
  const width = Math.abs(shortLeg.strike - longLeg.strike);
  const midCredit = round(Math.max(0, shortLeg.mid - longLeg.mid), 4);
  const conservativeCredit = round(Math.max(0, shortLeg.bid - longLeg.ask), 4);
  const entryCredit = round(Math.max(conservativeCredit, midCredit), 4);
  const worstCaseRisk = round(Math.max(0, (width - conservativeCredit) * 100), 2);
  const riskAtMid = round(Math.max(0, (width - entryCredit) * 100), 2);
  const maxProfit = round(entryCredit * 100, 2);
  return { width, midCredit, conservativeCredit, entryCredit, worstCaseRisk, riskAtMid, maxProfit };
}

function liquidityScore(shortLeg, longLeg) {
  const volume = Math.min(shortLeg.volume || 0, longLeg.volume || 0);
  const openInterest = Math.min(shortLeg.openInterest || 0, longLeg.openInterest || 0);
  const spreadPct = ((shortLeg.ask - shortLeg.bid) / Math.max(shortLeg.mid || shortLeg.ask, 0.01) +
    (longLeg.ask - longLeg.bid) / Math.max(longLeg.mid || longLeg.ask, 0.01)) / 2;
  const volumePoints = Math.min(35, Math.log10(volume + 1) * 12);
  const oiPoints = Math.min(35, Math.log10(openInterest + 1) * 12);
  const spreadPoints = Math.max(0, 30 - spreadPct * 100);
  return {
    score: Math.round(Math.min(100, volumePoints + oiPoints + spreadPoints)),
    volume,
    openInterest,
    spreadPct: round(spreadPct * 100, 2)
  };
}

function trendFit(strategy, trend) {
  if (trend === 'neutral') return 0.75;
  if (strategy === 'BULL_PUT_CREDIT_SPREAD') return trend === 'bullish' ? 1 : 0.25;
  if (strategy === 'BEAR_CALL_CREDIT_SPREAD') return trend === 'bearish' ? 1 : 0.25;
  return 0.5;
}

function idFor(parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

function makeCandidate({ symbol, quote, technical, expiration, dte, shortLeg, longLeg, strategy }) {
  const math = creditMath(shortLeg, longLeg);
  const shortAbsDelta = Math.abs(shortLeg.delta);
  const popEstimate = round(Math.max(0, Math.min(0.99, 1 - shortAbsDelta)), 4);
  const liquidity = liquidityScore(shortLeg, longLeg);
  const fit = trendFit(strategy, technical.trend);
  const deltaQuality = shortAbsDelta >= 0.12 && shortAbsDelta <= 0.32 ? 1 : 0.45;
  const creditEfficiency = Math.min(1, math.entryCredit / Math.max(math.width * 0.35, 0.01));
  const score = Math.round(Math.max(0, Math.min(100,
    38 + (popEstimate * 22) + (liquidity.score * 0.16) + (fit * 12) + (deltaQuality * 8) + (creditEfficiency * 4) - (dte < 25 ? 4 : 0)
  )));
  const id = idFor([symbol, expiration, strategy, shortLeg.strike, longLeg.strike]);
  const takeProfitDebit = round(math.entryCredit * 0.5, 2);
  const stopLossDebit = round(Math.min(math.width * 0.9, math.entryCredit * 2), 2);
  const shortAction = 'SELL_TO_OPEN';
  const longAction = 'BUY_TO_OPEN';
  const legs = strategy === 'BULL_PUT_CREDIT_SPREAD'
    ? [
        { action: shortAction, type: 'PUT', strike: shortLeg.strike, contractSymbol: shortLeg.symbol, bid: shortLeg.bid, ask: shortLeg.ask, delta: shortLeg.delta },
        { action: longAction, type: 'PUT', strike: longLeg.strike, contractSymbol: longLeg.symbol, bid: longLeg.bid, ask: longLeg.ask, delta: longLeg.delta }
      ]
    : [
        { action: shortAction, type: 'CALL', strike: shortLeg.strike, contractSymbol: shortLeg.symbol, bid: shortLeg.bid, ask: shortLeg.ask, delta: shortLeg.delta },
        { action: longAction, type: 'CALL', strike: longLeg.strike, contractSymbol: longLeg.symbol, bid: longLeg.bid, ask: longLeg.ask, delta: longLeg.delta }
      ];
  return {
    id,
    symbol,
    strategy,
    strategyLabel: strategy === 'BULL_PUT_CREDIT_SPREAD' ? 'Bull Put Credit Spread' : 'Bear Call Credit Spread',
    direction: strategy === 'BULL_PUT_CREDIT_SPREAD' ? 'ALCISTA / NEUTRAL' : 'BAJISTA / NEUTRAL',
    source: 'Tradier',
    generatedAt: new Date().toISOString(),
    expiration,
    dte,
    underlyingPrice: quote.price,
    shortStrike: shortLeg.strike,
    longStrike: longLeg.strike,
    width: round(math.width, 2),
    credit: math.entryCredit,
    midCredit: math.midCredit,
    minimumCredit: math.conservativeCredit,
    maxProfitUsd: math.maxProfit,
    maxRiskUsd: math.worstCaseRisk,
    riskAtMidUsd: math.riskAtMid,
    popEstimate,
    score,
    shortDelta: round(shortLeg.delta, 4),
    longDelta: round(longLeg.delta, 4),
    iv: round(shortLeg.iv, 4),
    liquidity,
    technical,
    legs,
    sizing: {
      accountSize: config.policy.accountSize,
      riskPerTradePct: config.policy.riskPerTradePct,
      riskBudgetUsd: round(config.policy.accountSize * config.policy.riskPerTradePct / 100, 2),
      contractsAtWorstRisk: math.worstCaseRisk > 0 ? Math.min(config.policy.maxContracts, Math.max(0, Math.floor((config.policy.accountSize * config.policy.riskPerTradePct / 100) / math.worstCaseRisk))) : 0
    },
    executionPlan: {
      order: 'Vertical credit spread · riesgo definido',
      entry: `Coloca una orden LIMIT para recibir crédito de $${math.entryCredit.toFixed(2)}; no aceptes menos de $${Math.max(0.01, math.conservativeCredit).toFixed(2)} con estos datos actuales.`,
      entryCredit: math.entryCredit,
      minimumCredit: math.conservativeCredit,
      takeProfit: `Buy to close cuando el débito del spread baje a $${takeProfitDebit.toFixed(2)} o menos (aprox. 50% de ganancia).`,
      takeProfitDebit,
      stopLoss: `Buy to close si el débito sube a aproximadamente $${stopLossDebit.toFixed(2)}, si el precio prueba el strike corto o si la tesis técnica se invalida.`,
      stopLossDebit,
      timeStop: 'Cerrar o reevaluar antes de entrar en los últimos 21 DTE; no esperar al vencimiento.',
      eventRule: 'Confirmar earnings y eventos macro antes de enviar la orden; Tradier no entrega un calendario de earnings en este flujo.'
    },
    greeks: {
      delta: round(shortLeg.delta + longLeg.delta, 4),
      gamma: round((shortLeg.gamma || 0) + (longLeg.gamma || 0), 6),
      theta: round((shortLeg.theta || 0) + (longLeg.theta || 0), 6),
      vega: round((shortLeg.vega || 0) + (longLeg.vega || 0), 6),
      rho: round((shortLeg.rho || 0) + (longLeg.rho || 0), 6)
    },
    deterministic: {
      pass: score >= config.policy.minScore && popEstimate >= config.policy.minPop && math.conservativeCredit >= config.policy.minCredit && liquidity.score >= 35,
      reasons: [
        `${technical.trend} trend fit ${(fit * 100).toFixed(0)}%`,
        `POP estimada ${(popEstimate * 100).toFixed(1)}% basada en delta`,
        `Liquidez ${liquidity.score}/100`,
        `Crédito mínimo ejecutable $${math.conservativeCredit.toFixed(2)}`
      ]
    },
    aiReview: null,
    status: 'CANDIDATE'
  };
}

export function buildCreditCandidates({ symbol, quote, technical, chain, expiration, dte, policy = config.policy }) {
  const puts = chain.filter((option) => validLeg(option) && option.type === 'put' && option.strike < quote.price && Math.abs(option.delta) >= 0.1 && Math.abs(option.delta) <= 0.38).sort((a, b) => b.strike - a.strike);
  const calls = chain.filter((option) => validLeg(option) && option.type === 'call' && option.strike > quote.price && Math.abs(option.delta) >= 0.1 && Math.abs(option.delta) <= 0.38).sort((a, b) => a.strike - b.strike);
  const candidates = [];
  const widths = [...new Set([1, 2, 3, 5, 10, Math.round(quote.price * 0.03)])].filter((width) => width > 0);

  for (const shortLeg of puts) {
    for (const width of widths) {
      const longLeg = nearestStrike(puts, shortLeg.strike - width, 'lower');
      if (!longLeg || longLeg.strike >= shortLeg.strike) continue;
      const candidate = makeCandidate({ symbol, quote, technical, expiration, dte, shortLeg, longLeg, strategy: 'BULL_PUT_CREDIT_SPREAD' });
      if (candidate.credit >= policy.minCredit && candidate.maxRiskUsd > 0) candidates.push(candidate);
    }
  }
  for (const shortLeg of calls) {
    for (const width of widths) {
      const longLeg = nearestStrike(calls, shortLeg.strike + width, 'higher');
      if (!longLeg || longLeg.strike <= shortLeg.strike) continue;
      const candidate = makeCandidate({ symbol, quote, technical, expiration, dte, shortLeg, longLeg, strategy: 'BEAR_CALL_CREDIT_SPREAD' });
      if (candidate.credit >= policy.minCredit && candidate.maxRiskUsd > 0) candidates.push(candidate);
    }
  }
  return candidates.sort((left, right) => right.score - left.score || right.popEstimate - left.popEstimate).slice(0, 8);
}

function topPerSymbol(candidates) {
  const result = [];
  const seen = new Set();
  for (const candidate of candidates.sort((left, right) => right.score - left.score)) {
    if (seen.has(candidate.symbol)) continue;
    seen.add(candidate.symbol);
    result.push(candidate);
  }
  return result;
}

function applyReviews(candidates, geminiResult, marketOpen) {
  const reviews = new Map((geminiResult?.reviews || []).map((review) => [review.candidateId, review]));
  return candidates.map((candidate) => {
    const review = reviews.get(candidate.id) || null;
    const aiApproved = review?.decision === 'APPROVE' && review.confidence >= 60;
    const deterministicReady = candidate.deterministic.pass;
    const ready = Boolean(marketOpen && deterministicReady && aiApproved);
    return {
      ...candidate,
      status: ready ? 'READY' : review?.decision === 'REJECT' ? 'REJECTED' : 'WATCH',
      aiReview: review,
      readiness: {
        deterministic: deterministicReady,
        ai: aiApproved,
        marketOpen: Boolean(marketOpen),
        final: ready,
        reasons: [
          !marketOpen ? 'Mercado cerrado: no alertar ni ejecutar.' : null,
          !deterministicReady ? 'No supera todos los filtros cuantitativos.' : null,
          !geminiResult?.configured ? 'Gemini no está configurado; señal bloqueada.' : null,
          geminiResult?.configured && !review ? 'Gemini no revisó este candidato.' : null,
          review?.decision === 'REJECT' ? 'Gemini rechazó el candidato.' : null
        ].filter(Boolean)
      }
    };
  });
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      try { results[index] = await fn(items[index], index); }
      catch (error) { results[index] = { error: error.message, symbol: items[index] }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function scanMarket({ tradier, gemini, symbols = config.watchlist.core, now = new Date() } = {}) {
  const startedAt = Date.now();
  const universe = [...new Set(symbols)].slice(0, config.watchlist.maxSymbolsPerScan);
  if (!tradier) throw new Error('Tradier client is required.');
  const clock = await tradier.getMarketClock();
  const marketOpen = String(clock?.state || '').toLowerCase() === 'open';
  const quotes = await tradier.getQuotes(universe);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const perSymbol = await mapWithConcurrency(universe, 3, async (symbol) => {
    const quote = quoteMap.get(symbol);
    if (!quote?.price) return { symbol, error: 'Tradier no entregó precio válido.' };
    const [history, expirations] = await Promise.all([tradier.getHistory(symbol, 90), tradier.getExpirations(symbol)]);
    const technical = buildTechnicalContext(history, quote.price);
    const selected = chooseExpiration(expirations, config.policy, now);
    if (!selected) return { symbol, quote, technical, error: `Sin vencimiento entre ${config.policy.minDte} y ${config.policy.maxDte} DTE.` };
    const chain = await tradier.getOptionChain(symbol, selected.expiration);
    const candidates = buildCreditCandidates({ symbol, quote, technical, chain, expiration: selected.expiration, dte: selected.dte });
    return { symbol, quote, technical, expiration: selected.expiration, dte: selected.dte, candidateCount: candidates.length, candidates };
  });
  const errors = perSymbol.filter((item) => item.error).map((item) => ({ symbol: item.symbol, error: item.error }));
  const allCandidates = perSymbol.flatMap((item) => item.candidates || []);
  const candidatesForReview = topPerSymbol(allCandidates).slice(0, 8);
  const reviewSet = candidatesForReview.map((candidate) => ({
    candidateId: candidate.id,
    symbol: candidate.symbol,
    strategy: candidate.strategyLabel,
    expiration: candidate.expiration,
    dte: candidate.dte,
    underlyingPrice: candidate.underlyingPrice,
    shortStrike: candidate.shortStrike,
    longStrike: candidate.longStrike,
    width: candidate.width,
    credit: candidate.credit,
    minimumCredit: candidate.minimumCredit,
    maxRiskUsd: candidate.maxRiskUsd,
    maxProfitUsd: candidate.maxProfitUsd,
    popEstimate: candidate.popEstimate,
    score: candidate.score,
    shortDelta: candidate.shortDelta,
    liquidity: candidate.liquidity,
    technical: candidate.technical
  }));
  let geminiResult;
  try {
    geminiResult = await gemini.review(reviewSet, {
      marketOpen,
      clock,
      symbols: universe,
      dataSource: 'Tradier',
      generatedAt: new Date().toISOString(),
      policy: config.policy
    });
  } catch (error) {
    geminiResult = { configured: true, ok: false, error: error.message, reviews: [], marketNote: '' };
  }
  const reviewed = applyReviews(candidatesForReview, geminiResult, marketOpen);
  const sorted = reviewed.sort((left, right) => {
    const rank = { READY: 3, WATCH: 2, CANDIDATE: 1, REJECTED: 0 };
    return (rank[right.status] - rank[left.status]) || (right.score - left.score);
  });
  const ready = sorted.filter((candidate) => candidate.status === 'READY').slice(0, config.policy.maxDailySignals);
  const readyIds = new Set(ready.map((candidate) => candidate.id));
  const signals = sorted.map((candidate) => readyIds.has(candidate.id) ? candidate : { ...candidate, status: candidate.status === 'READY' ? 'WATCH' : candidate.status });
  return {
    id: `scan-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    source: 'Tradier',
    market: { marketOpen, clock, state: clock?.state || 'unknown' },
    universe,
    magnificentSeven: config.watchlist.magnificentSeven,
    policy: config.policy,
    ai: {
      provider: 'Gemini',
      configured: Boolean(geminiResult?.configured),
      ok: Boolean(geminiResult?.ok),
      model: geminiResult?.model || null,
      marketNote: geminiResult?.marketNote || '',
      error: geminiResult?.error || null,
      reviewedCandidates: reviewSet.length
    },
    signals,
    errors,
    summary: {
      ready: signals.filter((signal) => signal.status === 'READY').length,
      watch: signals.filter((signal) => signal.status === 'WATCH').length,
      rejected: signals.filter((signal) => signal.status === 'REJECTED').length,
      candidates: allCandidates.length,
      symbolsWithData: perSymbol.filter((item) => !item.error).length
    },
    warnings: [
      'Las probabilidades son estimaciones; no son garantías.',
      'Tradier no entrega aquí el calendario de earnings. Confirma earnings y eventos macro antes de enviar una orden en Robinhood.',
      'La app genera señales manuales; no envía órdenes a Robinhood ni a Tradier.'
    ]
  };
}
