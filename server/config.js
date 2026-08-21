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

const magnificientSeven = asList(process.env.MAGNIFICENT_7, ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA']);
const defaultWatchlist = [...magnificientSeven, 'SPY', 'QQQ', 'IWM', 'DIA'];

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
    baseUrl: (process.env.TRADIER_BASE_URL || 'https://api.tradier.com/v1').replace(/\/$/, ''),
    sandbox: asBool(process.env.TRADIER_SANDBOX, false)
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    required: asBool(process.env.GEMINI_REQUIRED, true)
  },
  watchlist: {
    magnificentSeven: magnificientSeven,
    core: asList(process.env.WATCHLIST_CORE, defaultWatchlist),
    maxSymbolsPerScan: asNumber(process.env.MAX_SYMBOLS_PER_SCAN, 11)
  },
  policy: {
    minDte: Math.max(1, asNumber(process.env.MIN_DTE, 21)),
    maxDte: Math.max(2, asNumber(process.env.MAX_DTE, 45)),
    accountSize: Math.max(0, asNumber(process.env.ACCOUNT_SIZE, 2000)),
    riskPerTradePct: Math.max(0.1, asNumber(process.env.RISK_PER_TRADE_PCT, 1)),
    maxContracts: Math.max(1, asNumber(process.env.MAX_CONTRACTS, 3)),
    minPop: Math.min(0.95, Math.max(0.5, asNumber(process.env.MIN_POP, 0.6))),
    minScore: Math.min(100, Math.max(0, asNumber(process.env.MIN_SCORE, 70))),
    minCredit: Math.max(0.01, asNumber(process.env.MIN_CREDIT, 0.1)),
    maxDailySignals: Math.max(1, asNumber(process.env.MAX_DAILY_SIGNALS, 3)),
    block0Dte: asBool(process.env.BLOCK_0DTE, true),
    blockEarningsUnknown: asBool(process.env.BLOCK_EARNINGS_UNKNOWN, false)
  },
  scanner: {
    intervalMinutes: Math.max(1, asNumber(process.env.SCAN_INTERVAL_MINUTES, 5)),
    marketOpenOnly: asBool(process.env.MARKET_OPEN_ONLY, true),
    enabled: asBool(process.env.SCANNER_ENABLED, true)
  },
  push: {
    enabled: asBool(process.env.PUSH_ENABLED, true),
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:you@example.com'
  },
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || './data')
};

export function publicConfig() {
  return {
    appName: '5 MILLIONS',
    watchlist: config.watchlist,
    policy: config.policy,
    scanner: config.scanner,
    security: { requiresKey: config.security.requireAccessKey },
    integrations: {
      tradier: Boolean(config.tradier.token),
      tradierMode: config.tradier.sandbox ? 'sandbox' : 'live-read-only',
      gemini: Boolean(config.gemini.apiKey),
      push: Boolean(config.push.enabled && config.push.publicKey && config.push.privateKey)
    }
  };
}
