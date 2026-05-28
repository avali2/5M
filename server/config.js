import 'dotenv/config';

const asNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const productionRuntime = String(process.env.NODE_ENV || '').toLowerCase() === 'production' ||
  String(process.env.RENDER || '').toLowerCase() === 'true' ||
  Boolean(process.env.RENDER_SERVICE_ID);

export const UNIVERSE = {
  indices: ['SPY', 'SPX', 'QQQ', 'IWM', 'DIA'],
  magnificent7: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA'],
  focusEquities: ['SOFI', 'AMD', 'RIVN', 'MCD', 'NU'],
  optionalIndices: ['XSP', 'NDX', 'RUT'],
  liquidEtfs: ['XLF', 'XLK', 'XLE', 'XLV', 'TLT', 'GLD'],
  breadth: ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU'],
  volatility: 'VIX'
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
    sandbox: String(process.env.TRADIER_SANDBOX || '').toLowerCase() === 'true'
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
    autoSignalDecision: String(process.env.AI_AUTO_SIGNAL_DECISION || 'false').toLowerCase() === 'true',
    autoNarrative: String(process.env.AI_AUTO_NARRATIVE || 'false').toLowerCase() === 'true',
    manualExplain: String(process.env.AI_MANUAL_EXPLAIN || 'true').toLowerCase() !== 'false',
    fallbackToDeterministic: String(process.env.AI_FALLBACK_TO_DETERMINISTIC || 'true').toLowerCase() !== 'false',
    dailyTokenBudget: asNumber(process.env.AI_DAILY_TOKEN_BUDGET, 30000),
    dailyRequestBudget: asNumber(process.env.AI_DAILY_REQUEST_BUDGET, 8),
    maxInputTokensPerCall: asNumber(process.env.AI_MAX_INPUT_TOKENS_PER_CALL, 2200),
    maxOutputTokensPerCall: asNumber(process.env.AI_MAX_OUTPUT_TOKENS_PER_CALL, 650),
    maxTotalTokensPerCall: asNumber(process.env.AI_MAX_TOTAL_TOKENS_PER_CALL, 3000),
    minAutomaticCallIntervalMinutes: asNumber(process.env.AI_MIN_AUTOMATIC_CALL_INTERVAL_MINUTES, 60),
    cooldownAfter429Minutes: asNumber(process.env.AI_COOLDOWN_AFTER_429_MINUTES, 120),
    disableAutoAtUsagePercent: asNumber(process.env.AI_DISABLE_AUTO_AT_USAGE_PERCENT, 75),
    disableAllAtUsagePercent: asNumber(process.env.AI_DISABLE_ALL_AT_USAGE_PERCENT, 95)
  },
  guardian: {
    enabled: String(process.env.GUARDIAN_ENABLED || 'true').toLowerCase() !== 'false'
  },
  webPush: {
    enabled: String(process.env.PUSH_ENABLED || process.env.ENABLE_WEB_PUSH || '').toLowerCase() === 'true',
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:your-email@example.com',
    enableFcm: String(process.env.ENABLE_FCM || '').toLowerCase() === 'true',
    fcmServerKey: process.env.FCM_SERVER_KEY || '',
    maxDailySignals: asNumber(process.env.PUSH_MAX_DAILY_SIGNALS, 5),
    symbolCooldownMinutes: asNumber(process.env.PUSH_SYMBOL_COOLDOWN_MINUTES, 30)
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
    maxCollateralPct: asNumber(process.env.MAX_COLLATERAL_PCT, 20),
    maxDailyLossPct: asNumber(process.env.MAX_DAILY_LOSS_PCT, 5),
    maxWeeklyLossPct: asNumber(process.env.MAX_WEEKLY_LOSS_PCT, 8),
    maxOpenTrades: asNumber(process.env.MAX_OPEN_TRADES, 3),
    minScore: asNumber(process.env.MIN_SCORE, 75),
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
    minPopCreditSpread: asNumber(process.env.MIN_POP_CREDIT_SPREAD, 0.7),
    maxPortfolioRiskPct: asNumber(process.env.MAX_PORTFOLIO_RISK_PCT, 0.06),
    maxDailySignals: asNumber(process.env.MAX_DAILY_SIGNALS, 5)
  },
  scanner: {
    enabled: String(process.env.SCANNER_ENABLED || 'true').toLowerCase() !== 'false',
    coreIntervalMinutes: asNumber(process.env.SCANNER_CORE_INTERVAL_MINUTES, 5),
    stockIntervalMinutes: asNumber(process.env.SCANNER_STOCK_INTERVAL_MINUTES, 10),
    afterHoursIntervalMinutes: asNumber(process.env.SCANNER_AFTER_HOURS_INTERVAL_MINUTES, 45)
  },
  refreshSeconds: asNumber(process.env.AUTO_REFRESH_SECONDS, 60)
};

export const buildInfo = {
  version: process.env.VALIDO_BUILD_VERSION ||
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
  return [
    {
      id: 'tradier',
      name: 'Tradier',
      configured: Boolean(config.tradier.token),
      primary: true,
      required: !config.polygon.apiKey,
      coverage: ['quotes', 'expirations', 'options chain', 'greeks', 'implied volatility']
    },
    {
      id: 'polygon',
      name: 'Polygon',
      configured: Boolean(config.polygon.apiKey),
      primary: false,
      required: !config.tradier.token,
      optional: true,
      coverage: ['quotes', 'options snapshots', 'greeks', 'open interest']
    },
    {
      id: 'yahoo',
      name: 'Yahoo Finance',
      configured: config.yahoo.enabled,
      primary: false,
      required: false,
      optional: true,
      coverage: ['delayed quotes', 'daily history', 'option chains fallback', 'market/company news fallback']
    },
    {
      id: 'finnhub',
      name: 'Finnhub',
      configured: Boolean(config.finnhub.apiKey),
      primary: true,
      required: true,
      coverage: ['economic calendar', 'earnings', 'news', 'insider activity']
    },
    {
      id: 'fmp',
      name: 'Financial Modeling Prep',
      configured: Boolean(config.fmp.apiKey),
      primary: false,
      required: false,
      optional: true,
      coverage: ['economic calendar', 'earnings fallback']
    },
    {
      id: 'benzinga',
      name: 'Benzinga',
      configured: Boolean(config.benzinga.apiKey),
      primary: false,
      required: false,
      optional: true,
      coverage: ['unusual options activity', 'block trades']
    },
    {
      id: 'alphaVantage',
      name: 'Alpha Vantage',
      configured: Boolean(config.alphaVantage.apiKey),
      primary: false,
      required: false,
      optional: true,
      coverage: ['news sentiment', 'macro/market context fallback']
    },
    {
      id: 'gemini',
      name: 'Gemini',
      configured: Boolean(config.gemini.apiKey),
      enabled: config.gemini.enabled,
      primary: config.ai.primaryProvider === 'gemini',
      required: false,
      optional: true,
      coverage: ['manual explanations', 'tutor summaries', 'risk education']
    },
    {
      id: 'openai',
      name: 'OpenAI',
      configured: Boolean(config.openai.apiKey && config.openai.model),
      enabled: config.openai.enabled,
      primary: false,
      required: false,
      optional: true,
      coverage: ['contextual market summary']
    },
    {
      id: 'postgres',
      name: 'PostgreSQL',
      configured: Boolean(config.database.url),
      primary: false,
      required: false,
      optional: true,
      coverage: ['iv history', 'throttled options snapshots', 'trade journal']
    }
  ];
}
