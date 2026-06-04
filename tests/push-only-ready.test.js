import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardianPushService } from '../server/push.js';

test('push service skips candidates and watchlist noise', async () => {
  const service = new GuardianPushService({ enabled: true, publicKey: 'bad', privateKey: 'bad', subject: 'mailto:test@example.com' }, { active: async () => [] });
  const result = await service.send({ type: 'CANDIDATE', title: 'Candidate', body: 'Noise' });
  assert.equal(result.skipped, true);
  assert.match(result.error, /not READY_GREEN/);
});

test('READY_GREEN reaches delivery layer', async () => {
  const service = new GuardianPushService({ enabled: false }, { active: async () => [] });
  const result = await service.sendReadyGreen({
    id: 'spy-ready',
    status: 'READY_GREEN',
    symbol: 'SPY',
    strategy: 'Bull Put Spread',
    expiration: '2026-07-17',
    strikes: '500 / 495',
    maxRisk: 100,
    pop: 63,
    confidenceScore: 76,
    creditDebit: { type: 'credit', value: 1.1 }
  });
  assert.equal(result.skipped, undefined);
  assert.match(result.error, /Web Push no configurado/);
});
