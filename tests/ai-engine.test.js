import test from 'node:test';
import assert from 'node:assert/strict';
import { AiBudgetManager } from '../server/ai/ai-budget.js';
import { AiProviderRouter } from '../server/ai/provider-router.js';

test('AI budget blocks calls after request limit without touching scanner logic', () => {
  const budget = new AiBudgetManager({ dailyRequestBudget: 1, dailyTokenBudget: 1000, manualExplain: true });
  assert.equal(budget.canCall({ provider: 'gemini', estimatedTokens: 100 }).allowed, true);
  budget.recordUsage({ tokens: 100 });
  const next = budget.canCall({ provider: 'gemini', estimatedTokens: 100 });
  assert.equal(next.allowed, false);
  assert.match(next.reason, /requests IA/);
});

test('AI router returns deterministic tutor when Gemini and OpenAI are not configured', async () => {
  const budget = new AiBudgetManager({ dailyRequestBudget: 8, dailyTokenBudget: 30000, manualExplain: true });
  const router = new AiProviderRouter({
    settings: { primaryProvider: 'gemini', manualExplain: true, fallbackToDeterministic: true },
    gemini: { configured: false, enabled: false, status: () => ({ configured: false, enabled: false }) },
    openai: { configured: false, settings: { enabled: false }, status: () => ({ configured: false, enabled: false }) },
    budgetManager: budget
  });
  const result = await router.explainScan({
    asOf: '2026-05-28T14:00:00.000Z',
    guardianStatus: 'AGGRESSIVE_EDGE',
    guardianEdge: { dailyBest: { symbol: 'SPY', strategy: 'Bull Put Spread', classification: 'AGGRESSIVE_EDGE', pop: 72, riskClass: 'Defined Risk' } },
    dataHealth: { source: 'test' }
  }, { manual: true });
  assert.equal(result.provider, 'deterministic');
  assert.equal(result.usedFallback, true);
  assert.match(result.narrative, /SPY/);
});

test('AI router marks manual only and never enables automatic signal decisions', () => {
  const router = new AiProviderRouter({
    settings: { primaryProvider: 'gemini', autoSignalDecision: false, autoNarrative: false },
    gemini: { configured: true, enabled: true, status: () => ({ configured: true, enabled: true }) },
    openai: { configured: false, settings: { enabled: false }, status: () => ({ configured: false, enabled: false }) },
    budgetManager: new AiBudgetManager({})
  });
  const status = router.status();
  assert.equal(status.manualOnly, true);
  assert.equal(status.automaticSignalDecision, false);
  assert.equal(status.automaticNarrative, false);
});
