import 'dotenv/config';

const asNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asPercentInput = (value, fallback) => {
  const parsed = asNumber(value, fallback);
  return parsed <= 1 ? parsed * 100 : parsed;
};

const asBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
};

const asList = (value, fallback = []) => {
  const source = value || fallback.join(',');
  return [...new Set(String(source).split(',').map((item) => item.trim()).filter(Boolean))];
};

const productionRuntime = String(process.env.NODE_ENV || '').toLowerCase() === 'production' ||
  String(process.env.RENDER || '').toLowerCase() === 'true' ||
  Boolean(process.env.RENDER_SERVICE_ID);

const WATCHLIST_CORE = asList(process.env.WATCHLIST_CORE, [
  'SPY', 'QQQ', 'IWM', 'DIA', 'SPX', 'XSP',
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA',
  'SOFI', 'NU', 'F', 'AMD', 'AVGO', 'PLTR', 'UBER', 'HOOD', 'COIN',
  'MCD', 'JPM', 'BAC', 'XOM', 'CVX', 'COST', 'WMT', 'LLY', 'ORCL', 'CRM', 'NFLX'
]);

export const UNIVERSE = {
  indices: ['SPY', 'SPX', 'QQQ', 'IWM', 'DIA'],
  pdfIndices: ['DJI', 'NDX', 'IXIC', 'SPX', 'DJA', 'DJT', 'DJU', 'XAX', 'NYA', 'OEX', 'RUT', 'VIX', 'VXST', 'VXN', 'RVX', 'VXEEM', 'OVX', 'GVZ'],
  magnificent7: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA'],
  focusEquities: ['SOFI', 'NU', 'F', 'AMD', 'AVGO', 'PLTR', 'UBER', 'HOOD', 'COIN', 'MCD', 'JPM', 'BAC', 'XOM', 'CVX', 'COST', 'WMT', 'LLY', 'ORCL', 'CRM', 'NFLX', 'DIS', 'BA', 'GE', 'CAT', 'PYPL', 'SHOP', 'SQ'],
  sp100Equities: [
    'MMM', 'ABT', 'ABBV', 'ACN', 'ADBE', 'AMD', 'ALL', 'GOOGL', 'GOOG', 'MO', 'AMZN', 'AXP', 'AIG', 'AMGN', 'AAPL', 'T', 'BAC', 'BK', 'BRK.B', 'BIIB', 'BLK', 'BA', 'BKNG', 'BMY', 'AVGO', 'COF', 'CAT',
    'SCHW', 'CHTR', 'CVX', 'CSCO', 'C', 'KO', 'CL', 'CMCSA', 'COP', 'COST', 'CVS', 'DHR', 'DOW', 'DD', 'DUK', 'LLY', 'EMR', 'EXC', 'XOM', 'FDX', 'F', 'GE', 'GD', 'GM', 'GILD', 'GS', 'HD', 'HON', 'IBM', 'INTC', 'JNJ', 'JPM', 'KMI',
    'KHC', 'LOW', 'MA', 'MCD', 'MDT', 'MRK', 'META', 'MET', 'MSFT', 'MDLZ', 'MS', 'NFLX', 'NEE', 'NKE', 'NVDA', 'OXY', 'ORCL', 'PYPL', 'PEP', 'PFE', 'PM', 'PG', 'QCOM', 'RTX', 'CRM', 'SLB', 'SO', 'SBUX', 'TMUS', 'TGT', 'TSLA', 'TXN', 'TMO',
    'UNP', 'UPS', 'UNH', 'USB', 'VZ', 'V', 'WMT', 'WBA', 'DIS', 'WFC'
  ],
  optionalIndices: ['XSP', 'NDX', 'RUT'],
  opportunityEquities: ['SOFI', 'NU', 'F', 'PLTR', 'UBER', 'HOOD', 'COIN', 'AVGO', 'JPM', 'BAC', 'XOM', 'CVX', 'COST', 'WMT', 'LLY', 'ORCL', 'CRM', 'NFLX', 'DIS', 'BA', 'GE', 'CAT', 'PYPL', 'SHOP', 'SQ', 'PFE', 'T', 'VZ'],
  liquidEtfs: ['XLF', 'XLK', 'XLE', 'XLV', 'TLT', 'GLD'],
  breadth: ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU'],
  volatility: 'VIX',
  core: WATCHLIST_CORE
};

const startedAt = new Date().toISOString();

export const config = {
  port: asNumber(process.env.PORT, 8787),
  host: process.env.HOST || (productionRuntime ? '0.0.0.0' : '127.0.0.1'),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  clientOrigin: process.env.CLIENT_ORIGIN || process.env.PUBLIC_BASE_URL || (productionRuntime ? false : 'http://127.0.0.1:5173'),
  security: {
    accessKey: process.env.APP_ACCESS_KEY || '',
    requireAccessKey: String(process.env.REQUIRE_ACCESS_KEY || '').toLowerCase() === 'true' ||
      String(process.env.RENDER || '').toLowerCase() === 'true' ||
      Boolean(process.env.RENDER_SERVICE_ID)
  },
  tradier: {
    token: process.env.TRADIER_TOKEN || process.env.TRADIER_ACCESS_TOKEN || '',
    baseUrl: process.env.TRADIER_BASE_URL || 'https://api.tradier.com/v1',
    accountId: process.env.TRADIER_ACCOUNT_ID || '',
    sandbox: String(process.env.TRADIER_SANDBOX || '').toLowerCase() === 'true',
    accountSync: asBool(process.env.TRADIER_ACCOUNT_SYNC, true),
    syncRiskLimitsFromEnv: asBool(process.env.SYNC_RISK_LIMITS_FROM_ENV, true)
  },
  tradierPaper: {
    enabled: asBool(process.env.TRADIER_PAPER_ENABLED, true),
    token: process.env.TRADIER_PAPER_TOKEN || '',
    baseUrl: process.env.TRADIER_PAPER_BASE_URL || 'https://sandbox.tradier.com/v1',
    accountId: process.env.TRADIER_PAPER_ACCOUNT_ID || '',
    defaultBotEnabled: asBool(process.env.PAPER_BOT_DEFAULT_ENABLED, false),
    defaultAutoExecute: asBool(process.env.PAPER_BOT_DEFAULT_AUTO_EXECUTE, false),
    intervalMinutes: asNumber(process.env.PAPER_BOT_INTERVAL_MINUTES, 3),
    maxRiskPct: asNumber(process.env.PAPER_BOT_MAX_RISK_PCT, 1),
    maxDailyLossPct: asNumber(process.env.PAPER_BOT_MAX_DAILY_LOSS_PCT, 2),
    maxOpenPositions: asNumber(process.env.PAPER_BOT_MAX_OPEN_POSITIONS, 3),
    maxContracts: asNumber(process.env.PAPER_BOT_MAX_CONTRACTS, 1),
    minScore: asNumber(process.env.PAPER_BOT_MIN_SCORE, 75),
    minPop: asNumber(process.env.PAPER_BOT_MIN_POP, 60),
    takeProfitPct: asNumber(process.env.PAPER_BOT_TAKE_PROFIT_PCT, 50),
    stopLossPct: asNumber(process.env.PAPER_BOT_STOP_LOSS_PCT, 50),
    requireGeminiApproval: asBool(process.env.PAPER_BOT_REQUIRE_GEMINI, true)
  },
  polygon: {
    apiKey: process.env.POLYGON_API_KEY || '',
    baseUrl: 'https://api.polygon.io'
  },
  yahoo: {
    enabled: String(process.env.ENABLE_YAHOO_PROVIDER || 'true').toLowerCase() !== 'false'
  },
  finnhub: {
    apiKey: process.env.FINNHUB_API_KEY || '',
    baseUrl: 'https://finnhub.io/api/v1'
  },
  fmp: {
    apiKey: process.env.FMP_API_KEY || '',
    baseUrl: 'https://financialmodelingprep.com/stable'
  },
  benzinga: {
    apiKey: process.env.BENZINGA_API_KEY || '',
    baseUrl: 'https://api.benzinga.com/api/v1'
  },
  alphaVantage: {
    apiKey: process.env.ALPHA_VANTAGE_API_KEY || '',
    baseUrl: 'https://www.alphavantage.co/query'
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    enabled: String(process.env.ENABLE_GEMINI || 'true').toLowerCase() !== 'false'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || '',
    enabled: String(process.env.ENABLE_OPENAI || process.env.ENABLE_AI_ASSISTANT || '').toLowerCase() === 'true',
    manualOnly: String(process.env.OPENAI_MANUAL_ONLY || 'true').toLowerCase() !== 'false',
    dailyLimit: asNumber(process.env.AI_DAILY_CALL_LIMIT, asNumber(process.env.AI_DAILY_REQUEST_BUDGET, 8))
  },
  ai: {
    primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'gemini',
    autoTutor: String(process.env.AI_AUTO_TUTOR || 'true').toLowerCase() === 'true',
    autoSignalDecision: asBool(process.env.AI_AUTO_SIGNAL_DECISION, asBool(process.env.AGENT_AUTO_VERIFY_SIGNALS, false)) ||
      asBool(process.env.AGENT_AUTO_VERIFY_SIGNALS, false),
    autoNarrative: String(process.env.AI_AUTO_NARRATIVE || 'false').toLowerCase() === 'true',
    manualExplain: String(process.env.AI_MANUAL_EXPLAIN || 'true').toLowerCase() !== 'false',
    fallbackToDeterministic: String(process.env.AI_FALLBACK_TO_DETERMINISTIC || 'true').toLowerCase() !== 'false',
    dailyTokenBudget: asNumber(process.env.AI_DAILY_TOKEN_BUDGET, 90000),
    dailyRequestBudget: asNumber(process.env.AI_DAILY_REQUEST_BUDGET, 28),
    maxInputTokensPerCall: asNumber(process.env.AI_MAX_INPUT_TOKENS_PER_CALL, 2200),
    maxOutputTokensPerCall: asNumber(process.env.AI_MAX_OUTPUT_TOKENS_PER_CALL, 800),
    maxTotalTokensPerCall: asNumber(process.env.AI_MAX_TOTAL_TOKENS_PER_CALL, 3000),
    minAutomaticCallIntervalMinutes: asNumber(process.env.AI_MIN_AUTOMATIC_CALL_INTERVAL_MINUTES, 10),
    cooldownAfter429Minutes: asNumber(process.env.AI_COOLDOWN_AFTER_429_MINUTES, 30),
    disableAutoAtUsagePercent: asNumber(process.env.AI_DISABLE_AUTO_AT_USAGE_PERCENT, 90),
    disableAllAtUsagePercent: asNumber(process.env.AI_DISABLE_ALL_AT_USAGE_PERCENT, 97)
  },
  guardian: {
    enabled: String(process.env.GUARDIAN_ENABLED || 'true').toLowerCase() !== 'false',
    edgeMode: {
      minProfitDollars: asNumber(process.env.SIGNAL_MIN_TARGET_PROFIT, 30),
      minPopToNotify: asPercentInput(process.env.MIN_POP_TO_NOTIFY, 70),
      minScoreReady: asNumber(process.env.MIN_EDGE_SCORE, 70),
      minScoreAggressive: asNumber(process.env.MIN_AGGRESSIVE_SCORE, 65),
      minScoreCandidate: asNumber(process.env.MIN_CANDIDATE_SCORE, 60),
      allowCapitalHeavyAlerts: asBool(process.env.ALLOW_CAPITAL_HEAVY_ALERTS, true),
      allowVeryAggressive: asBool(process.env.ALLOW_VERY_AGGRESSIVE, false),
      allow0DTE: asBool(process.env.ALLOW_0DTE, false),
      maxAlertsPerHour: asNumber(process.env.PUSH_MAX_ALERTS_PER_HOUR, 3)
    }
  },
  webPush: {
    enabled: asBool(process.env.PUSH_ENABLED || process.env.ENABLE_WEB_PUSH, false),
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:your-email@example.com',
    enableFcm: asBool(process.env.ENABLE_FCM, false),
    fcmServerKey: process.env.FCM_SERVER_KEY || '',
    maxDailySignals: asNumber(process.env.PUSH_MAX_DAILY_SIGNALS, 5),
    symbolCooldownMinutes: asNumber(process.env.PUSH_SYMBOL_COOLDOWN_MINUTES, 30),
    realSignalsOnly: asBool(process.env.PUSH_REAL_SIGNALS_ONLY, true),
    blockOnMacroCaution: asBool(process.env.PUSH_BLOCK_ON_MACRO_CAUTION, true),
    blockOnNewsCaution: asBool(process.env.PUSH_BLOCK_ON_NEWS_CAUTION, false),
    includeReasonSummary: asBool(process.env.PUSH_INCLUDE_REASON_SUMMARY, true)
  },
  agent: {
    enabled: asBool(process.env.AGENT_ENABLED, asBool(process.env.GUARDIAN_ENABLED, true)),
    name: process.env.AGENT_NAME || 'Gemini Guardian',
    mode: process.env.AGENT_MODE || 'aggressive_defined_risk',
    refreshIntervalMinutes: asNumber(process.env.AGENT_REFRESH_INTERVAL_MINUTES, 5),
    manualScanEnabled: asBool(process.env.AGENT_MANUAL_SCAN_ENABLED, true),
    autoVerifySignals: asBool(process.env.AGENT_AUTO_VERIFY_SIGNALS, true),
    verifyMinScore: asNumber(process.env.AGENT_VERIFY_MIN_SCORE, 70),
    creditReviewMinScore: asNumber(process.env.AGENT_CREDIT_REVIEW_MIN_SCORE, 60),
    reviewTopN: asNumber(process.env.AGENT_REVIEW_TOP_N, 12),
    cacheTtlMinutes: asNumber(process.env.AGENT_CACHE_TTL_MINUTES, 180),
    maxAiVerificationsPerDay: asNumber(process.env.AGENT_MAX_AI_VERIFICATIONS_PER_DAY, 24),
    minutesBetweenAiCalls: asNumber(process.env.AGENT_MINUTES_BETWEEN_AI_CALLS, 10),
    disableAiAtUsagePercent: asNumber(process.env.AGENT_DISABLE_AI_AT_USAGE_PERCENT, 90),
    failsafeDeterministic: asBool(process.env.AGENT_FAILSAFE_DETERMINISTIC, true),
    requireStructuredJson: asBool(process.env.AGENT_REQUIRE_STRUCTURED_JSON, true)
  },
  signals: {
    realSignalsOnly: asBool(process.env.REAL_SIGNALS_ONLY, true),
    minScore: asNumber(process.env.SIGNAL_MIN_SCORE, asNumber(process.env.MIN_SCORE, 72)),
    minPop: asNumber(process.env.SIGNAL_MIN_POP, asNumber(process.env.MIN_PROBABILITY, 0.62)),
    requireRiskApproval: asBool(process.env.SIGNAL_REQUIRE_RISK_APPROVAL, true),
    requireMacroClearance: asBool(process.env.SIGNAL_REQUIRE_MACRO_CLEARANCE, true),
    requireNewsClearance: asBool(process.env.SIGNAL_REQUIRE_NEWS_CLEARANCE, false),
    requireAiConfirmation: asBool(process.env.SIGNAL_REQUIRE_AI_CONFIRMATION, false),
    failClosedOnAiError: asBool(
      process.env.FAIL_CLOSED_ON_GEMINI_ERROR,
      asBool(process.env.FAIL_CLOSED_ON_AI_ERROR, false)
    ),
    maxPerDay: asNumber(process.env.SIGNAL_MAX_PER_DAY, 3),
    minReadyScore: asNumber(process.env.MIN_READY_SCORE, 70),
    minCandidateScore: asNumber(process.env.MIN_CANDIDATE_SCORE, 58),
    minWatchlistScore: asNumber(process.env.MIN_WATCHLIST_SCORE, 45)
  },
  guards: {
    macroEnabled: asBool(process.env.MACRO_GUARD_ENABLED, true),
    newsEnabled: asBool(process.env.NEWS_GUARD_ENABLED, true),
    geopoliticalEnabled: asBool(process.env.GEOPOLITICAL_GUARD_ENABLED, true),
    fedEnabled: asBool(process.env.FED_GUARD_ENABLED, true),
    earningsEnabled: asBool(process.env.EARNINGS_GUARD_ENABLED, true),
    highImpactBlackoutHours: asNumber(process.env.HIGH_IMPACT_EVENT_BLACKOUT_HOURS, 24),
    mediumImpactCautionHours: asNumber(process.env.MEDIUM_IMPACT_EVENT_CAUTION_HOURS, 8),
    newsLookbackHours: asNumber(process.env.NEWS_LOOKBACK_HOURS, 24),
    newsCautionScore: asNumber(process.env.NEWS_CAUTION_SCORE, 65),
    newsBlockScore: asNumber(process.env.NEWS_BLOCK_SCORE, 80),
    fedEventCautionHours: asNumber(process.env.FED_EVENT_CAUTION_HOURS, 48),
    warNewsBlockEnabled: asBool(process.env.WAR_NEWS_BLOCK_ENABLED, true),
    allowUnverifiedMacroWhenFeedsMissing: asBool(process.env.ALLOW_UNVERIFIED_MACRO_WHEN_FEEDS_MISSING, false),
    allowUnverifiedNewsWhenFeedsMissing: asBool(process.env.ALLOW_UNVERIFIED_NEWS_WHEN_FEEDS_MISSING, false)
  },
  ui: {
    showManualRefreshButton: asBool(process.env.SHOW_MANUAL_REFRESH_BUTTON, true),
    showAgentPanel: asBool(process.env.SHOW_AGENT_PANEL, true),
    showUnavailableFeedsAsOptional: asBool(process.env.SHOW_UNAVAILABLE_FEEDS_AS_OPTIONAL, true),
    hidePremiumFeedsIfUnconfigured: asBool(process.env.HIDE_PREMIUM_FEEDS_IF_UNCONFIGURED, true),
    hideRejectedSignalsByDefault: asBool(process.env.HIDE_REJECTED_SIGNALS_BY_DEFAULT, true),
    defaultHomeView: process.env.DEFAULT_HOME_VIEW || 'signals',
    friendlyLightTheme: asBool(process.env.FRIENDLY_LIGHT_THEME, true)
  },
  feeds: {
    optionalPremium: asList(process.env.OPTIONAL_PREMIUM_FEEDS, ['polygon', 'benzinga', 'fcm']),
    required: asList(process.env.REQUIRED_FEEDS, ['tradier_or_yahoo', 'app_access_key']),
    important: asList(process.env.IMPORTANT_FEEDS, ['gemini', 'database', 'webpush', 'alpha_vantage', 'finnhub', 'fmp'])
  },
  watchlist: {
    core: WATCHLIST_CORE
  },
  marketDataMode: process.env.MARKET_DATA_MODE || 'live',
  database: {
    url: process.env.DATABASE_URL || '',
    ssl: String(process.env.DATABASE_SSL || '').toLowerCase() === 'true',
    snapshotIntervalMinutes: asNumber(process.env.SNAPSHOT_INTERVAL_MINUTES, 60),
    maxSnapshotContracts: asNumber(process.env.MAX_SNAPSHOT_CONTRACTS, 80),
    snapshotRetentionDays: asNumber(process.env.SNAPSHOT_RETENTION_DAYS, 45)
  },
  policy: {
    accountSize: asNumber(process.env.ACCOUNT_SIZE, 2000),
    riskPct: asNumber(process.env.RISK_PER_TRADE_PCT, 2),
    maxCollateralPct: asNumber(process.env.MAX_COLLATERAL_PCT, 35),
    maxDailyLossPct: asNumber(process.env.MAX_DAILY_LOSS_PCT, 4),
    maxWeeklyLossPct: asNumber(process.env.MAX_WEEKLY_LOSS_PCT, 8),
    maxOpenTrades: asNumber(process.env.MAX_OPEN_TRADES, 4),
    minScore: asNumber(process.env.SIGNAL_MIN_SCORE, asNumber(process.env.MIN_SCORE, 72)),
    minDte: asNumber(process.env.MIN_DTE, 21),
    maxDte: asNumber(process.env.MAX_DTE, 45),
    minOpenInterest: 100,
    minVolume: 10,
    maxBidAskPct: 0.2,
    maxShortDelta: 0.3,
    minShortDelta: 0.12,
    maxVix: 30,
    ivRankMinObservations: asNumber(process.env.IV_RANK_MIN_OBSERVATIONS, 30),
    allow1DteApproval: String(process.env.ALLOW_1DTE_APPROVAL || '').toLowerCase() === 'true',
    allow0Dte: String(process.env.ALLOW_0DTE || '').toLowerCase() === 'true',
    allowEarnings: String(process.env.ALLOW_EARNINGS || '').toLowerCase() === 'true',
    allowMargin: String(process.env.ALLOW_MARGIN || '').toLowerCase() === 'true',
    workMode: true,
    defaultRiskMode: process.env.DEFAULT_RISK_MODE || 'MODERATE_AGGRESSIVE',
    minPopCreditSpread: asNumber(process.env.MIN_POP_CREDIT_SPREAD, 58),
    minPopReadyCreditSpread: asNumber(process.env.MIN_POP_READY_CREDIT_SPREAD, 60),
    maxPortfolioRiskPct: asNumber(process.env.MAX_PORTFOLIO_RISK_PCT, 0.06),
    maxDailySignals: asNumber(process.env.SIGNAL_MAX_PER_DAY, asNumber(process.env.MAX_DAILY_SIGNALS, 3))
  },
  scanner: {
    enabled: String(process.env.SCANNER_ENABLED || 'true').toLowerCase() !== 'false',
    // Keep the server-side fallback active until a dedicated Render worker
    // explicitly disables it with SCANNER_RUN_IN_WEB=false.
    runInWeb: asBool(process.env.SCANNER_RUN_IN_WEB, true),
    intervalMinutes: asNumber(process.env.SCANNER_INTERVAL_MINUTES, 3),
    marketOpenOnly: asBool(process.env.SCANNER_MARKET_OPEN_ONLY, false),
    coreIntervalMinutes: asNumber(process.env.SCANNER_CORE_INTERVAL_MINUTES, 5),
    stockIntervalMinutes: asNumber(process.env.SCANNER_STOCK_INTERVAL_MINUTES, 10),
    afterHoursIntervalMinutes: asNumber(process.env.SCANNER_AFTER_HOURS_INTERVAL_MINUTES, 15)
  },
  refreshSeconds: asNumber(process.env.AUTO_REFRESH_SECONDS, 180)
};

export const buildInfo = {
  version: process.env.npm_package_version ||
    process.env.VALIDO_BUILD_VERSION ||
    process.env.VITE_VALIDO_BUILD_VERSION ||
    process.env.RENDER_GIT_COMMIT?.slice(0, 7) ||
    process.env.npm_package_version ||
    'local-dev',
  timestamp: process.env.VALIDO_BUILD_TIMESTAMP ||
    process.env.VITE_VALIDO_BUILD_TIMESTAMP ||
    process.env.RENDER_DEPLOY_CREATED_AT ||
    startedAt,
  startedAt
};

export function providerStatus() {
  const feedMeta = (group, optionalPremium = false) => ({
    group,
    optionalPremium,
    required: group === 'required',
    important: group === 'important',
    hiddenWhenMissing: optionalPremium && config.ui.hidePremiumFeedsIfUnconfigured
  });
  return [
    {
      id: 'tradier',
      name: 'Tradier',
      configured: Boolean(config.tradier.token),
      primary: true,
      ...feedMeta('required'),
      coverage: ['quotes', 'expirations', 'options chain', 'greeks', 'implied volatility']
    },
    {
      id: 'polygon',
      name: 'Polygon',
      configured: Boolean(config.polygon.apiKey),
      primary: false,
      ...feedMeta('optional_premium', true),
      coverage: ['quotes', 'options snapshots', 'greeks', 'open interest']
    },
    {
      id: 'yahoo',
      name: 'Yahoo Finance',
      configured: config.yahoo.enabled,
      primary: false,
      ...feedMeta('required'),
      coverage: ['delayed quotes', 'daily history', 'option chains fallback', 'market/company news fallback']
    },
    {
      id: 'finnhub',
      name: 'Finnhub',
      configured: Boolean(config.finnhub.apiKey),
      primary: true,
      ...feedMeta('important'),
      coverage: ['economic calendar', 'earnings', 'news', 'insider activity']
    },
    {
      id: 'fmp',
      name: 'Financial Modeling Prep',
      configured: Boolean(config.fmp.apiKey),
      primary: false,
      ...feedMeta('important'),
      coverage: ['economic calendar', 'earnings fallback']
    },
    {
      id: 'benzinga',
      name: 'Benzinga',
      configured: Boolean(config.benzinga.apiKey),
      primary: false,
      ...feedMeta('optional_premium', true),
      coverage: ['unusual options activity', 'block trades']
    },
    {
      id: 'alphaVantage',
      name: 'Alpha Vantage',
      configured: Boolean(config.alphaVantage.apiKey),
      primary: false,
      ...feedMeta('important'),
      coverage: ['news sentiment', 'macro/market context fallback']
    },
    {
      id: 'gemini',
      name: 'Gemini',
      configured: Boolean(config.gemini.apiKey),
      enabled: config.gemini.enabled,
      primary: config.ai.primaryProvider === 'gemini',
      ...feedMeta('important'),
      coverage: ['manual explanations', 'tutor summaries', 'risk education']
    },
    {
      id: 'openai',
      name: 'OpenAI',
      configured: Boolean(config.openai.apiKey && config.openai.model),
      enabled: config.openai.enabled,
      primary: false,
      ...feedMeta('optional'),
      coverage: ['contextual market summary']
    },
    {
      id: 'postgres',
      name: 'PostgreSQL',
      configured: Boolean(config.database.url),
      primary: false,
      ...feedMeta('important'),
      coverage: ['iv history', 'throttled options snapshots', 'trade journal']
    },
    {
      id: 'webpush',
      name: 'Web Push / VAPID',
      configured: Boolean(config.webPush.enabled && config.webPush.publicKey && config.webPush.privateKey),
      enabled: config.webPush.enabled,
      primary: false,
      ...feedMeta('important'),
      coverage: ['mobile push notifications', 'locked-phone alerts where supported']
    },
    {
      id: 'fcm',
      name: 'FCM',
      configured: Boolean(config.webPush.enableFcm && config.webPush.fcmServerKey),
      enabled: config.webPush.enableFcm,
      primary: false,
      ...feedMeta('optional_premium', true),
      coverage: ['reserved optional notification transport']
    }
  ];
}
