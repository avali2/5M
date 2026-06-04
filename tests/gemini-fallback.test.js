import test from 'node:test';
import assert from 'node:assert/strict';
import { AiProviderRouter } from '../server/ai/provider-router.js';
import { AiBudgetManager } from '../server/ai/ai-budget.js';
import { ProviderError } from '../server/lib/http.js';

test('Gemini 429 returns deterministic unavailable review instead of throwing', async () => {
  const router = new AiProviderRouter({
    settings: { autoSignalDecision: true, fallbackToDeterministic: true, cooldownAfter429Minutes: 30 },
    agentSettings: { autoVerifySignals: true, creditReviewMinScore: 50 },
    gemini: {
      configured: true,
      enabled: true,
      status() { return { configured: true, enabled: true }; },
      async explain() { throw new ProviderError('Gemini', 'HTTP 429', 429); }
    },
    openai: null,
    budgetManager: new AiBudgetManager({ dailyRequestBudget: 10, dailyTokenBudget: 10000 })
  });
  const review = await router.reviewSignal({ symbol: 'SPY', strategy: 'Bull Put Spread', score: 80, confidenceScore: 80, expiration: '2026-07-17', strikes: '500/495', maxRisk: 100, maxProfit: 50, legs: [{ side: 'sell', type: 'put', strike: 500 }] }, { asOf: new Date().toISOString(), macro: {} });
  assert.equal(review.provider, 'deterministic');
  assert.equal(review.aiStatus, 'UNAVAILABLE');
  assert.equal(review.entry_ok, false);
});
