export const REAL_SIGNAL_ALLOWED = new Set([
  "BULL_PUT_CREDIT_SPREAD",
  "BEAR_CALL_CREDIT_SPREAD",
  "IRON_CONDOR",
  "IRON_BUTTERFLY",
  "BROKEN_WING_CONDOR",
  "BROKEN_WING_BUTTERFLY",
  "CASH_SECURED_PUT",
  "COVERED_CALL",
  "WHEEL",
  "COLLAR",
  "PROTECTIVE_PUT",
  "BULL_CALL_DEBIT_SPREAD",
  "BEAR_PUT_DEBIT_SPREAD"
]);

export const WATCHLIST_ONLY = new Set([
  "LONG_CALL",
  "LONG_PUT",
  "LONG_STRADDLE",
  "LONG_STRANGLE",
  "REVERSE_IRON_CONDOR",
  "REVERSE_IRON_BUTTERFLY",
  "PMCC",
  "CALENDAR_SPREAD",
  "DIAGONAL_SPREAD"
]);

export const BLOCKED_OR_PAPER_ONLY = new Set([
  "SHORT_CALL",
  "SHORT_PUT",
  "SHORT_STRADDLE",
  "SHORT_STRANGLE",
  "NAKED_CALL",
  "NAKED_PUT",
  "COVERED_PUT",
  "RATIO_SPREAD_UNPROTECTED"
]);

export function enforceStrategyPermission(ticket) {
  const strategy = ticket?.strategy;

  if (!strategy) {
    return {
      ...ticket,
      classification: "NO_TRADE",
      blockedReasons: [...(ticket?.blockedReasons || []), "Estrategia no identificada."]
    };
  }

  if (REAL_SIGNAL_ALLOWED.has(strategy)) {
    return ticket;
  }

  if (WATCHLIST_ONLY.has(strategy)) {
    return {
      ...ticket,
      classification: ticket.classification === "ENTRAR_AHORA"
        ? "ESPERAR_CONFIRMACION"
        : ticket.classification || "WATCHLIST",
      warnings: [
        ...(ticket.warnings || []),
        "Estrategia permitida solo con confirmación adicional; no es núcleo de crédito."
      ]
    };
  }

  if (BLOCKED_OR_PAPER_ONLY.has(strategy)) {
    return {
      ...ticket,
      classification: "EDUCATIONAL_ONLY",
      realSignalAllowed: false,
      blockedReasons: [
        ...(ticket.blockedReasons || []),
        "Estrategia bloqueada para señales reales por riesgo indefinido, short stock o complejidad excesiva."
      ]
    };
  }

  return {
    ...ticket,
    classification: "WATCHLIST",
    warnings: [
      ...(ticket.warnings || []),
      "Estrategia no clasificada. Requiere revisión manual."
    ]
  };
}