import pLimit from 'p-limit';
import { UNIVERSE, config, providerStatus } from '../config.js';
import { appendAlert, getAlerts } from '../lib/store.js';
import { daysTo, round } from '../lib/math.js';
import { repository } from '../db/repository.js';
import { classifyEventRisk, classifyNewsRisk, computeGammaProxy, detectMarketRegime, loadMarketOverview } from './market-intelligence.js';
import { deriveTechnicals } from './technicals.js';
import {
  generateBrokenWingCondor,
  generateCashSecuredPut,
  generateCoveredCall,
  generateDefinedRiskSetups,
  generateVolatilityDebitSpread
} from './strategies.js';
import { scoreSetup } from './scoring.js';
import { createDailyAssistant, createExecutionPlan } from './guidance.js';
import { buildDataHealth } from './data-health.js';
import { calculateProbabilityEdge } from './probability-edge.js';
import { evaluateRiskGovernor } from './risk-governor.js';

const DEFAULT_SYMBOLS = [...UNIVERSE.indices, ...UNIVERSE.magnificent7, ...UNIVERSE.focusEquities, ...UNIVERSE.liquidEtfs];
const SHORT_DTE_SYMBOLS = new Set(['SPY', 'SPX', 'QQQ', 'IWM', 'DIA']);
const CORRELATED = {
  SPY: 'broad', SPX: 'broad', DIA: 'broad', IWM: 'broad',
  QQQ: 'tech', XLK: 'tech', AAPL: 'tech', MSFT: 'tech', NVDA: 'tech',
  AMZN: 'tech', META: 'tech', GOOGL: 'tech', TSLA: 'growth'
};

function deterministicSummary(scan) {
  if (scan.decision.status !== 'eligible') {
    return `NO TRADE: ${scan.decision.reasons.join(' ')} La recoleccion permanece activa para construir IV Rank y snapshots.`;
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
        ...generateBrokenWingCondor({ symbol, spot: quote.price, expiration: entry.date, chain: entry.chain, trend: technicals.trend, policy: standardPolicy }),
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
    { name: 'Real-time quotes', pass: Boolean(providers.market), required: 'Tradier or Polygon' },
    { name: 'Options chain with Greeks/IV/OI', pass: Boolean(providers.options), required: 'Tradier or Polygon' },
    { name: 'Macro and earnings calendar', pass: Boolean(providers.calendar), required: 'Finnhub or FMP' },
    { name: 'Breaking market news', pass: providers.finnhub.configured, required: 'Finnhub' }
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
    riskMode: 'CONSERVADOR',
    tradingPaused: false
  });
  const symbols = [...new Set([...UNIVERSE.indices, ...UNIVERSE.magnificent7, ...UNIVERSE.focusEquities, ...watchlist.symbols])];
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
  if (missing.length) {
    const scan = {
      ...base,
      decision: { status: 'configuration_required', label: 'NO TRADE - FALTAN FUENTES REALES', reasons: missing.map((gate) => `${gate.name}: configura ${gate.required}.`) },
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
  const [market, events, earnings, news, companyNews, flow, blockTrades, insiders] = await Promise.all([
    loadMarketOverview({ providers, symbols: [...new Set([...symbols, ...UNIVERSE.breadth])] }),
    providers.calendar.getEconomicCalendar().catch(() => []),
    providers.calendar.getEarningsCalendar(symbols).catch(() => []),
    providers.finnhub.getMarketNews().catch(() => []),
    providers.finnhub.configured && typeof providers.finnhub.getCompanyNews === 'function'
      ? providers.finnhub.getCompanyNews([...UNIVERSE.magnificent7, ...UNIVERSE.focusEquities]).catch(() => [])
      : Promise.resolve([]),
    providers.benzinga.configured && typeof providers.benzinga.getUnusualOptions === 'function' ? providers.benzinga.getUnusualOptions(symbols).catch(() => []) : Promise.resolve([]),
    providers.benzinga.configured && typeof providers.benzinga.getBlockTrades === 'function' ? providers.benzinga.getBlockTrades(symbols).catch(() => []) : Promise.resolve([]),
    providers.finnhub.configured && typeof providers.finnhub.getInsiderTransactions === 'function' ? providers.finnhub.getInsiderTransactions(symbols).catch(() => []) : Promise.resolve([])
  ]);
  const highImpactEvents = classifyEventRisk(events);
  const breakingRisk = classifyNewsRisk(news);
  const macro = { events, earnings, news, companyNews, highImpactEvents, breakingRisk, flow, blockTrades, insiders };
  const globalBlocks = [];
  if (!Number.isFinite(market.vix)) globalBlocks.push('Cotizacion de VIX no disponible');
  if (market.vix >= policy.maxVix) globalBlocks.push(`Regimen VIX extremo: ${market.vix}`);
  if (highImpactEvents.length) globalBlocks.push('Evento macro de EE. UU. de impacto dentro de 48 horas');
  if (breakingRisk.length) globalBlocks.push('Noticias sensibles requieren revision humana');
  if (profile.tradingPaused) globalBlocks.push('Kill switch del mandato esta activo');
  if (profile.dailyLossPct >= profile.maxDailyLossPct) globalBlocks.push('Se alcanzo la perdida diaria maxima');
  if (profile.weeklyLossPct >= profile.maxWeeklyLossPct) globalBlocks.push('Se alcanzo la perdida semanal maxima');
  if (profile.collateralUsedPct >= 80) globalBlocks.push('Colateral utilizado sobre 80%; solo paper trade');
  const limit = pLimit(3);
  const results = await Promise.all(symbols.map((symbol) => limit(() => scanSymbol({ symbol, providers, market, macro, policy, profile }))));
  const spyGamma = results.find((result) => result.symbol === 'SPY')?.gamma;
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
        flowBias === 'unavailable' ? 'Flujo institucional opcional no disponible' : `Flujo inusual ${flowBias}`
      ]
    };
  };
  const allSetups = results.flatMap((result) => (result.candidates || []).map(formatCandidate));
  const eligible = globalBlocks.length ? [] : allSetups.filter((setup) => setup.riskGovernor.allowedReal && setup.confidenceScore >= 80)
    .sort((a, b) => b.confidenceScore - a.confidenceScore || b.pop - a.pop || a.maxRisk - b.maxRisk);
  const opportunities = eligible.slice(0, 5).map((setup) => ({
    ...setup,
    executionPlan: createExecutionPlan(setup, profile)
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
  const decision = opportunities.length ? { status: 'eligible', label: 'PLANES INSTITUCIONALES APROBADOS', reasons: [] } : { status: 'no_trade', label: 'HOY NO HAY VENTAJAS', reasons };
  if (!opportunities.length) await appendAlert({ kind: 'no_trade', message: reasons.join(' ') });
  if (opportunities[0]) await appendAlert({ kind: 'a_setup', symbol: opportunities[0].symbol, message: `Detectado ${opportunities[0].strategy} con confianza ${opportunities[0].confidenceScore}/100.` });
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
    alerts: await getAlerts()
  };
  scan.assistant = createDailyAssistant(scan);
  scan.summary = deterministicSummary(scan);
  scan.summarySource = 'Motor deterministico';
  scan.aiStatus = typeof providers.openai.status === 'function' ? providers.openai.status() : {
    configured: providers.openai.configured,
    enabled: false,
    automaticCalls: false
  };
  return scan;
}
