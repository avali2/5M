import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { buildInfo, config, providerStatus, UNIVERSE } from './config.js';
import { cache } from './lib/cache.js';
import { createProviders } from './providers/index.js';
import { explainers } from './explainers.js';
import { ScanScheduler } from './services/scheduler.js';
import { repository } from './db/repository.js';
import { GuardianPushStore } from './pushStore.js';
import { GuardianPushService } from './push.js';
import { GuardianScheduler } from './guardianScheduler.js';
import { createGuardianRouter, createPushRouter } from './guardianRoutes.js';
import { registerPushRoutes } from './pushRoutes.js';
import { startAutonomousSignalWorker } from './autonomousSignalWorker.js';
import positionsRoutes from './routes/positionsRoutes.js';

function enabledLabel(value) {
  return value ? 'enabled' : 'disabled';
}

function configuredLabel(value) {
  return value ? 'configured' : 'missing';
}

function providerHealth(settings, providers) {
  const openaiStatus = typeof providers.openai?.status === 'function' ? providers.openai.status() : {
    configured: Boolean(providers.openai?.configured),
    enabled: false,
    automaticCalls: false,
    manualOnly: true,
    cooldownUntil: null
  };
  const geminiStatus = typeof providers.gemini?.status === 'function' ? providers.gemini.status() : {
    configured: Boolean(providers.gemini?.configured),
    enabled: false
  };
  const aiStatus = typeof providers.ai?.status === 'function' ? providers.ai.status() : null;
  return {
    yahoo: enabledLabel(settings.yahoo?.enabled !== false),
    tradier: configuredLabel(Boolean(settings.tradier?.token)),
    polygon: configuredLabel(Boolean(settings.polygon?.apiKey)),
    finnhub: configuredLabel(Boolean(settings.finnhub?.apiKey)),
    fmp: configuredLabel(Boolean(settings.fmp?.apiKey)),
    benzinga: configuredLabel(Boolean(settings.benzinga?.apiKey)),
    alphaVantage: configuredLabel(Boolean(settings.alphaVantage?.apiKey)),
    gemini: geminiStatus.configured && geminiStatus.enabled ? 'manual_only' : configuredLabel(Boolean(geminiStatus.configured)),
    geminiConfigured: Boolean(geminiStatus.configured),
    geminiEnabled: Boolean(geminiStatus.enabled),
    openai: openaiStatus.cooldownUntil ? 'manual_only_cooldown' : 'manual_only',
    openaiConfigured: Boolean(openaiStatus.configured),
    openaiEnabled: Boolean(openaiStatus.enabled),
    openaiAutomaticCalls: false,
    aiPrimaryProvider: aiStatus?.primaryProvider || settings.ai?.primaryProvider || 'gemini',
    aiMode: aiStatus?.automaticSignalDecision ? 'gemini_guardian_gatekeeper' : 'manual_explain_only',
    aiDecisionEnabled: Boolean(aiStatus?.automaticSignalDecision),
    agentMode: settings.agent?.mode || 'gatekeeper',
    aiBudget: aiStatus?.budget || null,
    activeMarketProvider: providers.market?.name || 'none',
    activeOptionsProvider: providers.options?.name || 'none',
    activeNewsProvider: providers.news?.name || 'none'
  };
}

function feedAvailability(settings) {
  const feeds = providerStatus().filter((provider) => !(provider.hiddenWhenMissing && !provider.configured));
  const decorate = (provider) => ({
    id: provider.id,
    name: provider.name,
    configured: Boolean(provider.configured),
    enabled: provider.enabled ?? true,
    group: provider.group || 'optional',
    status: provider.configured ? 'configured' : provider.required ? 'missing_required' : provider.important ? 'missing_important' : 'optional_missing',
    coverage: provider.coverage
  });
  return {
    hidePremiumFeedsIfUnconfigured: Boolean(settings.ui?.hidePremiumFeedsIfUnconfigured),
    required: feeds.filter((provider) => provider.group === 'required').map(decorate),
    important: feeds.filter((provider) => provider.group === 'important').map(decorate),
    optionalPremium: feeds.filter((provider) => provider.group === 'optional_premium').map(decorate),
    optional: feeds.filter((provider) => !['required', 'important', 'optional_premium'].includes(provider.group)).map(decorate)
  };
}

function normalizeSignal(setup, scan) {
  if (!setup) return null;
  const creditDebit = Number.isFinite(setup.credit) ? { type: 'credit', value: setup.credit } :
    Number.isFinite(setup.debit) ? { type: 'debit', value: setup.debit } : { type: 'confirm_in_chain', value: null };
  const legs = (setup.legs || []).map((leg) => ({
    side: leg.side,
    type: leg.type,
    strike: leg.strike,
    mid: leg.mid,
    bid: leg.bid,
    ask: leg.ask,
    delta: leg.delta,
    gamma: leg.gamma,
    theta: leg.theta,
    vega: leg.vega,
    iv: leg.iv,
    volume: leg.volume,
    openInterest: leg.openInterest,
    symbol: leg.symbol
  }));
  const id = setup.id || `${setup.symbol}-${setup.strategy}-${setup.expiration}-${(setup.strikes || legs.map((leg) => leg.strike).join('-')).replaceAll(' ', '')}`;
  return {
    id,
    ticker: setup.symbol,
    symbol: setup.symbol,
    currentPrice: setup.underlyingPrice ?? scan?.market?.quotes?.find((quote) => quote.symbol === setup.symbol)?.price ?? null,
    strategy: setup.strategy,
    direction: setup.institutionalBias || setup.educationBias || 'neutral',
    expiration: setup.expiration,
    dte: setup.dte,
    strikes: setup.strikes || legs.map((leg) => leg.strike).join(' / ') || 'requiere confirmar en cadena',
    legs,
    creditDebit,
    entryLimit: setup.executionPlan?.entryRules?.[0] || (Number.isFinite(creditDebit.value) ? `${creditDebit.type === 'credit' ? 'Credito minimo' : 'Debito maximo'} ${creditDebit.value}` : 'Requiere confirmar bid/ask real'),
    maxLoss: setup.maxRisk ?? null,
    maxRisk: setup.maxRisk ?? null,
    maxProfit: setup.maxProfit ?? null,
    collateralRequired: setup.collateralRequired ?? setup.maxRisk ?? null,
    popEstimated: setup.pop ?? setup.edge?.probabilityOfProfit ?? null,
    probability: setup.pop ?? setup.edge?.probabilityOfProfit ?? null,
    score: setup.tradeQualityScore ?? setup.confidenceScore ?? setup.score ?? null,
    risk: setup.riskClass || setup.gammaRisk || 'moderado',
    riskClass: setup.riskClass || setup.gammaRisk || 'moderado',
    reason: setup.reasoning?.join(' + ') || 'Setup generado por reglas deterministicas.',
    invalidation: setup.executionPlan?.entryRules?.find((rule) => /no entrar|invalid/i.test(rule)) || setup.activationRules?.[0] || 'Invalidar si rompe soporte/resistencia, VIX se expande o bid/ask empeora.',
    closeAlert: setup.takeProfit ? `${setup.takeProfit}. Stop: ${setup.stopLoss || 'definir antes de entrar'}` : 'TP 40%-60%; stop 1.5x-2x credito o invalidacion tecnica.',
    nearbyEvents: [
      ...(scan?.macro?.highImpactEvents || []).slice(0, 2).map((event) => event.title),
      ...(scan?.macro?.earnings || []).filter((event) => event.symbol === setup.symbol).slice(0, 2).map((event) => `Earnings ${event.date}`)
    ],
    aiStatus: setup.aiVerificationStatus || 'manual only',
    geminiGuardian: setup.geminiReview ? {
      decision: setup.geminiReview.decision,
      confidence: setup.geminiReview.confidence,
      summary: setup.geminiReview.summary,
      risks: setup.geminiReview.risks,
      requiresManualReview: setup.geminiReview.requires_manual_review
    } : null,
    dataSource: scan?.marketDataMode || 'live',
    source: {
      quote: scan?.providers?.find((provider) => provider.id === 'tradier' && provider.configured) ? 'Tradier' : 'Yahoo/fallback',
      chain: 'Options chain provider server-side',
      probability: 'probability-edge deterministic engine',
      timestamp: scan?.asOf
    }
  };
}

function guardSummary(scan, settings, providers) {
  const missingMacro = Boolean(settings.signals?.requireMacroClearance && !providers.calendar && settings.guards?.allowUnverifiedMacroWhenFeedsMissing === false);
  const missingNews = Boolean(settings.signals?.requireNewsClearance && !(providers.news || providers.finnhub) && settings.guards?.allowUnverifiedNewsWhenFeedsMissing === false);
  const highMacro = scan?.macro?.highImpactEvents || [];
  const softMacro = scan?.macro?.softImpactEvents || [];
  const newsBlocks = scan?.macro?.newsBlocks || [];
  const newsRisk = scan?.macro?.breakingRisk || [];
  const fedEvents = [...highMacro, ...softMacro].filter((event) => /fed|fomc|powell|rate|minutes/i.test(event.title || ''));
  const geopolitical = newsRisk.filter((item) => item.riskType === 'geopolitical');
  const earnings = scan?.macro?.earnings || [];
  const liquidityBlocks = [...(scan?.rejected || []), ...(scan?.conditionalIdeas || [])]
    .filter((item) => (item.blocks || []).some((block) => /liquidez|bid|ask|volume|open interest/i.test(block)));
  const dataErrors = scan?.dataHealth?.endpointErrors || scan?.scanErrors || [];
  const status = (block, caution, missing = false) => block ? 'block' : caution ? 'caution' : missing ? 'unavailable' : 'clear';
  return {
    macro: { status: status(highMacro.length || missingMacro, softMacro.length), count: highMacro.length + softMacro.length, detail: missingMacro ? 'Macro clearance unavailable' : highMacro[0]?.title || softMacro[0]?.title || 'clear' },
    fed: { status: status(false, fedEvents.length), count: fedEvents.length, detail: fedEvents[0]?.title || 'clear' },
    news: { status: status(newsBlocks.length || missingNews, newsRisk.length), count: newsRisk.length, detail: missingNews ? 'News clearance unavailable' : newsBlocks[0]?.headline || newsRisk[0]?.headline || 'clear' },
    geopolitical: { status: status(geopolitical.some((item) => item.blocksSignal), geopolitical.length), count: geopolitical.length, detail: geopolitical[0]?.headline || 'clear' },
    earnings: { status: status(false, earnings.length), count: earnings.length, detail: earnings[0] ? `${earnings[0].symbol} ${earnings[0].date}` : 'clear' },
    liquidity: { status: status(false, liquidityBlocks.length), count: liquidityBlocks.length, detail: liquidityBlocks[0]?.symbol || 'clear' },
    risk: { status: status(scan?.decision?.status === 'configuration_required', scan?.decision?.status === 'conditional_edge'), detail: scan?.decision?.label || 'clear' },
    dataQuality: { status: status(dataErrors.length, scan?.dataHealth?.metrics?.some((metric) => !metric.available)), count: dataErrors.length, detail: dataErrors[0]?.error || dataErrors[0] || 'clear' }
  };
}

function agentState(scan, settings, providers) {
  if (settings.agent?.enabled === false) return 'SLEEPING';
  const guards = guardSummary(scan, settings, providers);
  const hardBlock = guards.dataQuality.status === 'block' || scan?.decision?.status === 'configuration_required';
  if (hardBlock) return 'BLOCKED';
  return 'ACTIVE';
}

function marketDecision(scan, settings, providers) {
  const guards = guardSummary(scan, settings, providers);
  if (guards.macro.status === 'block') return 'BLOCKED BY MACRO';
  if (guards.news.status === 'block' || guards.geopolitical.status === 'block') return 'BLOCKED BY NEWS';
  if (guards.earnings.status === 'block') return 'BLOCKED BY EARNINGS';
  if (guards.dataQuality.status === 'block' || scan?.decision?.status === 'configuration_required') return 'DATA INSUFFICIENT';
  if (Object.values(guards).some((guard) => ['caution', 'unavailable'].includes(guard.status))) return 'CAUTION';
  return scan?.opportunities?.length ? 'MARKET CLEAR' : 'NO TRADE';
}

function buildAgentPayload({ scan, settings, providers, guardianScheduler }) {
  const guards = guardSummary(scan, settings, providers);
  const aiStatus = typeof providers.ai?.status === 'function' ? providers.ai.status() : null;
  const approvedSignals = (scan?.opportunities || []).slice(0, settings.signals?.maxPerDay || 3).map((setup) => normalizeSignal(setup, scan));
  const rejectedCandidates = [...(scan?.rejected || []), ...(scan?.conditionalIdeas || []).filter((item) => item.symbol)]
    .slice(0, 12).map((setup) => ({
      ...normalizeSignal(setup, scan),
      rejectionReasons: setup.blocks || setup.missingValidation || ['No cumple score/filtros para senal real.']
    }));
  return {
    enabled: settings.agent?.enabled !== false,
    name: settings.agent?.name || 'Gemini Guardian',
    state: agentState(scan, settings, providers),
    lastRunAt: scan?.guardianStatus?.lastScan || guardianScheduler.status().lastScan || scan?.asOf || null,
    nextRunAt: scan?.guardianStatus?.nextScan || guardianScheduler.status().nextScan || null,
    marketDecision: marketDecision(scan, settings, providers),
    tokenBudget: aiStatus?.budget || null,
    aiAvailable: Boolean(aiStatus?.gemini?.configured || aiStatus?.openai?.configured),
    deterministicFallback: settings.ai?.fallbackToDeterministic !== false,
    guards,
    approvedSignals,
    rejectedCandidates,
    macroWarnings: [...(scan?.macro?.highImpactEvents || []), ...(scan?.macro?.softImpactEvents || [])],
    newsWarnings: scan?.macro?.breakingRisk || [],
    guardStatus: guards,
    aiVerificationStatus: {
      mode: aiStatus?.automaticSignalDecision ? 'gemini_guardian_gatekeeper' : 'manual_only',
      requireAiConfirmation: Boolean(settings.signals?.requireAiConfirmation),
      autoDecision: Boolean(aiStatus?.automaticSignalDecision),
      autoNarrative: Boolean(aiStatus?.automaticNarrative),
      guardian: scan?.aiGuardian || null
    },
    aiGuardian: scan?.aiGuardian || null
  };
}

function firstSignalCandidate(payload, idOrSymbol) {
  const pool = [...(payload.approvedSignals || []), ...(payload.rejectedCandidates || [])];
  if (!idOrSymbol) return pool[0] || null;
  const key = String(idOrSymbol).toUpperCase();
  return pool.find((item) =>
    String(item?.id || '').toUpperCase() === key ||
    String(item?.ticker || item?.symbol || '').toUpperCase() === key
  ) || pool[0] || null;
}

function sigmaDecisionFor(signal, guards, settings) {
  const blockers = [
    ...(signal?.rejectionReasons || []),
    ...(signal?.nearbyEvents || []),
    ...Object.entries(guards || {})
      .filter(([, guard]) => guard?.status === 'block')
      .map(([name, guard]) => `${name}: ${guard.detail}`)
  ].filter(Boolean);
  const score = Number(signal?.score);
  const pop = Number(signal?.popEstimated ?? signal?.probability);
  const minPop = (settings.signals?.minPop || 0.7) <= 1 ? (settings.signals?.minPop || 0.7) * 100 : settings.signals?.minPop;
  const scoreOk = Number.isFinite(score) && score >= (settings.signals?.minScore || 82);
  const popOk = Number.isFinite(pop) && pop >= minPop;
  if (!signal || blockers.length) return { decision: 'NO_TRADE', auditStatus: 'REJECTED', priority: 'LOW', blockers };
  if (scoreOk && popOk && signal.geminiGuardian?.decision === 'APPROVE') return { decision: 'APPROVED', auditStatus: 'APPROVED', priority: 'HIGH', blockers };
  if (scoreOk || popOk) return { decision: 'WATCHLIST', auditStatus: 'NEEDS_HUMAN_REVIEW', priority: 'MEDIUM', blockers: ['Requiere confirmacion final de cadena, guards y Gemini Guardian.'] };
  return { decision: 'NO_TRADE', auditStatus: 'REJECTED', priority: 'LOW', blockers: ['Score o POP debajo del mandato.'] };
}

function buildSigmaAudit({ signal, scan, guards, settings }) {
  const outcome = sigmaDecisionFor(signal, guards, settings);
  const legs = (signal?.legs || []).map((leg) => ({
    side: leg.side,
    type: leg.type,
    strike: leg.strike,
    bid: leg.bid,
    ask: leg.ask,
    mid: leg.mid,
    delta: leg.delta,
    gamma: leg.gamma,
    theta: leg.theta,
    vega: leg.vega,
    volume: leg.volume,
    openInterest: leg.openInterest
  }));
  const score = Number(signal?.score);
  return {
    agent: 'VALIDO_GUARDIAN',
    signal_id: signal?.id || 'dry-run-no-signal',
    timestamp: new Date().toISOString(),
    market_regime: scan?.market?.regime || 'NO_TRADE',
    decision: outcome.decision,
    priority: outcome.priority,
    symbol: signal?.ticker || signal?.symbol || 'NO_DATA',
    underlying_price: Number(signal?.currentPrice) || null,
    strategy: signal?.strategy || 'NO_TRADE',
    direction: signal?.direction || 'NO_TRADE',
    expiration: signal?.expiration || null,
    dte: Number.isFinite(Number(signal?.dte)) ? Number(signal.dte) : null,
    legs,
    entry: {
      limit_price: Number(signal?.creditDebit?.value) || null,
      natural_price: null,
      mid_price: Number(signal?.creditDebit?.value) || null,
      max_slippage_allowed: null
    },
    risk: {
      max_profit: Number(signal?.maxProfit) || null,
      max_loss: Number(signal?.maxRisk ?? signal?.maxLoss) || null,
      buying_power_required: Number(signal?.collateralRequired) || null,
      risk_reward: Number.isFinite(Number(signal?.maxProfit)) && Number(signal?.maxRisk) > 0 ? Number((signal.maxProfit / signal.maxRisk).toFixed(2)) : null,
      position_size_contracts: Number(signal?.maxRisk) > 0 && scan?.profile?.accountSize ? Math.max(0, Math.floor((scan.profile.accountSize * scan.profile.riskPct / 100) / signal.maxRisk)) : 0,
      account_risk_percent: Number(signal?.maxRisk) > 0 && scan?.profile?.accountSize ? Number((signal.maxRisk / scan.profile.accountSize * 100).toFixed(2)) : null
    },
    probability: {
      probability_of_profit: Number(signal?.popEstimated ?? signal?.probability) || null,
      probability_source: signal?.source?.probability || 'DELTA_APPROX',
      break_even: null
    },
    scores: {
      technical_score: signal?.scoreFactors?.primaryTrend ?? null,
      liquidity_score: signal?.scoreFactors?.optionsLiquidity ?? null,
      volatility_score: signal?.scoreFactors?.volatilityEdge ?? null,
      news_score: signal?.scoreFactors?.newsEarningsMacro ?? null,
      earnings_risk_score: guards?.earnings?.status === 'clear' ? 10 : 0,
      risk_score: signal?.scoreFactors?.riskRewardSizing ?? null,
      final_score: Number.isFinite(score) ? score : null
    },
    evidence: [
      signal?.reason,
      `Macro Guard: ${guards?.macro?.status || 'unavailable'} - ${guards?.macro?.detail || ''}`,
      `News Guard: ${guards?.news?.status || 'unavailable'} - ${guards?.news?.detail || ''}`,
      `Earnings Guard: ${guards?.earnings?.status || 'unavailable'} - ${guards?.earnings?.detail || ''}`
    ].filter(Boolean),
    blockers: outcome.blockers,
    trade_management: {
      take_profit: signal?.closeAlert || 'TP 40%-60% si se valida en broker.',
      stop_loss: signal?.closeAlert || 'Stop por precio del spread o invalidacion tecnica.',
      adjustment_plan: 'No ajustar sin recalcular max loss, bid/ask y evento macro/news.',
      close_before_earnings: guards?.earnings?.status !== 'clear',
      invalidation_level: null
    },
    gemini_audit: {
      status: outcome.auditStatus,
      confidence: signal?.geminiGuardian?.confidence ?? (outcome.decision === 'NO_TRADE' ? 35 : 60),
      data_freshness_seconds: scan?.asOf ? Math.max(0, Math.round((Date.now() - new Date(scan.asOf).getTime()) / 1000)) : null,
      hallucination_check: signal?.geminiGuardian?.decision === 'APPROVE' ? 'PASSED' : 'FAILED',
      reason: signal?.geminiGuardian?.summary || outcome.blockers[0] || 'Dry-run deterministic Valido Guardian audit.'
    }
  };
}

export function createApp(settings = config, customProviders = null, options = { startBackground: true }) {
  const app = express();
  const providers = customProviders || createProviders(settings);
  const scheduler = new ScanScheduler({ providers, settings });
  const pushService = new GuardianPushService(settings.webPush || {}, new GuardianPushStore(repository));
  const guardianScheduler = new GuardianScheduler({
    scanScheduler: scheduler,
    repository,
    pushService,
    enabled: settings.guardian?.enabled !== false,
    regularMinutes: settings.agent?.refreshIntervalMinutes || 5
  });
  const defaults = { ...settings.policy, holdings: {}, activeSymbols: [], dailyLossPct: 0, weeklyLossPct: 0, collateralUsedPct: 0, consecutiveDailyLosses: 0, riskMode: settings.policy?.defaultRiskMode || 'MODERATE_AGGRESSIVE', tradingPaused: false };
  const defaultWatchlist = [...UNIVERSE.indices, ...UNIVERSE.magnificent7, ...UNIVERSE.focusEquities, ...UNIVERSE.liquidEtfs];

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: settings.clientOrigin }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.path === '/health') return next();
    if (settings.security?.requireAccessKey && !settings.security?.accessKey) {
      return res.status(503).json({
        error: 'Private access is not configured',
        detail: 'Set APP_ACCESS_KEY in the hosting environment before using Valido 1M.'
      });
    }
    if (!settings.security?.accessKey) return next();
    const expected = Buffer.from(settings.security.accessKey);
    const supplied = Buffer.from(req.get('x-valido-key') || '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return res.status(401).json({ error: 'Access key required' });
    }
    return next();
  });
  app.locals.scheduler = scheduler;
  app.locals.guardianScheduler = guardianScheduler;
  app.locals.pushService = pushService;
  if (options.startBackground) {
    scheduler.start();
    guardianScheduler.start();
  }

  app.get('/api/health', (_req, res) => {
    const accessRequired = Boolean(settings.security?.requireAccessKey);
    const protectedAccess = Boolean(settings.security?.accessKey);
    res.json({
      ok: true,
      app: 'VALIDO 1M',
      env: process.env.NODE_ENV || 'development',
      version: buildInfo.version,
      buildTimestamp: buildInfo.timestamp,
      startedAt: buildInfo.startedAt,
      timestamp: new Date().toISOString(),
      providers: providerHealth(settings, providers),
      feeds: feedAvailability(settings),
      mode: 'defined-risk-manual-review',
      protected: protectedAccess,
      accessRequired,
      securityStatus: accessRequired && !protectedAccess ? 'configuration_required' : 'ready',
      database: {
        configured: Boolean(settings.database?.url),
        ssl: Boolean(settings.database?.ssl),
        connected: repository.mode === 'postgresql',
        mode: repository.mode
      },
      render: {
        detected: Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID),
        warning: process.env.RENDER ? 'Render free/low-cost services can sleep; continuous alerts depend on plan and uptime.' : null
      },
      refreshSeconds: settings.refreshSeconds,
      lastQuote: scheduler.latest?.market?.quotes?.find((quote) => Number.isFinite(quote.price))?.timestamp || scheduler.latest?.asOf || null,
      lastOptionsChain: scheduler.latest?.collection?.latestSnapshotAt || scheduler.latest?.asOf || null,
      lastNews: scheduler.latest?.macro?.news?.[0]?.datetime || scheduler.latest?.macro?.breakingRisk?.[0]?.datetime || null,
      marketStatus: guardianScheduler.status(repository.mode).marketStatus || 'unknown',
      lastChecked: new Date().toISOString(),
      scheduler: {
        running: Boolean(scheduler.running),
        lastScan: scheduler.latest?.asOf || null,
        lastError: scheduler.lastError
      },
      guardian: guardianScheduler.status(repository.mode),
      agent: {
        enabled: settings.agent?.enabled !== false,
        name: settings.agent?.name || 'Gemini Guardian',
        mode: settings.agent?.mode || 'gatekeeper',
        refreshIntervalMinutes: settings.agent?.refreshIntervalMinutes || 5,
        autoVerifySignals: Boolean(settings.agent?.autoVerifySignals),
        aiDecisionEnabled: Boolean(typeof providers.ai?.status === 'function' ? providers.ai.status()?.automaticSignalDecision : false),
        dailyAiBudget: settings.ai?.dailyTokenBudget,
        aiUsedToday: typeof providers.ai?.status === 'function' ? providers.ai.status()?.budget?.tokensUsed : null,
        requestsUsedToday: typeof providers.ai?.status === 'function' ? providers.ai.status()?.budget?.requestsUsed : null,
        dailyAiBudgetOk: typeof providers.ai?.status === 'function' ? (providers.ai.status()?.budget?.usagePercent || 0) < settings.ai?.disableAllAtUsagePercent : true,
        failsafeDeterministic: settings.agent?.failsafeDeterministic !== false && settings.ai?.fallbackToDeterministic !== false,
        lastReviewAt: typeof providers.ai?.status === 'function' ? providers.ai.status()?.gatekeeper?.lastReviewAt : null,
        nextReviewAt: guardianScheduler.status(repository.mode).nextScan
      },
      guards: {
        macro: enabledLabel(settings.guards?.macroEnabled !== false),
        news: enabledLabel(settings.guards?.newsEnabled !== false),
        fed: enabledLabel(settings.guards?.fedEnabled !== false),
        geopolitical: enabledLabel(settings.guards?.geopoliticalEnabled !== false),
        earnings: enabledLabel(settings.guards?.earningsEnabled !== false)
      },
      signals: {
        realSignalsOnly: Boolean(settings.signals?.realSignalsOnly),
        requireAiConfirmation: Boolean(settings.signals?.requireAiConfirmation),
        minScore: settings.signals?.minScore,
        minPop: settings.signals?.minPop
      },
      webPush: { enabled: pushService.status().enabled, configured: pushService.status().configured }
    });
  });

  app.get('/api/agent/status', async (_req, res, next) => {
    try {
      const scan = await scheduler.snapshot();
      const enriched = { ...scan, guardianStatus: guardianScheduler.status(repository.mode) };
      res.json(buildAgentPayload({ scan: enriched, settings, providers, guardianScheduler }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/macro/guard', async (_req, res, next) => {
    try {
      const scan = await scheduler.snapshot();
      const enriched = { ...scan, guardianStatus: guardianScheduler.status(repository.mode) };
      const payload = buildAgentPayload({ scan: enriched, settings, providers, guardianScheduler });
      res.json({
        ok: true,
        guard: payload.guards.macro,
        fed: payload.guards.fed,
        earnings: payload.guards.earnings,
        highImpactEvents: scan?.macro?.highImpactEvents || [],
        softImpactEvents: scan?.macro?.softImpactEvents || [],
        earningsCalendar: scan?.macro?.earnings || [],
        asOf: scan.asOf
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/news/guard', async (_req, res, next) => {
    try {
      const scan = await scheduler.snapshot();
      const enriched = { ...scan, guardianStatus: guardianScheduler.status(repository.mode) };
      const payload = buildAgentPayload({ scan: enriched, settings, providers, guardianScheduler });
      res.json({
        ok: true,
        guard: payload.guards.news,
        geopolitical: payload.guards.geopolitical,
        breakingRisk: scan?.macro?.breakingRisk || [],
        newsBlocks: scan?.macro?.newsBlocks || [],
        companyNews: scan?.macro?.companyNews || [],
        asOf: scan.asOf
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/agent/scan', async (_req, res, next) => {
    try {
      const scan = await scheduler.run(true);
      const enriched = { ...scan, guardianStatus: guardianScheduler.status(repository.mode) };
      res.json({
        ...buildAgentPayload({ scan: enriched, settings, providers, guardianScheduler }),
        scan: enriched
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/agent/verify-signal', async (req, res, next) => {
    try {
      const scan = await scheduler.snapshot();
      const enriched = { ...scan, guardianStatus: guardianScheduler.status(repository.mode) };
      const payload = buildAgentPayload({ scan: enriched, settings, providers, guardianScheduler });
      const candidate = req.body?.signal || firstSignalCandidate(payload, req.body?.signalId || req.body?.symbol);
      const dryRun = req.body?.dryRun !== false;
      const sigmaAudit = buildSigmaAudit({ signal: candidate, scan: enriched, guards: payload.guards, settings });
      if (dryRun || !candidate) {
        return res.json({
          ok: true,
          dryRun: true,
          aiCalled: false,
          review: sigmaAudit,
          note: 'Dry-run deterministico: no consume Gemini ni envia notificacion.'
        });
      }
      if (typeof providers.ai?.reviewSignal !== 'function') {
        return res.json({
          ok: true,
          dryRun: false,
          aiCalled: false,
          review: { ...sigmaAudit, decision: 'NEEDS_HUMAN_REVIEW' },
          note: 'AI router unavailable; deterministic failsafe returned.'
        });
      }
      const review = await providers.ai.reviewSignal(candidate, enriched, { automatic: false, cycleKey: `manual-${Date.now()}` });
      return res.json({
        ok: true,
        dryRun: false,
        aiCalled: review.provider === 'gemini',
        review,
        sigmaAudit: {
          ...sigmaAudit,
          decision: review.decision === 'APPROVE' && review.entry_ok ? 'APPROVED' : review.decision === 'BLOCK' ? 'NO_TRADE' : 'NEEDS_HUMAN_REVIEW',
          gemini_audit: {
            ...sigmaAudit.gemini_audit,
            status: review.decision === 'APPROVE' && review.entry_ok ? 'APPROVED' : review.decision === 'BLOCK' ? 'REJECTED' : 'NEEDS_HUMAN_REVIEW',
            confidence: review.confidence,
            hallucination_check: review.decision === 'APPROVE' && review.entry_ok ? 'PASSED' : 'FAILED',
            reason: review.summary
          }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/signals', async (req, res, next) => {
    try {
      const includeRejected = String(req.query.includeRejected || '').toLowerCase() === 'true';
      const scan = await scheduler.snapshot();
      const enriched = { ...scan, guardianStatus: guardianScheduler.status(repository.mode) };
      const payload = buildAgentPayload({ scan: enriched, settings, providers, guardianScheduler });
      res.json({
        signals: payload.approvedSignals,
        rejectedCandidates: includeRejected ? payload.rejectedCandidates : [],
        marketDecision: payload.marketDecision,
        guardStatus: payload.guardStatus,
        asOf: scan.asOf
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/signals/:id/explain', async (req, res, next) => {
    try {
      const scan = await scheduler.snapshot();
      const payload = buildAgentPayload({ scan, settings, providers, guardianScheduler });
      const signal = [...payload.approvedSignals, ...payload.rejectedCandidates].find((item) => item?.id === req.params.id);
      if (!signal) return res.status(404).json({ error: 'Signal not found or expired' });
      if (typeof providers.ai?.explainScan === 'function') {
        return res.json(await providers.ai.explainScan({ ...scan, selectedSignal: signal }, { manual: true, automatic: false, purpose: 'signal_manual_explain' }));
      }
      return res.json({
        provider: 'deterministic',
        manualOnly: true,
        summary: `${signal.ticker} ${signal.strategy}: revisa bid/ask, riesgo maximo ${signal.maxRisk ?? 'No disponible'}, POP estimada ${signal.popEstimated ?? 'No disponible'} y la invalidacion antes de copiarlo al broker.`,
        note: 'La explicacion es deterministica porque no hay proveedor IA disponible.'
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/scan', async (_req, res, next) => {
    try {
      const scan = await scheduler.snapshot();
      const enriched = { ...scan, guardianStatus: guardianScheduler.status(repository.mode) };
      res.json({ ...enriched, agent: buildAgentPayload({ scan: enriched, settings, providers, guardianScheduler }) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/scan', async (_req, res, next) => {
    try {
      const scan = await scheduler.run(true);
      const enriched = { ...scan, guardianStatus: guardianScheduler.status(repository.mode) };
      res.json({ ...enriched, agent: buildAgentPayload({ scan: enriched, settings, providers, guardianScheduler }) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/scan/refresh', async (_req, res, next) => {
    try {
      const scan = await scheduler.run(true);
      const enriched = { ...scan, guardianStatus: guardianScheduler.status(repository.mode) };
      res.json({ ...enriched, agent: buildAgentPayload({ scan: enriched, settings, providers, guardianScheduler }) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/watchlist', async (_req, res, next) => {
    try {
      res.json(await repository.getWatchlist(defaultWatchlist));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/watchlist', async (req, res, next) => {
    try {
      if (!Array.isArray(req.body.symbols)) return res.status(400).json({ error: 'symbols array required' });
      cache.clear();
      const watchlist = await repository.saveWatchlist(req.body.symbols);
      scheduler.run(true).catch(() => {});
      return res.json(watchlist);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/profile', async (_req, res, next) => {
    try {
      res.json(await repository.getRiskProfile(defaults));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/profile', async (req, res, next) => {
    try {
      cache.clear();
      const profile = await repository.saveRiskProfile(req.body || {}, defaults);
      scheduler.run(true).catch(() => {});
      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/explainers', (_req, res) => res.json(explainers));

  app.get('/api/ai/status', (_req, res) => {
    res.json(typeof providers.ai?.status === 'function' ? providers.ai.status() : {
      configured: Boolean(providers.openai?.configured),
      enabled: false,
      automaticCalls: false
    });
  });

  app.post('/api/ai/explain', async (_req, res, next) => {
    try {
      const scan = await scheduler.snapshot();
      if (typeof providers.ai?.explainScan === 'function') {
        return res.json(await providers.ai.explainScan(scan, { manual: true, automatic: false, purpose: 'manual_explain' }));
      }
      return res.status(503).json({ error: 'AI router unavailable' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/ai/test-gemini', async (_req, res, next) => {
    try {
      const scan = await scheduler.snapshot();
      if (typeof providers.ai?.testGemini === 'function') return res.json(await providers.ai.testGemini(scan));
      return res.status(503).json({ error: 'AI router unavailable' });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/collection', async (_req, res, next) => {
    try {
      res.json(await repository.collectionStats());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/journal', async (_req, res, next) => {
    try {
      res.json(await repository.listJournal());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/journal', async (req, res, next) => {
    try {
      if (!req.body?.symbol || !req.body?.strategy) return res.status(400).json({ error: 'symbol and strategy required' });
      return res.status(201).json(await repository.addJournal(req.body));
    } catch (error) {
      return next(error);
    }
  });

  registerPushRoutes(app);
  startAutonomousSignalWorker({ scheduler, guardianScheduler, pushService, repository });
  app.use('/api/guardian', createGuardianRouter({ guardianScheduler, repository }));
  app.use('/api/push', createPushRouter({ pushService }));
  app.use('/api/positions', positionsRoutes);

  app.use((error, _req, res, _next) => {
    const status = error.status && error.status >= 400 ? error.status : 503;
    res.status(status).json({
      error: 'Market intelligence request failed',
      detail: error.message,
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

export async function startServer() {
  const app = createApp();
  const dist = path.resolve('dist');
  try {
    await access(path.join(dist, 'institutional-os.html'));
    app.use(express.static(dist, {
      setHeaders(res, filePath) {
        if (/(institutional-os\.html|sw\.js|manifest\.webmanifest)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'no-store');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('/', (_req, res) => res.redirect('/institutional-os.html'));
    app.get(['/archivo', '/laboratorio', '/dev', '/signals/:id'], (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(dist, 'institutional-os.html'));
    });
    // Catch-all SPA fallback — any non-API GET sends the React app
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(dist, 'institutional-os.html'));
    });
  } catch {
    app.get('/', (_req, res) => res.json({
      service: 'Valido 1M API',
      message: 'Run npm run dev for the React client or npm run build before production start.'
    }));
    // Fallback for non‑built environment
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.json({ service: 'Valido 1M API', note: 'Frontend not built. Run npm run build.' });
    });
  }
  return app.listen(config.port, config.host, () => {
    console.log(`Valido 1M API listening on http://${config.host}:${config.port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  startServer();
}
