import pLimit from 'p-limit';
import { UNIVERSE, config, providerStatus } from '../config.js';
import { appendAlert, getAlerts } from '../lib/store.js';
import { daysTo, round } from '../lib/math.js';
import { repository } from '../db/repository.js';
import { classifyEventRisk, classifyNewsRisk, classifySoftEventRisk, computeGammaProxy, detectMarketRegime, loadMarketOverview } from './market-intelligence.js';
import { deriveTechnicals } from './technicals.js';
import {
  generateCashSecuredPut,
  generateCoveredCall,
  generateDefinedRiskSetups,
  generateVolatilityDebitSpread
} from './strategies.js';
import { scoreSetup, classifySignal } from './scoring.js';
import { createDailyAssistant, createExecutionPlan } from './guidance.js';
import { buildDataHealth } from './data-health.js';
import { calculateProbabilityEdge } from './probability-edge.js';
import { evaluateRiskGovernor } from './risk-governor.js';
import { buildGuardianEdgeTicketScan } from '../guardian/edge-tickets.js';

const DEFAULT_SYMBOLS = [...UNIVERSE.core, ...UNIVERSE.indices, ...UNIVERSE.magnificent7, ...UNIVERSE.focusEquities, ...UNIVERSE.liquidEtfs];
const SHORT_DTE_SYMBOLS = new Set(['SPY', 'SPX', 'QQQ', 'IWM', 'DIA']);
const CORRELATED = {
  SPY: 'broad', SPX: 'broad', DIA: 'broad', IWM: 'broad',
  QQQ: 'tech', XLK: 'tech', AAPL: 'tech', MSFT: 'tech', NVDA: 'tech',
  AMZN: 'tech', META: 'tech', GOOGL: 'tech', TSLA: 'growth'
};

function deterministicSummary(scan) {
  if (scan.decision.status === 'conditional_edge') {
    const best = scan.guardianEdge?.dailyBest;
    return best
      ? `EDGE CONDICIONAL: Guardian detectó ${best.symbol} ${best.strategy} (${best.classification}) con POP estimada ${best.popEstimated ?? 'No disponible'}%. Requiere gatillo, cadena y riesgo verificados manualmente.`
      : 'EDGE CONDICIONAL: existen candidatos educativos/condicionales, pero ningún trade real validado.';
  }
  if (scan.decision.status !== 'eligible') {
    return `No ejecutar sin revisión: ${scan.decision.reasons.join(' ')} La recolección permanece activa para construir IV Rank y snapshots.`;
  }
  const best = scan.opportunities[0];
  return `${scan.market.regime} con VIX ${scan.market.vix}. Mejor plan filtrado: ${best.symbol} ${best.strategy}, confianza ${best.confidenceScore}/100 y riesgo maximo $${best.maxRisk}.`;
}

function highImpactForSymbol(earnings, symbol, expiration) {
  return earnings.find((entry) => entry.symbol === symbol && entry.date <= expiration) || null;
}

function flowAlignment(flow, setup) {
  const records = flow.filter((entry) => entry.symbol === setup.symbol);
  if (!records.length) return 'unavailable';
  const bullish = records.filter((entry) => String(entry.sentiment).toLowerCase().includes('bull')).length;
  const bearish = records.filter((entry) => String(entry.sentiment).toLowerCase().includes('bear')).length;
  const wantsBullish = /(Bull|Cash Secured Put|Call Debit)/i.test(setup.strategy);
  const wantsBearish = /(Bear|Put Debit)/i.test(setup.strategy);
  const aligned = wantsBullish ? bullish >= bearish : wantsBearish ? bearish >= bullish : true;
  return aligned ? 'aligned' : 'opposed';
}

function chooseExpiration(expirations, minDte, maxDte) {
  return expirations.map((date) => ({ date, dte: daysTo(date) }))
    .filter(({ dte }) => dte >= minDte && dte <= maxDte)
    .sort((a, b) => a.dte - b.dte)[0] || null;
}

function atmMetrics(chain, spot, dte) {
  const atm = chain.slice().sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 4);
  const values = atm.map((contract) => contract.iv).filter(Number.isFinite);
  const iv = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const call = chain.filter((contract) => contract.type === 'call').sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
  const put = chain.filter((contract) => contract.type === 'put').sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
  const straddle = call && put && [call.bid, call.ask, put.bid, put.ask].every(Number.isFinite)
    ? ((call.bid + call.ask) / 2) + ((put.bid + put.ask) / 2) : null;
  return {
    iv,
    expectedMove: Number.isFinite(straddle) ? round(straddle) :
      iv === null ? null : round(spot * iv * Math.sqrt(dte / 365))
  };
}

function correlationRisk(symbol, activeSymbols) {
  const bucket = CORRELATED[symbol];
  if (!bucket) return false;
  return activeSymbols.filter((active) => CORRELATED[active] === bucket).length >= 2;
}

function buildTapeProxy(technicals = {}, setup = {}) {
  const relVol = Number(technicals.relativeVolume20);
  const macd = Number(technicals.macd?.histogram);
  const rsi = Number(technicals.rsi14);
  const bullish = /Bull|Call Debit/i.test(setup.strategy);
  const bearish = /Bear|Put Debit/i.test(setup.strategy);
  let pressure = 0;
  if (technicals.trend === 'bullish') pressure += 25;
  if (technicals.trend === 'bearish') pressure -= 25;
  if (Number.isFinite(macd)) pressure += Math.max(-25, Math.min(25, macd * 80));
  if (Number.isFinite(relVol)) pressure += relVol >= 1.2 ? 15 : relVol < 0.8 ? -10 : 5;
  if (Number.isFinite(rsi)) {
    if (rsi > 70) pressure -= bullish ? 10 : -5;
    else if (rsi < 30) pressure += bearish ? -10 : 5;
    else if (rsi >= 45 && rsi <= 65) pressure += bullish ? 5 : bearish ? -5 : 0;
  }
  const score = Math.round(Math.max(-100, Math.min(100, pressure)));
  const aligned = bullish ? score > 10 : bearish ? score < -10 : Math.abs(score) < 35;
  return {
    mode: 'proxy',
    label: score >= 25 ? 'Bullish tape proxy' : score <= -25 ? 'Bearish tape proxy' : Math.abs(score) < 12 ? 'Neutral tape proxy' : 'Mixed tape proxy',
    pressureScore: score,
    aggressionScore: Math.round(Math.max(0, Math.min(100, Math.abs(score) + (Number.isFinite(relVol) ? (relVol - 1) * 25 : 0)))),
    volumeSurgeScore: Number.isFinite(relVol) ? Math.round(Math.max(0, Math.min(100, relVol * 50))) : null,
    alignedWithStrategy: aligned,
    limitation: 'Proxy educativo basado en tendencia, momentum, volumen relativo y VWAP/EMA disponibles; no es Time & Sales ni Level 2 real.'
  };
}

function individualBlocks({ setup, ivRank, gamma, earningsRisk, policy, profile, flowBias }) {
  const blocks = [];
  const premiumTrade = !/Debit Spread/i.test(setup.strategy);
  if (ivRank === null) blocks.push('IV Rank aun necesita mas observaciones reales persistidas');
  if (premiumTrade && gamma.regime !== 'positive') blocks.push('Vender prima requiere proxy gamma OI positivo');
  if (!premiumTrade && gamma.regime !== 'negative') blocks.push('Una estructura de expansion requiere proxy gamma negativo');
  if (earningsRisk) blocks.push(`Resultados antes de expiracion: ${earningsRisk.date}`);
  if (setup.liquidityScore < 7) blocks.push('Liquidez debajo del umbral institucional');
  if (premiumTrade && setup.pop < 65) blocks.push('Probabilidad estimada debajo del umbral para vender prima');
  if (/Iron Condor/i.test(setup.strategy) && setup.creditWidthRatio < 20) blocks.push('Credito del iron condor menor al 20% del ancho');
  if (setup.maxRisk > profile.accountSize * profile.riskPct / 100) blocks.push('Riesgo mayor al presupuesto por operacion');
  if (setup.collateralRequired > profile.accountSize * profile.maxCollateralPct / 100) blocks.push('Colateral mayor al limite de la cuenta');
  if (flowBias === 'opposed') blocks.push('El flujo inusual contradice la estructura');
  if (correlationRisk(setup.symbol, profile.activeSymbols)) blocks.push('Limite de exposicion correlacionada alcanzado');
  if (profile.activeSymbols.length >= profile.maxOpenTrades) blocks.push('Numero maximo de operaciones abiertas alcanzado');
  if (profile.dailyLossPct >= profile.maxDailyLossPct) blocks.push('Kill switch por perdida diaria activado');
  if (profile.weeklyLossPct >= profile.maxWeeklyLossPct) blocks.push('Kill switch por perdida semanal activado');
  if (profile.collateralUsedPct >= 80) blocks.push('Colateral utilizado sobre 80%; solo educacion/paper trade');
  if (/0DTE/i.test(setup.strategy)) blocks.push('0DTE solo se observa en modo trabajo');
  if (/1DTE/i.test(setup.strategy) && !profile.allow1DteApproval) blocks.push('1DTE requiere aprobacion expresa en el mandato');
  if (/Debit Spread/i.test(setup.strategy) && policy.workMode) blocks.push('Estructura direccional incompatible con modo trabajo');
  return blocks;
}

async function loadChain({ symbol, expiration, providers }) {
  if (!expiration) return null;
  const chain = await providers.options.getOptionChain(symbol, expiration.date);
  if (!chain.length) return null;
  await repository.saveOptionChain(symbol, expiration.date, chain);
  return { ...expiration, chain };
}

async function scanSymbol({ symbol, providers, market, macro, policy, profile }) {
  const quote = market.quotes.find((item) => item.symbol === symbol);
  if (!quote || !Number.isFinite(quote.price)) return { symbol, error: 'No verified quote' };
  try {
    const [history, expirations] = await Promise.all([providers.market.getHistory(symbol), providers.options.getExpirations(symbol)]);
    const technicals = deriveTechnicals(history);
    const primaryExpiry = chooseExpiration(expirations, policy.minDte, policy.maxDte);
    const shortExpiry = SHORT_DTE_SYMBOLS.has(symbol) ? chooseExpiration(expirations, 0, 1) : null;
    const chains = [];
    if (primaryExpiry) {
      const primary = await loadChain({ symbol, expiration: primaryExpiry, providers });
      if (primary) chains.push({ ...primary, category: 'income' });
    }
    if (shortExpiry && shortExpiry.date !== primaryExpiry?.date) {
      const short = await loadChain({ symbol, expiration: shortExpiry, providers });
      if (short) chains.push({ ...short, category: short.dte === 0 ? '0DTE' : '1DTE' });
    }
    if (!chains.length) return { symbol, error: 'No option chain in configured DTE windows', technicals };
    const ivChain = chains.find((item) => item.category === 'income') || chains[0];
    const primaryMetrics = atmMetrics(ivChain.chain, quote.price, ivChain.dte);
    const ivStats = await repository.recordIv(symbol, primaryMetrics.iv, policy.ivRankMinObservations);
    const candidates = [];
    const conditionalCandidates = [];
    chains.forEach((entry) => {
      const metrics = atmMetrics(entry.chain, quote.price, entry.dte);
      const gamma = computeGammaProxy(entry.chain, quote.price);
      const standardPolicy = entry.category === 'income' ? policy : {
        ...policy,
        targetDelta: 0.1,
        minShortDelta: 0.06,
        maxShortDelta: 0.16
      };
      const earningsRisk = highImpactForSymbol(macro.earnings, symbol, entry.date);
      const base = entry.category === 'income' ? [
        ...generateDefinedRiskSetups({ symbol, spot: quote.price, expiration: entry.date, chain: entry.chain, trend: technicals.trend, policy: standardPolicy }),
        ...generateCashSecuredPut({ symbol, spot: quote.price, expiration: entry.date, chain: entry.chain, trend: technicals.trend, policy: standardPolicy, cashAvailable: profile.accountSize * profile.maxCollateralPct / 100 }),
        ...generateCoveredCall({ symbol, spot: quote.price, expiration: entry.date, chain: entry.chain, trend: technicals.trend, policy: standardPolicy, shares: profile.holdings[symbol] }),
        ...generateVolatilityDebitSpread({ symbol, spot: quote.price, expiration: entry.date, chain: entry.chain, trend: technicals.trend, policy: standardPolicy })
      ] : generateDefinedRiskSetups({
        symbol,
        spot: quote.price,
        expiration: entry.date,
        chain: entry.chain,
        trend: 'range',
        policy: standardPolicy,
        condorOnly: true,
        strategyPrefix: `${entry.category} `
      });
      base.forEach((setup) => candidates.push({
        setup,
        gamma,
        technicals,
        earningsRisk,
        metrics,
        dte: entry.dte,
        category: entry.category,
        ivRank: ivStats.ivRank,
        ivPercentile: ivStats.ivPercentile,
        ivRankObservations: ivStats.samples.length
      }));
      if (entry.category === 'income') {
        const conditionalStructures = [
          {
            educationBias: 'bullish',
            options: generateDefinedRiskSetups({ symbol, spot: quote.price, expiration: entry.date, chain: entry.chain, trend: 'bullish', policy: standardPolicy })
              .filter((setup) => /Bull Put Spread/i.test(setup.strategy))
          },
          {
            educationBias: 'bearish',
            options: generateDefinedRiskSetups({ symbol, spot: quote.price, expiration: entry.date, chain: entry.chain, trend: 'bearish', policy: standardPolicy })
              .filter((setup) => /Bear Call Spread/i.test(setup.strategy))
          },
          {
            educationBias: 'neutral',
            options: generateDefinedRiskSetups({ symbol, spot: quote.price, expiration: entry.date, chain: entry.chain, trend: 'range', policy: standardPolicy })
              .filter((setup) => /Iron Condor/i.test(setup.strategy))
          }
        ];
        conditionalStructures.forEach(({ educationBias, options }) => {
          if (!options[0]) return;
          conditionalCandidates.push({
            setup: options[0],
            educationBias,
            gamma,
            technicals,
            earningsRisk,
            metrics,
            dte: entry.dte,
            category: 'educational',
            ivRank: ivStats.ivRank,
            ivPercentile: ivStats.ivPercentile,
            ivRankObservations: ivStats.samples.length
          });
        });
      }
    });
    return {
      symbol,
      candidates,
      conditionalCandidates,
      gamma: candidates.find((candidate) => candidate.category === 'income')?.gamma || candidates[0]?.gamma,
      technicals,
      ivRank: ivStats.ivRank,
      ivRankObservations: ivStats.samples.length,
      collectedChains: chains.map((entry) => ({ expiration: entry.date, dte: entry.dte, category: entry.category, contracts: entry.chain.length }))
    };
  } catch (error) {
    return { symbol, error: error.message };
  }
}

function requiredProviderGates(providers) {
  return [
    { name: 'Quotes', pass: Boolean(providers.market), required: 'Tradier, Polygon or Yahoo Finance', hardRequired: true },
    { name: 'Options chain with IV/OI', pass: Boolean(providers.options), required: 'Tradier, Polygon or Yahoo Finance', hardRequired: true },
    { name: 'Macro and earnings calendar', pass: Boolean(providers.calendar), required: 'Finnhub or FMP', hardRequired: false },
    { name: 'Breaking market news', pass: Boolean(providers.news), required: 'Finnhub or Yahoo Finance', hardRequired: false }
  ];
}

export async function runAutonomousScan({ providers, settings = config } = {}) {
  const policy = settings.policy;
  const watchlist = await repository.getWatchlist(DEFAULT_SYMBOLS);
  const profile = await repository.getRiskProfile({
    ...policy,
    holdings: {},
    activeSymbols: [],
    dailyLossPct: 0,
    weeklyLossPct: 0,
    collateralUsedPct: 0,
    riskMode: policy.defaultRiskMode || 'MODERATE_AGGRESSIVE',
    tradingPaused: false
  });
  const symbols = [...new Set([...(settings.watchlist?.core || UNIVERSE.core), ...UNIVERSE.indices, ...UNIVERSE.magnificent7, ...UNIVERSE.focusEquities, ...watchlist.symbols])];
  const providerGates = requiredProviderGates(providers);
  const missing = providerGates.filter((gate) => !gate.pass);
  const base = {
    asOf: new Date().toISOString(),
    refreshSeconds: settings.refreshSeconds,
    marketDataMode: settings.marketDataMode || 'live',
    providers: providerStatus(),
    providerGates,
    watchlist,
    profile
  };
  const hardMissing = missing.filter((gate) => gate.hardRequired);
  if (hardMissing.length) {
    const scan = {
      ...base,
      decision: { status: 'configuration_required', label: 'NO TRADE - FALTAN FUENTES REALES', reasons: hardMissing.map((gate) => `${gate.name}: configura ${gate.required}.`) },
      collection: await repository.collectionStats(),
      market: null,
      macro: null,
      opportunities: [],
      rejected: [],
      conditionalIdeas: [],
      dataHealth: buildDataHealth({ providerStates: base.providers }),
      alerts: await getAlerts()
    };
    scan.summary = deterministicSummary(scan);
    return scan;
  }
  const newsProvider = providers.news || providers.finnhub;
  const [market, events, earnings, news, companyNews, flow, blockTrades, insiders] = await Promise.all([
    loadMarketOverview({ providers, symbols: [...new Set([...symbols, ...UNIVERSE.breadth])] }),
    providers.calendar ? providers.calendar.getEconomicCalendar().catch(() => []) : Promise.resolve([]),
    providers.calendar ? providers.calendar.getEarningsCalendar(symbols).catch(() => []) : Promise.resolve([]),
    newsProvider ? newsProvider.getMarketNews().catch(() => []) : Promise.resolve([]),
    newsProvider && typeof newsProvider.getCompanyNews === 'function'
      ? newsProvider.getCompanyNews([...UNIVERSE.magnificent7, ...UNIVERSE.focusEquities]).catch(() => [])
      : Promise.resolve([]),
    providers.benzinga.configured && typeof providers.benzinga.getUnusualOptions === 'function' ? providers.benzinga.getUnusualOptions(symbols).catch(() => []) : Promise.resolve([]),
    providers.benzinga.configured && typeof providers.benzinga.getBlockTrades === 'function' ? providers.benzinga.getBlockTrades(symbols).catch(() => []) : Promise.resolve([]),
    providers.finnhub.configured && typeof providers.finnhub.getInsiderTransactions === 'function' ? providers.finnhub.getInsiderTransactions(symbols).catch(() => []) : Promise.resolve([])
  ]);
  const guardSettings = settings.guards || {};
  const signalSettings = settings.signals || {};
  const highImpactEvents = guardSettings.macroEnabled === false ? [] : classifyEventRisk(events, guardSettings);
  const softImpactEvents = guardSettings.macroEnabled === false ? [] : classifySoftEventRisk(events, guardSettings);
  const breakingRisk = guardSettings.newsEnabled === false ? [] : classifyNewsRisk(news, guardSettings);
  const newsBlocks = breakingRisk.filter((item) => item.blocksSignal && (item.riskType !== 'geopolitical' || guardSettings.warNewsBlockEnabled !== false));
  const macroClearanceUnavailable = Boolean(signalSettings.requireMacroClearance && !providers.calendar && guardSettings.allowUnverifiedMacroWhenFeedsMissing === false);
  const newsClearanceUnavailable = Boolean(signalSettings.requireNewsClearance && !newsProvider && guardSettings.allowUnverifiedNewsWhenFeedsMissing === false);
  const macro = {
    events,
    earnings,
    news,
    companyNews,
    highImpactEvents,
    softImpactEvents,
    breakingRisk,
    newsBlocks,
    macroClearanceUnavailable,
    newsClearanceUnavailable,
    flow,
    blockTrades,
    insiders
  };
  const globalBlocks = [];
  if (!Number.isFinite(market.vix)) globalBlocks.push('Cotizacion de VIX no disponible');
  if (market.vix >= policy.maxVix) globalBlocks.push(`Regimen VIX extremo: ${market.vix}`);
  if (macroClearanceUnavailable) globalBlocks.push('Macro clearance unavailable: configura Finnhub/FMP o desactiva SIGNAL_REQUIRE_MACRO_CLEARANCE');
  if (newsClearanceUnavailable) globalBlocks.push('News clearance unavailable: configura Alpha/Finnhub/FMP/Yahoo o desactiva SIGNAL_REQUIRE_NEWS_CLEARANCE');
  if (highImpactEvents.length) globalBlocks.push(`Evento macro critico de EE. UU. en blackout (${guardSettings.highImpactBlackoutHours || 24}h)`);
  if (newsBlocks.length) globalBlocks.push('Noticias sensibles/geopoliticas bloquean nuevas senales');
  if (profile.tradingPaused) globalBlocks.push('Kill switch del mandato esta activo');
  if (profile.dailyLossPct >= profile.maxDailyLossPct) globalBlocks.push('Se alcanzo la perdida diaria maxima');
  if (profile.weeklyLossPct >= profile.maxWeeklyLossPct) globalBlocks.push('Se alcanzo la perdida semanal maxima');
  if (profile.collateralUsedPct >= 80) globalBlocks.push('Colateral utilizado sobre 80%; solo paper trade');
  const limit = pLimit(3);
  const results = await Promise.all(symbols.map((symbol) => limit(() => scanSymbol({ symbol, providers, market, macro, policy, profile }))));
  const spyGamma = results.find((result) => result.symbol === 'SPY')?.gamma;
  // Build tape reading proxy for the overall market
  market.tapeReading = {
    arrow: market.regime === 'BULL_TREND' ? '⬆️' : market.regime === 'BEAR_TREND' ? '⬇️' : '↔️',
    label: market.regime === 'BULL_TREND' ? 'Instituciones comprando' : market.regime === 'BEAR_TREND' ? 'Instituciones vendiendo' : 'Flujo mixto',
    explanation: market.regime === 'BULL_TREND' ? 'Tape proxy alcista por regimen de mercado, tendencia y breadth.' : market.regime === 'BEAR_TREND' ? 'Tape proxy bajista por regimen de mercado, tendencia y breadth.' : 'Sin lectura clara de tape. Flujo mixto.',
    confidence: market.breadth != null ? Math.abs(market.breadth - 50) * 2 : 40,
    signals: [
      `Regimen: ${market.regime}`,
      `Breadth: ${market.breadth != null ? market.breadth.toFixed(1) + '%' : 'N/A'}`,
      `VIX: ${market.vix != null ? market.vix.toFixed(1) : 'N/A'}`
    ],
    institutionalFlow: market.regime === 'BULL_TREND' ? 'BUYING' : market.regime === 'BEAR_TREND' ? 'SELLING' : 'MIXED'
  };
  market.gamma = spyGamma || null;
  market.regime = detectMarketRegime({
    vix: market.vix,
    breadth: market.breadth,
    spyTechnical: market.technicals?.SPY,
    qqqTechnical: market.technicals?.QQQ,
    gamma: spyGamma,
    macroRisk: highImpactEvents.length > 0 || breakingRisk.length > 0
  });
  const formatCandidate = (candidate) => {
    const setup = candidate.setup;
    const flowBias = flowAlignment(flow, setup);
    const riskAllowed = setup.maxRisk <= profile.accountSize * profile.riskPct / 100;
      const enriched = {
      ...setup,
      dte: candidate.dte,
      expectedMove: candidate.metrics.expectedMove,
      underlyingPrice: market.quotes.find((quote) => quote.symbol === setup.symbol)?.price,
      iv: candidate.metrics.iv === null ? null : round(candidate.metrics.iv * 100, 1),
      ivRank: candidate.ivRank,
      ivPercentile: candidate.ivPercentile,
      ivRankObservations: candidate.ivRankObservations,
      gammaRisk: candidate.gamma.regime,
      gammaProxy: candidate.gamma,
      technicals: candidate.technicals,
      tapeProxy: buildTapeProxy(candidate.technicals, setup),
      trend: candidate.technicals.trend,
      flowBias
    };
    const edge = calculateProbabilityEdge(enriched, base.asOf);
    const scored = scoreSetup({
      setup,
      ivRank: candidate.ivRank,
      trend: candidate.technicals.trend,
      macroBlocked: globalBlocks.length > 0,
      gamma: candidate.gamma,
      flowBias,
      regime: market.regime,
      technicals: candidate.technicals,
      riskAllowed,
      edge
    });
    const blocks = individualBlocks({ setup, ivRank: candidate.ivRank, gamma: candidate.gamma, earningsRisk: candidate.earningsRisk, policy, profile, flowBias });
    const riskGovernor = evaluateRiskGovernor({
      setup: { ...enriched, blocks, tradeQualityScore: scored.score, confidenceScore: scored.score },
      profile,
      globalBlocks,
      dataHealthy: edge.available
    });
    return {
      ...enriched,
      edge,
      score: scored.score,
      tradeQualityScore: scored.score,
      confidenceScore: scored.confidenceScore,
      scoreFactors: scored.factors,
      scoreWeights: scored.weights,
      confidence: riskGovernor.allowedReal ? 'high' : 'conditional/paper',
      classification: riskGovernor.classification,
      riskGovernor,
      blocks: riskGovernor.blocks,
      reasoning: [
        `Regimen ${market.regime}`,
        `Tendencia tecnica ${candidate.technicals.trend}`,
        `Proxy gamma OI ${candidate.gamma.regime}`,
        candidate.ivRank === null ? `IV Rank acumulando historia (${candidate.ivRankObservations}/${policy.ivRankMinObservations} sesiones)` : `IV Rank ${candidate.ivRank}`,
        `Liquidez ${setup.liquidityScore}/10`,
        `${enriched.tapeProxy.label}: ${enriched.tapeProxy.pressureScore} (proxy, no Level 2)`,
        flowBias === 'unavailable' ? 'Flujo institucional opcional no disponible' : `Flujo inusual ${flowBias}`
      ]
    };
  };
  const allSetups = results.flatMap((result) => (result.candidates || []).map(formatCandidate));
  const minSignalScore = Number.isFinite(signalSettings.minScore) ? signalSettings.minScore : 80;
  const minSignalPop = Number.isFinite(signalSettings.minPop) ? (signalSettings.minPop <= 1 ? signalSettings.minPop * 100 : signalSettings.minPop) : 70;
  const maxSignals = Number.isFinite(signalSettings.maxPerDay) ? signalSettings.maxPerDay : 3;
  const eligible = globalBlocks.length ? [] : allSetups.filter((setup) =>
    setup.riskGovernor.allowedReal &&
    setup.confidenceScore >= minSignalScore &&
    setup.pop >= minSignalPop
  )
    .sort((a, b) => b.confidenceScore - a.confidenceScore || b.pop - a.pop || a.maxRisk - b.maxRisk);
  const opportunities = eligible.slice(0, maxSignals).map((setup) => ({
    ...setup,
    executionPlan: createExecutionPlan(setup, profile),
    aiVerificationStatus: signalSettings.requireAiConfirmation ? 'manual_only_or_budget_limited' : 'skipped_not_required'
  }));
  const rejected = allSetups.filter((setup) => !setup.riskGovernor.allowedReal || setup.confidenceScore < 80)
    .sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 30);
  const conditionalPool = results.flatMap((result) => (result.conditionalCandidates || []).map((candidate) => ({
    ...formatCandidate(candidate),
    educationBias: candidate.educationBias
  }))).sort((left, right) => right.confidenceScore - left.confidenceScore || right.liquidityScore - left.liquidityScore);
  const conditionalIdeas = ['bullish', 'bearish', 'neutral'].map((bias) => {
    const setup = conditionalPool.find((candidate) => candidate.educationBias === bias);
    if (!setup) {
      return {
        educationBias: bias,
        status: 'no_data',
        classification: 'IDEA EDUCATIVA SIN STRIKES',
        reason: 'No existe cadena liquida suficiente para construir esta estructura sin inventar datos.'
      };
    }
    const technicalTrigger = bias === 'bullish'
      ? `Confirmar precio sobre VWAP proxy ${setup.technicals.vwap20 ?? 'No disponible'} y soporte ${setup.technicals.support ?? 'No disponible'}.`
      : bias === 'bearish'
        ? `Confirmar rechazo bajo VWAP proxy ${setup.technicals.vwap20 ?? 'No disponible'} o resistencia ${setup.technicals.resistance ?? 'No disponible'}.`
        : `Confirmar rango entre soporte ${setup.technicals.support ?? 'No disponible'} y resistencia ${setup.technicals.resistance ?? 'No disponible'}, sin expansion de VIX.`;
    return {
      ...setup,
      status: 'conditional',
      classification: setup.classification === 'Trade Validado' ? 'Trade Condicional' : setup.classification,
      activationRules: [
        technicalTrigger,
        'Reescanear y exigir que liquidez, IV, gamma, noticias, earnings y riesgo pasen sin bloqueos.',
        ...globalBlocks.map((block) => `Bloqueo actual a resolver: ${block}.`)
      ],
      missingValidation: [...new Set(setup.blocks.length ? setup.blocks : ['Requiere revalidacion de precio y chain al momento de entrada.'])]
    };
  });
  const reasons = globalBlocks.length ? globalBlocks : opportunities.length ? [] : ['Ninguna estructura paso regimen, liquidez, riesgo, historial IV, gamma y probabilidad.'];
  const decision = opportunities.length ? { status: 'eligible', label: 'PLANES INSTITUCIONALES APROBADOS', reasons: [] } : { status: 'no_trade', label: 'NO TRADE REAL', reasons };
  const scan = {
    ...base,
    decision,
    collection: {
      ...(await repository.collectionStats()),
      scannedSymbols: results.filter((result) => !result.error).length,
      chainsCollected: results.flatMap((result) => result.collectedChains || []).length,
      note: 'La recoleccion de datos continua aunque la aprobacion sea NO TRADE.'
    },
    market,
    macro,
    opportunities,
    rejected,
    conditionalIdeas,
    dataHealth: buildDataHealth({ providerStates: base.providers, market, macro, results }),
    gammaSurfaces: results.filter((result) => result.gamma).map((result) => ({ symbol: result.symbol, ...result.gamma })),
    scanErrors: results.filter((result) => result.error),
    alerts: []
  };
  scan.guardianEdge = buildGuardianEdgeTicketScan(scan, settings);
  const hasConditionalEdge = scan.guardianEdge?.actionableTickets?.some((ticket) =>
    ['AGGRESSIVE_EDGE', 'TRADE_CANDIDATE', 'WAIT_TRIGGER', 'CAPITAL_HEAVY', 'HIGH_POP_BAD_PAYOUT'].includes(ticket.classification)
  );
  if (!opportunities.length && hasConditionalEdge && scan.decision.status === 'no_trade') {
    scan.decision = {
      status: 'conditional_edge',
      label: 'EDGE CONDICIONAL - REVISAR TICKET',
      reasons: [
        'No hay trade real completamente validado, pero Guardian encontro candidato accionable/condicional con riesgo definido para revision manual.',
        'No entrar sin gatillo, cadena actualizada, max loss confirmado e invalidacion vigente.'
      ]
    };
  }
  if (opportunities[0]) {
    await appendAlert({ kind: 'a_setup', symbol: opportunities[0].symbol, message: `Detectado ${opportunities[0].strategy} con confianza ${opportunities[0].confidenceScore}/100.` });
  } else if (scan.guardianEdge?.dailyBest) {
    await appendAlert({
      kind: 'trade_candidate',
      symbol: scan.guardianEdge.dailyBest.symbol,
      message: `${scan.guardianEdge.dailyBest.classification}: ${scan.guardianEdge.dailyBest.symbol} ${scan.guardianEdge.dailyBest.strategy} con POP estimada ${scan.guardianEdge.dailyBest.popEstimated ?? 'No disponible'}%.`
    });
  } else {
    await appendAlert({ kind: 'no_trade', message: reasons.join(' ') });
  }
  scan.alerts = await getAlerts();
  scan.assistant = createDailyAssistant(scan);
  scan.summary = deterministicSummary(scan);
  scan.summarySource = 'Motor deterministico';
  scan.aiStatus = typeof providers.ai?.status === 'function' ? providers.ai.status() : {
    configured: providers.openai?.configured,
    enabled: false,
    automaticCalls: false
  };
  return scan;
}
