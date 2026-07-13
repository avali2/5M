import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const testStore = await mkdtemp(path.join(tmpdir(), 'scan-lock-test-'));
process.env.SIGMA_DATA_DIR = testStore;
const { ScanLock } = await import('../server/services/scanLock.js');
const { ScanPersistence } = await import('../server/services/scanPersistence.js');
const { ScanScheduler } = await import('../server/services/scheduler.js');

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

test('scan persistence stores the complete worker snapshot for the web reader', async () => {
  const persistence = new ScanPersistence({});
  const scan = {
    asOf: new Date().toISOString(),
    decision: { status: 'no_trade', label: 'CAPITAL PROTEGIDO', reasons: ['Sin setup valido.'] },
    collection: { scannedSymbols: 12, chainsCollected: 4 },
    opportunities: [],
    rejected: [{ symbol: 'SOFI', status: 'BLOCKED', blocks: ['Capital insuficiente.'] }]
  };
  await persistence.saveScan(scan, { mode: 'worker-test', worker: 'test-worker' });
  const latest = await persistence.latest();
  assert.equal(latest.scan.asOf, scan.asOf);
  assert.equal(latest.scan.rejected[0].symbol, 'SOFI');
});

test('web reader returns the persisted scan without invoking the market engine', async () => {
  const scan = { asOf: new Date().toISOString(), opportunities: [], rejected: [] };
  const scheduler = new ScanScheduler({
    providers: {},
    settings: {},
    readPersisted: true,
    persistence: { async latest() { return { scan }; } }
  });
  assert.equal(await scheduler.snapshot(), scan);
  assert.equal(scheduler.running, null);
});

test('web fallback persists scans and reports its own watchdog heartbeat', async () => {
  const calls = [];
  const persistence = {
    async saveScan(scan, meta) {
      calls.push({ type: 'scan', scan, meta });
      return { id: 'web-run-1' };
    },
    async saveWorkerState(state) {
      calls.push({ type: 'state', state });
    }
  };
  const scheduler = new ScanScheduler({
    providers: {},
    settings: {},
    persistence,
    stateServiceName: 'web-scanner'
  });
  const scan = { asOf: '2026-07-13T16:20:00.000Z', opportunities: [], rejected: [] };

  await scheduler.persistScheduledResult(scan);

  assert.equal(calls[0].meta.mode, 'web-fallback');
  assert.equal(calls[0].meta.worker, 'web-scanner');
  assert.equal(calls[1].state.serviceName, 'web-scanner');
  assert.equal(calls[1].state.lastScanAt, scan.asOf);
  assert.equal(calls[1].state.status, 'ONLINE');
});
