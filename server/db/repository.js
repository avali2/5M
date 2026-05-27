import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from '../config.js';
import {
  addTradeJournal as addLocalJournal,
  getCollectionStats as getLocalStats,
  listTradeJournal as listLocalJournal,
  recordIvObservation as recordLocalIv,
  saveLatestOptionsSnapshot
} from '../lib/store.js';
import { ivStatistics } from '../lib/math.js';

class InstitutionalRepository {
  constructor(settings) {
    this.settings = settings;
    this.pool = settings.url ? new Pool({
      connectionString: settings.url,
      ssl: settings.ssl ? { rejectUnauthorized: false } : false
    }) : null;
    this.ready = null;
    this.mode = this.pool ? 'postgresql' : 'local-file-fallback';
    this.lastSnapshotWrites = new Map();
    this.lastCleanup = 0;
  }

  async initialize() {
    if (!this.pool) return;
    if (!this.ready) {
      this.ready = readFile(path.resolve('server/db/schema.sql'), 'utf8')
        .then((sql) => this.pool.query(sql))
        .catch((error) => {
          this.mode = `postgres-error: ${error.message}`;
          throw error;
        });
    }
    await this.ready;
  }

  async recordIv(symbol, iv, minimum) {
    if (!Number.isFinite(iv)) return { samples: [], ivRank: null, ivPercentile: null };
    if (!this.pool) {
      const samples = await recordLocalIv(symbol, iv);
      return { samples, ...ivStatistics(samples, iv, minimum) };
    }
    await this.initialize();
    const date = new Date().toISOString().slice(0, 10);
    await this.pool.query(
      `INSERT INTO iv_history(symbol, iv, date)
       VALUES ($1, $2, $3)
       ON CONFLICT (symbol, date) DO UPDATE SET iv = EXCLUDED.iv, recorded_at = NOW()`,
      [symbol, iv, date]
    );
    const result = await this.pool.query(
      'SELECT date, iv FROM iv_history WHERE symbol = $1 ORDER BY date DESC LIMIT 260',
      [symbol]
    );
    const samples = result.rows.map((row) => ({ date: row.date, iv: Number(row.iv) }));
    const stats = ivStatistics(samples, iv, minimum);
    await this.pool.query(
      'UPDATE iv_history SET iv_rank = $1, iv_percentile = $2 WHERE symbol = $3 AND date = $4',
      [stats.ivRank, stats.ivPercentile, symbol, date]
    );
    return { samples, ...stats };
  }

  async saveOptionChain(symbol, expiration, chain) {
    const collectedAt = new Date().toISOString();
    if (!this.pool) {
      await saveLatestOptionsSnapshot({
        symbol,
        expiration,
        collectedAt,
        contracts: chain.map((contract) => ({
          strike: contract.strike,
          type: contract.type,
          iv: contract.iv,
          delta: contract.delta,
          gamma: contract.gamma,
          theta: contract.theta,
          vega: contract.vega,
          openInterest: contract.openInterest,
          volume: contract.volume,
          bid: contract.bid,
          ask: contract.ask
        }))
      });
      return { stored: true, contracts: chain.length };
    }
    await this.initialize();
    if (this.lastCleanup < Date.now() - 24 * 60 * 60 * 1000) {
      this.lastCleanup = Date.now();
      try {
        await this.pool.query(
          `DELETE FROM options_snapshots
           WHERE date < NOW() - ($1 * INTERVAL '1 day')`,
          [Math.max(7, Number(this.settings.snapshotRetentionDays || 45))]
        );
      } catch (error) {
        this.lastCleanup = 0;
        throw error;
      }
    }
    const key = `${symbol}:${expiration}`;
    const now = Date.now();
    const interval = this.snapshotIntervalMs(now);
    if ((this.lastSnapshotWrites.get(key) || 0) > now - interval) return { stored: false, contracts: 0 };
    const recent = await this.pool.query(
      'SELECT MAX(date) AS latest FROM options_snapshots WHERE symbol = $1 AND expiration = $2',
      [symbol, expiration]
    );
    const lastSaved = recent.rows[0]?.latest ? new Date(recent.rows[0].latest).getTime() : 0;
    if (lastSaved > now - interval) {
      this.lastSnapshotWrites.set(key, lastSaved);
      return { stored: false, contracts: 0 };
    }
    const retained = chain.filter((contract) =>
      Number.isFinite(contract.strike) &&
      Number.isFinite(contract.delta) &&
      Number.isFinite(contract.gamma) &&
      ((contract.openInterest || 0) > 0 || (contract.volume || 0) > 0)
    ).sort((left, right) =>
      ((right.openInterest || 0) + (right.volume || 0)) -
      ((left.openInterest || 0) + (left.volume || 0))
    ).slice(0, this.settings.maxSnapshotContracts);
    if (!retained.length) return { stored: false, contracts: 0 };
    const values = [];
    const tuples = retained.map((contract, index) => {
      const offset = index * 14;
      values.push(symbol, expiration, contract.strike, contract.type, contract.iv, contract.delta, contract.gamma,
        contract.theta, contract.vega, contract.openInterest, contract.volume, contract.bid, contract.ask, collectedAt);
      return `(${Array.from({ length: 14 }, (_, item) => `$${offset + item + 1}`).join(',')})`;
    });
    await this.pool.query(
      `INSERT INTO options_snapshots
        (symbol, expiration, strike, option_type, iv, delta, gamma, theta, vega, oi, volume, bid, ask, date)
       VALUES ${tuples.join(',')}`,
      values
    );
    this.lastSnapshotWrites.set(key, now);
    return { stored: true, contracts: retained.length };
  }

  snapshotIntervalMs(now) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(now)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    const session = !['Sat', 'Sun'].includes(parts.weekday) && minute >= 570 && minute <= 975;
    const configured = Math.max(15, Number(this.settings.snapshotIntervalMinutes || 60));
    return (session ? configured : Math.max(configured, 720)) * 60 * 1000;
  }

  async collectionStats() {
    if (!this.pool) return getLocalStats();
    await this.initialize();
    const stats = await this.pool.query(
      `SELECT
        (SELECT COUNT(DISTINCT symbol) FROM iv_history) AS iv_symbols,
        (SELECT COUNT(*) FROM options_snapshots) AS snapshots,
        (SELECT MAX(date) FROM options_snapshots) AS latest_snapshot_at`
    );
    const row = stats.rows[0];
    return {
      backend: 'postgresql',
      ivSymbols: Number(row.iv_symbols),
      snapshots: Number(row.snapshots),
      latestSnapshotAt: row.latest_snapshot_at
    };
  }

  async listJournal() {
    if (!this.pool) return listLocalJournal();
    await this.initialize();
    const result = await this.pool.query('SELECT * FROM trade_journal ORDER BY created_at DESC LIMIT 100');
    return result.rows;
  }

  async addJournal(entry) {
    if (!this.pool) return addLocalJournal(entry);
    await this.initialize();
    const result = await this.pool.query(
      `INSERT INTO trade_journal(symbol, strategy, reason, regime, confidence, outcome, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [entry.symbol, entry.strategy, entry.reason, entry.regime, entry.confidence, entry.outcome || 'OPEN', entry.notes]
    );
    return result.rows[0];
  }
}

export const repository = new InstitutionalRepository(config.database);
