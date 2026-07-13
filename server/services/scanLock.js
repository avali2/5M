import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { config } from '../config.js';

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

export class ScanLock {
  constructor({ settings = config.database, owner = `scanner-${process.pid}-${randomUUID().slice(0, 8)}` } = {}) {
    this.owner = owner;
    this.pool = settings?.url ? new Pool({
      connectionString: settings.url,
      ssl: settings.ssl ? { rejectUnauthorized: false } : false
    }) : null;
    this.ready = null;
  }

  async initialize() {
    if (!this.pool || this.ready) return this.ready;
    this.ready = this.pool.query(`
      CREATE TABLE IF NOT EXISTS scan_locks (
        lock_name TEXT PRIMARY KEY,
        locked_until TIMESTAMPTZ NOT NULL,
        owner TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    return this.ready;
  }

  async acquire(lockName = 'scanner', ttlMs = 150000) {
    const now = new Date();
    const until = new Date(now.getTime() + ttlMs);
    if (!this.pool) {
      const locks = await readJson('scan-locks.json', {});
      const current = locks[lockName];
      if (current?.lockedUntil && new Date(current.lockedUntil) > now && current.owner !== this.owner) {
        return { acquired: false, owner: current.owner, lockedUntil: current.lockedUntil };
      }
      locks[lockName] = {
        lockName,
        owner: this.owner,
        lockedUntil: until.toISOString(),
        createdAt: current?.createdAt || now.toISOString(),
        updatedAt: now.toISOString()
      };
      await writeJson('scan-locks.json', locks);
      return { acquired: true, owner: this.owner, lockedUntil: until.toISOString() };
    }
    await this.initialize();
    const result = await this.pool.query(
      `INSERT INTO scan_locks(lock_name, locked_until, owner, created_at, updated_at)
       VALUES ($1,$2,$3,NOW(),NOW())
       ON CONFLICT (lock_name) DO UPDATE
       SET locked_until = EXCLUDED.locked_until, owner = EXCLUDED.owner, updated_at = NOW()
       WHERE scan_locks.locked_until <= NOW() OR scan_locks.owner = EXCLUDED.owner
       RETURNING lock_name, locked_until AS "lockedUntil", owner`,
      [lockName, until.toISOString(), this.owner]
    );
    const row = result.rows[0];
    if (!row) {
      const current = await this.pool.query('SELECT owner, locked_until AS "lockedUntil" FROM scan_locks WHERE lock_name=$1', [lockName]);
      return { acquired: false, owner: current.rows[0]?.owner, lockedUntil: current.rows[0]?.lockedUntil };
    }
    return { acquired: true, owner: row.owner, lockedUntil: row.lockedUntil };
  }

  async release(lockName = 'scanner') {
    if (!this.pool) {
      const locks = await readJson('scan-locks.json', {});
      if (locks[lockName]?.owner === this.owner) {
        delete locks[lockName];
        await writeJson('scan-locks.json', locks);
        return true;
      }
      return false;
    }
    await this.initialize();
    const result = await this.pool.query('DELETE FROM scan_locks WHERE lock_name=$1 AND owner=$2', [lockName, this.owner]);
    return result.rowCount > 0;
  }

  async extend(lockName = 'scanner', ttlMs = 180000) {
    const until = new Date(Date.now() + ttlMs);
    if (!this.pool) {
      const locks = await readJson('scan-locks.json', {});
      if (locks[lockName]?.owner !== this.owner) return false;
      locks[lockName].lockedUntil = until.toISOString();
      locks[lockName].updatedAt = new Date().toISOString();
      await writeJson('scan-locks.json', locks);
      return true;
    }
    await this.initialize();
    const result = await this.pool.query(
      `UPDATE scan_locks SET locked_until=$1, updated_at=NOW() WHERE lock_name=$2 AND owner=$3`,
      [until.toISOString(), lockName, this.owner]
    );
    return result.rowCount > 0;
  }

  async withLock(lockName, ttlMs, fn) {
    const lock = await this.acquire(lockName, ttlMs);
    if (!lock.acquired) return { skipped: true, lock };
    const heartbeat = setInterval(() => this.extend(lockName, ttlMs).catch(() => {}), Math.max(10000, Math.floor(ttlMs / 3)));
    heartbeat.unref?.();
    try {
      return { skipped: false, lock, value: await fn(lock) };
    } finally {
      clearInterval(heartbeat);
      await this.release(lockName);
    }
  }
}

export const scanLock = new ScanLock();
