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
import { loadBrokerPositions } from '../services/brokerPositionsService.js';
import { analyzePortfolioRisk } from '../services/positionRiskAnalyzer.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WORKER_OWNER = `worker:${process.pid}:${Date.now()}`;
const SCAN_INTERVAL_MS = 3 * 60 * 1000;
const AFTER_HOURS_INTERVAL_MS = Number(process.env.SCANNER_AFTER_HOURS_INTERVAL_MINUTES || config.scanner?.afterHoursIntervalMinutes || 15) * 60 * 1000;
const LOCK_TTL_MS = 180_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldFullScan(session) {
  return !['CLOSED', 'AFTER_CLOSE', 'PREMARKET'].includes(session.phase);
}

async function notifyReadyGreen({ scan, pushService, persistence }) {
  const ready = readyGreenSignals(scan);
  const results = [];
  for (const signal of ready) {
    const result = await pushService.sendReadyGreen(signal);
    results.push(result);
    await persistence.recordPushEvent({
      signalId: signal.id || `${signal.symbol}-${signal.strategy}-${signal.expiration}`,
      type: 'READY_GREEN',
      payload: signal,
      result
    });
  }
  return results;
}

async function auditOpenPositions({ scan, persistence, providers }) {
  const broker = await loadBrokerPositions({ repository, providers });
  const analysis = analyzePortfolioRisk({ positions: broker.positions, market: scan.market || {} });
  const reviews = (analysis.positions || []).map((position) => ({
    id: `risk-${position.id}-${Date.now()}`,
    positionId: position.id,
    symbol: position.symbol,
    riskScore: position.health === 'CRITICAL_RISK' ? 100 : position.health === 'ROLL_CANDIDATE' ? 75 : position.health === 'TAKE_PROFIT' ? 35 : 50,
    status: position.status,
    action: position.action,
    payload: position
  }));
  await persistence.saveRiskReviews(reviews);
  return { count: reviews.length, analysis };
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
    await persistence.saveWorkerStatus({ scanStatus: 'ONLINE', lastScanAt: new Date().toISOString(), lastRunId: null });
    return { ok: true, skipped: true, reason: `Market session ${session.phase}`, session };
  }
  return lock.withLock('scanner', LOCK_TTL_MS, async () => {
    const scheduler = new ScanScheduler({ providers, settings });
    const scan = await scheduler.run(true);
    const risk = await auditOpenPositions({ scan, persistence, providers });
    const push = await notifyReadyGreen({ scan, pushService, persistence });
    const notificationsSent = push.reduce((sum, item) => sum + Number(item?.sent || 0), 0);
    const run = await persistence.saveScan(scan, { mode, worker: WORKER_OWNER, positionsReviewed: risk.count, notificationsSent });
    return {
      ok: true,
      skipped: false,
      session,
      run,
      scan,
      readyGreen: readyGreenSignals(scan).length,
      positionsReviewed: risk.count,
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
      const persistence = new ScanPersistence(config.database);
      await persistence.saveWorkerError(error).catch(() => {});
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
