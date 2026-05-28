import { OPTION_FORMULAS } from '../data/formulas.js';

export function createLineage({
  label,
  value,
  source = 'Motor deterministico',
  endpoint = 'No aplica',
  formula = 'No aplica',
  timestamp = new Date().toISOString(),
  confidence = 'medium',
  staleStatus = 'unknown',
  fallbackUsed = false,
  explanation = ''
}) {
  return { label, value, source, endpoint, formula, timestamp, confidence, staleStatus, fallbackUsed, explanation };
}

export function formulaLineage(formulaKey, value, overrides = {}) {
  const formula = OPTION_FORMULAS[formulaKey] || {};
  return createLineage({
    label: formula.label || formulaKey,
    value,
    formula: formula.formula || 'No disponible',
    explanation: formula.explanation || 'Formula no documentada.',
    ...overrides
  });
}

export function signalLineage(ticket = {}) {
  return [
    createLineage({
      label: 'Signal status',
      value: ticket.classification || ticket.status || 'No disponible',
      source: 'signalEngine / Options Guardian',
      formula: 'Reglas deterministicas: score + POP + EV + riesgo + data quality',
      timestamp: ticket.timestamp || new Date().toISOString(),
      confidence: ticket.confidence || 'medium',
      explanation: 'La IA no genera la senal; solo puede explicar el ticket bajo demanda.'
    }),
    formulaLineage('popDeltaApproximation', ticket.pop ?? ticket.popEstimated ?? 'No disponible', {
      source: ticket.probabilitySource || 'probabilityEngine',
      timestamp: ticket.timestamp || new Date().toISOString(),
      confidence: ticket.confidence || 'medium'
    }),
    formulaLineage('evManagedExit', ticket.ev ?? 'No disponible', {
      source: 'probabilityEngine / riskEngine',
      timestamp: ticket.timestamp || new Date().toISOString(),
      confidence: Number.isFinite(Number(ticket.ev)) ? 'medium' : 'low',
      fallbackUsed: !Number.isFinite(Number(ticket.ev))
    })
  ];
}
