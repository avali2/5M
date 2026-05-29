import type { ProfessionalSignal } from "../types/signal";

export function buildSignalNotificationBody(signal: ProfessionalSignal): string {
  const popText =
    signal.pop != null ? `POP ${Math.round(signal.pop * 100)}%` : "Momentum setup";
  const priceText =
    signal.credit != null
      ? `Credit $${signal.credit.toFixed(2)}`
      : signal.debit != null
        ? `Debit $${signal.debit.toFixed(2)}`
        : "Limit order";
  const riskText =
    signal.maxRiskUsd != null ? `Risk $${Math.round(signal.maxRiskUsd)}` : "Risk defined";
  const gammaText =
    signal.dte === 0 && signal.gammaRisk
      ? `Gamma ${signal.gammaRisk.level}`
      : `${signal.dte}DTE`;
  return `${popText} | ${priceText} | ${riskText} | ${gammaText}`;
}

export function buildNotificationTitle(signal: ProfessionalSignal): string {
  if (signal.status === "0DTE_SCALP") return `SCALP: ${signal.symbol} ${signal.strategyLabel}`;
  if (signal.status === "AGGRESSIVE") return `AGGRESSIVE: ${signal.symbol} ${signal.strategyLabel}`;
  return `READY: ${signal.symbol} ${signal.strategyLabel}`;
}
