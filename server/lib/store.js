import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import { buildLearningSummary } from './learning.js';

const legacyFilePath = path.join(config.dataDir, 'store.json');
const databasePath = config.nodeEnv === 'test' ? ':memory:' : path.join(config.dataDir, 'five-millions.sqlite');
const FEEDBACK_ACTIONS = new Set(['TAKEN', 'SKIPPED', 'WIN', 'LOSS', 'BREAKEVEN']);
let database = null;

function json(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function initializeSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      subscription_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS notified_signals (
      signal_id TEXT PRIMARY KEY,
      notified_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS scans (
      scan_id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      source TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      market_risk_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS signal_instances (
      instance_id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      symbol TEXT NOT NULL,
      strategy TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      status TEXT NOT NULL,
      score REAL,
      pop_estimate REAL,
      short_delta REAL,
      dte INTEGER,
      entry_credit REAL,
      max_risk_usd REAL,
      payload_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS signal_feedback (
      feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('TAKEN','SKIPPED','WIN','LOSS','BREAKEVEN')),
      entry_credit REAL,
      exit_debit REAL,
      pnl_usd REAL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(instance_id) REFERENCES signal_instances(instance_id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_scans_generated_at ON scans(generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_signal_instances_symbol ON signal_instances(symbol, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_signal_instances_signal_id ON signal_instances(signal_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_feedback_instance ON signal_feedback(instance_id, created_at DESC);
  `);
}

function setState(db, key, value) {
  db.prepare(`INSERT INTO app_state(key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
    .run(key, json(value), new Date().toISOString());
}

function insertScan(db, scan) {
  const scanId = String(scan.id);
  db.prepare(`INSERT INTO scans(scan_id, generated_at, source, summary_json, market_risk_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scan_id) DO UPDATE SET generated_at=excluded.generated_at, source=excluded.source,
      summary_json=excluded.summary_json, market_risk_json=excluded.market_risk_json`)
    .run(scanId, String(scan.generatedAt), String(scan.source || 'Tradier'), json(scan.summary), json(scan.marketRisk));
  const insertSignal = db.prepare(`INSERT INTO signal_instances(
      instance_id, scan_id, signal_id, generated_at, symbol, strategy, profile_id, status, score,
      pop_estimate, short_delta, dte, entry_credit, max_risk_usd, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_id) DO UPDATE SET status=excluded.status, payload_json=excluded.payload_json`);
  for (const signal of scan.signals || []) {
    const instanceId = String(signal.instanceId || `${scanId}:${signal.id}`);
    insertSignal.run(
      instanceId, scanId, String(signal.id), String(signal.generatedAt || scan.generatedAt), String(signal.symbol || ''),
      String(signal.strategy || ''), String(signal.profile?.id || 'CORE'), String(signal.status || 'WATCH'),
      Number.isFinite(Number(signal.score)) ? Number(signal.score) : null,
      Number.isFinite(Number(signal.popEstimate)) ? Number(signal.popEstimate) : null,
      Number.isFinite(Number(signal.shortDelta)) ? Number(signal.shortDelta) : null,
      Number.isFinite(Number(signal.dte)) ? Math.trunc(Number(signal.dte)) : null,
      Number.isFinite(Number(signal.credit)) ? Number(signal.credit) : null,
      Number.isFinite(Number(signal.maxRiskUsd)) ? Number(signal.maxRiskUsd) : null,
      json({ ...signal, instanceId })
    );
  }
  setState(db, 'latest_scan', scan);
}

function migrateLegacy(db) {
  if (config.nodeEnv === 'test') return;
  const migration = db.prepare('SELECT value_json FROM app_state WHERE key = ?').get('legacy_store_migrated');
  if (migration) return;
  if (fs.existsSync(legacyFilePath)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyFilePath, 'utf8'));
      const now = new Date().toISOString();
      const insertSubscription = db.prepare('INSERT OR IGNORE INTO push_subscriptions(endpoint, subscription_json, created_at, updated_at) VALUES (?, ?, ?, ?)');
      for (const subscription of Array.isArray(legacy.subscriptions) ? legacy.subscriptions : []) {
        if (subscription?.endpoint) insertSubscription.run(String(subscription.endpoint), json(subscription), now, now);
      }
      const insertNotified = db.prepare('INSERT OR IGNORE INTO notified_signals(signal_id, notified_at) VALUES (?, ?)');
      for (const signalId of Array.isArray(legacy.notifiedSignalIds) ? legacy.notifiedSignalIds : []) insertNotified.run(String(signalId), now);
      if (legacy.latestScan?.id) insertScan(db, legacy.latestScan);
    } catch (error) {
      console.warn(`[5M] No se pudo migrar store.json a SQLite: ${error.message}`);
    }
  }
  setState(db, 'legacy_store_migrated', { at: new Date().toISOString(), source: fs.existsSync(legacyFilePath) ? 'store.json' : 'none' });
}

function getDatabase() {
  if (database) return database;
  if (databasePath !== ':memory:') fs.mkdirSync(config.dataDir, { recursive: true });
  database = new DatabaseSync(databasePath);
  initializeSchema(database);
  migrateLegacy(database);
  return database;
}

function prune(db) {
  db.prepare('DELETE FROM scans WHERE scan_id NOT IN (SELECT scan_id FROM scans ORDER BY generated_at DESC LIMIT ?)')
    .run(config.learning.historyLimit);
  db.prepare(`DELETE FROM signal_instances
    WHERE instance_id NOT IN (SELECT instance_id FROM signal_instances ORDER BY generated_at DESC LIMIT ?)
      AND instance_id NOT IN (SELECT DISTINCT instance_id FROM signal_feedback)`)
    .run(config.learning.signalRetention);
  db.prepare('DELETE FROM notified_signals WHERE signal_id NOT IN (SELECT signal_id FROM notified_signals ORDER BY notified_at DESC LIMIT 500)').run();
}

export async function addSubscription(subscription) {
  const endpoint = String(subscription?.endpoint || '');
  if (!endpoint) throw new Error('Suscripción push inválida: falta endpoint.');
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO push_subscriptions(endpoint, subscription_json, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET subscription_json=excluded.subscription_json, updated_at=excluded.updated_at`)
    .run(endpoint, json(subscription), now, now);
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint NOT IN (SELECT endpoint FROM push_subscriptions ORDER BY updated_at DESC LIMIT 20)').run();
  return Number(db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').get().count);
}

export async function removeSubscription(endpoint) {
  getDatabase().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(endpoint || ''));
}

export async function getSubscriptions() {
  return getDatabase().prepare('SELECT subscription_json FROM push_subscriptions ORDER BY updated_at DESC').all()
    .map((row) => parseJson(row.subscription_json)).filter(Boolean);
}

export async function markSignalNotified(signalId) {
  getDatabase().prepare(`INSERT INTO notified_signals(signal_id, notified_at) VALUES (?, ?)
    ON CONFLICT(signal_id) DO UPDATE SET notified_at=excluded.notified_at`)
    .run(String(signalId), new Date().toISOString());
}

export async function wasSignalNotified(signalId) {
  return Boolean(getDatabase().prepare('SELECT 1 AS found FROM notified_signals WHERE signal_id = ?').get(String(signalId)));
}

export async function saveScan(scan) {
  const db = getDatabase();
  transaction(db, () => {
    insertScan(db, scan);
    prune(db);
  });
  return scan;
}

export async function getLatestScan() {
  const row = getDatabase().prepare('SELECT value_json FROM app_state WHERE key = ?').get('latest_scan');
  return parseJson(row?.value_json, null);
}

export async function getPortfolioState() {
  const row = getDatabase().prepare('SELECT value_json FROM app_state WHERE key = ?').get('portfolio_state');
  return parseJson(row?.value_json, { cashAvailableUsd: 0, sharesBySymbol: {}, updatedAt: null });
}

export async function savePortfolioState(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('El colateral debe enviarse como un objeto.');
  }
  const cashValue = input.cashAvailableUsd;
  const cash = Number(cashValue);
  if (cashValue === null || cashValue === undefined || String(cashValue).trim() === '' || !Number.isFinite(cash) || cash < 0 || cash > 1000000000) {
    throw new Error('El efectivo libre debe ser un número entre $0 y $1,000,000,000.');
  }
  const rawShares = input.sharesBySymbol ?? {};
  if (!rawShares || typeof rawShares !== 'object' || Array.isArray(rawShares)) {
    throw new Error('Las acciones libres deben enviarse como un mapa por símbolo.');
  }
  const entries = Object.entries(rawShares);
  if (entries.length > 100) throw new Error('Registra como máximo 100 símbolos.');
  const sharesBySymbol = {};
  for (const [rawSymbol, rawCount] of entries) {
    const symbol = String(rawSymbol).trim().toUpperCase();
    const count = Number(rawCount);
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol) || !Number.isSafeInteger(count) || count < 0 || count > 1000000) {
      throw new Error(`Cantidad de acciones inválida para ${symbol || 'símbolo'}. Usa un ticker válido y acciones enteras no negativas.`);
    }
    if (count > 0) sharesBySymbol[symbol] = count;
  }
  const portfolioState = {
    cashAvailableUsd: Math.round(cash * 100) / 100,
    sharesBySymbol,
    updatedAt: new Date().toISOString()
  };
  setState(getDatabase(), 'portfolio_state', portfolioState);
  return portfolioState;
}

export async function getScanHistory(limit = 30) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
  return getDatabase().prepare('SELECT scan_id, generated_at, source, summary_json, market_risk_json FROM scans ORDER BY generated_at DESC LIMIT ?')
    .all(safeLimit).map((row) => ({ id: row.scan_id, generatedAt: row.generated_at, source: row.source, summary: parseJson(row.summary_json, {}), marketRisk: parseJson(row.market_risk_json, {}) }));
}

export async function saveSignalFeedback({ instanceId, signalId, action, entryCredit = null, exitDebit = null, pnlUsd = null, notes = '' } = {}) {
  const db = getDatabase();
  const normalizedAction = String(action || '').toUpperCase();
  if (!FEEDBACK_ACTIONS.has(normalizedAction)) throw new Error('Resultado inválido. Usa TAKEN, SKIPPED, WIN, LOSS o BREAKEVEN.');
  let instance = instanceId ? db.prepare('SELECT instance_id, signal_id FROM signal_instances WHERE instance_id = ?').get(String(instanceId)) : null;
  if (!instance && signalId) instance = db.prepare('SELECT instance_id, signal_id FROM signal_instances WHERE signal_id = ? ORDER BY generated_at DESC LIMIT 1').get(String(signalId));
  if (!instance) throw new Error('No se encontró la instancia de señal. Actualiza la app y vuelve a intentarlo.');
  const numberOrNull = (value) => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const result = db.prepare(`INSERT INTO signal_feedback(instance_id, signal_id, action, entry_credit, exit_debit, pnl_usd, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(instance.instance_id, instance.signal_id, normalizedAction, numberOrNull(entryCredit), numberOrNull(exitDebit), numberOrNull(pnlUsd), String(notes || '').slice(0, 500), new Date().toISOString());
  return { ok: true, feedbackId: Number(result.lastInsertRowid), instanceId: instance.instance_id, signalId: instance.signal_id, action: normalizedAction };
}

export async function getLearningSummary() {
  if (!config.learning.enabled) return { enabled: false, message: 'Aprendizaje desactivado.' };
  const rows = getDatabase().prepare(`SELECT
      si.instance_id AS instanceId, si.signal_id AS signalId, si.symbol, si.strategy,
      si.profile_id AS profileId, si.score, si.pop_estimate AS popEstimate,
      si.short_delta AS shortDelta, si.dte, si.generated_at AS signalAt,
      sf.action, sf.pnl_usd AS pnlUsd, sf.created_at AS feedbackAt
    FROM signal_feedback sf JOIN signal_instances si ON si.instance_id = sf.instance_id
    ORDER BY sf.created_at ASC`).all();
  return buildLearningSummary(rows, { minimumValidatedSamples: config.learning.minimumValidatedSamples });
}

export async function getStoreStatus() {
  const db = getDatabase();
  const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  const latest = db.prepare('SELECT scan_id FROM scans ORDER BY generated_at DESC LIMIT 1').get();
  return {
    provider: 'sqlite',
    durable: databasePath !== ':memory:',
    databaseFile: databasePath === ':memory:' ? ':memory:' : path.basename(databasePath),
    subscriptions: count('push_subscriptions'),
    recentScans: count('scans'),
    signalsStored: count('signal_instances'),
    feedbackEvents: count('signal_feedback'),
    latestScan: latest?.scan_id || null
  };
}
