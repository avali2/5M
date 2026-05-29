export type SignalStatus =
  | "READY"
  | "AGGRESSIVE"
  | "0DTE_SCALP"
  | "WATCH"
  | "AVOID"
  | "NO_DATA"
  | "LOCKED_BY_RISK";

export type SignalBias = "bullish" | "bearish" | "neutral" | "volatility";

export type StrategyType =
  | "BULL_CALL_DEBIT_SPREAD"
  | "BEAR_PUT_DEBIT_SPREAD"
  | "BULL_PUT_CREDIT_SPREAD"
  | "BEAR_CALL_CREDIT_SPREAD"
  | "IRON_CONDOR"
  | "IRON_FLY"
  | "LONG_CALL_SCALP"
  | "LONG_PUT_SCALP"
  | "CALENDAR"
  | "DIAGONAL"
  | "PMCC"
  | "COVERED_CALL"
  | "CASH_SECURED_PUT";

export interface OptionLeg {
  side: "BUY" | "SELL";
  optionType: "CALL" | "PUT";
  strike: number;
  expiration: string;
  qty: number;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  volume: number | null;
  openInterest: number | null;
}

export interface GammaRisk {
  level: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  reason: string;
  stopRequired: boolean;
  maxHoldMinutes: number | null;
  avoidAfterTime: string | null;
}

export interface ExecutionPlan {
  entryTrigger: string;
  entryType:
    | "LIMIT_ONLY"
    | "MARKETABLE_LIMIT"
    | "WAIT_BREAKOUT"
    | "WAIT_PULLBACK"
    | "AVOID_MARKET_ORDER";
  limitPrice: number | null;
  stopLoss: string;
  takeProfit: string;
  timeStop: string;
  invalidationLevel: number | null;
  maxHoldMinutes: number | null;
}

export interface GeminiCoach {
  decision:
    | "takeable"
    | "aggressive_takeable"
    | "scalp_only"
    | "watch"
    | "avoid";
  confidence: number;
  summary: string;
  traderAction:
    | "COPY_TICKET"
    | "WAIT_CONFIRMATION"
    | "WATCH"
    | "AVOID"
    | "ASK_GEMINI";
  whyMoneyCanBeMadeHere: string;
  mainRisk: string;
  doNotEnterIf: string;
  bestEntryCondition: string;
  exitPlan: string;
  emotionalWarning: string;
  checklist: string[];
}

export interface SourceQuality {
  marketDataSource: "tradier" | "fallback" | "mock";
  optionDataSource: "tradier" | "fallback" | "mock" | "unavailable";
  latency: "realtime" | "realtime_proxy" | "delayed" | "mock";
  greeksFreshness: "live" | "stale" | "missing";
  warnings: string[];
}

export interface ProfessionalSignal {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  symbol: string;
  underlyingPrice: number | null;
  status: SignalStatus;
  strategy: StrategyType;
  strategyLabel: string;
  bias: SignalBias;
  expiration: string;
  dte: number;
  score: number;
  pop: number | null;
  credit: number | null;
  debit: number | null;
  maxRiskUsd: number | null;
  maxProfitUsd: number | null;
  breakevens: number[];
  rewardRisk: number | null;
  collateralRequired: number | null;
  gammaRisk: GammaRisk | null;
  executionPlan: ExecutionPlan;
  legs: OptionLeg[];
  sourceQuality: SourceQuality;
  technicalSummary: string;
  macroSummary: string;
  newsSummary: string;
  ticketText: string;
  geminiCoach: GeminiCoach | null;
  blockedReason: string | null;
}
