import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGuardianLearning } from '../src/features/options-guardian-agent/agentLearning.js';

test('learning coach identifies FOMO, liquidity and gamma practice needs without AI', () => {
  const profile = analyzeGuardianLearning({
    journal: [
      { outcome: 'PAPER TRADE', pnl: -25, mentalState: 'FOMO', error: 'Entro con bid/ask ancho en 0DTE y no respeto stop.' },
      { outcome: 'PAPER TRADE', pnl: -18, mentalState: 'REVENGE', error: 'Slippage y gamma 0DTE.' }
    ],
    events: [{ type: 'LIQUIDITY_WARNING', message: 'Bid/ask amplio' }, { type: 'GAMMA_RISK', message: 'Gamma 0DTE' }]
  });
  assert.ok(profile.weakConcepts.includes('liquidez y slippage'));
  assert.ok(profile.weakConcepts.includes('riesgo gamma en 0DTE/1DTE'));
  assert.ok(profile.fomoRiskScore > 0);
  assert.ok(profile.revengeRiskScore > 0);
  assert.ok(profile.disciplineScore < 80);
  assert.match(profile.coach.practice, /paper/i);
});

test('ignored conditional alerts suggest reducing notification fatigue', () => {
  const profile = analyzeGuardianLearning({
    feedback: Array.from({ length: 3 }, () => ({ action: 'ignored', eventType: 'SIGNAL_CONDITIONAL' }))
  });
  assert.match(profile.coach.notificationAdjustment, /elevar minScoreToNotify/);
});
