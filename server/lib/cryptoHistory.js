/**
 * 5M · Históricos crypto en SQLite (disco persistente /var/data).
 * Descarga velas de Binance.US por paginación y las guarda para consultas offline
 * y para validar señales con datos propios.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const BINANCE_US = 'https://api.binance.us/api/v3';
const INTERVALS = { '1h': 3600000, '1d': 86400000, '15m': 900000 };

let db = null;
let syncState = { running: false, startedAt: null, finishedAt: null, error: null, added: 0 };

function dbPath() {
  try { fs.mkdirSync(config.dataDir, { recursive: true }); } catch { /* sin disco */ }
  return path.join(config.dataDir, 'crypto-history.sqlite');
}

export function openHistory() {
  if (db) return db;
  db = new DatabaseSync(dbPath());
  db.exec('CREATE TABLE IF NOT EXISTS candles (symbol TEXT NOT NULL, interval TEXT NOT NULL, open_time INTEGER NOT NULL, open REAL, high REAL, low REAL, close REAL, volume REAL, PRIMARY KEY (symbol, interval, open_time))');
  db.exec('CREATE INDEX IF NOT EXISTS idx_candles_time ON candles (symbol, interval, open_time)');
  return db;
}

async function fetchKlines(symbol, interval, startTime, endTime, limit = 1000) {
  const url = BINANCE_US + '/klines?symbol=' + encodeURIComponent(symbol) + '&interval=' + interval + '&limit=' + limit + '&startTime=' + startTime + (endTime ? '&endTime=' + endTime : '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Binance.US klines HTTP ' + response.status);
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } finally {
    clearTimeout(timer);
  }
}

export async function syncCryptoHistory(options = {}) {
  const symbol = String(options.symbol || 'SOLUSDT');
  const intervals = options.intervals || ['1h', '1d'];
  const daysByInterval = options.daysByInterval || { '1h': 730, '1d': 1825 };
  const database = openHistory();
  syncState = { running: true, startedAt: new Date().toISOString(), finishedAt: null, error: null, added: 0 };
  try {
    const insert = database.prepare('INSERT OR REPLACE INTO candles (symbol, interval, open_time, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const interval of intervals) {
      const step = INTERVALS[interval] || 3600000;
      const days = daysByInterval[interval] || 365;
      const rowsExisting = database.prepare('SELECT MAX(open_time) AS last FROM candles WHERE symbol = ? AND interval = ?').get(symbol, interval);
      const targetStart = Date.now() - days * 86400000;
      let start = Math.max(targetStart, rowsExisting && rowsExisting.last ? Number(rowsExisting.last) + step : targetStart);
      let guard = 0;
      while (start < Date.now() && guard < 60) {
        guard += 1;
        const rows = await fetchKlines(symbol, interval, start);
        if (!rows.length) break;
        database.exec('BEGIN');
        for (const row of rows) {
          insert.run(symbol, interval, Number(row[0]), Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4]), Number(row[5]));
          syncState.added += 1;
        }
        database.exec('COMMIT');
        const lastOpen = Number(rows[rows.length - 1][0]);
        if (lastOpen + step <= start) break;
        start = lastOpen + step;
        if (rows.length < 1000) break;
      }
    }
    syncState.finishedAt = new Date().toISOString();
    return coverage();
  } catch (error) {
    syncState.error = error.message;
    syncState.finishedAt = new Date().toISOString();
    return coverage();
  } finally {
    syncState.running = false;
  }
}

export function coverage(symbol = 'SOLUSDT') {
  try {
    const database = openHistory();
    const rows = database.prepare('SELECT interval, COUNT(*) AS count, MIN(open_time) AS first, MAX(open_time) AS last FROM candles WHERE symbol = ? GROUP BY interval').all(symbol);
    const total = database.prepare('SELECT COUNT(*) AS count FROM candles WHERE symbol = ?').get(symbol);
    return { ok: true, dbPath: dbPath(), symbol, total: Number(total?.count || 0), intervals: rows.map((row) => ({ interval: row.interval, count: Number(row.count), from: new Date(Number(row.first)).toISOString(), to: new Date(Number(row.last)).toISOString() })), sync: syncState };
  } catch (error) {
    return { ok: false, error: error.message, sync: syncState };
  }
}

export function historyCandles(symbol = 'SOLUSDT', interval = '1h', limit = 500) {
  const database = openHistory();
  return database.prepare('SELECT open_time AS time, open, high, low, close, volume FROM candles WHERE symbol = ? AND interval = ? ORDER BY open_time DESC LIMIT ?').all(symbol, interval, limit).reverse();
}

export function historyStatus() { return coverage(); }
