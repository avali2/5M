import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('guardian local alerts delegate to the mobile-safe Service Worker notification helper', async () => {
  const code = await readFile('src/features/options-guardian-agent/agentNotifications.js', 'utf8');
  const notifications = await readFile('src/services/notifications.js', 'utf8');
  assert.match(code, /showMobileSafeNotification/);
  assert.doesNotMatch(code, /new\s+Notification\s*\(/);
  assert.doesNotMatch(notifications, /new\s+Notification\s*\(/);
  assert.match(notifications, /registration\.showNotification/);
});

test('service worker accepts Web Push and displays it with showNotification', async () => {
  const worker = await readFile('public/sw.js', 'utf8');
  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /self\.registration\.showNotification/);
  assert.match(worker, /pushsubscriptionchange/);
  assert.match(worker, /\/icons\/icon-192\.png/);
  assert.match(worker, /\/icons\/badge-72\.png/);
  assert.doesNotMatch(worker, /new\s+Notification\s*\(/);
});
