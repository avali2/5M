import test from 'node:test';
import assert from 'node:assert/strict';
import { AiBudgetManager } from '../server/ai/ai-budget.js';
import { AiProviderRouter } from '../server/ai/provider-router.js';
import { applyGeminiGuardianGate } from '../server/ai/gemini-guardian-gate.js';
import { ProviderError } from '../server/lib/http.js';

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

test('Gemini Guardian approves only structured JSON APPROVE reviews', async () => {
  const router = new AiProviderRouter({
    settings: { autoTutor: true, autoSignalDecision: true, dailyRequestBudget: 8, dailyTokenBudget: 30000 },
    agentSettings: { autoVerifySignals: true, verifyMinScore: 82, cacheTtlMinutes: 180, maxAiVerificationsPerDay: 8, minutesBetweenAiCalls: 45 },
    gemini: {
      configured: true,
      enabled: true,
      status: () => ({ configured: true, enabled: true }),
      async explain() {
        return {
          text: JSON.stringify({
            decision: 'APPROVE',
            confidence: 91,
            summary: 'Candidato limpio y sin alertas criticas.',
            why: ['score suficiente', 'riesgo definido'],
            risks: ['slippage'],
            entry_ok: true,
            invalidation: 'pierde soporte',
            position_management: 'TP 50%, stop definido',
            news_warning: false,
            macro_warning: false,
            requires_manual_review: false
          }),
          usage: { totalTokens: 200 }
        };
      }
    },
    openai: { configured: false },
    budgetManager: new AiBudgetManager({ autoTutor: true, dailyRequestBudget: 8, dailyTokenBudget: 30000 })
  });
  const review = await router.reviewSignal({
    symbol: 'SPY',
    strategy: 'Bull Put Spread',
    expiration: '2026-06-18',
    strikes: '700 / 695',
    confidenceScore: 85,
    pop: 75,
    maxRisk: 430,
    collateralRequired: 430,
    legs: []
  }, { asOf: '2026-05-28T15:00:00.000Z', macro: {} }, { automatic: true, cycleKey: 'cycle-approve' });
  assert.equal(review.decision, 'APPROVE');
  assert.equal(review.entry_ok, true);
  assert.equal(review.status, 'approved');
});

test('Gemini Guardian blocks BLOCK reviews from becoming operable', async () => {
  const scan = {
    asOf: '2026-05-28T15:00:00.000Z',
    decision: { status: 'eligible', label: 'PLANES', reasons: [] },
    macro: {},
    opportunities: [{
      symbol: 'QQQ',
      strategy: 'Bull Put Spread',
      expiration: '2026-06-18',
      strikes: '700 / 695',
      confidenceScore: 88,
      pop: 76,
      maxRisk: 430,
      maxProfit: 70,
      collateralRequired: 430,
      riskGovernor: { allowedReal: true },
      blocks: [],
      legs: []
    }],
    rejected: [],
    guardianEdge: {
      notifyableTickets: [{ symbol: 'QQQ', strategy: 'Bull Put Spread', expiration: '2026-06-18', sourceSetup: { strikes: '700 / 695' } }],
      actionableTickets: [{ symbol: 'QQQ', strategy: 'Bull Put Spread', expiration: '2026-06-18', sourceSetup: { strikes: '700 / 695' } }],
      tickets: [{ symbol: 'QQQ', strategy: 'Bull Put Spread', expiration: '2026-06-18', sourceSetup: { strikes: '700 / 695' } }]
    }
  };
  const reviewed = await applyGeminiGuardianGate(scan, {
    settings: {
      ai: { autoSignalDecision: true },
      agent: { enabled: true, name: 'Gemini Guardian', mode: 'gatekeeper', autoVerifySignals: true, verifyMinScore: 82, reviewTopN: 3 },
      signals: { requireAiConfirmation: true }
    },
    providers: {
      ai: {
        status: () => ({ automaticSignalDecision: true, budget: {} }),
        async reviewSignal() {
          return {
            decision: 'BLOCK',
            confidence: 90,
            summary: 'Noticia critica activa.',
            entry_ok: false,
            requires_manual_review: true,
            news_warning: true,
            macro_warning: false
          };
        }
      }
    }
  });
  assert.equal(reviewed.opportunities.length, 0);
  assert.equal(reviewed.rejected[0].aiVerificationStatus, 'REQUIRES_MANUAL_REVIEW');
  assert.equal(reviewed.guardianEdge.notifyableTickets.length, 0);
});

test('Gemini Guardian 429 keeps scanner alive and requires manual review', async () => {
  const router = new AiProviderRouter({
    settings: { autoTutor: true, autoSignalDecision: true, cooldownAfter429Minutes: 120, dailyRequestBudget: 8, dailyTokenBudget: 30000 },
    agentSettings: { autoVerifySignals: true, verifyMinScore: 82, cacheTtlMinutes: 180, maxAiVerificationsPerDay: 8, minutesBetweenAiCalls: 45 },
    gemini: {
      configured: true,
      enabled: true,
      status: () => ({ configured: true, enabled: true }),
      async explain() { throw new ProviderError('Gemini', 'HTTP 429', 429); }
    },
    openai: { configured: false },
    budgetManager: new AiBudgetManager({ autoTutor: true, cooldownAfter429Minutes: 120, dailyRequestBudget: 8, dailyTokenBudget: 30000 })
  });
  const review = await router.reviewSignal({
    symbol: 'SPY',
    strategy: 'Bull Put Spread',
    expiration: '2026-06-18',
    strikes: '700 / 695',
    confidenceScore: 85,
    pop: 75,
    maxRisk: 430,
    collateralRequired: 430,
    legs: []
  }, { asOf: '2026-05-28T15:00:00.000Z', macro: {} }, { automatic: true, cycleKey: 'cycle-429' });
  assert.equal(review.decision, 'CAUTION');
  assert.equal(review.entry_ok, false);
  assert.equal(review.requires_manual_review, true);
  assert.match(review.summary, /Gemini error|429/i);
});
