export function evaluateRiskGovernor({ setup, profile, globalBlocks = [], dataHealthy = true }) {
  const blocks = [...(setup.blocks || [])];
  const warnings = [];
  if (!dataHealthy) blocks.push('Data Health incompleto: no se autoriza operacion real.');
  if (globalBlocks.length) blocks.push(...globalBlocks.map((reason) => `Contexto bloqueante: ${reason}`));
  if (profile.collateralUsedPct > 60 && profile.collateralUsedPct < 80) warnings.push('Colateral utilizado sobre 60%; reducir exposicion.');
  if (profile.collateralUsedPct >= 80) blocks.push('Colateral utilizado sobre 80%; solo paper trade.');
  if ((profile.consecutiveDailyLosses || 0) >= 2) blocks.push('Cooling-off: dos perdidas consecutivas registradas hoy.');
  if (profile.dailyLossPct >= profile.maxDailyLossPct) blocks.push('Perdida diaria maxima alcanzada.');
  if (profile.weeklyLossPct >= profile.maxWeeklyLossPct) blocks.push('Perdida semanal maxima alcanzada.');
  if (setup.dte <= 0 && !profile.allow0Dte) blocks.push('0DTE requiere permiso y confirmacion tecnica.');
  if (/Cash Secured Put/i.test(setup.strategy) && !profile.allowMargin && setup.collateralRequired > profile.accountSize) blocks.push('CSP excede cash disponible sin margen permitido.');
  const score = setup.tradeQualityScore ?? setup.confidenceScore ?? setup.score ?? 0;
  const uniqueBlocks = [...new Set(blocks)];
  const classification = uniqueBlocks.length || score < 60 ? 'Paper Trade / solo estudio' :
    score >= 70 ? 'Trade Validado' :
      score >= 65 ? 'Trade Condicional' : 'Agresivo / tamano reducido';
  return {
    allowedReal: classification === 'Trade Validado' && !uniqueBlocks.length,
    classification,
    blocks: uniqueBlocks,
    warnings,
    reviewedAt: new Date().toISOString()
  };
}
