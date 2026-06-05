import 'dotenv/config';
import { config } from '../config.js';
import { createProviders } from '../providers/index.js';
import { ScanScheduler } from '../services/scheduler.js';
import { ScanLock } from '../services/scanLock.js';
import { ScanPersistence } from '../services/scanPersistence.js';
import { GuardianPushStore } from '../pushStore.js';
import { GuardianPushService } from '../push.js';
import { repository } from '../db/repository.js';
import { getMarketSessionET } from '../autonomousSignalWorker.js';
import { readyGreenSignals } from '../engine/greenSignalPolicy.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WORKER_OWNER = `worker:${process.pid}:${Date.now()}`;
const SCAN_INTERVAL_MS = Number(process.env.SCANNER_INTERVAL_MINUTES || config.scanner?.intervalMinutes || 3) * 60 * 1000;
const AFTER_HOURS_INTERVAL_MS = Number(process.env.SCANNER_AFTER_HOURS_INTERVAL_MINUTES || config.scanner?.afterHoursIntervalMinutes || 15) * 60 * 1000;
const LOCK_TTL_MS = Math.max(90_000, Math.min(SCAN_INTERVAL_MS - 5_000, 170_000));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldFullScan(session) {
  if (config.scanner?.marketOpenOnly) return !['CLOSED', 'AFTER_CLOSE'].includes(session.phase);
  return true;
}

async function notifyReadyGreen({ scan, pushService }) {
  const ready = readyGreenSignals(scan);
  const results = [];
  for (const signal of ready) {
    results.push(await pushService.sendReadyGreen(signal));
  }
  return results;
}

export async function runScannerWorkerCycle({
  mode = 'scheduled',
  providers = createProviders(config),
  settings = config,
  lock = new ScanLock({ settings: config.database, owner: WORKER_OWNER }),
  persistence = new ScanPersistence(config.database),
  pushService = new GuardianPushService(settings.webPush || {}, new GuardianPushStore(repository))
} = {}) {
  const session = getMarketSessionET();
  if (!settings.scanner?.enabled) {
    return { ok: true, skipped: true, reason: 'SCANNER_ENABLED=false', session };
  }
  if (!shouldFullScan(session)) {
    return { ok: true, skipped: true, reason: `Market session ${session.phase}`, session };
  }
  return lock.withLock('scanner', LOCK_TTL_MS, async () => {
    const scheduler = new ScanScheduler({ providers, settings });
    const scan = await scheduler.run(true);
    const run = await persistence.saveScan(scan, { mode, worker: WORKER_OWNER });
    const push = await notifyReadyGreen({ scan, pushService });
    return {
      ok: true,
      skipped: false,
      session,
      run,
      readyGreen: readyGreenSignals(scan).length,
      push
    };
  });
}

export async function startScannerWorker() {
  console.log(`VALIDO 1M scanner worker started. Interval=${SCAN_INTERVAL_MS}ms afterHours=${AFTER_HOURS_INTERVAL_MS}ms owner=${WORKER_OWNER}`);
  while (true) {
    const started = Date.now();
    try {
      const result = await runScannerWorkerCycle({ mode: 'worker' });
      if (result.skipped) console.log('Scanner worker skipped:', result.reason || result.lock?.owner || 'locked');
      else console.log('Scanner worker cycle:', JSON.stringify({ readyGreen: result.value?.readyGreen, runId: result.value?.run?.id }));
    } catch (error) {
      console.error('Scanner worker cycle failed:', error.message);
    }
    const session = getMarketSessionET();
    const interval = ['CLOSED', 'AFTER_CLOSE'].includes(session.phase) ? AFTER_HOURS_INTERVAL_MS : SCAN_INTERVAL_MS;
    await sleep(Math.max(10_000, interval - (Date.now() - started)));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  startScannerWorker().catch((error) => {
    console.error('Scanner worker fatal error:', error);
    process.exit(1);
  });
}
