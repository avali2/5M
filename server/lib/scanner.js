import crypto from 'node:crypto';
import { config } from '../config.js';
import { buildMultiTimeframeContext } from './indicators.js';
import { marketRiskFallback } from './gemini.js';
import { finite, round } from './http.js';
import { selectRotatingUniverse, universeCatalog } from './universe.js';
import { analyzeInstitutionalFlow, flowForStrategy } from './institutionalFlow.js';

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

export function chooseExpiration(expirations, profile = config.policy.profiles.core, now = new Date()) {
  const targetDte = finite(profile.targetDte, 30);
  const eligible = expirations
    .map((expiration) => ({ expiration, dte: daysToExpiration(expiration, now) }))
    .filter((item) => item.dte !== null && item.dte >= profile.minDte && item.dte <= profile.maxDte)
    .sort((left, right) => Math.abs(left.dte - targetDte) - Math.abs(right.dte - targetDte));
  return eligible[0] || null;
}

function normalizeProfile(profile = {}, policy = config.policy) {
  return {
    id: String(profile.id || 'CORE').toUpperCase(),
    label: String(profile.label || 'Base'),
    riskLevel: String(profile.riskLevel || 'MODERADO'),
    enabled: profile.enabled !== false,
    minDte: finite(profile.minDte, finite(policy.minDte, 21)),
    maxDte: finite(profile.maxDte, finite(policy.maxDte, 45)),
    targetDte: finite(profile.targetDte, 30),
    shortDeltaMin: finite(profile.shortDeltaMin, 0.12),
    shortDeltaMax: finite(profile.shortDeltaMax, 0.30),
    minLiquidity: finite(profile.minLiquidity, 40),
    minScore: finite(profile.minScore, finite(policy.minScore, 70)),
    minPop: finite(profile.minPop, finite(policy.minPop, 0.60)),
    takeProfitPct: finite(profile.takeProfitPct, 0.50),
    stopMultiple: finite(profile.stopMultiple, 2),
    timeStopDte: finite(profile.timeStopDte, 21),
    riskMultiplier: finite(profile.riskMultiplier, 1),
    maxContracts: finite(profile.maxContracts, finite(policy.maxContracts, 1)),
    priorityOnly: Boolean(profile.priorityOnly)
  };
}

function completePolicy(input = {}) {
  return {
    ...config.policy,
    ...input,
    profiles: {
      core: { ...config.policy.profiles.core, ...(input.profiles?.core || {}) },
      aggressive: { ...config.policy.profiles.aggressive, ...(input.profiles?.aggressive || {}) }
    }
  };
}

function profilesForSymbol(symbol, policy, prioritySymbols) {
  const core = normalizeProfile(policy.profiles?.core || {}, policy);
  const aggressive = normalizeProfile(policy.profiles?.aggressive || { enabled: false, id: 'AGGRESSIVE' }, policy);
  return [core, ...(aggressive.enabled && (!aggressive.priorityOnly || prioritySymbols.includes(symbol)) ? [aggressive] : [])];
}

function validLeg(option) {
  const mid = finite(option?.mid, option?.bid !== undefined && option?.ask !== undefined ? (Number(option.bid) + Number(option.ask)) / 2 : null);
  return option && Number.isFinite(option.strike) && Number.isFinite(option.bid) && Number.isFinite(option.ask) &&
    option.bid > 0 && option.ask >= option.bid && option.ask - option.bid <= Math.max(0.2, (mid || option.ask) * 0.35) &&
    Number.isFinite(option.delta);
}

function nearestStrike(options, target, direction) {
  const candidates = options.filter(validLeg).filter((option) => direction === 'lower' ? option.strike < target : option.strike > target);
  if (!candidates.length) return null;
  return candidates.sort((left, right) => Math.abs(left.strike - target) - Math.abs(right.strike - target))[0];
}

function creditMath(shortLeg, longLeg) {
  const width = Math.abs(shortLeg.strike - longLeg.strike);
  const shortMid = finite(shortLeg.mid, (shortLeg.bid + shortLeg.ask) / 2);
  const longMid = finite(longLeg.mid, (longLeg.bid + longLeg.ask) / 2);
  const midCredit = round(Math.max(0, shortMid - longMid), 4);
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
  const shortMid = finite(shortLeg.mid, (shortLeg.bid + shortLeg.ask) / 2);
  const longMid = finite(longLeg.mid, (longLeg.bid + longLeg.ask) / 2);
  const spreadPct = ((shortLeg.ask - shortLeg.bid) / Math.max(shortMid || shortLeg.ask, 0.01) +
    (longLeg.ask - longLeg.bid) / Math.max(longMid || longLeg.ask, 0.01)) / 2;
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

function directionalCounts(strategy, technical) {
  const summary = technical?.timeframeSummary || {};
  return strategy === 'BULL_PUT_CREDIT_SPREAD'
    ? { aligned: summary.bullish || 0, opposing: summary.bearish || 0 }
    : { aligned: summary.bearish || 0, opposing: summary.bullish || 0 };
}

function trendFit(strategy, technical) {
  const trend = technical?.trend || 'neutral';
  if (trend === 'neutral') return 0.75;
  if (strategy === 'BULL_PUT_CREDIT_SPREAD') return trend === 'bullish' ? 1 : 0.2;
  if (strategy === 'BEAR_CALL_CREDIT_SPREAD') return trend === 'bearish' ? 1 : 0.2;
  return 0.5;
}

function idFor(parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

function parseTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric < 1e12 ? numeric * 1000 : numeric) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dataQualityFor({ quote, technical, now, policy, realtimeEntitled }) {
  const timestamp = parseTimestamp(quote?.tradeDate) || parseTimestamp(technical?.intradayAsOf);
  const ageMinutes = timestamp ? Math.max(0, (new Date(now).getTime() - timestamp.getTime()) / 60000) : null;
  return {
    realtimeEntitled: Boolean(realtimeEntitled),
    latestTimestamp: timestamp?.toISOString() || null,
    ageMinutes: round(ageMinutes, 1),
    fresh: ageMinutes !== null && ageMinutes <= policy.maxDataAgeMinutes,
    intradayAvailable: Boolean(technical?.timeframes?.m5?.sufficient),
    source: 'Tradier'
  };
}

function triggerFor(strategy, technical) {
  const m15 = technical?.timeframes?.m15;
  const h1 = technical?.timeframes?.h1;
  const anchor = finite(m15?.ema21, finite(h1?.ema21, finite(technical?.ema20)));
  if (strategy === 'BULL_PUT_CREDIT_SPREAD') {
    return `Entrar solo si el precio se mantiene${anchor ? ` sobre $${anchor.toFixed(2)}` : ' firme'} y 15m/1h no cambian a tendencia bajista.`;
  }
  return `Entrar solo si el precio se mantiene${anchor ? ` bajo $${anchor.toFixed(2)}` : ' débil'} y 15m/1h no cambian a tendencia alcista.`;
}

function makeCandidate({ symbol, quote, technical, expiration, dte, shortLeg, longLeg, strategy, profile, policy, dataQuality, institutionalFlow, isPriority, now }) {
  const math = creditMath(shortLeg, longLeg);
  const shortAbsDelta = Math.abs(shortLeg.delta);
  const popEstimate = round(Math.max(0, Math.min(0.99, 1 - shortAbsDelta)), 4);
  const liquidity = liquidityScore(shortLeg, longLeg);
  const fit = trendFit(strategy, technical);
  const direction = directionalCounts(strategy, technical);
  const institutional = flowForStrategy(institutionalFlow, strategy, policy.institutionalFlow?.minimumConfidence);
  const deltaCenter = (profile.shortDeltaMin + profile.shortDeltaMax) / 2;
  const deltaQuality = Math.max(0.25, 1 - Math.abs(shortAbsDelta - deltaCenter) / Math.max(0.01, profile.shortDeltaMax - profile.shortDeltaMin));
  const creditEfficiency = Math.min(1, math.entryCredit / Math.max(math.width * 0.35, 0.01));
  const priorityPutBonus = isPriority && strategy === 'BULL_PUT_CREDIT_SPREAD' ? 4 : 0;
  const profilePenalty = profile.id === 'AGGRESSIVE' ? 3 : 0;
  const score = Math.round(Math.max(0, Math.min(100,
    26 + (popEstimate * 24) + (liquidity.score * 0.20) + (fit * 14) + (deltaQuality * 7) +
    (creditEfficiency * 7) + Math.min(5, direction.aligned * 1.5) +
    (institutional.aligned ? 6 : institutional.alignment === 'OPPOSED' ? -8 : 0) + priorityPutBonus - profilePenalty
  )));
  const id = idFor([symbol, profile.id, expiration, strategy, shortLeg.strike, longLeg.strike]);
  const takeProfitDebit = round(math.entryCredit * (1 - profile.takeProfitPct), 2);
  const stopLossDebit = round(Math.min(Math.max(0.01, math.width - 0.01), math.entryCredit * profile.stopMultiple), 2);
  const breakEven = strategy === 'BULL_PUT_CREDIT_SPREAD'
    ? round(shortLeg.strike - math.entryCredit, 2)
    : round(shortLeg.strike + math.entryCredit, 2);
  const enoughTimeframes = (technical?.timeframeSummary?.available || 0) >= policy.minTimeframes;
  const aggressiveAligned = profile.id !== 'AGGRESSIVE' || (direction.aligned >= 2 && direction.opposing <= 1 && (technical?.timeframeSummary?.alignmentPct || 0) >= 50);
  const rules = {
    score: score >= profile.minScore,
    pop: popEstimate >= profile.minPop,
    credit: math.conservativeCredit >= policy.minCredit,
    liquidity: liquidity.score >= profile.minLiquidity,
    dte: dte >= profile.minDte && dte <= profile.maxDte && (!policy.block0Dte || dte > 0),
    delta: shortAbsDelta >= profile.shortDeltaMin && shortAbsDelta <= profile.shortDeltaMax,
    timeframes: enoughTimeframes,
    aggressiveAlignment: aggressiveAligned,
    institutionalFlow: profile.id !== 'AGGRESSIVE' || !policy.institutionalFlow?.requiredForAggressive || institutional.qualified,
    fresh: Boolean(dataQuality.fresh)
  };
  const deterministicPass = Object.values(rules).every(Boolean);
  const legs = [
    { action: 'SELL_TO_OPEN', type: strategy === 'BULL_PUT_CREDIT_SPREAD' ? 'PUT' : 'CALL', strike: shortLeg.strike, contractSymbol: shortLeg.symbol, bid: shortLeg.bid, ask: shortLeg.ask, delta: shortLeg.delta },
    { action: 'BUY_TO_OPEN', type: strategy === 'BULL_PUT_CREDIT_SPREAD' ? 'PUT' : 'CALL', strike: longLeg.strike, contractSymbol: longLeg.symbol, bid: longLeg.bid, ask: longLeg.ask, delta: longLeg.delta }
  ];
  return {
    id,
    candidateId: id,
    symbol,
    isPriority,
    profile: { id: profile.id, label: profile.label, riskLevel: profile.riskLevel },
    strategy,
    strategyLabel: strategy === 'BULL_PUT_CREDIT_SPREAD' ? 'Put Credit Spread' : 'Call Credit Spread',
    direction: strategy === 'BULL_PUT_CREDIT_SPREAD' ? 'ALCISTA / NEUTRAL' : 'BAJISTA / NEUTRAL',
    source: 'Tradier',
    generatedAt: new Date(now).toISOString(),
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
    returnOnRisk: math.worstCaseRisk > 0 ? round((math.conservativeCredit * 100) / math.worstCaseRisk, 4) : null,
    breakEven,
    popEstimate,
    score,
    shortDelta: round(shortLeg.delta, 4),
    longDelta: round(longLeg.delta, 4),
    iv: round(shortLeg.iv, 4),
    liquidity,
    institutionalFlow: institutional,
    technical,
    dataQuality,
    legs,
    sizing: {
      mode: 'USER_DECIDES',
      contractsAtWorstRisk: null,
      maxRiskPerContractUsd: math.worstCaseRisk,
      note: 'La señal no se filtra por balance ni limita contratos. El usuario decide cantidad y acepta el riesgo total.'
    },
    executionPlan: {
      order: 'Vertical credit spread · riesgo definido · orden LIMIT',
      entry: `Abrir por un crédito LIMIT cercano a $${math.entryCredit.toFixed(2)}; cancelar si no recibes al menos $${Math.max(0.01, math.conservativeCredit).toFixed(2)} con cotizaciones vigentes.`,
      entryTrigger: triggerFor(strategy, technical),
      entryCredit: math.entryCredit,
      minimumCredit: math.conservativeCredit,
      breakEven,
      takeProfit: `Buy to close a $${takeProfitDebit.toFixed(2)} o menos (objetivo aproximado: ${(profile.takeProfitPct * 100).toFixed(0)}% del crédito capturado).`,
      takeProfitDebit,
      stopLoss: `Buy to close cerca de $${stopLossDebit.toFixed(2)}, o antes si el subyacente invalida la tesis o alcanza el strike corto.`,
      stopLossDebit,
      timeStop: `Cerrar o reevaluar al llegar a ${profile.timeStopDte} DTE; no mantener hasta vencimiento por defecto.`,
      eventRule: 'El filtro de noticias debe permanecer CLEAR al enviar la orden. Revalidar si cambia una noticia, evento macro o earnings.',
      assignmentRule: 'Cerrar antes si aumenta el riesgo de asignación; nunca dejar una pierna corta sin su protección.'
    },
    greeks: {
      delta: round((longLeg.delta || 0) - (shortLeg.delta || 0), 4),
      gamma: round((longLeg.gamma || 0) - (shortLeg.gamma || 0), 6),
      theta: round((longLeg.theta || 0) - (shortLeg.theta || 0), 6),
      vega: round((longLeg.vega || 0) - (shortLeg.vega || 0), 6),
      rho: round((longLeg.rho || 0) - (shortLeg.rho || 0), 6)
    },
    deterministic: {
      pass: deterministicPass,
      rules,
      reasons: [
        `Perfil ${profile.label}: ${profile.minDte}-${profile.maxDte} DTE, delta corta ${profile.shortDeltaMin.toFixed(2)}-${profile.shortDeltaMax.toFixed(2)}`,
        `${technical.trend} · ${direction.aligned} temporalidad(es) alineada(s) y ${direction.opposing} opuesta(s)`,
        `POP estimada ${(popEstimate * 100).toFixed(1)}% basada en delta`,
        `Liquidez ${liquidity.score}/100 · crédito conservador $${math.conservativeCredit.toFixed(2)}`,
        `Flujo inferido ${institutional.direction} · confianza ${institutional.confidence}% · ${institutional.alignment}`,
        `Sin filtro por balance: riesgo máximo ${math.worstCaseRisk.toFixed(2)} USD por contrato`
      ]
    },
    aiReview: null,
    status: 'CANDIDATE'
  };
}

export function buildCreditCandidates({ symbol, quote, technical, chain, expiration, dte, policy = config.policy, profile, dataQuality = { fresh: true }, institutionalFlow = null, isPriority = false, now = new Date() }) {
  const activePolicy = completePolicy(policy);
  const activeProfile = normalizeProfile(profile || activePolicy.profiles?.core || {}, activePolicy);
  const validPuts = chain.filter((option) => validLeg(option) && option.type === 'put' && option.strike < quote.price).sort((left, right) => right.strike - left.strike);
  const validCalls = chain.filter((option) => validLeg(option) && option.type === 'call' && option.strike > quote.price).sort((left, right) => left.strike - right.strike);
  const shortPuts = validPuts.filter((option) => Math.abs(option.delta) >= activeProfile.shortDeltaMin && Math.abs(option.delta) <= activeProfile.shortDeltaMax);
  const shortCalls = validCalls.filter((option) => Math.abs(option.delta) >= activeProfile.shortDeltaMin && Math.abs(option.delta) <= activeProfile.shortDeltaMax);
  const candidates = new Map();
  const maximumWidth = Math.max(5, finite(activePolicy.maximumSpreadWidth, 25));
  const widths = [...new Set([1, 2, 3, 5, 10, 15, 20, 25, Math.round(quote.price * 0.02), Math.round(quote.price * 0.05)])]
    .filter((width) => width > 0 && width <= maximumWidth);

  for (const shortLeg of shortPuts) {
    for (const width of widths) {
      const longLeg = nearestStrike(validPuts, shortLeg.strike - width, 'lower');
      if (!longLeg || longLeg.strike >= shortLeg.strike) continue;
      const candidate = makeCandidate({ symbol, quote, technical, expiration, dte, shortLeg, longLeg, strategy: 'BULL_PUT_CREDIT_SPREAD', profile: activeProfile, policy: activePolicy, dataQuality, institutionalFlow, isPriority, now });
      if (candidate.credit >= activePolicy.minCredit && candidate.maxRiskUsd > 0 && candidate.width <= maximumWidth) candidates.set(candidate.id, candidate);
    }
  }
  for (const shortLeg of shortCalls) {
    for (const width of widths) {
      const longLeg = nearestStrike(validCalls, shortLeg.strike + width, 'higher');
      if (!longLeg || longLeg.strike <= shortLeg.strike) continue;
      const candidate = makeCandidate({ symbol, quote, technical, expiration, dte, shortLeg, longLeg, strategy: 'BEAR_CALL_CREDIT_SPREAD', profile: activeProfile, policy: activePolicy, dataQuality, institutionalFlow, isPriority, now });
      if (candidate.credit >= activePolicy.minCredit && candidate.maxRiskUsd > 0 && candidate.width <= maximumWidth) candidates.set(candidate.id, candidate);
    }
  }
  return [...candidates.values()].sort((left, right) => right.score - left.score || right.popEstimate - left.popEstimate).slice(0, 10);
}

function topPerSymbolProfile(candidates) {
  const result = [];
  const seen = new Set();
  const ordered = [...candidates].sort((left, right) =>
    Number(right.isPriority) - Number(left.isPriority) ||
    Number(right.strategy === 'BULL_PUT_CREDIT_SPREAD') - Number(left.strategy === 'BULL_PUT_CREDIT_SPREAD') ||
    right.score - left.score);
  for (const candidate of ordered) {
    const key = `${candidate.symbol}:${candidate.profile.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

export function applyReviews(candidates, geminiResult, { marketOpen, marketRisk, realtimeEntitled }) {
  const reviews = new Map((geminiResult?.reviews || []).map((review) => [review.candidateId, review]));
  const newsClear = marketRisk?.status === 'CLEAR' && marketRisk?.coverageComplete;
  return candidates.map((candidate) => {
    const review = reviews.get(candidate.id) || null;
    const minimumConfidence = candidate.profile.id === 'AGGRESSIVE' ? 70 : 60;
    const aiApproved = review?.decision === 'APPROVE' && review.confidence >= minimumConfidence;
    const deterministicReady = candidate.deterministic.pass;
    const dataReady = Boolean(realtimeEntitled && candidate.dataQuality?.fresh);
    const ready = Boolean(marketOpen && deterministicReady && aiApproved && newsClear && dataReady);
    return {
      ...candidate,
      status: ready ? 'READY' : review?.decision === 'REJECT' ? 'REJECTED' : 'WATCH',
      aiReview: review,
      readiness: {
        deterministic: deterministicReady,
        ai: aiApproved,
        news: newsClear,
        data: dataReady,
        marketOpen: Boolean(marketOpen),
        final: ready,
        reasons: [
          !marketOpen ? 'Mercado cerrado: no abrir ni alertar.' : null,
          !newsClear ? `Filtro de noticias ${marketRisk?.status || 'UNKNOWN'}: no abrir.` : null,
          !realtimeEntitled ? 'Tiempo real de Tradier no confirmado en la configuración.' : null,
          !candidate.dataQuality?.fresh ? 'Cotización intradía ausente o vencida.' : null,
          !deterministicReady ? 'No supera todos los filtros cuantitativos, multitemporales y de flujo.' : null,
          !geminiResult?.configured ? 'Gemini no está configurado; señal bloqueada.' : null,
          geminiResult?.configured && !review ? 'Gemini no revisó este candidato.' : null,
          review && !aiApproved ? `Gemini no aprobó con la confianza mínima de ${minimumConfidence}%.` : null,
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
      catch (error) { results[index] = { error: error.message, symbol: items[index], errors: [{ symbol: items[index], stage: 'symbol', error: error.message }] }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function candidateForReview(candidate) {
  return {
    candidateId: candidate.id,
    symbol: candidate.symbol,
    priority: candidate.isPriority,
    profile: candidate.profile,
    strategy: candidate.strategyLabel,
    expiration: candidate.expiration,
    dte: candidate.dte,
    underlyingPrice: candidate.underlyingPrice,
    shortStrike: candidate.shortStrike,
    longStrike: candidate.longStrike,
    width: candidate.width,
    credit: candidate.credit,
    minimumCredit: candidate.minimumCredit,
    breakEven: candidate.breakEven,
    maxRiskUsd: candidate.maxRiskUsd,
    maxProfitUsd: candidate.maxProfitUsd,
    returnOnRisk: candidate.returnOnRisk,
    popEstimate: candidate.popEstimate,
    score: candidate.score,
    shortDelta: candidate.shortDelta,
    liquidity: candidate.liquidity,
    institutionalFlow: candidate.institutionalFlow,
    technical: candidate.technical,
    deterministic: candidate.deterministic
  };
}

export async function scanMarket({
  tradier,
  gemini,
  symbols = null,
  prioritySymbols = config.watchlist.priority,
  contextIndices = config.watchlist.contextIndices,
  policy = config.policy,
  maxSymbols = config.watchlist.maxSymbolsPerScan,
  realtimeEntitled = config.tradier.realtimeEntitled,
  learningContext = null,
  now = new Date()
} = {}) {
  const startedAt = Date.now();
  if (!tradier) throw new Error('Tradier client is required.');
  const activePolicy = completePolicy(policy);
  const priority = [...new Set(prioritySymbols.map((symbol) => String(symbol).toUpperCase()))];
  const selectedSymbols = symbols || selectRotatingUniverse({ maxSymbols, now });
  const requested = [...new Set(selectedSymbols.map((symbol) => String(symbol).toUpperCase()))];
  const universe = [...requested.filter((symbol) => priority.includes(symbol)), ...requested.filter((symbol) => !priority.includes(symbol))].slice(0, maxSymbols);
  const contextIndexSymbols = [...new Set((contextIndices || []).map((symbol) => String(symbol).toUpperCase()))];
  const catalog = universeCatalog();
  const clock = await tradier.getMarketClock();
  const marketOpen = String(clock?.state || '').toLowerCase() === 'open';
  const marketRiskPromise = typeof gemini?.reviewMarketRisk === 'function'
    ? gemini.reviewMarketRisk({ symbols: catalog.allSignalSymbols, prioritySymbols: priority, contextIndices: contextIndexSymbols, marketClock: clock, now })
      .catch((error) => marketRiskFallback(error, { configured: Boolean(gemini?.configured ?? true), now }))
    : Promise.resolve(marketRiskFallback(new Error('Gemini no implementa la revisión de noticias.'), { configured: false, now }));
  const [quotes, contextIndexQuotes] = await Promise.all([
    tradier.getQuotes(universe),
    contextIndexSymbols.length ? tradier.getQuotes(contextIndexSymbols).catch(() => []) : Promise.resolve([])
  ]);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const perSymbolPromise = mapWithConcurrency(universe, 3, async (symbol) => {
    const errors = [];
    const quote = quoteMap.get(symbol);
    if (!quote?.price) return { symbol, error: 'Tradier no entregó precio válido.', errors: [{ symbol, stage: 'quote', error: 'Tradier no entregó precio válido.' }] };
    const [historyResult, intradayResult, expirationsResult] = await Promise.allSettled([
      tradier.getHistory(symbol, 420, 'daily', now),
      typeof tradier.getTimeSales === 'function' ? tradier.getTimeSales(symbol, { interval: '5min', lookbackDays: 8, now, sessionFilter: 'open' }) : Promise.reject(new Error('Cliente Tradier sin Time & Sales.')),
      tradier.getExpirations(symbol)
    ]);
    if (historyResult.status === 'rejected') errors.push({ symbol, stage: 'history', error: historyResult.reason.message });
    if (intradayResult.status === 'rejected') errors.push({ symbol, stage: 'intraday', error: intradayResult.reason.message });
    if (expirationsResult.status === 'rejected') errors.push({ symbol, stage: 'expirations', error: expirationsResult.reason.message });
    if (historyResult.status === 'rejected' || expirationsResult.status === 'rejected') {
      return { symbol, quote, error: 'Faltan históricos o vencimientos.', errors };
    }
    const history = historyResult.value;
    const intraday = intradayResult.status === 'fulfilled' ? intradayResult.value : [];
    const technical = buildMultiTimeframeContext({ daily: history, intraday5m: intraday, price: quote.price });
    const dataQuality = dataQualityFor({ quote, technical, now, policy: activePolicy, realtimeEntitled });
    const selectedProfiles = profilesForSymbol(symbol, activePolicy, priority).map((profile) => ({
      profile,
      selected: chooseExpiration(expirationsResult.value, profile, now)
    }));
    const validSelections = selectedProfiles.filter((item) => item.selected);
    for (const item of selectedProfiles.filter((entry) => !entry.selected)) {
      errors.push({ symbol, stage: `expiration-${item.profile.id.toLowerCase()}`, error: `Sin vencimiento ${item.profile.minDte}-${item.profile.maxDte} DTE.` });
    }
    const chainResults = await Promise.allSettled(validSelections.map((item) => tradier.getOptionChain(symbol, item.selected.expiration)));
    const candidates = [];
    chainResults.forEach((result, index) => {
      const item = validSelections[index];
      if (result.status === 'rejected') {
        errors.push({ symbol, stage: `chain-${item.profile.id.toLowerCase()}`, error: result.reason.message });
        return;
      }
      const institutionalFlow = analyzeInstitutionalFlow({
        chain: result.value,
        quote,
        history,
        technical,
        now,
        settings: activePolicy.institutionalFlow
      });
      candidates.push(...buildCreditCandidates({
        symbol,
        quote,
        technical,
        chain: result.value,
        expiration: item.selected.expiration,
        dte: item.selected.dte,
        policy: activePolicy,
        profile: item.profile,
        dataQuality,
        institutionalFlow,
        isPriority: priority.includes(symbol),
        now
      }));
    });
    return { symbol, quote, technical, dataQuality, candidateCount: candidates.length, candidates, errors };
  });

  const [perSymbol, marketRisk] = await Promise.all([perSymbolPromise, marketRiskPromise]);
  const errors = perSymbol.flatMap((item) => item.errors || []);
  const allCandidates = perSymbol.flatMap((item) => item.candidates || []);
  const candidatesForReview = topPerSymbolProfile(allCandidates).slice(0, 12);
  const reviewSet = candidatesForReview.map(candidateForReview);
  let geminiResult;
  try {
    geminiResult = await gemini.review(reviewSet, {
      marketOpen,
      clock,
      symbols: universe,
      prioritySymbols: priority,
      dataSource: 'Tradier',
      realtimeEntitled: Boolean(realtimeEntitled),
      generatedAt: new Date(now).toISOString(),
      policy: activePolicy,
      marketRisk,
      contextIndices: contextIndexQuotes,
      learning: learningContext?.usable ? learningContext : { usable: false, warning: 'Sin muestra validada; no inferir ventaja histórica.' }
    });
  } catch (error) {
    geminiResult = { configured: Boolean(gemini?.configured ?? true), ok: false, error: error.message, reviews: [], marketNote: '' };
  }
  const reviewed = applyReviews(candidatesForReview, geminiResult, { marketOpen, marketRisk, realtimeEntitled });
  const sorted = reviewed.sort((left, right) => {
    const rank = { READY: 3, WATCH: 2, CANDIDATE: 1, REJECTED: 0 };
    return (rank[right.status] - rank[left.status]) ||
      Number(right.isPriority) - Number(left.isPriority) ||
      Number(right.strategy === 'BULL_PUT_CREDIT_SPREAD') - Number(left.strategy === 'BULL_PUT_CREDIT_SPREAD') ||
      right.score - left.score;
  });
  const ready = sorted.filter((candidate) => candidate.status === 'READY').slice(0, activePolicy.maxDailySignals);
  const readyIds = new Set(ready.map((candidate) => candidate.id));
  const scanId = `scan-${new Date(now).getTime()}`;
  const signals = sorted.map((candidate) => {
    const signal = readyIds.has(candidate.id) ? candidate : { ...candidate, status: candidate.status === 'READY' ? 'WATCH' : candidate.status };
    return { ...signal, instanceId: `${scanId}:${signal.id}` };
  });
  return {
    id: scanId,
    generatedAt: new Date(now).toISOString(),
    durationMs: Date.now() - startedAt,
    source: 'Tradier',
    data: {
      provider: 'Tradier',
      realtimeEntitled: Boolean(realtimeEntitled),
      mode: realtimeEntitled ? 'REAL_TIME_CONFIRMED' : 'ENTITLEMENT_UNCONFIRMED',
      intradayInterval: '5min',
      historicalTimeframes: ['5m', '15m', '1h', '1D', '1W']
    },
    market: { marketOpen, clock, state: clock?.state || 'unknown', contextIndices: contextIndexQuotes },
    marketRisk,
    universe,
    universeCatalog: catalog,
    prioritySymbols: priority,
    magnificentSeven: config.watchlist.magnificentSeven,
    policy: activePolicy,
    ai: {
      provider: 'Gemini',
      configured: Boolean(geminiResult?.configured),
      ok: Boolean(geminiResult?.ok),
      model: geminiResult?.model || null,
      marketNote: geminiResult?.marketNote || '',
      error: geminiResult?.error || null,
      reviewedCandidates: reviewSet.length,
      groundedSources: marketRisk?.sources?.length || 0
    },
    learning: {
      usedByGemini: Boolean(learningContext?.usable),
      minimumSampleGuard: config.learning.minimumValidatedSamples,
      warning: 'El aprendizaje histórico solo puede endurecer la revisión; nunca convierte por sí solo una señal en READY.'
    },
    signals,
    errors,
    summary: {
      ready: signals.filter((signal) => signal.status === 'READY').length,
      watch: signals.filter((signal) => signal.status === 'WATCH').length,
      rejected: signals.filter((signal) => signal.status === 'REJECTED').length,
      candidates: allCandidates.length,
      aggressive: signals.filter((signal) => signal.profile?.id === 'AGGRESSIVE').length,
      priority: signals.filter((signal) => signal.isPriority).length,
      symbolsWithData: perSymbol.filter((item) => item.quote && item.technical).length
    },
    warnings: [
      'Ninguna señal ni POP garantiza ganancias. El sistema puede perder el riesgo máximo indicado.',
      'Las señales READY requieren mercado abierto, noticias CLEAR con fuentes, datos frescos, tiempo real confirmado, reglas cuantitativas, flujo exigido y aprobación de Gemini. El balance no filtra señales.',
      'La app genera señales para ejecución manual; no envía órdenes a Robinhood ni a Tradier.',
      'SPX, NDX, RUT y VIX se usan como contexto. Las señales operables se generan sobre acciones y ETF para evitar mezclar reglas de liquidación de índices.',
      'Revalida precio, crédito, noticias y poder de compra justo antes de enviar la orden.'
    ]
  };
}
