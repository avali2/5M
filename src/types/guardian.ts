export type SignalRating = "A+" | "A" | "B+" | "B" | "WATCH_ONLY" | "NO_TRADE";

export type StrategyType =
  | "BULL_PUT_SPREAD"
  | "BEAR_CALL_SPREAD"
  | "CALL_DEBIT_SPREAD"
  | "PUT_DEBIT_SPREAD"
  | "IRON_CONDOR"
  | "IRON_BUTTERFLY"
  | "CALENDAR"
  | "DIAGONAL"
  | "BROKEN_WING_BUTTERFLY"
  | "CASH_SECURED_PUT"
  | "COVERED_CALL"
  | "PMCC";

export type EventImpactStars = 1 | 2 | 3 | 4 | 5;

export interface AccountRiskConfig {
  accountValue: number;
  defaultRiskPct: number;
  maxRiskPct: number;
  collateralCapPct: number;
  maxOpenTrades: number;
  pdtProtected: boolean;
  maxDayTradesRolling5Days: number;
}

export interface MarketPulse {
  spyTrend: "BULL_TREND" | "BEAR_TREND" | "RANGE" | "NO_DATA";
  qqqTrend: "BULL_TREND" | "BEAR_TREND" | "RANGE" | "NO_DATA";
  vix: number | null;
  vixRegime: "LOW" | "NORMAL" | "HIGH" | "PANIC" | "NO_DATA";
  macroStatus: "CLEAR" | "CAUTION" | "DANGER";
  newsStatus: "CLEAR" | "CAUTION" | "DANGER";
  tapeReading: TapeReadingState;
  bestModeNow: "BUSCAR_ENTRADAS" | "GESTIONAR_SALIDAS" | "ESPERAR" | "NO_TRADE";
}

export interface TapeReadingState {
  institutionalFlow: "BUYING" | "SELLING" | "MIXED" | "NO_DATA";
  arrow: "⬆️" | "⬇️" | "↔️" | "❔";
  label: string;
  explanation: string;
  confidence: number;
  signals: string[];
}

export interface ClassifiedNewsEvent {
  id: string;
  symbol?: string;
  title: string;
  source?: string;
  url?: string;
  publishedAt?: string;
  eventDate?: string;
  category:
    | "EARNINGS"
    | "FED"
    | "CPI"
    | "PCE"
    | "NFP"
    | "GDP"
    | "WAR"
    | "GEOPOLITICAL"
    | "BANKING"
    | "RATES"
    | "OIL"
    | "AI_SEMICONDUCTORS"
    | "ANTITRUST"
    | "COMPANY_NEWS"
    | "MARKET_STRUCTURE"
    | "OTHER";
  stars: EventImpactStars;
  color: "GREEN" | "YELLOW" | "ORANGE" | "RED";
  action:
    | "IGNORE"
    | "WATCH"
    | "REDUCE_SIZE"
    | "BLOCK_NEW_TRADES"
    | "BLOCK_SYMBOL"
    | "BLOCK_MARKET";
  whyItMatters: string;
}

export interface OptionSignal {
  id: string;
  createdAt: string;
  symbol: string;
  underlyingPrice: number;
  strategyType: StrategyType;
  expiration: string;
  dte: number;
  legs: Array<{
    action: "BUY" | "SELL";
    type: "CALL" | "PUT";
    strike: number;
    bid?: number;
    ask?: number;
    mid?: number;
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    iv?: number;
    volume?: number;
    openInterest?: number;
  }>;
  thesis: string;
  entry: {
    idealEntry: string;
    limitPrice: number | null;
    timingScore: number;
    decision: "ENTER_NOW" | "WAIT_CONFIRMATION" | "WATCH_ONLY" | "NO_CHASE" | "BLOCKED";
  };
  risk: {
    maxRisk: number;
    maxProfit: number | null;
    riskReward: number | null;
    accountRiskPct: number;
    collateralRequired: number;
    popEstimate: number | null;
  };
  greeks: {
    netDelta: number | null;
    netTheta: number | null;
    netVega: number | null;
    netGamma: number | null;
  };
  management: {
    takeProfit: string;
    stopLoss: string;
    timeStop: string;
    rollPlan: string;
    invalidation: string;
  };
  rating: SignalRating;
  geminiApproved: boolean;
  geminiSummary: string;
  education: string;
  blockedReason?: string;
}