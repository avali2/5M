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
  .split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
const asOrigins = (...values) => [...new Set(values.flatMap((value) => String(value || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean).map((origin) => {
    const parsed = new URL(origin);
    if (parsed.origin !== origin.replace(/\/$/, '')) throw new Error(`Expected an origin without a path: ${origin}`);
    return parsed.origin;
  })))];

const magnificentSeven = asList(process.env.MAGNIFICENT_7, ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA']);
const prioritySymbols = asList(process.env.PRIORITY_SYMBOLS, ['AMD', 'MSFT', 'SPY']);
const indexProxies = asList(process.env.INDEX_PROXIES, ['SPY', 'QQQ', 'IWM', 'DIA']);
const contextIndices = asList(process.env.CONTEXT_INDICES, ['SPX', 'NDX', 'RUT', 'VIX']);
const optionsLeaders = asList(process.env.OPTIONS_LEADERS, ['AMD', 'AVGO', 'PLTR', 'NFLX', 'HOOD', 'MU', 'ORCL', 'TSM', 'BABA', 'BAC', 'COIN']);
const sectorAndMacroEtfs = asList(process.env.SECTOR_MACRO_ETFS, ['SMH', 'XLK', 'XLF', 'XLE', 'TLT', 'IBIT']);
const wheelSymbols = asList(process.env.WHEEL_SYMBOLS, ['SOFI', 'MARA']);
const defaultWatchlist = [...prioritySymbols, ...indexProxies, ...wheelSymbols, ...magnificentSeven, ...optionsLeaders, ...sectorAndMacroEtfs];

const wheelProfile = {
  id: 'WHEEL',
  label: 'Rueda',
  riskLevel: 'MODERADO',
  enabled: asBool(process.env.WHEEL_ENABLED, true),
  minDte: Math.max(14, asNumber(process.env.WHEEL_MIN_DTE, 14)),
  maxDte: Math.max(21, asNumber(process.env.WHEEL_MAX_DTE, 45)),
  targetDte: Math.max(14, asNumber(process.env.WHEEL_TARGET_DTE, 30)),
  shortDeltaMin: Math.max(0.05, asNumber(process.env.WHEEL_SHORT_DELTA_MIN, 0.15)),
  shortDeltaMax: Math.min(0.35, Math.max(0.10, asNumber(process.env.WHEEL_SHORT_DELTA_MAX, 0.30))),
  minLiquidity: Math.min(100, Math.max(0, asNumber(process.env.WHEEL_MIN_LIQUIDITY, 60))),
  minScore: Math.min(100, Math.max(0, asNumber(process.env.WHEEL_MIN_SCORE, 65))),
  takeProfitPct: Math.min(0.9, Math.max(0.1, asNumber(process.env.WHEEL_TAKE_PROFIT_PCT, 0.50))),
  stopMultiple: Math.max(1.1, asNumber(process.env.WHEEL_STOP_MULTIPLE, 2)),
  timeStopDte: Math.max(1, asNumber(process.env.WHEEL_TIME_STOP_DTE, 7))
};

export const config = {
  root: ROOT,
  port: asNumber(process.env.PORT, 8787),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  clientOrigins: asOrigins(process.env.CLIENT_ORIGIN, process.env.SITE_ORIGIN),
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
    newsCacheMinutes: Math.min(5, Math.max(1, asNumber(process.env.NEWS_CACHE_MINUTES, 5))),
    minGroundingSources: Math.max(3, asNumber(process.env.NEWS_MIN_SOURCES, 3)),
    maxClearRiskScore: Math.min(100, Math.max(0, asNumber(process.env.NEWS_MAX_CLEAR_RISK, 35)))
  },
  watchlist: {
    magnificentSeven,
    priority: prioritySymbols,
    indexProxies,
    contextIndices,
    optionsLeaders,
    sectorAndMacroEtfs,
    wheelSymbols,
    core: asList(process.env.WATCHLIST_CORE, defaultWatchlist),
    maxSymbolsPerScan: Math.max(6, asNumber(process.env.MAX_SYMBOLS_PER_SCAN, 12)),
    rotationEnabled: asBool(process.env.WATCHLIST_ROTATION_ENABLED, true)
  },
  policy: {
    minDte: wheelProfile.minDte,
    maxDte: wheelProfile.maxDte,
    minScore: wheelProfile.minScore,
    minLiquidity: wheelProfile.minLiquidity,
    minOptionVolume: Math.max(1, asNumber(process.env.MIN_OPTION_VOLUME, 10)),
    minOpenInterest: Math.max(1, asNumber(process.env.MIN_OPEN_INTEREST, 100)),
    maxOptionSpreadPct: Math.min(0.5, Math.max(0.05, asNumber(process.env.MAX_OPTION_SPREAD_PCT, 0.25))),
    minCredit: Math.max(0.01, asNumber(process.env.MIN_CREDIT, 0.10)),
    maxDailySignals: Math.max(1, asNumber(process.env.MAX_DAILY_SIGNALS, 3)),
    block0Dte: true,
    minTimeframes: Math.min(5, Math.max(3, asNumber(process.env.MIN_TIMEFRAMES, 3))),
    maxDataAgeMinutes: Math.min(10, Math.max(1, asNumber(process.env.MAX_DATA_AGE_MINUTES, 5))),
    portfolioFreshHours: Math.min(48, Math.max(1, asNumber(process.env.PORTFOLIO_FRESH_HOURS, 24))),
    institutionalFlow: {
      enabled: asBool(process.env.INSTITUTIONAL_FLOW_ENABLED, true),
      minimumConfidence: Math.min(95, Math.max(30, asNumber(process.env.INSTITUTIONAL_FLOW_MIN_CONFIDENCE, 55))),
      minimumUnusualVolume: Math.max(1, asNumber(process.env.INSTITUTIONAL_FLOW_MIN_VOLUME, 100)),
      minimumVolumeOiRatio: Math.max(0.05, asNumber(process.env.INSTITUTIONAL_FLOW_MIN_VOLUME_OI, 0.5))
    },
    profiles: { wheel: wheelProfile }
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
      tradierMode: config.tradier.sandbox ? 'sandbox'
        : config.tradier.realtimeEntitled ? 'real-time-configured-unverified'
          : 'entitlement-unconfirmed',
      gemini: Boolean(config.gemini.apiKey),
      groundedNews: Boolean(config.gemini.apiKey),
      push: Boolean(config.push.enabled && config.push.publicKey && config.push.privateKey)
    }
  };
}
