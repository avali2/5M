import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from '../config.js';
import { readyGreenSignals } from '../engine/greenSignalPolicy.js';

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
      CREATE TABLE IF NOT EXISTS latest_scan_state (
        service_name TEXT PRIMARY KEY,
        scan_run_id TEXT,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS scanner_worker_state (
        service_name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        last_heartbeat_at TIMESTAMPTZ,
        last_scan_at TIMESTAMPTZ,
        last_success_at TIMESTAMPTZ,
        last_error TEXT,
        payload JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS position_risk_snapshots (
        id TEXT PRIMARY KEY,
        status TEXT,
        positions_reviewed INTEGER DEFAULT 0,
        critical_count INTEGER DEFAULT 0,
        average_risk_score NUMERIC,
        payload JSONB NOT NULL,
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
    await this.pool.query(
      `INSERT INTO latest_scan_state(service_name,scan_run_id,payload,updated_at)
       VALUES($1,$2,$3,NOW())
       ON CONFLICT(service_name) DO UPDATE SET scan_run_id=EXCLUDED.scan_run_id,payload=EXCLUDED.payload,updated_at=NOW()`,
      ['scanner-worker', run.id, JSON.stringify(scan)]
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
    return run;
  }

  async latest() {
    if (!this.pool) return readJson('latest-scan.json', null);
    await this.initialize();
    const state = await this.pool.query(
      `SELECT scan_run_id AS "scanRunId",payload AS scan,updated_at AS "updatedAt"
       FROM latest_scan_state WHERE service_name=$1`,
      ['scanner-worker']
    );
    if (state.rows[0]?.scan) return state.rows[0];
    const result = await this.pool.query('SELECT * FROM scan_runs ORDER BY timestamp DESC LIMIT 1');
    return result.rows[0] ? { run: result.rows[0], scan: null } : null;
  }

  async saveWorkerState(state = {}) {
    const value = {
      serviceName: state.serviceName || 'scanner-worker',
      status: state.status || 'ONLINE',
      lastHeartbeatAt: state.lastHeartbeatAt || new Date().toISOString(),
      lastScanAt: state.lastScanAt || null,
      lastSuccessAt: state.lastSuccessAt || null,
      lastError: state.lastError || null,
      payload: state.payload || {}
    };
    if (!this.pool) {
      await writeJson('scanner-worker-state.json', value);
      return value;
    }
    await this.initialize();
    await this.pool.query(
      `INSERT INTO scanner_worker_state(service_name,status,last_heartbeat_at,last_scan_at,last_success_at,last_error,payload,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT(service_name) DO UPDATE SET status=EXCLUDED.status,last_heartbeat_at=EXCLUDED.last_heartbeat_at,
       last_scan_at=COALESCE(EXCLUDED.last_scan_at,scanner_worker_state.last_scan_at),
       last_success_at=COALESCE(EXCLUDED.last_success_at,scanner_worker_state.last_success_at),
       last_error=EXCLUDED.last_error,payload=EXCLUDED.payload,updated_at=NOW()`,
      [value.serviceName, value.status, value.lastHeartbeatAt, value.lastScanAt, value.lastSuccessAt, value.lastError, JSON.stringify(value.payload)]
    );
    return value;
  }

  async workerState(serviceName = 'scanner-worker', { marketOpen = true } = {}) {
    let value;
    if (!this.pool) {
      value = await readJson('scanner-worker-state.json', null);
    } else {
      await this.initialize();
      const result = await this.pool.query(
        `SELECT service_name AS "serviceName",status,last_heartbeat_at AS "lastHeartbeatAt",
         last_scan_at AS "lastScanAt",last_success_at AS "lastSuccessAt",last_error AS "lastError",payload
         FROM scanner_worker_state WHERE service_name=$1`,
        [serviceName]
      );
      value = result.rows[0] || null;
    }
    if (!value) return { status: 'STALE', reason: 'Worker has not reported yet.', lastScanAt: null };
    const heartbeat = new Date(value.lastHeartbeatAt || 0).getTime();
    const stale = !Number.isFinite(heartbeat) || Date.now() - heartbeat > 7 * 60 * 1000;
    return { ...value, status: value.status === 'ERROR' ? 'ERROR' : marketOpen && stale ? 'STALE' : 'ONLINE', stale: marketOpen && stale };
  }

  async savePositionRisk(analysis = {}, meta = {}) {
    const value = {
      id: meta.id || `risk-${Date.now()}`,
      status: analysis.status || 'NO_OPEN_POSITIONS',
      positionsReviewed: analysis.summary?.total || 0,
      criticalCount: analysis.summary?.critical || 0,
      averageRiskScore: analysis.summary?.averageRiskScore || 0,
      payload: analysis,
      createdAt: new Date().toISOString()
    };
    if (!this.pool) {
      const rows = await readJson('position-risk-snapshots.json', []);
      rows.unshift(value);
      await writeJson('position-risk-snapshots.json', rows.slice(0, 500));
      return value;
    }
    await this.initialize();
    await this.pool.query(
      `INSERT INTO position_risk_snapshots(id,status,positions_reviewed,critical_count,average_risk_score,payload,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [value.id, value.status, value.positionsReviewed, value.criticalCount, value.averageRiskScore, JSON.stringify(value.payload), value.createdAt]
    );
    return value;
  }

  async pushRecentlySent(signalId, type = 'READY_GREEN', cooldownMs = 45 * 60 * 1000) {
    const cutoff = new Date(Date.now() - cooldownMs);
    if (!this.pool) {
      const rows = await readJson('push-events.json', []);
      return rows.some((row) => row.signalId === signalId && row.type === type && new Date(row.createdAt) >= cutoff);
    }
    await this.initialize();
    const result = await this.pool.query(
      `SELECT 1 FROM push_events WHERE signal_id=$1 AND type=$2 AND created_at >= $3 LIMIT 1`,
      [signalId, type, cutoff.toISOString()]
    );
    return result.rowCount > 0;
  }

  async recordPush({ signalId, type = 'READY_GREEN', payload = {}, result = {} } = {}) {
    const value = { id: `push-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, signalId, type, payload, result, createdAt: new Date().toISOString() };
    if (!this.pool) {
      const rows = await readJson('push-events.json', []);
      rows.unshift(value);
      await writeJson('push-events.json', rows.slice(0, 1000));
      return value;
    }
    await this.initialize();
    await this.pool.query(
      `INSERT INTO push_events(id,signal_id,type,payload,result,created_at) VALUES($1,$2,$3,$4,$5,$6)`,
      [value.id, value.signalId, value.type, JSON.stringify(value.payload), JSON.stringify(value.result), value.createdAt]
    );
    return value;
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
