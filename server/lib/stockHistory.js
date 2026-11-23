/**
 * 5M · Históricos de acciones/índices en SQLite (disco persistente).
 * Fuente: Tradier (producción). Guarda barras diarias para dar contexto
 * histórico a los bots y para aprendizaje offline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import { TradierClient } from './tradier.js';
import { ema, rsi } from './cryptoData.js';

export const STOCK_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'VIX', 'AMD', 'MU', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SOFI', 'PLTR', 'COIN', 'MARA', 'XLK', 'XLF', 'XLE', 'SMH'];

let db = null;
let syncState = { running: false, startedAt: null, finishedAt: null, error: null, added: 0, symbols: 0 };

function dbPath() {
  try { fs.mkdirSync(config.dataDir, { recursive: true }); } catch { /* sin disco */ }
  return path.join(config.dataDir, 'stock-history.sqlite');
}

export function openStockHistory() {
  if (db) return db;
  db = new DatabaseSync(dbPath());
  db.exec('CREATE TABLE IF NOT EXISTS bars (symbol TEXT NOT NULL, time TEXT NOT NULL, open REAL, high REAL, low REAL, close REAL, volume REAL, PRIMARY KEY (symbol, time))');
  db.exec('CREATE INDEX IF NOT EXISTS idx_bars_symbol_time ON bars (symbol, time)');
  return db;
}

export function summarizeBars(bars) {
  const clean = (bars || []).filter((bar) => bar && Number.isFinite(bar.close));
  if (clean.length < 30) return null;
  const closes = clean.map((bar) => bar.close);
  const price = closes[closes.length - 1];
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const returns = [];
  for (let index = Math.max(1, closes.length - 21); index < closes.length; index += 1) returns.push(Math.log(closes[index] / closes[index - 1]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / Math.max(1, returns.length);
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  const vol20 = Math.sqrt(variance) * Math.sqrt(252);
  const trend = Number.isFinite(ema50) && Number.isFinite(ema200) ? (price > ema50 && ema50 > ema200 ? 'ALCISTA' : (price < ema50 && ema50 < ema200 ? 'BAJISTA' : 'LATERAL')) : 'SIN_DATOS';
  return { price: Math.round(price * 100) / 100, ema50: Number.isFinite(ema50) ? Math.round(ema50 * 100) / 100 : null, ema200: Number.isFinite(ema200) ? Math.round(ema200 * 100) / 100 : null, rsi14: Number.isFinite(rsi14) ? Math.round(rsi14 * 10) / 10 : null, vol20: Number.isFinite(vol20) ? Math.round(vol20 * 1000) / 10 : null, trend, bars: clean.length };
}

export async function syncStockHistory(options = {}) {
  const symbols = options.symbols || STOCK_SYMBOLS;
  const days = Number(options.days || 1825);
  if (!config.tradier.token) return { ok: false, error: 'Sin TRADIER_TOKEN.' };
  syncState = { running: true, startedAt: new Date().toISOString(), finishedAt: null, error: null, added: 0, symbols: 0 };
  const client = options.client || new TradierClient(config.tradier);
  const database = openStockHistory();
  const insert = database.prepare('INSERT OR REPLACE INTO bars (symbol, time, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const errors = [];
  try {
    for (const symbol of symbols) {
      try {
        const bars = await client.getHistory(symbol, days, 'daily');
        database.exec('BEGIN');
        for (const bar of bars) insert.run(symbol, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume);
        database.exec('COMMIT');
        syncState.added += bars.length;
        if (bars.length) syncState.symbols += 1;
      } catch (error) {
        errors.push(symbol + ': ' + error.message);
      }
    }
    syncState.finishedAt = new Date().toISOString();
    return { ...stockCoverage(), errors };
  } catch (error) {
    syncState.error = error.message;
    syncState.finishedAt = new Date().toISOString();
    return { ...stockCoverage(), errors };
  } finally {
    syncState.running = false;
  }
}

export function stockCoverage() {
  try {
    const database = openStockHistory();
    const rows = database.prepare('SELECT symbol, COUNT(*) AS count, MIN(time) AS first, MAX(time) AS last FROM bars GROUP BY symbol ORDER BY symbol').all();
    const total = database.prepare('SELECT COUNT(*) AS count FROM bars').get();
    return { ok: true, dbPath: dbPath(), total: Number(total?.count || 0), symbols: rows.map((row) => ({ symbol: row.symbol, count: Number(row.count), from: row.first, to: row.last })), sync: syncState };
  } catch (error) {
    return { ok: false, error: error.message, sync: syncState };
  }
}

export function stockContext(symbols = STOCK_SYMBOLS) {
  const database = openStockHistory();
  const result = [];
  for (const symbol of symbols) {
    const rows = database.prepare('SELECT time, open, high, low, close, volume FROM bars WHERE symbol = ? ORDER BY time DESC LIMIT 400').all(symbol).reverse();
    const summary = summarizeBars(rows);
    if (summary) result.push({ symbol, ...summary });
  }
  return result;
}

export function stockStatus() {
  return { coverage: stockCoverage(), context: stockContext() };
}