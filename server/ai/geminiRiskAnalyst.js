export function deterministicGeminiRiskAnalyst(positionRisk) {
  return {
    provider: 'deterministic',
    aiStatus: 'FALLBACK',
    summary: positionRisk?.reason || 'Risk review available from deterministic engine.',
    actionPlan: positionRisk?.plan || null,
    note: 'Gemini Risk Analyst is read-only. No orders are sent.'
  };
}
