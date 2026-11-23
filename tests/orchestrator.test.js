import test from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../server/lib/orchestrator.js';

const NOW = new Date('2026-11-23T16:00:00Z');

function fakeBot(overrides = {}) {
  const history = overrides.history || [];
  const bots = {
    state: { history, lessons: [] },
    armed: true,
    paused: false,
    config: { strategies: { bullPut: true, bearCall: true, ironCondor: true } },
    status() { return { armed: !this.paused, gates: { ok: true, checks: [] } }; },
    pause(value) { this.paused = Boolean(value); },
    getConfig() { return this.config; },
    updateConfig(patch) { this.config = { ...this.config, ...patch }; return { ok: true }; },
    save() {}
  };
  return bots;
}

test('pausa el bot si la pérdida diaria supera el límite', async () => {
  const bot = fakeBot({ history: [{ closedAt: NOW.toISOString(), realizedUsd: -300 }] });
  const orch = new Orchestrator({ bots: { paper: bot }, env: { BOT_DAILY_LOSS_LIMIT: '200' }, now: () => NOW, dataDir: '/tmp/5m-orch-test' });
  await orch.runOnce();
  assert.equal(bot.paused, true);
  assert.ok(orch.state.alerts.some((alert) => alert.kind === 'RIESGO'));
});

test('desactiva estrategias con win rate bajo tras 6 trades', async () => {
  const history = Array.from({ length: 6 }, (_, index) => ({ closedAt: NOW.toISOString(), strategy: 'BULL_PUT_CREDIT', realizedUsd: index === 0 ? 100 : -50 }));
  const bot = fakeBot({ history });
  const orch = new Orchestrator({ bots: { paper: bot }, env: {}, now: () => NOW, dataDir: '/tmp/5m-orch-test2' });
  await orch.runOnce();
  assert.equal(bot.config.strategies.bullPut, false);
  assert.ok(orch.state.learning.length >= 1);
});

test('no desactiva una estrategia rentable', async () => {
  const history = Array.from({ length: 6 }, (_, index) => ({ closedAt: NOW.toISOString(), strategy: 'BULL_PUT_CREDIT', realizedUsd: index === 0 ? -50 : 100 }));
  const bot = fakeBot({ history });
  const orch = new Orchestrator({ bots: { paper: bot }, env: {}, now: () => NOW, dataDir: '/tmp/5m-orch-test3' });
  await orch.runOnce();
  assert.equal(bot.config.strategies.bullPut, true);
});
