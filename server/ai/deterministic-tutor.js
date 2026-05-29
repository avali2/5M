const pct = (value) => (Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : 'No disponible');

export function createCompactScanPayload(scan = {}) {
  const ticket = scan.guardianEdge?.dailyBest || scan.guardianEdge?.tickets?.[0] || null;
  return {
    asOf: scan.asOf || new Date().toISOString(),
    status: scan.guardianStatus || scan.decision?.status || 'unknown',
    regime: scan.market?.regime || null,
    vix: scan.market?.vix || scan.market?.volatility?.vix || null,
    decision: scan.decision ? {
      status: scan.decision.status,
      title: scan.decision.title,
      reason: scan.decision.reason,
      softWarnings: scan.decision.softWarnings || []
    } : null,
    dailyBest: ticket ? {
      symbol: ticket.symbol,
      strategy: ticket.strategy,
      classification: ticket.classification,
      riskClass: ticket.riskClass,
      pop: ticket.popEstimated ?? ticket.pop,
      ev: ticket.evEstimated ?? ticket.ev,
      entryLimit: ticket.entryLimit,
      maxRisk: ticket.maxRisk,
      maxProfit: ticket.maxProfit,
      expiration: ticket.expiration,
      legs: ticket.legs,
      invalidation: ticket.invalidation,
      tapeProxy: ticket.tapeProxy,
      minProfitDollars: ticket.minProfitDollars
    } : null,
    opportunities: (scan.opportunities || []).slice(0, 5).map((item) => ({
      symbol: item.symbol,
      strategy: item.strategy,
      score: item.score,
      pop: item.pop,
      classification: item.classification,
      maxRisk: item.maxRisk,
      blocks: item.blocks || []
    })),
    riskOverlays: scan.decision?.riskOverlays || scan.market?.riskOverlays || [],
    dataHealth: {
      mode: scan.marketDataMode,
      source: scan.dataHealth?.source || null,
      errors: (scan.dataHealth?.errors || []).slice(0, 5),
      missing: (scan.dataHealth?.missingConfig || []).slice(0, 5)
    }
  };
}

export function deterministicTutorFallback(scan = {}, reason = '') {
  const payload = createCompactScanPayload(scan);
  const best = payload.dailyBest;
  const status = payload.status;
  const lead = best
    ? `${best.symbol}: ${best.classification || status} en ${best.strategy}. POP estimada ${pct(best.pop)}; riesgo ${best.riskClass || 'por revisar'}.`
    : `Estado del motor: ${status}. No hay ticket listo con datos completos en este momento.`;
  const dataLine = payload.dataHealth.errors?.length
    ? `Datos a revisar: ${payload.dataHealth.errors.join('; ')}.`
    : `Fuente de datos: ${payload.dataHealth.source || payload.dataHealth.mode || 'No disponible'}.`;
  const action = best
    ? 'Antes de entrar: revisa bid/ask, OI, volumen, max risk, invalidacion tecnica y que el precio limite siga disponible en Robinhood.'
    : 'Usa esto como modo estudio: espera chain valida, precio fresco y riesgo maximo calculado antes de considerar dinero real.';
  const fallbackReason = reason ? ` Fallback deterministico activo: ${reason}.` : '';
  return `${lead} ${dataLine} ${action}${fallbackReason}`;
}

export function buildAiTutorPrompt() {
  return [
    'Eres el tutor de VALIDO 1M OS para opciones.',
    'Explica en espanol claro y prudente.',
    'No calcules precios, strikes, POP, EV, Greeks ni riesgo; esos datos ya vienen del motor deterministico.',
    'No prometas ganancias ni digas que el usuario debe ejecutar.',
    'Enfocate en: que revisar, riesgo principal, invalidacion, fuente de datos, tape reading proxy si existe, y una leccion profunda pero accionable sobre venta de prima/spreads de credito.',
    'Si hay candidato de credito, explica por que el credito compensa o no compensa el riesgo y que confirmaria en Robinhood.',
    'Maximo 220 palabras.'
  ].join(' ');
}
