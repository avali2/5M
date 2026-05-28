import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGuardianRules } from '../src/features/options-guardian-agent/agentRules.js';
import { AGENT_EVENT_TYPES } from '../src/features/options-guardian-agent/agentTypes.js';

const now = '2026-05-27T15:00:00.000Z';
const legs = [
  { bid: 0.7, ask: 0.72, delta: -0.18, gamma: 0.02, openInterest: 700, volume: 120 },
  { bid: 0.2, ask: 0.22, delta: -0.08, gamma: 0.01, openInterest: 500, volume: 80 }
];

function setup(score, allowed = score >= 80, extra = {}) {
  return {
    symbol: 'SPY',
    strategy: 'Bull Put Spread',
    expiration: '2026-06-26',
    strikes: '585 / 580',
    confidenceScore: score,
    maxRisk: 428,
    maxProfit: 72,
    pop: 74,
    riskGovernor: { allowedReal: allowed, blocks: allowed ? [] : ['Falta confirmacion de riesgo.'] },
    legs,
    ...extra
  };
}

function eventsFor(candidate, context = {}) {
  return evaluateGuardianRules({
    scan: { asOf: now, opportunities: [candidate], conditionalIdeas: [], decision: { status: 'eligible' }, dataHealth: {} },
    now,
    marketStatus: 'regular',
    ...context
  });
}

test('guardian emits validated, conditional and paper events by institutional score', () => {
  assert.ok(eventsFor(setup(82)).some((item) => item.type === AGENT_EVENT_TYPES.SIGNAL_VALIDATED));
  assert.ok(eventsFor(setup(75, false)).some((item) => item.type === AGENT_EVENT_TYPES.SIGNAL_CONDITIONAL));
  assert.ok(eventsFor(setup(65, false)).some((item) => item.type === AGENT_EVENT_TYPES.SIGNAL_PAPER_ONLY));
});

test('guardian reports risk blocks and weak chain liquidity without approving the trade', () => {
  const warningLegs = [
    { bid: 0.1, ask: 0.55, delta: null, gamma: null, openInterest: 20, volume: 2 },
    legs[1]
  ];
  const events = eventsFor(setup(75, false, { legs: warningLegs }));
  assert.ok(events.some((item) => item.type === AGENT_EVENT_TYPES.RISK_BLOCKED));
  assert.ok(events.some((item) => item.type === AGENT_EVENT_TYPES.LIQUIDITY_WARNING));
  assert.ok(events.some((item) => item.type === AGENT_EVENT_TYPES.CHAIN_WARNING));
  assert.equal(events.some((item) => item.type === AGENT_EVENT_TYPES.SIGNAL_VALIDATED), false);
});

test('guardian warns on gamma risk for one-day structures', () => {
  const events = eventsFor(setup(82, true, { expiration: '2026-05-27', dte: 0 }));
  assert.ok(events.some((item) => item.type === AGENT_EVENT_TYPES.GAMMA_RISK));
});

test('closed market produces paper practice rather than a live trade signal', () => {
  const events = evaluateGuardianRules({
    scan: { opportunities: [], conditionalIdeas: [], decision: { status: 'closed' }, dataHealth: {} },
    now,
    marketStatus: 'closed'
  });
  assert.ok(events.some((item) => item.type === AGENT_EVENT_TYPES.PAPER_PRACTICE_SUGGESTED));
  assert.ok(events.some((item) => item.type === AGENT_EVENT_TYPES.NO_TRADE_PROFESSIONAL));
});

test('guardian emits actionable edge ticket events with trade ticket details', () => {
  const ticket = {
    id: 'SPY-edge-ticket',
    symbol: 'SPY',
    classification: 'EDGE_READY',
    riskClass: 'Defined Risk',
    strategy: 'Bull Put Spread',
    expiration: '2026-06-26',
    legsText: 'Sell 585P / Buy 580P',
    entryLimit: 'Credit >= $0.72',
    maxRisk: 428,
    maxProfit: 72,
    popEstimated: 74,
    evEstimated: 12,
    edgeScore: 78,
    notificationTitle: '🔥 SPY — EDGE_READY',
    notificationBody: 'Bull Put Spread | POP 74% | Risk: Defined Risk'
  };
  const events = evaluateGuardianRules({
    scan: {
      asOf: now,
      opportunities: [],
      conditionalIdeas: [],
      decision: { status: 'eligible' },
      dataHealth: {},
      guardianEdge: { notifyableTickets: [ticket] }
    },
    now,
    marketStatus: 'regular'
  });
  const edgeEvent = events.find((item) => item.type === AGENT_EVENT_TYPES.EDGE_TICKET);
  assert.ok(edgeEvent);
  assert.equal(edgeEvent.data.ticket.popEstimated, 74);
  assert.equal(edgeEvent.data.ticket.riskClass, 'Defined Risk');
  assert.equal(edgeEvent.channels.includes('webPush'), true);
});
