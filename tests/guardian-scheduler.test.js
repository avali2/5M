import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardianScheduler } from '../server/guardianScheduler.js';
import { filterGuardianNotifications, guardianCadenceMinutes } from '../src/features/options-guardian-agent/agentEngine.js';
import { AGENT_CHANNELS, AGENT_EVENT_TYPES, AGENT_SEVERITIES, createGuardianEvent } from '../src/features/options-guardian-agent/agentTypes.js';

function fakeRepository() {
  return {
    async getGuardianSettings(defaults) { return defaults; },
    async listGuardianEvents() { return []; },
    async listJournal() { return []; },
    async listGuardianFeedback() { return []; },
    async getGuardianLearningProfile() { return null; },
    async saveGuardianEvents(events) { return events; },
    async saveGuardianLearningProfile(profile) { return profile; },
    async updateGuardianEvent() {},
    async saveGuardianCooldown() {},
    async saveGuardianScanRun(run) { return run; },
    async saveGuardianMarketSnapshot(value) { return value; }
  };
}

test('backend guardian never performs a live scan while market is closed', async () => {
  let scanCalls = 0;
  const scheduler = new GuardianScheduler({
    scanScheduler: { async run() { scanCalls += 1; return {}; } },
    repository: fakeRepository(),
    pushService: { async sendGuardianEvent() { return { sent: 0 }; } },
    now: () => new Date('2026-05-30T16:00:00.000Z')
  });
  const result = await scheduler.runNow('manual');
  assert.equal(scanCalls, 0);
  assert.equal(result.marketStatus, 'closed');
  assert.ok(result.events.some((item) => item.type === AGENT_EVENT_TYPES.PAPER_PRACTICE_SUGGESTED));
});

test('paused guardian does not run background scans', async () => {
  let scanCalls = 0;
  const repository = fakeRepository();
  repository.getGuardianSettings = async (defaults) => ({ ...defaults, enabled: false });
  const scheduler = new GuardianScheduler({
    scanScheduler: { async run() { scanCalls += 1; return {}; } },
    repository,
    pushService: { async sendGuardianEvent() { return { sent: 0 }; } },
    now: () => new Date('2026-05-27T15:00:00.000Z')
  });
  const result = await scheduler.runNow('scheduled');
  assert.equal(scanCalls, 0);
  assert.equal(result.paused, true);
});

test('cadence uses regular interval and accelerates only for active candidate or critical risk', () => {
  assert.equal(guardianCadenceMinutes({ marketStatus: 'regular' }), 15);
  assert.equal(guardianCadenceMinutes({ marketStatus: 'regular', events: [{ type: AGENT_EVENT_TYPES.SIGNAL_VALIDATED }] }), 5);
  assert.equal(guardianCadenceMinutes({ marketStatus: 'regular', events: [{ severity: AGENT_SEVERITIES.CRITICAL }] }), 3);
});

test('work mode respects duplicate and hourly notification controls', () => {
  const createdAt = '2026-05-27T15:00:00.000Z';
  const signal = createGuardianEvent({
    type: AGENT_EVENT_TYPES.SIGNAL_VALIDATED,
    severity: AGENT_SEVERITIES.OPPORTUNITY,
    symbol: 'SPY',
    title: 'SPY',
    message: 'Setup',
    recommendation: 'Review',
    data: { score: 82 },
    channels: [AGENT_CHANNELS.WEB_PUSH],
    createdAt
  });
  assert.equal(filterGuardianNotifications([signal], [], {}, new Date(createdAt)).length, 1);
  const previous = [{ ...signal, notificationSent: true }];
  assert.equal(filterGuardianNotifications([signal], previous, {}, new Date('2026-05-27T15:02:00.000Z')).length, 0);
});

test('high impact macro allows risk notification but suppresses opportunity push', () => {
  const createdAt = '2026-05-27T15:00:00.000Z';
  const signal = createGuardianEvent({
    type: AGENT_EVENT_TYPES.SIGNAL_VALIDATED,
    severity: AGENT_SEVERITIES.OPPORTUNITY,
    symbol: 'SPY',
    title: 'Signal',
    message: 'Setup',
    recommendation: 'Review',
    data: { score: 82 },
    channels: [AGENT_CHANNELS.WEB_PUSH],
    createdAt
  });
  const macro = createGuardianEvent({
    type: AGENT_EVENT_TYPES.MACRO_RISK,
    severity: AGENT_SEVERITIES.CRITICAL,
    title: 'FOMC',
    message: 'High impact',
    recommendation: 'Wait',
    channels: [AGENT_CHANNELS.WEB_PUSH],
    createdAt
  });
  const selected = filterGuardianNotifications([signal, macro], [], {}, new Date(createdAt));
  assert.equal(selected.some((item) => item.type === AGENT_EVENT_TYPES.SIGNAL_VALIDATED), false);
  assert.equal(selected.some((item) => item.type === AGENT_EVENT_TYPES.MACRO_RISK), true);
});
