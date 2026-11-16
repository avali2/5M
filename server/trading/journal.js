import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const active = "'ENTRY_PENDING', 'OPEN', 'EXIT_PENDING', 'REVIEW'";

export class TradingJournal {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.owner = randomUUID();
    this.db.exec(`
      PRAGMA busy_timeout=5000;
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS bot_state (
        id INTEGER PRIMARY KEY CHECK (id=1), owner TEXT NOT NULL DEFAULT '',
        lease_until INTEGER NOT NULL DEFAULT 0, paused INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO bot_state (id) VALUES (1);
      CREATE TABLE IF NOT EXISTS bot_trades (
        id TEXT PRIMARY KEY, state TEXT NOT NULL, plan TEXT NOT NULL, created_at TEXT NOT NULL,
        entry_credit REAL, close_debit REAL, fees REAL NOT NULL DEFAULT 0, note TEXT
      );
      CREATE TABLE IF NOT EXISTS bot_orders (
        tag TEXT PRIMARY KEY, trade_id TEXT NOT NULL REFERENCES bot_trades(id),
        action TEXT NOT NULL, day TEXT NOT NULL, created_at TEXT NOT NULL, price REAL NOT NULL,
        reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'intent', broker_id TEXT, fees REAL NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_entry_per_day ON bot_orders(day) WHERE action='OPEN';
      CREATE UNIQUE INDEX IF NOT EXISTS one_pending_order ON bot_orders(trade_id)
        WHERE status IN ('intent','sent');
    `);
    this.transaction(() => {
      if (!this.db.prepare('PRAGMA table_info(bot_trades)').all().some(column => column.name === 'exit_reason')) {
        this.db.exec('ALTER TABLE bot_trades ADD COLUMN exit_reason TEXT');
      }
    });
  }

  requestExit(tradeId, reason) {
    if (!['VENCIMIENTO_CERCANO', 'UMBRAL_DE_PERDIDA', 'STRIKE_CORTO_ALCANZADO'].includes(reason)) return false;
    return Boolean(this.db.prepare("UPDATE bot_trades SET exit_reason=COALESCE(exit_reason, ?) WHERE id=? AND state='OPEN'")
      .run(reason, tradeId).changes);
  }

  renew() {
    const now = Date.now();
    return Boolean(this.db.prepare('UPDATE bot_state SET owner=?, lease_until=? WHERE id=1 AND (owner=? OR lease_until<=?)')
      .run(this.owner, now + 120000, this.owner, now).changes);
  }

  release() {
    this.db.prepare('UPDATE bot_state SET lease_until=0 WHERE id=1 AND owner=?').run(this.owner);
  }

  paused() {
    return Boolean(this.db.prepare('SELECT paused FROM bot_state WHERE id=1').get().paused);
  }

  setPaused(paused) {
    this.db.prepare('UPDATE bot_state SET paused=? WHERE id=1').run(Number(paused));
  }

  trades(where = '1', limit = 15) {
    return this.db.prepare(`SELECT * FROM bot_trades WHERE ${where} ORDER BY created_at DESC LIMIT ?`).all(limit)
      .map(({ plan, ...row }) => ({ ...row, plan: JSON.parse(plan) }));
  }

  activeTrades() {
    return this.trades(`state IN (${active})`, 100);
  }

  pending() {
    return this.db.prepare("SELECT * FROM bot_orders WHERE status IN ('intent','sent') ORDER BY created_at").all();
  }

  entered(day) {
    return Boolean(this.db.prepare("SELECT 1 FROM bot_orders WHERE action='OPEN' AND day=?").get(day));
  }

  realized(day) {
    return this.db.prepare(`SELECT ROUND(COALESCE(SUM((t.entry_credit - t.close_debit) * 100 - t.fees), 0), 2) AS pnl
      FROM bot_trades t JOIN bot_orders o ON o.trade_id=t.id
      WHERE t.state='CLOSED' AND o.action='CLOSE' AND o.status='filled' AND o.day=?`).get(day).pnl;
  }

  recentOrders() {
    return this.db.prepare(`SELECT o.action, o.status, o.price, o.reason, o.created_at, o.broker_id
      FROM bot_orders o ORDER BY o.created_at DESC LIMIT 15`).all();
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  reserve({ tag, tradeId, plan, action, day, now, price, reason, fees }) {
    return this.transaction(() => {
      const at = now.toISOString();
      if (action === 'OPEN') {
        if (this.paused() || this.activeTrades().length || this.entered(day)) return null;
        this.db.prepare("INSERT INTO bot_trades(id,state,plan,created_at) VALUES (?,'ENTRY_PENDING',?,?)")
          .run(tag, JSON.stringify(plan), at);
      } else {
        const updated = this.db.prepare("UPDATE bot_trades SET state='EXIT_PENDING' WHERE id=? AND state='OPEN'").run(tradeId);
        if (!updated.changes) return null;
      }
      this.db.prepare('INSERT INTO bot_orders(tag,trade_id,action,day,created_at,price,reason,fees) VALUES (?,?,?,?,?,?,?,?)')
        .run(tag, action === 'OPEN' ? tag : tradeId, action, day, at, price, reason, fees);
      return tag;
    });
  }

  submitted(tag, id) {
    this.db.prepare("UPDATE bot_orders SET broker_id=?,status='sent' WHERE tag=? AND status='intent'").run(id, tag);
  }

  finalize(order, status, fill) {
    this.transaction(() => {
      if (!this.db.prepare("UPDATE bot_orders SET status=? WHERE tag=? AND status IN ('intent','sent')").run(fill?.filled ? 'filled' : status, order.tag).changes) return;
      const note = fill?.filled ? order.reason : status;
      if (!fill) {
        this.db.prepare("UPDATE bot_trades SET state='REVIEW', note=? WHERE id=?")
          .run('Tradier devolvió patas o cantidades que requieren revisión.', order.trade_id);
      } else if (order.action === 'OPEN') {
        this.db.prepare('UPDATE bot_trades SET state=?, entry_credit=?, fees=?, note=? WHERE id=?')
          .run(fill.filled ? 'OPEN' : 'ABANDONED', fill.price ?? null, fill.filled ? order.fees : 0, note, order.trade_id);
      } else {
        this.db.prepare('UPDATE bot_trades SET state=?, close_debit=?, fees=fees+?, note=? WHERE id=?')
          .run(fill.filled ? 'CLOSED' : 'OPEN', fill.price ?? null, fill.filled ? order.fees : 0, note, order.trade_id);
      }
    });
  }
}
