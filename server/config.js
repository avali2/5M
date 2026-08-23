import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const asNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
};

const asList = (value, fallback) => [...new Set(String(value || fallback.join(','))
  .split(',')
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean))];

const magnificentSeven = asList(process.env.MAGNIFICENT_7, ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA']);
const prioritySymbols = asList(process.env.PRIORITY_SYMBOLS, ['AMD', 'MSFT', 'SPY']);
const indexProxies = asList(process.env.INDEX_PROXIES, ['SPY', 'QQQ', 'IWM', 'DIA']);
const contextIndices = asList(process.env.CONTEXT_INDICES, ['SPX', 'NDX', 'RUT', 'VIX']);
const optionsLeaders = asList(process.env.OPTIONS_LEADERS, ['AMD', 'AVGO', 'PLTR', 'NFLX', 'HOOD', 'MU', 'ORCL', 'TSM', 'BABA', 'BAC', 'COIN']);
const sectorAndMacroEtfs = asList(process.env.SECTOR_MACRO_ETFS, ['SMH', 'XLK', 'XLF', 'XLE', 'TLT', 'IBIT']);
const defaultWatchlist = [...prioritySymbols, ...indexProxies, ...magnificentSeven, ...optionsLeaders, ...sectorAndMacroEtfs];

const coreProfile = {
  id: 'CORE',
  label: 'Base',
  riskLevel: 'MODERADO',
  enabled: true,
  minDte: Math.max(1, asNumber(process.env.MIN_DTE, 21)),
  maxDte: Math.max(2, asNumber(process.env.MAX_DTE, 45)),
  targetDte: Math.max(1, asNumber(process.env.TARGET_DTE, 30)),
  shortDeltaMin: Math.max(0.01, asNumber(process.env.CORE_SHORT_DELTA_MIN, 0.12)),
  shortDeltaMax: Math.min(0.49, asNumber(process.env.CORE_SHORT_DELTA_MAX, 0.30)),
  minLiquidity: Math.min(100, Math.max(0, asNumber(process.env.CORE_MIN_LIQUIDITY, 40))),
  minScore: Math.min(100, Math.max(0, asNumber(process.env.MIN_SCORE, 70))),
  minPop: Math.min(0.95, Math.max(0.5, asNumber(process.env.MIN_POP, 0.60))),
  takeProfitPct: Math.min(0.9, Math.max(0.1, asNumber(process.env.CORE_TAKE_PROFIT_PCT, 0.50))),
  stopMultiple: Math.max(1.1, asNumber(process.env.CORE_STOP_MULTIPLE, 2)),
  timeStopDte: Math.max(1, asNumber(process.env.CORE_TIME_STOP_DTE, 21)),
  riskMultiplier: 1,
  maxContracts: Math.max(1, asNumber(process.env.MAX_CONTRACTS, 3)),
  priorityOnly: false
};

const aggressiveProfile = {
  id: 'AGGRESSIVE',
  label: 'Agresiva',
  riskLevel: 'ALTO',
  enabled: asBool(process.env.AGGRESSIVE_ENABLED, true),
  minDte: Math.max(1, asNumber(process.env.AGGRESSIVE_MIN_DTE, 7)),
  maxDte: Math.max(2, asNumber(process.env.AGGRESSIVE_MAX_DTE, 20)),
  targetDte: Math.max(1, asNumber(process.env.AGGRESSIVE_TARGET_DTE, 14)),
  shortDeltaMin: Math.max(0.01, asNumber(process.env.AGGRESSIVE_SHORT_DELTA_MIN, 0.24)),
  shortDeltaMax: Math.min(0.49, asNumber(process.env.AGGRESSIVE_SHORT_DELTA_MAX, 0.40)),
  minLiquidity: Math.min(100, Math.max(0, asNumber(process.env.AGGRESSIVE_MIN_LIQUIDITY, 50))),
  minScore: Math.min(100, Math.max(0, asNumber(process.env.AGGRESSIVE_MIN_SCORE, 76))),
  minPop: Math.min(0.95, Math.max(0.5, asNumber(process.env.AGGRESSIVE_MIN_POP, 0.58))),
  takeProfitPct: Math.min(0.9, Math.max(0.1, asNumber(process.env.AGGRESSIVE_TAKE_PROFIT_PCT, 0.35))),
  stopMultiple: Math.max(1.1, asNumber(process.env.AGGRESSIVE_STOP_MULTIPLE, 1.75)),
  timeStopDte: Math.max(1, asNumber(process.env.AGGRESSIVE_TIME_STOP_DTE, 7)),
  riskMultiplier: Math.min(1, Math.max(0.1, asNumber(process.env.AGGRESSIVE_RISK_MULTIPLIER, 0.5))),
  maxContracts: Math.max(1, asNumber(process.env.AGGRESSIVE_MAX_CONTRACTS, 1)),
  priorityOnly: true
};

export const config = {
  root: ROOT,
  port: asNumber(process.env.PORT, 8787),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  clientOrigin: process.env.CLIENT_ORIGIN || '',
  security: {
    accessKey: process.env.APP_ACCESS_KEY || '',
    requireAccessKey: asBool(process.env.REQUIRE_ACCESS_KEY, false)
  },
  tradier: {
    token: process.env.TRADIER_TOKEN || process.env.TRADIER_ACCESS_TOKEN || '',
    baseUrl: (process.env.TRADIER_BASE_URL || (asBool(process.env.TRADIER_SANDBOX, false)
      ? 'https://sandbox.tradier.com/v1'
      : 'https://api.tradier.com/v1')).replace(/\/$/, ''),
    sandbox: asBool(process.env.TRADIER_SANDBOX, false),
    realtimeEntitled: asBool(process.env.TRADIER_REALTIME_ENTITLED, false)
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    required: asBool(process.env.GEMINI_REQUIRED, true),
    newsCacheMinutes: Math.max(1, asNumber(process.env.NEWS_CACHE_MINUTES, 15)),
    minGroundingSources: Math.max(1, asNumber(process.env.NEWS_MIN_SOURCES, 3)),
    maxClearRiskScore: Math.min(100, Math.max(0, asNumber(process.env.NEWS_MAX_CLEAR_RISK, 35)))
  },
  watchlist: {
    magnificentSeven,
    priority: prioritySymbols,
    indexProxies,
    contextIndices,
    optionsLeaders,
    sectorAndMacroEtfs,
    core: asList(process.env.WATCHLIST_CORE, defaultWatchlist),
    maxSymbolsPerScan: Math.max(6, asNumber(process.env.MAX_SYMBOLS_PER_SCAN, 12)),
    rotationEnabled: asBool(process.env.WATCHLIST_ROTATION_ENABLED, true)
  },
  policy: {
    minDte: coreProfile.minDte,
    maxDte: coreProfile.maxDte,
    accountSize: Math.max(0, asNumber(process.env.ACCOUNT_SIZE, 2000)),
    riskPerTradePct: Math.max(0.1, asNumber(process.env.RISK_PER_TRADE_PCT, 1)),
    maxContracts: coreProfile.maxContracts,
    minPop: coreProfile.minPop,
    minScore: coreProfile.minScore,
    minCredit: Math.max(0.01, asNumber(process.env.MIN_CREDIT, 0.1)),
    maxDailySignals: Math.max(1, asNumber(process.env.MAX_DAILY_SIGNALS, 3)),
    block0Dte: asBool(process.env.BLOCK_0DTE, true),
    requireAffordableSignal: asBool(process.env.REQUIRE_AFFORDABLE_SIGNAL, true),
    minTimeframes: Math.min(5, Math.max(2, asNumber(process.env.MIN_TIMEFRAMES, 3))),
    maxDataAgeMinutes: Math.max(1, asNumber(process.env.MAX_DATA_AGE_MINUTES, 20)),
    profiles: { core: coreProfile, aggressive: aggressiveProfile }
  },
  scanner: {
    intervalMinutes: Math.max(1, asNumber(process.env.SCAN_INTERVAL_MINUTES, 5)),
    manualCooldownSeconds: Math.max(0, asNumber(process.env.MANUAL_SCAN_COOLDOWN_SECONDS, 60)),
    marketOpenOnly: asBool(process.env.MARKET_OPEN_ONLY, true),
    enabled: asBool(process.env.SCANNER_ENABLED, true)
  },
  push: {
    enabled: asBool(process.env.PUSH_ENABLED, true),
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:you@example.com'
  },
  learning: {
    enabled: asBool(process.env.LEARNING_ENABLED, true),
    minimumValidatedSamples: Math.max(10, asNumber(process.env.LEARNING_MIN_VALIDATED_SAMPLES, 20)),
    historyLimit: Math.max(50, asNumber(process.env.LEARNING_HISTORY_LIMIT, 500)),
    signalRetention: Math.max(500, asNumber(process.env.LEARNING_SIGNAL_RETENTION, 5000))
  },
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || './data')
};

export function publicConfig() {
  return {
    appName: '5 MILLIONS',
    watchlist: config.watchlist,
    policy: config.policy,
    scanner: config.scanner,
    learning: config.learning,
    security: { requiresKey: config.security.requireAccessKey },
    integrations: {
      tradier: Boolean(config.tradier.token),
      tradierMode: config.tradier.sandbox ? 'sandbox' : config.tradier.realtimeEntitled ? 'real-time-read-only' : 'entitlement-unconfirmed',
      gemini: Boolean(config.gemini.apiKey),
      groundedNews: Boolean(config.gemini.apiKey),
      push: Boolean(config.push.enabled && config.push.publicKey && config.push.privateKey)
    }
  };
}
