import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from '../config.js';
import { readyGreenSignals } from '../engine/greenSignalPolicy.js';
import { getMarketSessionET } from '../autonomousSignalWorker.js';

const root = path.resolve(process.env.SIGMA_DATA_DIR || 'data');

async function ensureRoot() {
  await mkdir(root, { recursive: true });
}

async function readJson(name, fallback) {
  await ensureRoot();
  try {
    return JSON.parse(await readFile(path.join(root, name), 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(name, value) {
  await ensureRoot();
  await writeFile(path.join(root, name), JSON.stringify(value, null, 2), 'utf8');
}

function summarizeReasons(scan = {}) {
  const counts = new Map();
  const items = [...(scan.rejected || []), ...(scan.conditionalIdeas || [])];
  for (const item of items) {
    const reasons = item.greenPolicy?.reasons || item.blocks || item.missingValidation || [];
    for (const reason of reasons) {
      const key = String(reason || 'Unknown').slice(0, 140);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function scanRunFrom(scan = {}, meta = {}) {
  const ready = readyGreenSignals(scan);
  const candidates = (scan.rejected || []).filter((item) => item.status === 'CANDIDATE').length;
  const watchlist = (scan.rejected || []).filter((item) => item.status === 'WATCHLIST').length;
  return {
    id: meta.id || `scan-${Date.now()}`,
    mode: meta.mode || 'scheduled',
    timestamp: scan.asOf || new Date().toISOString(),
    status: scan.decision?.status || 'unknown',
    label: scan.decision?.label || '',
    symbolsScanned: scan.collection?.scannedSymbols || 0,
    chainsCollected: scan.collection?.chainsCollected || 0,
    candidatesEvaluated: (scan.opportunities || []).length + (scan.rejected || []).length,
    readyGreenCount: ready.length,
    candidateCount: candidates,
    watchlistCount: watchlist,
    dataErrorCount: (scan.scanErrors || []).length + (scan.rejected || []).filter((item) => item.status === 'DATA_ERROR').length,
    topRejectionReasons: summarizeReasons(scan),
    providerHealth: scan.providers || [],
    aiStatus: scan.aiStatus || scan.aiGuardian || null,
    decisionReasons: scan.decision?.reasons || [],
    worker: meta.worker || null,
    createdAt: new Date().toISOString()
  };
}

function discardedSignalsFrom(scan = {}) {
  return [...(scan.rejected || []), ...(scan.conditionalIdeas || [])]
    .filter((item) => item?.symbol)
    .map((item) => ({
      id: item.id || `discarded-${item.symbol}-${item.strategy || 'setup'}-${item.expiration || 'na'}-${Date.now()}`,
      symbol: item.symbol,
      strategy: item.strategy || item.sourceSetup?.strategy || null,
      status: item.status || item.classification || 'DISCARDED',
      reasons: item.greenPolicy?.reasons || item.blocks || item.missingValidation || item.warnings || [],
      payload: item
    }));
}

function workerStatusFromRun(run = {}, patch = {}) {
  return {
    scanStatus: patch.scanStatus || (patch.error ? 'ERROR' : 'ONLINE'),
    lastScanAt: patch.lastScanAt || run.timestamp || new Date().toISOString(),
    lastRunId: patch.lastRunId || run.id || null,
    lastError: patch.error || null,
    positionsReviewed: patch.positionsReviewed ?? 0,
    notificationsSent: patch.notificationsSent ?? 0,
    updatedAt: new Date().toISOString()
  };
}

function healthFromStatus(status = {}) {
  const session = getMarketSessionET();
  const lastScanAt = status.lastScanAt || status.last_scan_at || null;
  const error = status.lastError || status.last_error || null;
  const ageMs = lastScanAt ? Date.now() - new Date(lastScanAt).getTime() : Infinity;
  const marketOpen = !['CLOSED', 'AFTER_CLOSE', 'PREMARKET'].includes(session.phase);
  const scanStatus = error ? 'ERROR' : marketOpen && ageMs > 7 * 60 * 1000 ? 'STALE' : lastScanAt ? 'ONLINE' : 'STALE';
  return {
    scanStatus,
    lastScanAt,
    ageSeconds: Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 1000)) : null,
    marketOpen,
    session,
    error,
    positionsReviewed: status.positionsReviewed ?? status.positions_reviewed ?? 0,
    notificationsSent: status.notificationsSent ?? status.notifications_sent ?? 0,
    updatedAt: status.updatedAt || status.updated_at || null
  };
}

export class ScanPersistence {
  constructor(settings = config.database) {
    this.pool = settings?.url ? new Pool({
      connectionString: settings.url,
      ssl: settings.ssl ? { rejectUnauthorized: false } : false
    }) : null;
    this.ready = null;
  }

  async initialize() {
    if (!this.pool || this.ready) return this.ready;
    this.ready = this.pool.query(`
      CREATE TABLE IF NOT EXISTS scan_runs (
        id TEXT PRIMARY KEY,
        mode TEXT,
        status TEXT,
        label TEXT,
        symbols_scanned INTEGER DEFAULT 0,
        chains_collected INTEGER DEFAULT 0,
        candidates_evaluated INTEGER DEFAULT 0,
        ready_green_count INTEGER DEFAULT 0,
        candidate_count INTEGER DEFAULT 0,
        watchlist_count INTEGER DEFAULT 0,
        data_error_count INTEGER DEFAULT 0,
        top_rejection_reasons JSONB DEFAULT '[]'::jsonb,
        provider_health JSONB DEFAULT '[]'::jsonb,
        ai_status JSONB,
        decision_reasons JSONB DEFAULT '[]'::jsonb,
        worker TEXT,
        timestamp TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS green_signals (
        id TEXT PRIMARY KEY,
        scan_run_id TEXT,
        payload JSONB NOT NULL,
        symbol TEXT,
        strategy TEXT,
        score NUMERIC,
        pop NUMERIC,
        status TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS push_events (
        id TEXT PRIMARY KEY,
        signal_id TEXT,
        type TEXT,
        payload JSONB,
        result JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS worker_status (
        id TEXT PRIMARY KEY DEFAULT 'scanner',
        last_scan_at TIMESTAMPTZ,
        scan_status TEXT DEFAULT 'STALE',
        last_run_id TEXT,
        last_error JSONB,
        positions_reviewed INTEGER DEFAULT 0,
        notifications_sent INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS latest_scan_payload (
        id TEXT PRIMARY KEY DEFAULT 'latest',
        scan_run_id TEXT,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS discarded_signals (
        id TEXT PRIMARY KEY,
        scan_run_id TEXT,
        symbol TEXT,
        strategy TEXT,
        status TEXT,
        reasons JSONB DEFAULT '[]'::jsonb,
        payload JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS risk_reviews (
        id TEXT PRIMARY KEY,
        position_id TEXT,
        symbol TEXT,
        risk_score NUMERIC,
        status TEXT,
        action TEXT,
        payload JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    return this.ready;
  }

  async saveScan(scan, meta = {}) {
    const run = scanRunFrom(scan, meta);
    const green = readyGreenSignals(scan);
    if (!this.pool) {
      const runs = await readJson('scan-runs.json', []);
      runs.unshift(run);
      await writeJson('scan-runs.json', runs.slice(0, 500));
      await writeJson('latest-scan.json', { run, scan });
      if (green.length) {
        const signals = await readJson('green-signals.json', []);
        for (const signal of green) {
          signals.unshift({
            id: signal.id || `${signal.symbol}-${signal.strategy}-${signal.expiration}`,
            scanRunId: run.id,
            symbol: signal.symbol,
            strategy: signal.strategy,
            status: signal.status,
            score: signal.confidenceScore ?? signal.score,
            pop: signal.pop,
            payload: signal,
            createdAt: run.timestamp
          });
        }
        await writeJson('green-signals.json', signals.slice(0, 300));
      }
      const discarded = await readJson('discarded-signals.json', []);
      discarded.unshift(...discardedSignalsFrom(scan).map((item) => ({ ...item, scanRunId: run.id, createdAt: run.timestamp })));
      await writeJson('discarded-signals.json', discarded.slice(0, 1000));
      await this.saveWorkerStatus(workerStatusFromRun(run, meta));
      return run;
    }
    await this.initialize();
    await this.pool.query(
      `INSERT INTO scan_runs
        (id, mode, status, label, symbols_scanned, chains_collected, candidates_evaluated, ready_green_count,
         candidate_count, watchlist_count, data_error_count, top_rejection_reasons, provider_health,
         ai_status, decision_reasons, worker, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO NOTHING`,
      [run.id, run.mode, run.status, run.label, run.symbolsScanned, run.chainsCollected, run.candidatesEvaluated,
        run.readyGreenCount, run.candidateCount, run.watchlistCount, run.dataErrorCount, JSON.stringify(run.topRejectionReasons),
        JSON.stringify(run.providerHealth), JSON.stringify(run.aiStatus || {}), JSON.stringify(run.decisionReasons),
        run.worker, run.timestamp]
    );
    for (const signal of green) {
      const id = signal.id || `${signal.symbol}-${signal.strategy}-${signal.expiration}`;
      await this.pool.query(
        `INSERT INTO green_signals(id, scan_run_id, payload, symbol, strategy, score, pop, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, status=EXCLUDED.status`,
        [id, run.id, JSON.stringify(signal), signal.symbol, signal.strategy, signal.confidenceScore ?? signal.score, signal.pop, signal.status]
      );
    }
    await this.pool.query(
      `INSERT INTO latest_scan_payload(id, scan_run_id, payload, updated_at)
       VALUES ('latest',$1,$2,NOW())
       ON CONFLICT (id) DO UPDATE SET scan_run_id=EXCLUDED.scan_run_id, payload=EXCLUDED.payload, updated_at=NOW()`,
      [run.id, JSON.stringify(scan)]
    );
    for (const signal of discardedSignalsFrom(scan)) {
      await this.pool.query(
        `INSERT INTO discarded_signals(id, scan_run_id, symbol, strategy, status, reasons, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET reasons=EXCLUDED.reasons, payload=EXCLUDED.payload, status=EXCLUDED.status`,
        [signal.id, run.id, signal.symbol, signal.strategy, signal.status, JSON.stringify(signal.reasons), JSON.stringify(signal.payload)]
      );
    }
    await this.saveWorkerStatus(workerStatusFromRun(run, meta));
    return run;
  }

  async saveWorkerStatus(status = {}) {
    const normalized = workerStatusFromRun({}, status);
    if (!this.pool) {
      await writeJson('worker-status.json', normalized);
      return normalized;
    }
    await this.initialize();
    await this.pool.query(
      `INSERT INTO worker_status(id, last_scan_at, scan_status, last_run_id, last_error, positions_reviewed, notifications_sent, updated_at)
       VALUES ('scanner',$1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (id) DO UPDATE SET last_scan_at=EXCLUDED.last_scan_at, scan_status=EXCLUDED.scan_status,
       last_run_id=EXCLUDED.last_run_id, last_error=EXCLUDED.last_error, positions_reviewed=EXCLUDED.positions_reviewed,
       notifications_sent=EXCLUDED.notifications_sent, updated_at=NOW()`,
      [normalized.lastScanAt, normalized.scanStatus, normalized.lastRunId, JSON.stringify(normalized.lastError || null),
        normalized.positionsReviewed, normalized.notificationsSent]
    );
    return normalized;
  }

  async saveWorkerError(error, meta = {}) {
    return this.saveWorkerStatus({
      scanStatus: 'ERROR',
      lastScanAt: meta.lastScanAt || new Date().toISOString(),
      lastRunId: meta.lastRunId || null,
      error: { message: error?.message || String(error), at: new Date().toISOString(), stack: error?.stack?.slice?.(0, 1200) || null },
      positionsReviewed: meta.positionsReviewed || 0,
      notificationsSent: meta.notificationsSent || 0
    });
  }

  async workerHealth() {
    if (!this.pool) return healthFromStatus(await readJson('worker-status.json', {}));
    await this.initialize();
    const result = await this.pool.query('SELECT * FROM worker_status WHERE id=$1', ['scanner']);
    return healthFromStatus(result.rows[0] || {});
  }

  async latestScanPayload() {
    if (!this.pool) return readJson('latest-scan.json', null);
    await this.initialize();
    const payload = await this.pool.query('SELECT payload, scan_run_id AS "scanRunId", updated_at AS "updatedAt" FROM latest_scan_payload WHERE id=$1', ['latest']);
    if (payload.rows[0]) return { scan: payload.rows[0].payload, run: { id: payload.rows[0].scanRunId, timestamp: payload.rows[0].updatedAt } };
    const result = await this.pool.query('SELECT * FROM scan_runs ORDER BY timestamp DESC LIMIT 1');
    const row = result.rows[0];
    if (!row) return null;
    return { run: row, scan: null };
  }

  async saveRiskReviews(reviews = []) {
    if (!reviews.length) return [];
    if (!this.pool) {
      const current = await readJson('risk-reviews.json', []);
      current.unshift(...reviews);
      await writeJson('risk-reviews.json', current.slice(0, 1000));
      return reviews;
    }
    await this.initialize();
    for (const review of reviews) {
      await this.pool.query(
        `INSERT INTO risk_reviews(id, position_id, symbol, risk_score, status, action, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, risk_score=EXCLUDED.risk_score, status=EXCLUDED.status, action=EXCLUDED.action`,
        [review.id, review.positionId, review.symbol, review.riskScore, review.status, review.action, JSON.stringify(review.payload || review)]
      );
    }
    return reviews;
  }

  async recordPushEvent(event = {}) {
    const id = event.id || `push-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (!this.pool) {
      const current = await readJson('push-events.json', []);
      current.unshift({ ...event, id, createdAt: new Date().toISOString() });
      await writeJson('push-events.json', current.slice(0, 1000));
      return { ...event, id };
    }
    await this.initialize();
    await this.pool.query(
      `INSERT INTO push_events(id, signal_id, type, payload, result)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [id, event.signalId || null, event.type || null, JSON.stringify(event.payload || {}), JSON.stringify(event.result || {})]
    );
    return { ...event, id };
  }

  async latest() {
    if (!this.pool) return readJson('latest-scan.json', null);
    await this.initialize();
    const result = await this.pool.query('SELECT * FROM scan_runs ORDER BY timestamp DESC LIMIT 1');
    return result.rows[0] || null;
  }

  async diagnostics(scan = null) {
    const latest = scan ? { scan, run: scanRunFrom(scan) } : await this.latest();
    const sourceScan = latest?.scan || scan || {};
    const run = latest?.run || latest || scanRunFrom(sourceScan);
    return {
      ok: true,
      lastScan: run.timestamp || sourceScan.asOf || null,
      symbolsScanned: run.symbolsScanned || sourceScan.collection?.scannedSymbols || 0,
      candidatesEvaluated: run.candidatesEvaluated || (sourceScan.rejected || []).length + (sourceScan.opportunities || []).length,
      readyGreen: run.readyGreenCount || readyGreenSignals(sourceScan).length,
      topRejectionReasons: run.topRejectionReasons || summarizeReasons(sourceScan),
      restrictiveFilters: (run.topRejectionReasons || summarizeReasons(sourceScan)).slice(0, 5),
      providerHealth: sourceScan.providers || run.providerHealth || [],
      gemini: sourceScan.aiGuardian || sourceScan.aiStatus || run.aiStatus || null,
      webPush: sourceScan.agent?.webPush || null,
      nextPossibleWindow: '10:00-11:30 ET or 13:30-15:15 ET if price, risk, liquidity and event gates align.',
      whatMustChange: (run.topRejectionReasons || summarizeReasons(sourceScan)).slice(0, 5).map((item) => item.reason)
    };
  }
}

export const scanPersistence = new ScanPersistence(config.database);
