export const APP_CONFIG = {
  appName: "VALIDO 1M",
  defaultMode: "AGGRESSIVE_OPPORTUNITIES",
  universe: [
    "SPY",
    "QQQ",
    "IWM",
    "DIA",
    "SPX",
    "XSP",
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "META",
    "GOOGL",
    "TSLA",
    "AMD",
    "SOFI",
    "TLT",
    "GLD"
  ],
  homeLimits: {
    actionable: 3,
    watch: 5,
    avoid: 5
  },
  risk: {
    maxRisk0DtePct: 0.005,
    maxRiskAggressivePct: 0.01,
    maxRiskBalancedPct: 0.02,
    maxDailyLossPct: 0.03,
    max0DteTradesPerDay: 3
  },
  signalThresholds: {
    readyScore: 75,
    aggressiveScore: 65,
    scalpScore: 62,
    watchScore: 55,
    minPopCredit0Dte: 0.58,
    minPopCreditNormal: 0.67,
    minCredit: 0.25,
    maxBidAskSpreadPct: 0.22,
    minOpenInterest: 50,
    minVolume: 10
  },
  notifications: {
    enabledStatuses: ["READY", "AGGRESSIVE", "0DTE_SCALP", "MACRO_RISK", "EXIT_ALERT"],
    cooldownMinutesBySymbol: 20,
    maxAlertsPerDay: 8
  }
} as const;
