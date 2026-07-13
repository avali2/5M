import type { AccountRiskConfig } from "../types/guardian";

const STORAGE_KEY = "valido1m_risk_config_v2";

export const DEFAULT_RISK_CONFIG: AccountRiskConfig = {
  accountValue: 2000,
  defaultRiskPct: 2,
  maxRiskPct: 3,
  collateralCapPct: 35,
  maxOpenTrades: 3,
  pdtProtected: true,
  maxDayTradesRolling5Days: 3
};

export function loadRiskConfig(): AccountRiskConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RISK_CONFIG;

    const parsed = JSON.parse(raw) as Partial<AccountRiskConfig>;

    return {
      ...DEFAULT_RISK_CONFIG,
      ...parsed,
      accountValue: Math.max(50, Number(parsed.accountValue ?? DEFAULT_RISK_CONFIG.accountValue)),
      defaultRiskPct: clamp(Number(parsed.defaultRiskPct ?? 2), 0.5, 5),
      maxRiskPct: clamp(Number(parsed.maxRiskPct ?? 3), 0.5, 5),
      collateralCapPct: clamp(Number(parsed.collateralCapPct ?? 35), 5, 50)
    };
  } catch {
    return DEFAULT_RISK_CONFIG;
  }
}

export function saveRiskConfig(config: AccountRiskConfig) {
  const safe: AccountRiskConfig = {
    ...config,
    accountValue: Math.max(50, config.accountValue),
    defaultRiskPct: clamp(config.defaultRiskPct, 0.5, 5),
    maxRiskPct: clamp(config.maxRiskPct, 0.5, 5),
    collateralCapPct: clamp(config.collateralCapPct, 5, 50)
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
}

export function getMaxDollarRisk(config: AccountRiskConfig, signalQuality: "NORMAL" | "A_PLUS") {
  const pct = signalQuality === "A_PLUS" ? config.maxRiskPct : config.defaultRiskPct;
  return Math.round(config.accountValue * (pct / 100));
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
