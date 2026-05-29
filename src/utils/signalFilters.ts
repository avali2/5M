import type { ProfessionalSignal } from "../types/signal";
import { APP_CONFIG } from "../config/appConfig";

export function isActionableSignal(signal: ProfessionalSignal): boolean {
  return (
    signal.status === "READY" ||
    signal.status === "AGGRESSIVE" ||
    signal.status === "0DTE_SCALP"
  );
}

export function shouldNotifySignal(signal: ProfessionalSignal): boolean {
  if (!isActionableSignal(signal)) return false;
  if (!signal.ticketText) return false;
  if (signal.sourceQuality.latency === "mock") return false;
  if (signal.sourceQuality.optionDataSource === "mock") return false;
  if (signal.status === "0DTE_SCALP" && !signal.executionPlan.stopLoss) return false;
  if (signal.expiresAt && new Date(signal.expiresAt).getTime() < Date.now()) return false;
  return true;
}

export function sortSignalsForHome(signals: ProfessionalSignal[]): ProfessionalSignal[] {
  const priority: Record<ProfessionalSignal["status"], number> = {
    "0DTE_SCALP": 1,
    READY: 2,
    AGGRESSIVE: 3,
    WATCH: 4,
    AVOID: 5,
    NO_DATA: 6,
    LOCKED_BY_RISK: 7
  };

  return [...signals].sort((a, b) => {
    const p = priority[a.status] - priority[b.status];
    if (p !== 0) return p;
    return b.score - a.score;
  });
}

export function groupSignalsForHome(signals: ProfessionalSignal[]) {
  const sorted = sortSignalsForHome(signals);
  const actionable = sorted
    .filter(isActionableSignal)
    .slice(0, APP_CONFIG.homeLimits.actionable);
  const watch = sorted
    .filter((signal) => signal.status === "WATCH")
    .slice(0, APP_CONFIG.homeLimits.watch);
  const avoid = sorted
    .filter((signal) => signal.status === "AVOID" || signal.status === "NO_DATA" || signal.status === "LOCKED_BY_RISK")
    .slice(0, APP_CONFIG.homeLimits.avoid);
  return { actionable, watch, avoid };
}
