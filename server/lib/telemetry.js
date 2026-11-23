/**
 * 5M · Telemetría central: todo lo que hacen los bots queda registrado
 * en SQLite (disco persistente) y disponible por API/UI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

let db = null;
const markers = new Map();
let inserted = 0;

function dbFile() {
  try { fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 }); } catch { /* sin disco */ }
  return path.join(config.dataDir, 'telemetry.sqlite');
}

export function openTelemetry() {
  if (db) return db;
  db = new DatabaseSync(dbFile());
  db.exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, module TEXT NOT NULL, level TEXT NOT NULL, type TEXT NOT NULL, message TEXT, data TEXT)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_at ON events (at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_module ON events (module)');
  return db;
}

export function record(event = {}) {
  try {
    const database = openTelemetry();
    const at = event.at || new Date().toISOString();
    database.prepare('INSERT INTO events (at, module, level, type, message, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(at, String(event.module || 'system'), String(event.level || 'info'), String(event.type || 'info'), String(event.message || '').slice(0, 500), event.data ? JSON.stringify(event.data).slice(0, 4000) : null);
    inserted += 1;
    if (inserted % 200 === 0) database.exec('DELETE FROM events WHERE id < (SELECT MAX(id) - 8000)');
    return true;
  } catch { return false; }
}

export function queryEvents(options = {}) {
  try {
    const database = openTelemetry();
    const limit = Math.min(500, Math.max(1, Number(options.limit) || 100));
    const where = [];
    const params = [];
    if (options.module) { where.push('module = ?'); params.push(String(options.module)); }
    if (options.level) { where.push('level = ?'); params.push(String(options.level)); }
    if (options.type) { where.push('type = ?'); params.push(String(options.type)); }
    if (options.since) { where.push('at >= ?'); params.push(String(options.since)); }
    const sql = 'SELECT * FROM events' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY id DESC LIMIT ?';
    params.push(limit);
    return database.prepare(sql).all(...params).map((row) => ({ ...row, data: row.data ? JSON.parse(row.data) : null }));
  } catch {
    return [];
  }
}

export function telemetryStats() {
  try {
    const database = openTelemetry();
    const since = new Date(Date.now() - 24 * 3600000).toISOString();
    const total = Number(database.prepare('SELECT COUNT(*) AS n FROM events').get()?.n || 0);
    const last24 = Number(database.prepare('SELECT COUNT(*) AS n FROM events WHERE at >= ?').get(since)?.n || 0);
    const errors = Number(database.prepare('SELECT COUNT(*) AS n FROM events WHERE level = ? AND at >= ?').get('error', since)?.n || 0);
    const byModule = database.prepare('SELECT module, COUNT(*) AS n FROM events WHERE at >= ? GROUP BY module ORDER BY n DESC').all(since);
    const byType = database.prepare('SELECT type, COUNT(*) AS n FROM events WHERE at >= ? GROUP BY type ORDER BY n DESC').all(since);
    const last = database.prepare('SELECT module, at FROM events ORDER BY id DESC LIMIT 1').get();
    return { total, last24, errors24: errors, byModule, byType, lastEventAt: last?.at || null };
  } catch {
    return { total: 0, last24: 0, errors24: 0, byModule: [], byType: [], lastEventAt: null };
  }
}

function newTrades(instance) {
  const history = instance.state && Array.isArray(instance.state.history) ? instance.state.history : [];
  return history;
}

export function collect({ bots = {}, cryptoPaper = null, orchestrator = null } = {}) {
  const now = new Date().toISOString();
  for (const [mode, instance] of Object.entries(bots)) {
    const moduleName = 'bot:' + mode;
    const status = instance.status();
    const marker = markers.get(moduleName) || { trades: 0, position: null, armed: null, gates: null, logAt: 0, lessonsAt: 0, config: null };
    const history = newTrades(instance);
    const configHash = JSON.stringify(instance.getConfig ? instance.getConfig() : {});
    if (marker.armed === null) {
      record({ module: moduleName, type: 'info', message: 'Bot ' + mode + ' inicializado (armed=' + Boolean(status.armed) + ', gates=' + Boolean(status.gates?.ok) + ').', at: now });
    } else {
      if (marker.armed !== Boolean(status.armed)) record({ module: moduleName, type: 'state', message: 'Armado: ' + Boolean(status.armed), at: now });
      if (marker.gates !== Boolean(status.gates?.ok)) record({ module: moduleName, level: status.gates?.ok ? 'info' : 'warn', type: 'gate', message: 'Gates: ' + (status.gates?.ok ? 'OK' : 'incompletos'), at: now });
    }
    if (marker.config !== null && marker.config !== configHash) record({ module: moduleName, type: 'config', message: 'Configuración modificada.', at: now });
    for (const trade of history.slice(marker.trades)) {
      record({ module: moduleName, type: 'exit', level: trade.realizedUsd > 0 ? 'info' : 'warn', message: (trade.strategy || 'trade') + ' cerrado por ' + (trade.closeReason || '—') + ': ' + (trade.realizedUsd ?? 0) + ' USD', data: { strategy: trade.strategy, pnl: trade.realizedUsd, capture: trade.premiumCapturePct, mae: trade.maePctOfCredit }, at: trade.closedAt || now });
    }
    const position = status.position;
    const positionKey = position ? (position.orderId || position.openedAt) : null;
    if (position && positionKey !== marker.position) record({ module: moduleName, type: 'entry', message: (position.strategy || '') + ' abierto · crédito ' + (position.credit ?? '—') + ' · riesgo ' + (position.riskUsd ?? '—'), data: { strategy: position.strategy, credit: position.credit, contracts: position.contracts }, at: position.openedAt || now });
    if (!position && marker.position) record({ module: moduleName, type: 'exit', message: 'Posición cerrada.', at: now });
    const botLog = instance.state && Array.isArray(instance.state.log) ? instance.state.log : [];
    for (const entry of botLog) {
      const at = Date.parse(entry.at || '');
      if (!Number.isFinite(at) || at <= marker.logAt) continue;
      record({ module: moduleName, level: entry.type === 'ERROR' ? 'error' : 'info', type: String(entry.type || 'log').toLowerCase(), message: entry.note || entry.text || entry.strategy || entry.type, data: entry, at: entry.at });
      marker.logAt = Math.max(marker.logAt, at);
    }
    const lessons = instance.state && Array.isArray(instance.state.lessons) ? instance.state.lessons : [];
    for (const lesson of lessons) {
      const at = Date.parse(lesson.at || '');
      if (!Number.isFinite(at) || at <= marker.lessonsAt) continue;
      record({ module: moduleName, type: 'ai', message: 'Lección IA (' + (lesson.provider || 'ia') + '): ' + String(lesson.text || '').slice(0, 180), at: lesson.at });
      marker.lessonsAt = Math.max(marker.lessonsAt, at);
    }
    markers.set(moduleName, { trades: history.length, position: positionKey, armed: Boolean(status.armed), gates: Boolean(status.gates?.ok), logAt: marker.logAt, lessonsAt: marker.lessonsAt, config: configHash });
  }
  if (cryptoPaper) {
    const status = cryptoPaper.status();
    const marker = markers.get('crypto') || { trades: 0, position: null, armed: null, logAt: 0, config: null };
    const history = cryptoPaper.state && Array.isArray(cryptoPaper.state.history) ? cryptoPaper.state.history : [];
    if (marker.armed === null) record({ module: 'crypto', type: 'info', message: 'Crypto SOL inicializado (armed=' + Boolean(status.armed) + ').', at: now });
    else if (marker.armed !== Boolean(status.armed)) record({ module: 'crypto', type: 'state', message: 'Armado: ' + Boolean(status.armed), at: now });
    for (const trade of history.slice(marker.trades)) record({ module: 'crypto', type: 'exit', level: trade.realizedUsd > 0 ? 'info' : 'warn', message: (trade.side || '') + ' cerrado por ' + (trade.closeReason || '—') + ': ' + (trade.realizedUsd ?? 0) + ' USD', data: { side: trade.side, pnl: trade.realizedUsd }, at: trade.closedAt || now });
    const position = status.position;
    const key = position ? position.openedAt : null;
    if (position && key !== marker.position) record({ module: 'crypto', type: 'entry', message: (position.side || '') + ' SOL en ' + position.entry + ' · stop ' + position.stop + ' · objetivo ' + position.target, data: position, at: position.openedAt || now });
    if (!position && marker.position) record({ module: 'crypto', type: 'exit', message: 'Posición crypto cerrada.', at: now });
    const log = cryptoPaper.state && Array.isArray(cryptoPaper.state.log) ? cryptoPaper.state.log : [];
    for (const entry of log) {
      const at = Date.parse(entry.at || '');
      if (!Number.isFinite(at) || at <= marker.logAt) continue;
      record({ module: 'crypto', type: String(entry.type || 'log').toLowerCase(), message: entry.note || entry.text || entry.type, data: entry, at: entry.at });
      marker.logAt = Math.max(marker.logAt || 0, at);
    }
    markers.set('crypto', { trades: history.length, position: key, armed: Boolean(status.armed), logAt: marker.logAt || 0, config: marker.config });
  }
  if (orchestrator) {
    const alerts = orchestrator.state && Array.isArray(orchestrator.state.alerts) ? orchestrator.state.alerts : [];
    const marker = markers.get('orchestrator') || { alerts: 0 };
    for (const alert of alerts.slice(0, Math.max(0, alerts.length - marker.alerts)).reverse()) {
      record({ module: 'orchestrator', level: alert.kind === 'RIESGO' ? 'warn' : 'info', type: String(alert.kind || 'info').toLowerCase(), message: alert.message, at: alert.at });
    }
    markers.set('orchestrator', { alerts: alerts.length });
  }
  return true;
}
