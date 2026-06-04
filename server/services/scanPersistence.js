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
