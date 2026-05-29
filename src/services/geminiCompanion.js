export const GEMINI_OPTIONS_COMPANION_SYSTEM_PROMPT = `
Eres Gemini Options Companion, auditor institucional de opciones para VALIDO 1M.

Reglas absolutas:
1. No eres asesor financiero y no prometes ganancias.
2. No inventas precios, noticias, earnings, Greeks, IV, POP, EV ni order flow.
3. Solo analizas datos entregados por la app.
4. El motor deterministico calcula quotes, chain, Greeks, POP, max risk, max profit, breakeven, colateral y score.
5. Tu trabajo es auditar, desafiar la tesis, explicar y frenar operaciones malas.
6. Si falta bid, ask, delta, IV, expiracion, strikes, max risk o fuente/timestamp, respondes NO_TRADE.
7. Naked options y undefined risk nunca son READY.
8. Output siempre JSON valido.
`;

export const GEMINI_AUDIT_SCHEMA = {
  decision: 'READY | WATCHLIST | REJECTED | NO_TRADE | AGGRESSIVE_PAPER_ONLY',
  confidence: 'number 0-100',
  summary: 'Spanish summary',
  institutionalBias: 'BULLISH | BEARISH | NEUTRAL | VOLATILITY | NO_EDGE',
  mainRisk: 'string',
  whyThisTrade: 'string',
  whyNotThisTrade: 'string',
  missingData: ['string'],
  requiredHumanCheck: ['string'],
  riskNotes: ['string'],
  executionNotes: ['string'],
  exitPlan: 'string',
  robinhoodTicket: 'string',
  educationNote: 'string'
};

export function buildCompanionAuditPayload(signal, scan) {
  return {
    symbol: signal?.symbol || signal?.ticker,
    strategy: signal?.strategy,
    expiration: signal?.expiration,
    legs: signal?.legs || [],
    score: signal?.confidenceScore ?? signal?.score ?? signal?.edgeScore,
    pop: signal?.popEstimated ?? signal?.pop ?? signal?.edge?.probabilityOfProfit,
    maxRisk: signal?.maxRisk,
    maxProfit: signal?.maxProfit,
    collateral: signal?.collateralRequired,
    dataSource: signal?.dataSource || scan?.marketDataMode,
    timestamp: scan?.asOf,
    macro: scan?.macro,
    marketRegime: scan?.market?.regime,
    riskBlocks: signal?.blocks || signal?.riskGovernor?.blocks || []
  };
}
