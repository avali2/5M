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
            requires_manual_review: false,
            hallucination_check: 'PASSED'
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
  assert.equal(review.hallucination_check, 'PASSED');
});

test('Gemini Guardian rejects APPROVE when hallucination check fails or is missing', async () => {
  const scan = {
    asOf: '2026-05-28T15:00:00.000Z',
    decision: { status: 'eligible', label: 'PLANES', reasons: [] },
    macro: {},
    opportunities: [{
      symbol: 'SPY',
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
    guardianEdge: { notifyableTickets: [], actionableTickets: [], tickets: [] }
  };
  const reviewed = await applyGeminiGuardianGate(scan, {
    settings: {
      ai: { autoSignalDecision: true },
      agent: { enabled: true, autoVerifySignals: true, verifyMinScore: 82, reviewTopN: 3 },
      signals: { requireAiConfirmation: true }
    },
    providers: {
      ai: {
        status: () => ({ automaticSignalDecision: true, budget: {} }),
        async reviewSignal() {
          return {
            decision: 'APPROVE',
            confidence: 88,
            summary: 'Aprobo pero no paso hallucination check.',
            entry_ok: true,
            requires_manual_review: false,
            news_warning: false,
            macro_warning: false,
            hallucination_check: 'FAILED'
          };
        }
      }
    }
  });
  assert.equal(reviewed.opportunities.length, 0);
  assert.match(reviewed.rejected[0].blocks.join(' '), /hallucination|Sigma Guardian/i);
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

test('Gemini outage does not block a deterministic READY signal when fail-closed is disabled', async () => {
  const scan = {
    asOf: '2026-07-13T15:00:00.000Z',
    decision: { status: 'eligible', label: 'READY', reasons: ['Todos los gates deterministas pasaron.'] },
    macro: {},
    opportunities: [{
      symbol: 'SOFI',
      strategy: 'Call Debit Spread',
      expiration: '2026-07-17',
      strikes: '24 / 25',
      confidenceScore: 84,
      pop: 68,
      maxRisk: 35,
      maxProfit: 65,
      collateralRequired: 35,
      riskGovernor: { allowedReal: true },
      blocks: [],
      legs: []
    }],
    rejected: [],
    guardianEdge: { notifyableTickets: [], actionableTickets: [], tickets: [] }
  };

  const reviewed = await applyGeminiGuardianGate(scan, {
    settings: {
      ai: { autoSignalDecision: true },
      agent: { enabled: true, autoVerifySignals: true, verifyMinScore: 70, reviewTopN: 3 },
      signals: { requireAiConfirmation: true, failClosedOnAiError: false }
    },
    providers: {
      ai: {
        status: () => ({ automaticSignalDecision: true, budget: {} }),
        async reviewSignal() {
          return {
            decision: 'CAUTION',
            confidence: 40,
            summary: 'Gemini HTTP 429; motor determinista activo.',
            entry_ok: false,
            requires_manual_review: true,
            news_warning: false,
            macro_warning: false,
            hallucination_check: 'FAILED',
            aiStatus: 'UNAVAILABLE'
          };
        }
      }
    }
  });

  assert.equal(reviewed.opportunities.length, 1);
  assert.equal(reviewed.opportunities[0].aiVerificationStatus, 'DETERMINISTIC_APPROVED_AI_UNAVAILABLE');
  assert.equal(reviewed.opportunities[0].geminiReview.approved, false);
  assert.equal(reviewed.aiGuardian.unavailable, true);
  assert.equal(reviewed.decision.label, 'READY');
});

test('Gemini outage preserves the real no-trade reason when capital blocked every setup', async () => {
  const originalDecision = {
    status: 'no_trade',
    label: 'NO TRADE - CAPITAL INSUFICIENTE',
    reasons: ['Ningun contrato cabe en el presupuesto de riesgo de la cuenta.']
  };
  const scan = {
    asOf: '2026-07-13T15:00:00.000Z',
    decision: { ...originalDecision, reasons: [...originalDecision.reasons] },
    summary: 'NO TRADE: capital insuficiente.',
    macro: {},
    opportunities: [],
    rejected: [{
      symbol: 'SOFI',
      strategy: 'Call Debit Spread',
      expiration: '2026-07-17',
      strikes: '24 / 25',
      confidenceScore: 84,
      pop: 68,
      maxRisk: 35,
      maxProfit: 65,
      collateralRequired: 35,
      riskGovernor: { allowedReal: false },
      blocks: ['Riesgo mayor al presupuesto disponible.'],
      legs: [
        { side: 'buy', type: 'call', strike: 24 },
        { side: 'sell', type: 'call', strike: 25 }
      ]
    }],
    guardianEdge: { notifyableTickets: [], actionableTickets: [], tickets: [] }
  };

  const reviewed = await applyGeminiGuardianGate(scan, {
    settings: {
      ai: { autoSignalDecision: true },
      agent: { enabled: true, autoVerifySignals: true, verifyMinScore: 70, reviewTopN: 3 },
      signals: { requireAiConfirmation: true, failClosedOnAiError: false }
    },
    providers: {
      ai: {
        status: () => ({ automaticSignalDecision: true, budget: {} }),
        async reviewSignal() {
          return {
            decision: 'CAUTION',
            confidence: 40,
            summary: 'Gemini HTTP 429; motor determinista activo.',
            entry_ok: false,
            requires_manual_review: true,
            news_warning: false,
            macro_warning: false,
            hallucination_check: 'FAILED',
            aiStatus: 'UNAVAILABLE'
          };
        }
      }
    }
  });

  assert.deepEqual(reviewed.decision, originalDecision);
  assert.equal(reviewed.summary, 'NO TRADE: capital insuficiente.');
  assert.equal(reviewed.opportunities.length, 0);
});
