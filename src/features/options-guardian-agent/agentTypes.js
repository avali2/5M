export const AGENT_EVENT_TYPES = Object.freeze({
  SIGNAL_VALIDATED: 'SIGNAL_VALIDATED',
  SIGNAL_CONDITIONAL: 'SIGNAL_CONDITIONAL',
  SIGNAL_PAPER_ONLY: 'SIGNAL_PAPER_ONLY',
  EDGE_TICKET: 'EDGE_TICKET',
  RISK_BLOCKED: 'RISK_BLOCKED',
  CHAIN_WARNING: 'CHAIN_WARNING',
  LIQUIDITY_WARNING: 'LIQUIDITY_WARNING',
  GAMMA_RISK: 'GAMMA_RISK',
  NEWS_RISK: 'NEWS_RISK',
  EARNINGS_RISK: 'EARNINGS_RISK',
  MACRO_RISK: 'MACRO_RISK',
  VWAP_BREAK: 'VWAP_BREAK',
  VWAP_REJECTION: 'VWAP_REJECTION',
  MARKET_REGIME_CHANGED: 'MARKET_REGIME_CHANGED',
  PAPER_TRADE_CREATED: 'PAPER_TRADE_CREATED',
  PAPER_TRADE_TAKE_PROFIT: 'PAPER_TRADE_TAKE_PROFIT',
  PAPER_TRADE_STOP: 'PAPER_TRADE_STOP',
  PAPER_PRACTICE_SUGGESTED: 'PAPER_PRACTICE_SUGGESTED',
  LEARNING_RECOMMENDATION: 'LEARNING_RECOMMENDATION',
  MOTIVATION_REMINDER: 'MOTIVATION_REMINDER',
  JOURNAL_REVIEW: 'JOURNAL_REVIEW',
  DATA_HEALTH_ERROR: 'DATA_HEALTH_ERROR',
  NOTIFICATION_ERROR: 'NOTIFICATION_ERROR',
  WATCHLIST_MOVED: 'WATCHLIST_MOVED',
  VOLATILITY_REGIME_CHANGED: 'VOLATILITY_REGIME_CHANGED',
  GEX_LEVEL_APPROACHED: 'GEX_LEVEL_APPROACHED',
  NO_TRADE_PROFESSIONAL: 'NO_TRADE_PROFESSIONAL',
  DAILY_SUMMARY: 'DAILY_SUMMARY',
  WEEKLY_REVIEW: 'WEEKLY_REVIEW'
});

export const AGENT_SEVERITIES = Object.freeze({
  INFO: 'info',
  EDUCATIONAL: 'educational',
  OPPORTUNITY: 'opportunity',
  WARNING: 'warning',
  CRITICAL: 'critical'
});

export const AGENT_CHANNELS = Object.freeze({
  IN_APP: 'inApp',
  PWA_NOTIFICATION: 'pwaNotification',
  WEB_PUSH: 'webPush',
  EMAIL_SUMMARY: 'emailSummary',
  DATABASE_ONLY: 'databaseOnly'
});

export const AGENT_ACTIONS = Object.freeze({
  OPEN_SIGNAL: 'OPEN_SIGNAL',
  OPEN_SIMULATOR: 'OPEN_SIMULATOR',
  CREATE_PAPER_TRADE: 'CREATE_PAPER_TRADE',
  OPEN_CHAIN_CHECKLIST: 'OPEN_CHAIN_CHECKLIST',
  OPEN_JOURNAL: 'OPEN_JOURNAL',
  OPEN_TRADING_PLAN: 'OPEN_TRADING_PLAN',
  OPEN_NEWS: 'OPEN_NEWS',
  OPEN_DATA_HEALTH: 'OPEN_DATA_HEALTH',
  OPEN_TRADE_TICKET: 'OPEN_TRADE_TICKET',
  MARK_TAKEN: 'MARK_TAKEN',
  MARK_IGNORED: 'MARK_IGNORED',
  MARK_INVALID: 'MARK_INVALID',
  MARK_REVIEWED: 'MARK_REVIEWED',
  SILENCE_SYMBOL: 'SILENCE_SYMBOL',
  EXPLAIN_WITH_AI_MANUAL: 'EXPLAIN_WITH_AI_MANUAL'
});

export const DEFAULT_GUARDIAN_SETTINGS = Object.freeze({
  enabled: true,
  workMode: {
    enabled: true,
    startTime: '05:30',
    endTime: '16:00',
    timezone: 'America/New_York',
    maxAlertsPerHour: 3,
    minScoreToNotify: 70,
    onlyCritical: false,
    includeConditional: true,
    includePaperPractice: true,
    silenceDuringHighImpactMacro: true,
    allowMotivation: true
  },
  edgeMode: {
    riskProfile: 'moderate_aggressive',
    minPopToNotify: 70,
    minScoreReady: 70,
    minScoreAggressive: 65,
    minScoreCandidate: 60,
    allowCapitalHeavyAlerts: true,
    allowVeryAggressive: false,
    allow0DTE: false,
    maxAlertsPerHour: 3,
    cooldownSymbolMinutes: 20,
    duplicateCooldownMinutes: 45
  },
  scanCadence: {
    marketClosedMinutes: 0,
    learningMinutesWhenClosed: 90,
    premarketMinutes: 45,
    regularMinutes: 15,
    activeCandidateMinutes: 5,
    criticalRiskMinutes: 3,
    paperTradeMonitorMinutes: 5
  },
  thresholds: {
    validatedScore: 80,
    conditionalScore: 70,
    paperScore: 60,
    maxBidAskSpreadPct: 12,
    maxBidAskSpreadDollars: 0.25,
    minOpenInterest: 100,
    minVolume: 10,
    highGammaDte: 1,
    maxRiskPctPerTrade: 2,
    maxCollateralPct: 60,
    maxDailyLossPct: 3,
    maxWeeklyLossPct: 6
  },
  cooldowns: {
    perSymbolMinutes: 20,
    perEventTypeMinutes: 15,
    duplicateMinutes: 45,
    motivationMinutes: 60,
    paperPracticeMinutes: 90
  },
  silencedUntil: null,
  mutedSymbols: [],
  updatedAt: null
});

let eventSequence = 0;

export function mergeGuardianSettings(input = {}) {
  return {
    ...DEFAULT_GUARDIAN_SETTINGS,
    ...input,
    workMode: { ...DEFAULT_GUARDIAN_SETTINGS.workMode, ...(input.workMode || {}) },
    edgeMode: { ...DEFAULT_GUARDIAN_SETTINGS.edgeMode, ...(input.edgeMode || {}) },
    scanCadence: { ...DEFAULT_GUARDIAN_SETTINGS.scanCadence, ...(input.scanCadence || {}) },
    thresholds: { ...DEFAULT_GUARDIAN_SETTINGS.thresholds, ...(input.thresholds || {}) },
    cooldowns: { ...DEFAULT_GUARDIAN_SETTINGS.cooldowns, ...(input.cooldowns || {}) },
    mutedSymbols: Array.isArray(input.mutedSymbols) ? input.mutedSymbols.map((symbol) => String(symbol).toUpperCase()) : []
  };
}

export function createGuardianEvent({
  type,
  severity = AGENT_SEVERITIES.INFO,
  symbol = null,
  title,
  message,
  recommendation,
  source = 'Options Guardian Agent Pro',
  data = {},
  actions = [AGENT_ACTIONS.MARK_REVIEWED],
  channels = [AGENT_CHANNELS.IN_APP],
  createdAt = new Date().toISOString()
}) {
  eventSequence += 1;
  return {
    id: `guardian-${type}-${symbol || 'market'}-${Date.parse(createdAt) || Date.now()}-${eventSequence}`,
    type,
    severity,
    symbol,
    title,
    message,
    recommendation,
    source,
    data,
    actions,
    channels,
    createdAt,
    status: 'new',
    notificationSent: false,
    notificationChannel: null,
    notificationError: null
  };
}
