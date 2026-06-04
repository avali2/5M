import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const testStore = await mkdtemp(path.join(tmpdir(), 'scan-lock-test-'));
process.env.SIGMA_DATA_DIR = testStore;
const { ScanLock } = await import('../server/services/scanLock.js');

test.after(async () => {
  await rm(testStore, { recursive: true, force: true });
});

test('scan lock prevents duplicate owners', async () => {
  const first = new ScanLock({ settings: {}, owner: 'worker-a' });
  const second = new ScanLock({ settings: {}, owner: 'worker-b' });
  const lockName = `scanner-test-${Date.now()}`;
  const acquired = await first.acquire(lockName, 60_000);
  assert.equal(acquired.acquired, true);
  const blocked = await second.acquire(lockName, 60_000);
  assert.equal(blocked.acquired, false);
  await first.release(lockName);
  const next = await second.acquire(lockName, 60_000);
  assert.equal(next.acquired, true);
});
