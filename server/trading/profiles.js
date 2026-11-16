import { daysLeft } from './strategy.js';

// Parámetros de ejecución, no una estimación de rentabilidad o probabilidad.
const standard = {
  id: 'standard', label: 'Estándar', minDte: 21, maxDte: 45, targetDte: 30,
  deltaMin: 0.15, deltaMax: 0.32, minimumCreditRatio: 0.17,
  intervalMs: 60000, researchMs: 180000,
  exitPolicy: Object.freeze({ takeProfitFraction: 0.5, stopMultiple: 2, timeStopDte: 7, shortStrikeExit: false })
};
const aggressive = {
  id: 'aggressive', label: 'Agresivo', minDte: 14, maxDte: 35, targetDte: 21,
  deltaMin: 0.22, deltaMax: 0.38, minimumCreditRatio: 0.20,
  intervalMs: 30000, researchMs: 90000,
  exitPolicy: Object.freeze({ takeProfitFraction: 0.5, stopMultiple: 1.8, timeStopDte: 7, shortStrikeExit: true })
};
export const PROFILES = Object.freeze({
  standard: Object.freeze(standard), aggressive: Object.freeze(aggressive)
});

export function resolveProfile(name = 'aggressive') {
  if (!Object.hasOwn(PROFILES, name)) throw new Error('BOT_PROFILE debe ser standard o aggressive.');
  return PROFILES[name];
}

export function selectExpirations(expirations, day, profile) {
  return [...new Set(expirations)].filter(item => {
    const dte = daysLeft(item, day);
    return dte >= profile.minDte && dte <= profile.maxDte;
  }).sort((a, b) => Math.abs(daysLeft(a, day) - profile.targetDte)
    - Math.abs(daysLeft(b, day) - profile.targetDte) || a.localeCompare(b)).slice(0, 3);
}
