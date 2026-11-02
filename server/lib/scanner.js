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
  const expiry = dateOnly(String(expiration) + 'T00:00:00Z');
  const today = dateOnly(now);
  if (!expiry || !today) return null;
  return Math.round((expiry.getTime() - today.getTime()) / DAY);
}

function completePolicy(input = {}) {
  return {
    ...config.policy,
    ...input,
    profiles: { wheel: { ...config.policy.profiles.wheel, ...(input.profiles?.wheel || {}) } }
  };
}

function normalizeWheelProfile(profile = {}, policy = config.policy) {
  return {
    id: 'WHEEL',
    label: 'Rueda',
    riskLevel: 'MODERADO',
    enabled: profile.enabled !== false,
    minDte: finite(profile.minDte, finite(policy.minDte, 14)),
    maxDte: finite(profile.maxDte, finite(policy.maxDte, 45)),
    targetDte: finite(profile.targetDte, 30),
    shortDeltaMin: finite(profile.shortDeltaMin, 0.15),
    shortDeltaMax: finite(profile.shortDeltaMax, 0.30),
    minLiquidity: finite(profile.minLiquidity, finite(policy.minLiquidity, 60)),
    minScore: finite(profile.minScore, finite(policy.minScore, 65)),
    takeProfitPct: finite(profile.takeProfitPct, 0.50),
    stopMultiple: finite(profile.stopMultiple, 2),
    timeStopDte: finite(profile.timeStopDte, 7)
  };
}

export function chooseExpiration(expirations, profile = config.policy.profiles.wheel, now = new Date()) {
  const targetDte = finite(profile.targetDte, 30);
  const eligible = expirations
    .map((expiration) => ({ expiration, dte: daysToExpiration(expiration, now) }))
    .filter((item) => item.dte !== null && item.dte >= profile.minDte && item.dte <= profile.maxDte && item.dte > 0)
    .sort((left, right) => Math.abs(left.dte - targetDte) - Math.abs(right.dte - targetDte));
  return eligible[0] || null;
}

function validLeg(option) {
  const bid = finite(option?.bid, null);
  const ask = finite(option?.ask, null);
  const mid = finite(option?.mid, bid !== null && ask !== null ? (bid + ask) / 2 : null);
  const strike = finite(option?.strike, null);
  const delta = finite(option?.delta, null);
  return Boolean(option && ['put', 'call'].includes(option.type) &&
    strike !== null && strike > 0 && bid !== null && ask !== null && mid !== null &&
    bid > 0 && ask >= bid && mid > 0 && delta !== null && Math.abs(delta) <= 1);
}

function liquidityScore(option, policy) {
  const volume = Math.max(0, finite(option.volume, 0));
  const openInterest = Math.max(0, finite(option.openInterest, 0));
  const mid = Math.max(0.01, finite(option.mid, (finite(option.bid, 0) + finite(option.ask, 0)) / 2));
  const spreadPct = Math.max(0, (finite(option.ask, 0) - finite(option.bid, 0)) / mid);
  const volumePoints = Math.min(40, Math.log10(volume + 1) * 14);
  const oiPoints = Math.min(30, Math.log10(openInterest + 1) * 10);
  const spreadPoints = Math.max(0, 30 - spreadPct * 100);
  return {
    score: Math.round(Math.min(100, volumePoints + oiPoints + spreadPoints)),
    volume,
    openInterest,
    spreadPct: round(spreadPct * 100, 2),
    eligible: volume >= policy.minOptionVolume &&
      openInterest >= policy.minOpenInterest &&
      spreadPct <= policy.maxOptionSpreadPct
  };
}

function parseTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dataQualityFor({ quote, technical, now, policy, realtimeEntitled, optionChainFetchedAt = null }) {
  const quoteTimestamp = parseTimestamp(quote?.tradeDate);
  const intradayTimestamp = parseTimestamp(technical?.intradayAsOf);
  const ageMinutes = quoteTimestamp ? (new Date(now).getTime() - quoteTimestamp.getTime()) / 60000 : null;
  const intradayAgeMinutes = intradayTimestamp
    ? (new Date(now).getTime() - intradayTimestamp.getTime()) / 60000
    : null;
  const intradayAvailable = Boolean(technical?.timeframes?.m5?.sufficient);
  const intradayWindowMinutes = finite(technical?.timeframes?.m5?.windowSpanMinutes, null);
  const quoteFresh = ageMinutes !== null && ageMinutes >= 0 && ageMinutes <= policy.maxDataAgeMinutes;
  const intradayFresh = intradayAgeMinutes !== null && intradayAgeMinutes >= 0 &&
    intradayAgeMinutes <= policy.maxDataAgeMinutes;
  const intradayWindowOk = intradayWindowMinutes !== null &&
    intradayWindowMinutes >= 0 && intradayWindowMinutes <= 120;
  const fresh = quoteFresh && intradayFresh && intradayAvailable && intradayWindowOk;
  return {
    realtimeEntitlementConfigured: Boolean(realtimeEntitled),
    latestTimestamp: quoteTimestamp?.toISOString() || null,
    quoteTimestamp: quoteTimestamp?.toISOString() || null,
    intradayTimestamp: intradayTimestamp?.toISOString() || null,
    ageMinutes: round(ageMinutes, 1),
    intradayAgeMinutes: round(intradayAgeMinutes, 1),
    intradayWindowMinutes,
    intradayWindowMaxMinutes: 120,
    quoteFresh,
    intradayFresh,
    intradayAvailable,
    intradayWindowOk,
    maxAgeMinutes: policy.maxDataAgeMinutes,
    fresh,
    optionChainFetchedAt,
    greeksSource: 'Tradier',
    greeksFrequency: 'Hourly snapshot; exact as-of timestamp unavailable',
    source: 'Tradier'
  };
}

function idFor(parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

function makeWheelCandidate({
  symbol, quote, technical, expiration, dte, option, strategy, profile, policy,
  dataQuality, institutionalFlow, portfolioState, isPriority, now
}) {
  const isPut = strategy === 'CASH_SECURED_PUT';
  const targetCredit = round(Math.max(0, finite(option.mid, (option.bid + option.ask) / 2)), 2);
  const minimumCredit = round(Math.max(0, finite(option.bid, 0)), 2);
  const contractDelta = finite(option.delta, 0);
  const absDelta = Math.abs(contractDelta);
  const deltaProxy = round(Math.max(0, Math.min(0.99, 1 - absDelta)), 4);
  const liquidity = liquidityScore(option, policy);
  const availableTimeframes = finite(technical?.timeframeSummary?.available, 0);
  const bullishTimeframes = finite(technical?.timeframeSummary?.bullish, 0);
  const trendScore = availableTimeframes > 0 ? (bullishTimeframes / availableTimeframes) * 100 : 0;
  const deltaCenter = (profile.shortDeltaMin + profile.shortDeltaMax) / 2;
  const deltaRange = Math.max(0.01, profile.shortDeltaMax - profile.shortDeltaMin);
  const deltaQuality = Math.max(0, 1 - Math.abs(absDelta - deltaCenter) / (deltaRange / 2));
  const score = Math.round(Math.max(0, Math.min(100,
    (liquidity.score * 0.5) + (trendScore * 0.3) + (deltaQuality * 100 * 0.2)
  )));
  const collateralUsd = isPut ? round(Number(option.strike) * 100, 2) : null;
  const requiredShares = isPut ? 0 : 100;
  const cashAvailableUsd = finite(portfolioState?.cashAvailableUsd, 0);
  const sharesAvailable = Math.max(0, finite(portfolioState?.sharesBySymbol?.[symbol], 0));
  const portfolioUpdatedAt = parseTimestamp(portfolioState?.updatedAt);
  const portfolioAgeHours = portfolioUpdatedAt
    ? Math.max(0, (new Date(now).getTime() - portfolioUpdatedAt.getTime()) / 3600000)
    : null;
  const portfolioFresh = portfolioAgeHours !== null && portfolioAgeHours >= 0 &&
    portfolioAgeHours <= policy.portfolioFreshHours &&
    new Date(now).getTime() >= portfolioUpdatedAt.getTime();
  const maxCoveredContracts = isPut
    ? collateralUsd > 0 ? Math.floor(cashAvailableUsd / collateralUsd) : 0
    : Math.floor(sharesAvailable / 100);
  const portfolioCovered = portfolioFresh && maxCoveredContracts >= 1;
  const maxRiskUsd = isPut
    ? round(Math.max(0, (Number(option.strike) - minimumCredit) * 100), 2)
    : round(Math.max(0, (Number(quote.price) - minimumCredit) * 100), 2);
  const maxProfitUsd = isPut
    ? round(minimumCredit * 100, 2)
    : round(((Number(option.strike) - Number(quote.price)) + minimumCredit) * 100, 2);
  const breakEven = isPut
    ? round(Number(option.strike) - minimumCredit, 2)
    : round(Number(quote.price) - minimumCredit, 2);
  const takeProfitDebit = round(minimumCredit * (1 - profile.takeProfitPct), 2);
  const stopLossDebit = round(minimumCredit * profile.stopMultiple, 2);
  const id = idFor([symbol, 'WHEEL', expiration, strategy, option.strike]);
  const enoughTimeframes = availableTimeframes >= policy.minTimeframes;
  const trendAcceptable = technical?.trend !== 'bearish';
  const rules = {
    score: score >= profile.minScore,
    delta: absDelta >= profile.shortDeltaMin && absDelta <= profile.shortDeltaMax,
    credit: minimumCredit >= policy.minCredit,
    liquidity: liquidity.eligible && liquidity.score >= profile.minLiquidity,
    dte: dte >= profile.minDte && dte <= profile.maxDte && dte > 0,
    timeframes: enoughTimeframes,
    trend: trendAcceptable,
    portfolio: portfolioCovered,
    fresh: Boolean(dataQuality.fresh)
  };
  const collateralConditional = isPut
    ? 'Cash disponible no comprometido de al menos $' + collateralUsd.toFixed(2) + ' por contrato; dato declarado manualmente y debe coincidir con Robinhood.'
    : 'Al menos 100 acciones libres por contrato; cantidad declarada manualmente y debe coincidir con Robinhood.';
  const reasons = [
    'Perfil Rueda: ' + profile.minDte + '-' + profile.maxDte + ' DTE; delta corta ' +
      profile.shortDeltaMin.toFixed(2) + '-' + profile.shortDeltaMax.toFixed(2),
    (isPut ? 'Colateral requerido: $' + collateralUsd.toFixed(2) : 'Acciones libres requeridas: 100') +
      ' por contrato; cobertura manual ' + (portfolioCovered ? 'confirmada' : 'pendiente o vencida'),
    'Liquidez ' + liquidity.score + '/100; volumen ' + liquidity.volume +
      '; interés abierto ' + liquidity.openInterest + '; spread ' + liquidity.spreadPct + '%',
    'Tendencia ' + String(technical?.trend || 'unknown') + '; ' + bullishTimeframes +
      ' de ' + availableTimeframes + ' temporalidades alcistas',
    'Delta ' + contractDelta.toFixed(3) + '; proxy 1-|delta| ' + (deltaProxy * 100).toFixed(1) +
      '%; no es una probabilidad calibrada',
    'El flujo de opciones es observacional y no se usa para aprobar la señal.'
  ];
  if (!portfolioFresh) reasons.push('Actualiza efectivo no comprometido y acciones libres en la sección de colateral.');
  else if (!portfolioCovered) reasons.push(isPut
    ? 'El efectivo declarado no cubre una asignación completa de 100 acciones al strike.'
    : 'No declaraste 100 acciones libres para respaldar un contrato.');
  if (!liquidity.eligible) reasons.push('Volumen, interés abierto o spread bid/ask no supera el mínimo de ejecución.');
  const flow = flowForStrategy(institutionalFlow, strategy, policy.institutionalFlow.minimumConfidence);
  return {
    id,
    candidateId: id,
    symbol,
    isPriority: Boolean(isPriority),
    isWheelSymbol: config.watchlist.wheelSymbols.includes(symbol),
    profile: { id: 'WHEEL', label: 'Rueda', riskLevel: 'MODERADO' },
    strategy,
    strategyLabel: isPut ? 'Cash-Secured Put · Rueda' : 'Covered Call · Rueda',
    direction: isPut ? 'NEUTRAL A ALCISTA · ACEPTAR ASIGNACIÓN' : 'NEUTRAL A ALCISTA · ACEPTAR VENTA',
    source: 'Tradier',
    generatedAt: new Date(now).toISOString(),
    expiration,
    dte,
    underlyingPrice: quote.price,
    shortStrike: Number(option.strike),
    longStrike: null,
    width: null,
    credit: targetCredit,
    midCredit: targetCredit,
    minimumCredit,
    maxProfitUsd,
    maxRiskUsd,
    riskAtMidUsd: maxRiskUsd,
    returnOnRisk: isPut && maxRiskUsd > 0 ? round(maxProfitUsd / maxRiskUsd, 4) : null,
    breakEven,
    popEstimate: deltaProxy,
    deltaProxy,
    score,
    shortDelta: round(contractDelta, 4),
    longDelta: null,
    iv: round(option.iv, 4),
    liquidity,
    institutionalFlow: flow,
    technical,
    dataQuality,
    legs: [{
      action: 'SELL_TO_OPEN',
      type: isPut ? 'PUT' : 'CALL',
      strike: Number(option.strike),
      contractSymbol: option.symbol || null,
      bid: option.bid,
      ask: option.ask,
      delta: contractDelta
    }],
    requirements: {
      wheelStage: isPut ? 'SELL_CASH_SECURED_PUT' : 'SELL_COVERED_CALL',
      collateralUsd,
      sharesRequired: requiredShares,
      referenceStockValueUsd: isPut ? null : round(Number(quote.price) * 100, 2),
      availableCashUsd: isPut ? round(cashAvailableUsd, 2) : null,
      availableShares: isPut ? null : sharesAvailable,
      maxCoveredContracts,
      portfolioUpdatedAt: portfolioState?.updatedAt || null,
      portfolioFresh,
      conditional: collateralConditional
    },
    sizing: {
      mode: 'MANUAL_COVERAGE_CHECK',
      contractsAvailableBasedOnLastCheck: maxCoveredContracts,
      maxRiskPerContractUsd: maxRiskUsd,
      note: 'Cobertura declarada manualmente; recalcula contratos y efectivo restante después de cada orden.'
    },
    executionPlan: {
      order: isPut ? 'Sell to open PUT · efectivo reservado · orden LIMIT' : 'Sell to open CALL · cubierta por acciones libres · orden LIMIT',
      entry: 'Objetivo cerca del punto medio $' + targetCredit.toFixed(2) +
        '; no aceptar un crédito inferior a la cotización bid actual de $' + minimumCredit.toFixed(2) + '.',
      entryTrigger: isPut
        ? 'Solo si aceptarías comprar 100 acciones al strike y mantenerlas tras una caída; costo neto estimado usando el crédito bid: $' + breakEven.toFixed(2) + '.'
        : 'Solo si tienes 100 acciones libres por contrato y aceptarías venderlas al strike; el costo base real de tus acciones no está conectado.',
      entryCredit: targetCredit,
      minimumCredit,
      breakEven,
      takeProfit: 'Evaluar Buy to close cerca de $' + takeProfitDebit.toFixed(2) +
        ' o menos, equivalente a capturar aproximadamente ' + Math.round(profile.takeProfitPct * 100) + '% de la prima mínima.',
      takeProfitDebit,
      stopLoss: 'Revisar la posición si el débito de cierre llega a $' + stopLossDebit.toFixed(2) +
        ' (' + profile.stopMultiple.toFixed(1) + 'x crédito mínimo) o si cambia la tesis; es un umbral de revisión, no un stop garantizado.',
      stopLossDebit,
      timeStop: 'Reevaluar al llegar a ' + profile.timeStopDte + ' DTE; revisar vencimiento, asignación y eventos antes de mantener.',
      eventRule: 'No abrir con el filtro de noticias distinto de CLEAR; revalidar justo antes de enviar en Robinhood.',
      assignmentRule: isPut
        ? 'Si asignan, reservarás $' + collateralUsd.toFixed(2) + ' y normalmente recibirás 100 acciones; actualiza el inventario antes de vender una Covered Call.'
        : 'Si asignan, normalmente venderás 100 acciones al strike; actualiza efectivo libre antes de evaluar otra Cash-Secured Put.',
      rollRule: 'No rolar solo para aplazar una pérdida. Compara débito/crédito neto, nuevo punto de equilibrio, riesgo, DTE y eventos; confirma la combinación en Robinhood.'
    },
    greeks: {
      delta: round(-contractDelta, 4),
      gamma: round(-finite(option.gamma, 0), 6),
      theta: round(-finite(option.theta, 0), 6),
      vega: round(-finite(option.vega, 0), 6),
      rho: round(-finite(option.rho, 0), 6),
      source: 'Tradier',
      freshness: 'Snapshot horario; Tradier no entrega timestamp por contrato en esta respuesta.'
    },
    deterministic: {
      pass: Object.values(rules).every(Boolean),
      rules,
      reasons
    },
    aiReview: null,
    status: 'CANDIDATE'
  };
}

export function buildWheelCandidates({
  symbol, quote, technical, chain, expiration, dte, policy = config.policy,
  profile, dataQuality = { fresh: false }, institutionalFlow = null,
  portfolioState = null, isPriority = false, now = new Date()
}) {
  const activePolicy = completePolicy(policy);
  const activeProfile = normalizeWheelProfile(profile || activePolicy.profiles.wheel, activePolicy);
  if (!activeProfile.enabled || !Number.isFinite(Number(quote?.price))) return [];
  const center = (activeProfile.shortDeltaMin + activeProfile.shortDeltaMax) / 2;
  const eligible = (option, type, side) => validLeg(option) && option.type === type &&
    (side === 'put' ? Number(option.strike) < Number(quote.price) : Number(option.strike) > Number(quote.price)) &&
    Math.abs(Number(option.delta)) >= activeProfile.shortDeltaMin &&
    Math.abs(Number(option.delta)) <= activeProfile.shortDeltaMax;
  const closest = (options) => [...options]
    .sort((left, right) => Math.abs(Math.abs(left.delta) - center) - Math.abs(Math.abs(right.delta) - center))
    .slice(0, 3);
  const puts = closest(chain.filter((option) => eligible(option, 'put', 'put')));
  const calls = closest(chain.filter((option) => eligible(option, 'call', 'call')));
  return [
    ...puts.map((option) => makeWheelCandidate({
      symbol, quote, technical, expiration, dte, option, strategy: 'CASH_SECURED_PUT',
      profile: activeProfile, policy: activePolicy, dataQuality, institutionalFlow,
      portfolioState, isPriority, now
    })),
    ...calls.map((option) => makeWheelCandidate({
      symbol, quote, technical, expiration, dte, option, strategy: 'COVERED_CALL',
      profile: activeProfile, policy: activePolicy, dataQuality, institutionalFlow,
      portfolioState, isPriority, now
    }))
  ].filter((candidate) => candidate.minimumCredit >= activePolicy.minCredit)
    .sort((left, right) => right.score - left.score);
}

function topPerSymbolStrategy(candidates) {
  const result = [];
  const seen = new Set();
  const ordered = [...candidates].sort((left, right) =>
    Number(right.isPriority) - Number(left.isPriority) ||
    Number(right.isWheelSymbol) - Number(left.isWheelSymbol) ||
    right.score - left.score);
  for (const candidate of ordered) {
    const key = candidate.symbol + ':' + candidate.strategy;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function isFreshTimestamp(value, now, maxAgeMinutes) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return false;
  const ageMinutes = (new Date(now).getTime() - timestamp.getTime()) / 60000;
  return ageMinutes >= 0 && ageMinutes <= maxAgeMinutes;
}

export function applyReviews(candidates, geminiResult, { marketOpen, marketRisk, realtimeEntitled, now = new Date() }) {
  const reviews = new Map((geminiResult?.reviews || []).map((review) => [review.candidateId, review]));
  const newsFresh = isFreshTimestamp(marketRisk?.checkedAt, now, config.gemini.newsCacheMinutes);
  const newsClear = marketRisk?.status === 'CLEAR' && marketRisk?.coverageComplete && newsFresh;
  return candidates.map((candidate) => {
    const review = reviews.get(candidate.id) || null;
    const aiApproved = Boolean(geminiResult?.ok && review?.decision === 'APPROVE');
    const deterministicReady = Boolean(candidate.deterministic.pass);
    const dataReady = Boolean(realtimeEntitled && candidate.dataQuality?.fresh);
    const ready = Boolean(marketOpen && deterministicReady && aiApproved && newsClear && dataReady);
    const reasons = [
      !marketOpen ? 'Mercado cerrado: no abrir ni alertar.' : null,
      !newsClear ? !newsFresh ? 'La revisión de noticias falta o está vencida.' : 'Filtro de noticias ' + (marketRisk?.status || 'UNKNOWN') + ': no abrir.' : null,
      !realtimeEntitled ? 'Entitlement de tiempo real no está habilitado en configuración; Tradier no confirma el entitlement por esta bandera.' : null,
      !candidate.dataQuality?.quoteFresh ? 'La cotización del subyacente falta, es futura o está vencida.' : null,
      !candidate.dataQuality?.intradayFresh ? 'La última vela de 5 minutos falta, es futura o está vencida.' : null,
      !candidate.dataQuality?.intradayAvailable ? 'Faltan 21 velas de 5 minutos para el contexto intradía.' : null,
      !candidate.dataQuality?.intradayWindowOk ? 'Las últimas 21 velas de 5 minutos cubren más de 120 minutos; el contexto intradía no es fiable.' : null,
      !candidate.deterministic.rules.portfolio ? 'No se ha verificado en Robinhood efectivo libre o 100 acciones sin compromiso; la cobertura debe estar actualizada.' : null,
      !candidate.deterministic.rules.liquidity ? 'La opción no cumple los mínimos de volumen, interés abierto o spread bid/ask.' : null,
      !deterministicReady ? 'El candidato no supera los filtros cuantitativos y multitemporales.' : null,
      !geminiResult?.configured ? 'Gemini no está configurado; señal bloqueada.' : null,
      geminiResult?.configured && !geminiResult?.ok ? 'La revisión de Gemini falló; señal bloqueada.' : null,
      geminiResult?.configured && !review ? 'Gemini no revisó este candidato.' : null,
      review && review.decision !== 'APPROVE' ? 'Gemini recomienda ' + review.decision + '.' : null
    ].filter(Boolean);
    return {
      ...candidate,
      status: ready ? 'READY' : review?.decision === 'REJECT' ? 'REJECTED' : 'WATCH',
      aiReview: review,
      readiness: {
        deterministic: deterministicReady,
        ai: aiApproved,
        news: newsClear,
        data: dataReady,
        portfolio: Boolean(candidate.deterministic.rules.portfolio),
        liquidity: Boolean(candidate.deterministic.rules.liquidity),
        marketOpen: Boolean(marketOpen),
        final: ready,
        reasons
      }
    };
  });
}

function enforceSharedCoverage(candidates, portfolioState) {
  let remainingCash = Math.max(0, finite(portfolioState?.cashAvailableUsd, 0));
  const remainingShares = { ...(portfolioState?.sharesBySymbol || {}) };
  const ordered = [...candidates].sort((left, right) =>
    Number(right.status === 'READY') - Number(left.status === 'READY') ||
    Number(right.isPriority) - Number(left.isPriority) || right.score - left.score);
  const blocked = new Map();
  for (const candidate of ordered) {
    if (candidate.status !== 'READY') continue;
    if (candidate.strategy === 'CASH_SECURED_PUT') {
      const needed = finite(candidate.requirements?.collateralUsd, Infinity);
      if (remainingCash < needed) {
        blocked.set(candidate.id, 'El efectivo libre ya está asignado a otra señal de put en esta revisión.');
      } else {
        remainingCash -= needed;
      }
    } else if (candidate.strategy === 'COVERED_CALL') {
      const freeShares = Math.max(0, finite(remainingShares[candidate.symbol], 0));
      if (freeShares < 100) {
        blocked.set(candidate.id, 'Las acciones libres ya están asignadas a otra Covered Call en esta revisión.');
      } else {
        remainingShares[candidate.symbol] = freeShares - 100;
      }
    }
  }
  return candidates.map((candidate) => {
    const reason = blocked.get(candidate.id);
    if (!reason) return candidate;
    const reasons = [...(candidate.readiness?.reasons || []), reason];
    return {
      ...candidate,
      status: 'WATCH',
      readiness: { ...candidate.readiness, portfolio: false, final: false, reasons }
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
      catch (error) {
        results[index] = {
          error: error.message,
          symbol: items[index],
          errors: [{ symbol: items[index], stage: 'symbol', error: error.message }]
        };
      }
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
    strategy: candidate.strategyLabel,
    expiration: candidate.expiration,
    dte: candidate.dte,
    underlyingPrice: candidate.underlyingPrice,
    shortStrike: candidate.shortStrike,
    creditTarget: candidate.credit,
    minimumCredit: candidate.minimumCredit,
    breakEven: candidate.breakEven,
    collateralRequirement: candidate.requirements,
    maxRiskUsd: candidate.maxRiskUsd,
    maxProfitUsd: candidate.maxProfitUsd,
    deltaProxy: candidate.deltaProxy,
    score: candidate.score,
    shortDelta: candidate.shortDelta,
    liquidity: candidate.liquidity,
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
  portfolioState = null,
  now = new Date()
} = {}) {
  const startedAt = Date.now();
  if (!tradier) throw new Error('Tradier client is required.');
  const activePolicy = completePolicy(policy);
  const priority = [...new Set(prioritySymbols.map((symbol) => String(symbol).toUpperCase()))];
  const selectedSymbols = symbols || selectRotatingUniverse({ maxSymbols, now });
  const requested = [...new Set(selectedSymbols.map((symbol) => String(symbol).toUpperCase()))];
  const universe = [
    ...requested.filter((symbol) => priority.includes(symbol)),
    ...requested.filter((symbol) => !priority.includes(symbol))
  ].slice(0, maxSymbols);
  const contextIndexSymbols = [...new Set((contextIndices || []).map((symbol) => String(symbol).toUpperCase()))];
  const catalog = universeCatalog();
  const clock = await tradier.getMarketClock();
  const marketOpen = String(clock?.state || '').toLowerCase() === 'open';
  const marketRiskPromise = typeof gemini?.reviewMarketRisk === 'function'
    ? gemini.reviewMarketRisk({
      symbols: catalog.allSignalSymbols,
      prioritySymbols: priority,
      contextIndices: contextIndexSymbols,
      marketClock: clock,
      now
    }).catch((error) => marketRiskFallback(error, { configured: Boolean(gemini?.configured ?? true), now }))
    : Promise.resolve(marketRiskFallback(new Error('Gemini no implementa la revisión de noticias.'), { configured: false, now }));
  const [quotes, contextIndexQuotes] = await Promise.all([
    tradier.getQuotes(universe),
    contextIndexSymbols.length ? tradier.getQuotes(contextIndexSymbols).catch(() => []) : Promise.resolve([])
  ]);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const perSymbolPromise = mapWithConcurrency(universe, 3, async (symbol) => {
    const errors = [];
    const quote = quoteMap.get(symbol);
    if (!quote?.price) {
      const error = 'Tradier no entregó precio válido.';
      return { symbol, error, errors: [{ symbol, stage: 'quote', error }] };
    }
    const [historyResult, intradayResult, expirationsResult] = await Promise.allSettled([
      tradier.getHistory(symbol, 420, 'daily', now),
      typeof tradier.getTimeSales === 'function'
        ? tradier.getTimeSales(symbol, { interval: '5min', lookbackDays: 8, now, sessionFilter: 'open' })
        : Promise.reject(new Error('Cliente Tradier sin Time & Sales.')),
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
    const wheelProfile = normalizeWheelProfile(activePolicy.profiles.wheel, activePolicy);
    const selected = chooseExpiration(expirationsResult.value, wheelProfile, now);
    if (!selected) {
      errors.push({
        symbol,
        stage: 'expiration-wheel',
        error: 'Sin vencimiento ' + wheelProfile.minDte + '-' + wheelProfile.maxDte + ' DTE.'
      });
      return { symbol, quote, technical, dataQuality, candidates: [], errors };
    }
    let chain;
    try {
      chain = await tradier.getOptionChain(symbol, selected.expiration);
    } catch (error) {
      errors.push({ symbol, stage: 'chain-wheel', error: error.message });
      return { symbol, quote, technical, dataQuality, candidates: [], errors };
    }
    const chainDataQuality = { ...dataQuality, optionChainFetchedAt: new Date().toISOString() };
    const institutionalFlow = analyzeInstitutionalFlow({
      chain, quote, history, technical, now, settings: activePolicy.institutionalFlow
    });
    const candidates = buildWheelCandidates({
      symbol,
      quote,
      technical,
      chain,
      expiration: selected.expiration,
      dte: selected.dte,
      policy: activePolicy,
      profile: wheelProfile,
      dataQuality: chainDataQuality,
      institutionalFlow,
      portfolioState,
      isPriority: priority.includes(symbol),
      now
    });
    return { symbol, quote, technical, dataQuality: chainDataQuality, candidateCount: candidates.length, candidates, errors };
  });

  const [perSymbol, marketRisk] = await Promise.all([perSymbolPromise, marketRiskPromise]);
  const errors = perSymbol.flatMap((item) => item.errors || []);
  const allCandidates = perSymbol.flatMap((item) => item.candidates || []);
  const displayCandidates = topPerSymbolStrategy(allCandidates);
  const reviewSet = displayCandidates.slice(0, 12).map(candidateForReview);
  let geminiResult;
  try {
    geminiResult = await gemini.review(reviewSet, {
      marketOpen,
      clock,
      symbols: universe,
      prioritySymbols: priority,
      dataSource: 'Tradier',
      realtimeEntitlementConfigured: Boolean(realtimeEntitled),
      optionGreeksFrequency: 'Tradier Brokerage API Greeks are hourly; exact snapshot time is not supplied in this response.',
      generatedAt: new Date(now).toISOString(),
      policy: activePolicy,
      marketRisk,
      contextIndices: contextIndexQuotes,
      learning: learningContext?.usable
        ? learningContext
        : { usable: false, warning: 'Sin muestra validada; no inferir ventaja histórica.' }
    });
  } catch (error) {
    geminiResult = { configured: Boolean(gemini?.configured ?? true), ok: false, error: error.message, reviews: [], marketNote: '' };
  }
  const reviewed = enforceSharedCoverage(
    applyReviews(displayCandidates, geminiResult, { marketOpen, marketRisk, realtimeEntitled, now }),
    portfolioState
  );
  const sorted = reviewed.sort((left, right) => {
    const rank = { READY: 3, WATCH: 2, CANDIDATE: 1, REJECTED: 0 };
    return (rank[right.status] - rank[left.status]) ||
      Number(right.isPriority) - Number(left.isPriority) ||
      Number(right.isWheelSymbol) - Number(left.isWheelSymbol) ||
      right.score - left.score;
  });
  const ready = sorted.filter((candidate) => candidate.status === 'READY').slice(0, activePolicy.maxDailySignals);
  const readyIds = new Set(ready.map((candidate) => candidate.id));
  const scanId = 'scan-' + new Date(now).getTime();
  const signals = sorted.map((candidate) => {
    const signal = readyIds.has(candidate.id)
      ? candidate
      : candidate.status === 'READY'
        ? { ...candidate, status: 'WATCH', readiness: { ...candidate.readiness, final: false, reasons: [...candidate.readiness.reasons, 'Se alcanzó el límite de señales listas en esta revisión.'] } }
        : candidate;
    return { ...signal, instanceId: scanId + ':' + signal.id };
  });
  return {
    id: scanId,
    generatedAt: new Date(now).toISOString(),
    durationMs: Date.now() - startedAt,
    source: 'Tradier',
    data: {
      provider: 'Tradier',
      realtimeEntitlementConfigured: Boolean(realtimeEntitled),
      mode: realtimeEntitled ? 'REAL_TIME_ENTITLEMENT_CONFIGURED_UNVERIFIED' : 'ENTITLEMENT_UNCONFIRMED',
      intradayInterval: '5min',
      historicalTimeframes: ['5m', '15m', '1h', '1D', '1W'],
      greeksFreshness: 'Hourly snapshot; no contract-level timestamp'
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
      groundedSources: marketRisk?.sources?.length || 0,
      independentSourceDomains: marketRisk?.uniqueSourceDomains?.length || 0
    },
    portfolio: {
      source: 'manual',
      updatedAt: portfolioState?.updatedAt || null,
      fresh: Boolean(parseTimestamp(portfolioState?.updatedAt) &&
        (new Date(now).getTime() - parseTimestamp(portfolioState.updatedAt).getTime()) / 3600000 <= activePolicy.portfolioFreshHours)
    },
    learning: {
      usedByGemini: Boolean(learningContext?.usable),
      minimumSampleGuard: config.learning.minimumValidatedSamples,
      warning: 'El historial es observacional; no convierte una señal en READY.'
    },
    signals,
    errors,
    summary: {
      ready: signals.filter((signal) => signal.status === 'READY').length,
      watch: signals.filter((signal) => signal.status === 'WATCH').length,
      rejected: signals.filter((signal) => signal.status === 'REJECTED').length,
      candidates: allCandidates.length,
      wheel: signals.filter((signal) => signal.profile?.id === 'WHEEL').length,
      cashSecuredPuts: signals.filter((signal) => signal.strategy === 'CASH_SECURED_PUT').length,
      coveredCalls: signals.filter((signal) => signal.strategy === 'COVERED_CALL').length,
      priority: signals.filter((signal) => signal.isPriority).length,
      symbolsWithData: perSymbol.filter((item) => item.quote && item.technical).length
    },
    warnings: [
      'La puntuación ordena candidatos; no representa probabilidad de ganancia ni está calibrada.',
      'El proxy 1-|delta| no es una probabilidad estadística. Tradier entrega Greeks en snapshots horarios sin timestamp por contrato.',
      'READY significa lista para revisión manual. Verifica bid/ask, Greeks, colateral y posición en Robinhood justo antes de enviar.',
      'El efectivo y las acciones se declaran manualmente; 5 MILLIONS no está conectado a las posiciones ni envía órdenes a Robinhood.',
      'Las señales se limitan a Cash-Secured Puts y Covered Calls; cada put debe tener efectivo y cada call 100 acciones libres por contrato.',
      'Revisa por separado los límites de efectivo cuando evalúes más de una señal: una misma reserva no cubre contratos simultáneos.'
    ]
  };
}
