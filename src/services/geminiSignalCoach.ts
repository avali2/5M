import type { ProfessionalSignal, GeminiCoach } from "../types/signal";

export const GEMINI_SIGNAL_COACH_SYSTEM_PROMPT = `
Eres Gemini Options Companion, un companero profesional para revisar senales de opciones.

Tu objetivo no es vender trades. Tu objetivo es ayudar al trader a pensar mejor.

Reglas absolutas:
1. No inventes precios.
2. No inventes noticias.
3. No inventes Greeks.
4. No inventes earnings.
5. No prometas ganancias.
6. No digas "seguro".
7. No ejecutes ordenes.
8. Si falta riesgo maximo, rechaza.
9. Si falta bid/ask, rechaza.
10. Si es 0DTE sin stop, rechaza.
11. Si hay riesgo agresivo pero definido, clasificalo como scalp_only o aggressive_takeable.
12. Habla claro, directo y en espanol.

Devuelve solo JSON valido.
`;

export function buildGeminiSignalCoachPrompt(signal: ProfessionalSignal): string {
  const compactSignal = {
    symbol: signal.symbol,
    status: signal.status,
    strategy: signal.strategy,
    strategyLabel: signal.strategyLabel,
    bias: signal.bias,
    dte: signal.dte,
    expiration: signal.expiration,
    underlyingPrice: signal.underlyingPrice,
    score: signal.score,
    pop: signal.pop,
    credit: signal.credit,
    debit: signal.debit,
    maxRiskUsd: signal.maxRiskUsd,
    maxProfitUsd: signal.maxProfitUsd,
    breakevens: signal.breakevens,
    gammaRisk: signal.gammaRisk,
    executionPlan: signal.executionPlan,
    technicalSummary: signal.technicalSummary,
    macroSummary: signal.macroSummary,
    newsSummary: signal.newsSummary,
    sourceQuality: signal.sourceQuality,
    legs: signal.legs.map((leg) => ({
      side: leg.side,
      optionType: leg.optionType,
      strike: leg.strike,
      expiration: leg.expiration,
      bid: leg.bid,
      ask: leg.ask,
      mid: leg.mid,
      delta: leg.delta,
      gamma: leg.gamma,
      theta: leg.theta,
      vega: leg.vega,
      iv: leg.iv,
      volume: leg.volume,
      openInterest: leg.openInterest
    })),
    ticketText: signal.ticketText
  };

  return `
Audita esta senal como companero profesional.

Senal:
${JSON.stringify(compactSignal, null, 2)}

Responde solo JSON valido con decision, confidence, summary, traderAction, whyMoneyCanBeMadeHere, mainRisk, doNotEnterIf, bestEntryCondition, exitPlan, emotionalWarning y checklist.
`;
}

export function validateGeminiCoach(raw: unknown): GeminiCoach | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<GeminiCoach>;
  const validDecision =
    value.decision === "takeable" ||
    value.decision === "aggressive_takeable" ||
    value.decision === "scalp_only" ||
    value.decision === "watch" ||
    value.decision === "avoid";
  const validAction =
    value.traderAction === "COPY_TICKET" ||
    value.traderAction === "WAIT_CONFIRMATION" ||
    value.traderAction === "WATCH" ||
    value.traderAction === "AVOID" ||
    value.traderAction === "ASK_GEMINI";

  if (!validDecision) return null;
  if (!validAction) return null;
  if (typeof value.confidence !== "number") return null;
  if (typeof value.summary !== "string") return null;
  if (typeof value.mainRisk !== "string") return null;
  if (!Array.isArray(value.checklist)) return null;
  return value as GeminiCoach;
}
