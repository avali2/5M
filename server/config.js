import 'dotenv/config';

const asNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const UNIVERSE = {
  indices: ['SPY', 'SPX', 'QQQ', 'IWM', 'DIA'],
  magnificent7: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA'],
  focusEquities: ['SOFI'],
  liquidEtfs: ['XLF', 'XLK', 'XLE', 'XLV', 'TLT', 'GLD'],
  breadth: ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU'],
  volatility: 'VIX'
};

export const config = {
  port: asNumber(process.env.PORT, 8787),
  host: process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173',
  security: {
    accessKey: process.env.APP_ACCESS_KEY || ''
  },
  tradier: {
    token: process.env.TRADIER_TOKEN || '',
    baseUrl: process.env.TRADIER_BASE_URL || 'https://api.tradier.com/v1'
  },
  polygon: {
    apiKey: process.env.POLYGON_API_KEY || '',
    baseUrl: 'https://api.polygon.io'
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
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || ''
  },
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
    workMode: true
  },
  refreshSeconds: asNumber(process.env.AUTO_REFRESH_SECONDS, 60)
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
      id: 'openai',
      name: 'OpenAI',
      configured: Boolean(config.openai.apiKey && config.openai.model),
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
