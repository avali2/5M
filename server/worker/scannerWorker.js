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
import { PaperAutopilot } from '../services/paperAutopilot.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WORKER_OWNER = `worker:${process.pid}:${Date.now()}`;
const SCAN_INTERVAL_MS = Number(process.env.SCANNER_INTERVAL_MINUTES || config.scanner?.intervalMinutes || 3) * 60 * 1000;
const AFTER_HOURS_INTERVAL_MS = Number(process.env.SCANNER_AFTER_HOURS_INTERVAL_MINUTES || config.scanner?.afterHoursIntervalMinutes || 15) * 60 * 1000;
const LOCK_TTL_MS = 180_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function marketSession(providers) {
  const fallback = getMarketSessionET();
  const regularFallback = ['OPENING_NOISE', 'MORNING_PRIME', 'MIDDAY', 'AFTERNOON_PRIME', 'POWER_HOUR', 'FINAL_GAMMA_WINDOW'].includes(fallback.phase);
  if (typeof providers?.tradier?.getMarketClock !== 'function') return { ...fallback, source: 'local_clock', marketOpen: regularFallback };
  try {
    const clock = await providers.tradier.getMarketClock();
    return { ...fallback, source: 'tradier_clock', marketOpen: clock?.state === 'open', clock };
  } catch (error) {
    return { ...fallback, source: 'local_clock_fallback', marketOpen: regularFallback, clockError: error.message };
  }
}

async function notifyReadyGreen({ scan, pushService, persistence }) {
  const ready = readyGreenSignals(scan);
  const results = [];
  for (const signal of ready) {
    const id = signal.id || `${signal.symbol}-${signal.strategy}-${signal.expiration}`;
    if (await persistence.pushRecentlySent(id, 'READY_GREEN')) {
      results.push({ signalId: id, skipped: true, reason: 'cooldown' });
      continue;
    }
    const result = await pushService.sendReadyGreen(signal);
    await persistence.recordPush({ signalId: id, type: 'READY_GREEN', payload: { symbol: signal.symbol, strategy: signal.strategy }, result });
    results.push({ signalId: id, ...result });
  }
  return results;
}

async function auditPositions({ scan, providers, persistence, pushService }) {
  const broker = await loadBrokerPositions({ repository, providers });
  const analysis = analyzePortfolioRisk({ positions: broker.positions, market: scan.market || {} });
  await persistence.savePositionRisk(analysis);
  for (const position of analysis.positions.filter((item) => item.status === 'CRITICAL_RISK')) {
    const id = `risk-${position.id}-${position.action}`;
    if (await persistence.pushRecentlySent(id, 'CRITICAL_RISK', 30 * 60 * 1000)) continue;
    const result = await pushService.sendCriticalRisk({
      symbol: position.symbol,
      reason: position.reason,
      action: position.action,
      url: '/institutional-os.html?tab=risk'
    });
    await persistence.recordPush({ signalId: id, type: 'CRITICAL_RISK', payload: position, result });
  }
  return { source: broker.source, connected: broker.brokerConnected, ...analysis.summary };
}

export async function runScannerWorkerCycle({
  mode = 'scheduled',
  providers = createProviders(config),
  settings = config,
  lock = new ScanLock({ settings: config.database, owner: WORKER_OWNER }),
  persistence = new ScanPersistence(config.database),
  pushService = new GuardianPushService(settings.webPush || {}, new GuardianPushStore(repository)),
  paperAutopilot = new PaperAutopilot({ providers, settings })
} = {}) {
  const session = await marketSession(providers);
  const paper = await paperAutopilot.run({ mode: `${mode}-paper` }).catch((error) => ({ status: 'ERROR', error: error.message }));
  if (!settings.scanner?.enabled) {
    await persistence.saveWorkerState({ status: 'STALE', payload: { reason: 'SCANNER_ENABLED=false', session, paperStatus: paper.status } });
    return { ok: true, skipped: true, reason: 'SCANNER_ENABLED=false', session, paper };
  }
  if (!session.marketOpen) {
    await persistence.saveWorkerState({ status: 'ONLINE', payload: { reason: 'Market is not open', session, paperStatus: paper.status } });
    return { ok: true, skipped: true, reason: `Market session ${session.clock?.state || session.phase}`, session, paper };
  }
  try {
    const result = await lock.withLock('scanner', LOCK_TTL_MS, async () => {
      const scheduler = new ScanScheduler({ providers, settings });
      const scan = await scheduler.run(true);
      const run = await persistence.saveScan(scan, { mode, worker: WORKER_OWNER });
      const risk = await auditPositions({ scan, providers, persistence, pushService });
      const push = await notifyReadyGreen({ scan, pushService, persistence });
      await persistence.saveWorkerState({
        status: 'ONLINE',
        lastScanAt: scan.asOf,
        lastSuccessAt: new Date().toISOString(),
        payload: { runId: run.id, readyGreen: readyGreenSignals(scan).length, positionsReviewed: risk.total, session, paperStatus: paper.status }
      });
      return {
        ok: true,
        skipped: false,
        session,
        run,
        risk,
        readyGreen: readyGreenSignals(scan).length,
        push,
        paper
      };
    });
    if (result.skipped) {
      await persistence.saveWorkerState({ status: 'ONLINE', payload: { reason: 'Another backend process owns the scan lock.', lock: result.lock, session } });
    }
    return result;
  } catch (error) {
    await persistence.saveWorkerState({ status: 'ERROR', lastError: error.message, payload: { session } });
    throw error;
  }
}

export async function startScannerWorker() {
  console.log(`VALIDO 1M scanner worker started. Interval=${SCAN_INTERVAL_MS}ms afterHours=${AFTER_HOURS_INTERVAL_MS}ms owner=${WORKER_OWNER}`);
  while (true) {
    const started = Date.now();
    let waitMs = SCAN_INTERVAL_MS;
    try {
      const result = await runScannerWorkerCycle({ mode: 'worker' });
      const session = result.session || result.value?.session;
      waitMs = session?.marketOpen ? SCAN_INTERVAL_MS : AFTER_HOURS_INTERVAL_MS;
      if (result.skipped) console.log('Scanner worker skipped:', result.reason || result.lock?.owner || 'locked');
      else console.log('Scanner worker cycle:', JSON.stringify({ readyGreen: result.value?.readyGreen, runId: result.value?.run?.id }));
    } catch (error) {
      console.error('Scanner worker cycle failed:', error.message);
    }
    await sleep(Math.max(10_000, waitMs - (Date.now() - started)));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  startScannerWorker().catch((error) => {
    console.error('Scanner worker fatal error:', error);
    process.exit(1);
  });
}
