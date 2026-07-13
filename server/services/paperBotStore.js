import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { config } from '../config.js';

const root = path.resolve(process.env.SIGMA_DATA_DIR || 'data');

async function readJson(name, fallback) {
  await mkdir(root, { recursive: true });
  try { return JSON.parse(await readFile(path.join(root, name), 'utf8')); } catch { return fallback; }
}

async function writeJson(name, value) {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, name), JSON.stringify(value, null, 2), 'utf8');
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback));
}

export function paperBotDefaults(settings = config.tradierPaper) {
  return {
    settingsVersion: 3,
    profile: settings.profile || 'AGGRESSIVE_DEFINED_RISK',
    enabled: Boolean(settings.defaultBotEnabled),
    autoExecute: Boolean(settings.defaultAutoExecute),
    killSwitch: false,
    maxRiskPct: clamp(settings.maxRiskPct, 0.25, 2, 1),
    maxDailyLossPct: clamp(settings.maxDailyLossPct, 0.5, 5, 2),
    maxOpenPositions: Math.round(clamp(settings.maxOpenPositions, 1, 8, 5)),
    maxContracts: Math.round(clamp(settings.maxContracts, 1, 5, 3)),
    maxEntriesPerDay: Math.round(clamp(settings.maxEntriesPerDay, 1, 12, 6)),
    minScore: clamp(settings.minScore, 65, 95, 68),
    minPop: clamp(settings.minPop, 50, 85, 52),
    minLiquidityScore: clamp(settings.minLiquidityScore, 5, 10, 6),
    takeProfitPct: clamp(settings.takeProfitPct, 20, 80, 35),
    stopLossPct: clamp(settings.stopLossPct, 20, 100, 65),
    allow1Dte: settings.allow1Dte !== false,
    requireGeminiApproval: settings.requireGeminiApproval !== false,
    updatedAt: null
  };
}

export function normalizePaperBotSettings(input = {}, defaults = paperBotDefaults()) {
  return {
    ...defaults,
    settingsVersion: 3,
    profile: input.profile === 'AGGRESSIVE_DEFINED_RISK' ? input.profile : defaults.profile,
    enabled: input.enabled === undefined ? defaults.enabled : Boolean(input.enabled),
    autoExecute: input.autoExecute === undefined ? defaults.autoExecute : Boolean(input.autoExecute),
    killSwitch: input.killSwitch === undefined ? defaults.killSwitch : Boolean(input.killSwitch),
    maxRiskPct: clamp(input.maxRiskPct, 0.25, 2, defaults.maxRiskPct),
    maxDailyLossPct: clamp(input.maxDailyLossPct, 0.5, 5, defaults.maxDailyLossPct),
    maxOpenPositions: Math.round(clamp(input.maxOpenPositions, 1, 8, defaults.maxOpenPositions)),
    maxContracts: Math.round(clamp(input.maxContracts, 1, 5, defaults.maxContracts)),
    maxEntriesPerDay: Math.round(clamp(input.maxEntriesPerDay, 1, 12, defaults.maxEntriesPerDay)),
    minScore: clamp(input.minScore, 65, 95, defaults.minScore),
    minPop: clamp(input.minPop, 50, 85, defaults.minPop),
    minLiquidityScore: clamp(input.minLiquidityScore, 5, 10, defaults.minLiquidityScore),
    takeProfitPct: clamp(input.takeProfitPct, 20, 80, defaults.takeProfitPct),
    stopLossPct: clamp(input.stopLossPct, 20, 100, defaults.stopLossPct),
    allow1Dte: input.allow1Dte === undefined ? defaults.allow1Dte : Boolean(input.allow1Dte),
    requireGeminiApproval: input.requireGeminiApproval === undefined ? defaults.requireGeminiApproval : Boolean(input.requireGeminiApproval),
    updatedAt: input.updatedAt || defaults.updatedAt || null
  };
}

export function migratePaperBotSettings(input = {}, defaults = paperBotDefaults()) {
  if (Number(input.settingsVersion) >= 3) return normalizePaperBotSettings(input, defaults);
  const killSwitch = Boolean(input.killSwitch);
  return normalizePaperBotSettings({
    ...defaults,
    ...input,
    settingsVersion: 3,
    profile: 'AGGRESSIVE_DEFINED_RISK',
    killSwitch,
    enabled: !killSwitch,
    autoExecute: !killSwitch,
    requireGeminiApproval: false,
    updatedAt: input.updatedAt || null
  }, defaults);
}

export class PaperBotStore {
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
      CREATE TABLE IF NOT EXISTS paper_bot_settings (
        id TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS paper_bot_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS paper_bot_orders (
        id TEXT PRIMARY KEY,
        broker_order_id TEXT,
        signal_key TEXT,
        kind TEXT NOT NULL,
        symbol TEXT,
        strategy TEXT,
        status TEXT,
        request JSONB NOT NULL,
        response JSONB,
        setup JSONB,
        realized_pnl NUMERIC,
        parent_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS paper_bot_orders_signal_idx ON paper_bot_orders(signal_key, created_at DESC);
    `);
    return this.ready;
  }

  async getSettings(defaults = paperBotDefaults()) {
    if (!this.pool) return migratePaperBotSettings(await readJson('paper-bot-settings.json', {}), defaults);
    await this.initialize();
    const result = await this.pool.query("SELECT value FROM paper_bot_settings WHERE id='default'");
    return migratePaperBotSettings(result.rows[0]?.value || {}, defaults);
  }

  async saveSettings(input = {}, defaults = paperBotDefaults()) {
    const value = { ...normalizePaperBotSettings(input, defaults), updatedAt: new Date().toISOString() };
    if (!this.pool) {
      await writeJson('paper-bot-settings.json', value);
      return value;
    }
    await this.initialize();
    await this.pool.query(
      `INSERT INTO paper_bot_settings(id,value,updated_at) VALUES('default',$1,NOW())
       ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,
      [JSON.stringify(value)]
    );
    return value;
  }

  async saveRun(payload = {}, mode = 'scheduled') {
    const value = {
      id: `paper-run-${Date.now()}-${randomUUID().slice(0, 8)}`,
      status: payload.status || 'UNKNOWN',
      mode,
      payload,
      createdAt: new Date().toISOString()
    };
    if (!this.pool) {
      const rows = await readJson('paper-bot-runs.json', []);
      rows.unshift(value);
      await writeJson('paper-bot-runs.json', rows.slice(0, 500));
      return value;
    }
    await this.initialize();
    await this.pool.query(
      'INSERT INTO paper_bot_runs(id,status,mode,payload,created_at) VALUES($1,$2,$3,$4,$5)',
      [value.id, value.status, value.mode, JSON.stringify(value.payload), value.createdAt]
    );
    return value;
  }

  async recentRuns(limit = 20) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    if (!this.pool) return (await readJson('paper-bot-runs.json', [])).slice(0, safeLimit);
    await this.initialize();
    const result = await this.pool.query(
      'SELECT id,status,mode,payload,created_at AS "createdAt" FROM paper_bot_runs ORDER BY created_at DESC LIMIT $1',
      [safeLimit]
    );
    return result.rows;
  }

  async recordOrder({ brokerOrderId = null, signalKey, kind = 'ENTRY', symbol, strategy, status = 'submitted', request = {}, response = {}, setup = {}, parentId = null } = {}) {
    const value = {
      id: `paper-order-${Date.now()}-${randomUUID().slice(0, 8)}`,
      brokerOrderId: brokerOrderId ? String(brokerOrderId) : null,
      signalKey,
      kind,
      symbol,
      strategy,
      status,
      request,
      response,
      setup,
      realizedPnl: null,
      parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!this.pool) {
      const rows = await readJson('paper-bot-orders.json', []);
      rows.unshift(value);
      await writeJson('paper-bot-orders.json', rows.slice(0, 500));
      return value;
    }
    await this.initialize();
    await this.pool.query(
      `INSERT INTO paper_bot_orders
       (id,broker_order_id,signal_key,kind,symbol,strategy,status,request,response,setup,parent_id,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [value.id, value.brokerOrderId, value.signalKey, value.kind, value.symbol, value.strategy, value.status,
        JSON.stringify(value.request), JSON.stringify(value.response), JSON.stringify(value.setup), value.parentId, value.createdAt, value.updatedAt]
    );
    return value;
  }

  async updateOrder(id, patch = {}) {
    if (!this.pool) {
      const rows = await readJson('paper-bot-orders.json', []);
      const next = rows.map((row) => row.id === id ? { ...row, ...patch, updatedAt: new Date().toISOString() } : row);
      await writeJson('paper-bot-orders.json', next);
      return next.find((row) => row.id === id) || null;
    }
    await this.initialize();
    const current = await this.pool.query('SELECT * FROM paper_bot_orders WHERE id=$1', [id]);
    if (!current.rows[0]) return null;
    const row = current.rows[0];
    const status = patch.status ?? row.status;
    const response = patch.response ?? row.response;
    const realizedPnl = patch.realizedPnl ?? row.realized_pnl;
    const result = await this.pool.query(
      `UPDATE paper_bot_orders SET status=$1,response=$2,realized_pnl=$3,updated_at=NOW() WHERE id=$4
       RETURNING id,broker_order_id AS "brokerOrderId",signal_key AS "signalKey",kind,symbol,strategy,status,request,response,setup,
       realized_pnl AS "realizedPnl",parent_id AS "parentId",created_at AS "createdAt",updated_at AS "updatedAt"`,
      [status, JSON.stringify(response || {}), realizedPnl, id]
    );
    return result.rows[0];
  }

  async listOrders(limit = 50) {
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    if (!this.pool) return (await readJson('paper-bot-orders.json', [])).slice(0, safeLimit);
    await this.initialize();
    const result = await this.pool.query(
      `SELECT id,broker_order_id AS "brokerOrderId",signal_key AS "signalKey",kind,symbol,strategy,status,request,response,setup,
       realized_pnl AS "realizedPnl",parent_id AS "parentId",created_at AS "createdAt",updated_at AS "updatedAt"
       FROM paper_bot_orders ORDER BY created_at DESC LIMIT $1`,
      [safeLimit]
    );
    return result.rows;
  }

  async hasRecentSignal(signalKey, hours = 24) {
    if (!signalKey) return false;
    const cutoff = Date.now() - Math.max(1, hours) * 60 * 60 * 1000;
    const orders = await this.listOrders(200);
    return orders.some((order) => order.kind === 'ENTRY' && order.signalKey === signalKey && new Date(order.createdAt).getTime() >= cutoff && !/rejected|canceled|error/i.test(order.status));
  }

  async learning() {
    const orders = await this.listOrders(200);
    const entries = orders.filter((order) => order.kind === 'ENTRY');
    const exits = orders.filter((order) => order.kind === 'EXIT');
    const wins = exits.filter((order) => Number(order.realizedPnl) > 0);
    const losses = exits.filter((order) => Number(order.realizedPnl) < 0);
    const realizedPnl = exits.reduce((sum, order) => sum + (Number(order.realizedPnl) || 0), 0);
    const entryById = new Map(entries.map((order) => [order.id, order]));
    const strategies = new Map();
    entries.forEach((order) => {
      if (!order.strategy) return;
      const current = strategies.get(order.strategy) || { strategy: order.strategy, trades: 0, closed: 0, wins: 0, losses: 0, pnl: 0, winRate: null };
      current.trades += 1;
      strategies.set(order.strategy, current);
    });
    exits.forEach((order) => {
      const strategy = entryById.get(order.parentId)?.strategy || order.strategy;
      if (!strategy) return;
      const current = strategies.get(strategy) || { strategy, trades: 0, closed: 0, wins: 0, losses: 0, pnl: 0, winRate: null };
      const pnl = Number(order.realizedPnl) || 0;
      current.closed += 1;
      current.pnl += pnl;
      if (pnl > 0) current.wins += 1;
      if (pnl < 0) current.losses += 1;
      current.winRate = current.closed ? Math.round(current.wins / current.closed * 1000) / 10 : null;
      current.pnl = Math.round(current.pnl * 100) / 100;
      strategies.set(strategy, current);
    });
    return {
      sampleSize: exits.length,
      entries: entries.length,
      exits: exits.length,
      wins: wins.length,
      losses: losses.length,
      winRate: exits.length ? Math.round(wins.length / exits.length * 1000) / 10 : null,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
      strategies: [...strategies.values()].sort((left, right) => right.trades - left.trades),
      confidence: exits.length >= 30 ? 'MEDIUM' : 'LOW_SAMPLE',
      recommendation: exits.length < 30
        ? 'Mantener las reglas fijas hasta completar al menos 30 operaciones paper cerradas; no optimizar con una muestra pequena.'
        : losses.length > wins.length ? 'Reducir tamano y revisar los regimenes perdedores antes de cambiar umbrales.' : 'Continuar validando la expectativa por regimen y estrategia.',
      updatedAt: new Date().toISOString()
    };
  }
}

export const paperBotStore = new PaperBotStore(config.database);
