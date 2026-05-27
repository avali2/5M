import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { GuardianPushService } from '../server/push.js';
import { GuardianPushStore } from '../server/pushStore.js';
import { createApp } from '../server/index.js';

test('push subscription storage keeps hashed endpoints and no frontend secret', async () => {
  let saved = null;
  const repository = {
    async saveGuardianPushSubscription(value) { saved = value; return value; },
    async listGuardianPushSubscriptions() { return []; },
    async updateGuardianPushSubscription() {}
  };
  const service = new GuardianPushService({ enabled: false }, new GuardianPushStore(repository));
  const subscription = { endpoint: 'https://push.example/token-private', keys: { p256dh: 'key', auth: 'auth' } };
  await service.subscribe({ subscription, deviceLabel: 'phone' });
  assert.ok(saved.endpointHash);
  assert.notEqual(saved.endpointHash, subscription.endpoint);
  assert.equal(service.status().configured, false);
});

test('protected backend exposes only public VAPID configuration status', async () => {
  const app = createApp({
    clientOrigin: 'https://valido.example',
    security: { accessKey: 'guardian-private-key' },
    refreshSeconds: 60,
    guardian: { enabled: true },
    webPush: { enabled: false },
    policy: {}
  }, {}, { startBackground: false });
  await request(app).get('/api/push/public-key').expect(401);
  const result = await request(app).get('/api/push/public-key').set('X-Valido-Key', 'guardian-private-key').expect(200);
  assert.equal(result.body.configured, false);
  assert.equal(result.body.publicKey, null);
});

test('invalid VAPID configuration fails closed without crashing the application service', () => {
  const service = new GuardianPushService({
    enabled: true,
    publicKey: 'invalid',
    privateKey: 'invalid',
    subject: 'mailto:test@example.com'
  }, { active: async () => [] });
  assert.equal(service.status().configured, false);
  assert.ok(service.status().configurationError);
});
