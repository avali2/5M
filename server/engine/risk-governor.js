export function evaluateRiskGovernor({ setup, profile, globalBlocks = [], dataHealthy = true }) {
  const blocks = [...(setup.blocks || [])];
  const warnings = [];

  // === REGLAS DE SEGURIDAD ESTRICTAS ===

  // 1. Data Health
  if (!dataHealthy) blocks.push('Data Health incompleto: no se autoriza operacion real.');
  if (globalBlocks.length) blocks.push(...globalBlocks.map((reason) => `Contexto bloqueante: ${reason}`));

  // 2. Colateral
  if (profile.collateralUsedPct > 60 && profile.collateralUsedPct < 80) warnings.push('Colateral utilizado sobre 60%; reducir exposicion.');
  if (profile.collateralUsedPct >= 80) blocks.push('Colateral utilizado sobre 80%; solo paper trade.');

  // 3. Pérdidas consecutivas
  if ((profile.consecutiveDailyLosses || 0) >= 2) blocks.push('Cooling-off: dos perdidas consecutivas registradas hoy.');
  if (profile.dailyLossPct >= profile.maxDailyLossPct) blocks.push('Perdida diaria maxima alcanzada.');
  if (profile.weeklyLossPct >= profile.maxWeeklyLossPct) blocks.push('Perdida semanal maxima alcanzada.');

  // 4. Reglas por DTE
  if (setup.dte === 0 && !profile.allow0Dte) blocks.push('0DTE requiere permiso y confirmacion tecnica.');
  if (setup.dte === 1 && !profile.allow1DteApproval) blocks.push('1DTE requiere aprobacion expresa en el mandato.');

  // 5. Sin margen para naked
  const cashAvailable = Number(profile.cashAvailable ?? profile.accountSize);
  if (/Cash Secured Put/i.test(setup.strategy) && !profile.allowMargin && setup.collateralRequired > cashAvailable) {
    blocks.push('CSP excede cash disponible sin margen permitido.');
  }

  // 6. Riesgo máximo definido
  if (!Number.isFinite(setup.maxRisk) || setup.maxRisk <= 0) {
    blocks.push('Riesgo maximo no definido o invalido.');
  }

  // 7. Plan de salida
  const hasTakeProfit = String(setup.takeProfit || '').length > 3;
  const hasStopLoss = String(setup.stopLoss || '').length > 3;
  if (!hasTakeProfit) blocks.push('No hay plan de take profit definido.');
  if (!hasStopLoss) blocks.push('No hay plan de stop loss definido.');

  // 8. Strikes definidos
  if (!setup.strikes || String(setup.strikes).length < 2) {
    blocks.push('Strikes no definidos o invalidos.');
  }

  // 9. Naked options check
  const strategy = String(setup.strategy || '');
  const isNakedCall = /Call/i.test(strategy) && (!setup.legs || setup.legs.length < 2) && !/Covered Call/i.test(strategy);
  const isNakedPut = /Put/i.test(strategy) && (!setup.legs || setup.legs.length < 2) && !/Cash Secured/i.test(strategy);
  if (isNakedCall) blocks.push('Naked call no permitida. Riesgo indefinido.');
  if (isNakedPut) blocks.push('Naked put requiere cash secured. Riesgo indefinido sin colateral.');

  // 10. Máximo de operaciones abiertas
  if ((profile.activeSymbols?.length || 0) >= profile.maxOpenTrades) {
    blocks.push('Numero maximo de operaciones abiertas alcanzado.');
  }

  const score = setup.tradeQualityScore ?? setup.confidenceScore ?? setup.score ?? 0;
  const uniqueBlocks = [...new Set(blocks)];

  // Clasificación final
  const classification = uniqueBlocks.length || score < 60 ? 'Paper Trade / solo estudio'
    : score >= 75 ? 'Trade Validado'
    : score >= 65 ? 'Trade Condicional'
    : 'Agresivo / tamano reducido';

  return {
    allowedReal: classification === 'Trade Validado' && !uniqueBlocks.length && !globalBlocks.length,
    classification,
    blocks: uniqueBlocks,
    warnings,
    reviewedAt: new Date().toISOString(),
    summary: uniqueBlocks.length
      ? uniqueBlocks.slice(0, 3).join('; ')
      : classification === 'Trade Validado'
        ? 'Riesgo definido, plan de salida y reglas de mandato cumplidas.'
        : 'Clasificado como ' + classification + '. Requiere revision manual.'
  };
}
