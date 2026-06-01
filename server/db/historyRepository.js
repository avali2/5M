/**
 * Historical data repository for price_history, iv_history, earnings, and closed_signals.
 * Works with the existing repository.js database instance.
 */
import { repository } from './repository.js';

export async function insertPriceHistory(symbol, date, ohlcv) {
  const query = `
    INSERT INTO price_history (symbol, date, open, high, low, close, volume)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (symbol, date) DO UPDATE SET
      open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
      close = EXCLUDED.close, volume = EXCLUDED.volume
  `;
  await repository.query(query, [symbol, date, ohlcv.open, ohlcv.high, ohlcv.low, ohlcv.close, ohlcv.volume]);
}

export async function getPriceHistory(symbol, startDate, endDate) {
  const query = `SELECT * FROM price_history WHERE symbol = $1 AND date BETWEEN $2 AND $3 ORDER BY date ASC`;
  const res = await repository.query(query, [symbol, startDate, endDate]);
  return res.rows || res || [];
}

export async function insertIvHistory(symbol, date, ivAtm) {
  const query = `
    INSERT INTO iv_history (symbol, date, iv_atm) VALUES ($1, $2, $3)
    ON CONFLICT (symbol, date) DO UPDATE SET iv_atm = EXCLUDED.iv_atm
  `;
  await repository.query(query, [symbol, date, ivAtm]);
}

export async function getIvHistory(symbol, days = 252) {
  const query = `SELECT * FROM iv_history WHERE symbol = $1 ORDER BY date DESC LIMIT $2`;
  const res = await repository.query(query, [symbol, days]);
  const rows = res.rows || res || [];
  return rows.reverse();
}

export async function insertEarnings(symbol, earningsDate, estimatedEps, actualEps = null, fiscalQuarter = null) {
  const query = `
    INSERT INTO earnings (symbol, earnings_date, estimated_eps, actual_eps, fiscal_quarter)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (symbol, earnings_date) DO UPDATE SET
      estimated_eps = EXCLUDED.estimated_eps,
      actual_eps = EXCLUDED.actual_eps
  `;
  await repository.query(query, [symbol, earningsDate, estimatedEps, actualEps, fiscalQuarter]);
}

export async function getNextEarnings(symbol, afterDate = new Date()) {
  const dateStr = afterDate instanceof Date ? afterDate.toISOString().split('T')[0] : String(afterDate);
  const query = `
    SELECT * FROM earnings
    WHERE symbol = $1 AND earnings_date >= $2
    ORDER BY earnings_date ASC LIMIT 1
  `;
  const res = await repository.query(query, [symbol, dateStr]);
  const rows = res.rows || res || [];
  return rows[0] || null;
}

export async function saveClosedSignal(signal) {
  const query = `
    INSERT INTO closed_signals (id, symbol, strategy, entry_price, exit_price, max_risk, max_profit, pnl, pnl_percent, entry_time, exit_time, classification_at_entry, duration_hours, was_profitable)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (id) DO UPDATE SET
      exit_price = EXCLUDED.exit_price, pnl = EXCLUDED.pnl,
      pnl_percent = EXCLUDED.pnl_percent, exit_time = EXCLUDED.exit_time,
      duration_hours = EXCLUDED.duration_hours, was_profitable = EXCLUDED.was_profitable
  `;
  await repository.query(query, [
    signal.id, signal.symbol, signal.strategy, signal.entry_price, signal.exit_price,
    signal.max_risk, signal.max_profit, signal.pnl, signal.pnl_percent,
    signal.entry_time, signal.exit_time, signal.classification_at_entry,
    signal.duration_hours, signal.was_profitable
  ]);
}

export async function getClosedSignalsStats() {
  const query = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN was_profitable THEN 1 ELSE 0 END) as wins,
      ROUND(AVG(pnl_percent)::numeric, 2) as avg_pnl_pct,
      ROUND(SUM(pnl)::numeric, 2) as total_pnl
    FROM closed_signals
    WHERE was_profitable IS NOT NULL
  `;
  const res = await repository.query(query);
  const rows = res.rows || res || [];
  return rows[0] || { total: 0, wins: 0, avg_pnl_pct: 0, total_pnl: 0 };
}

/** Update iv-history.js to use PostgreSQL instead of JSON file */
export async function getIvHistoryForRank(symbol, days = 252) {
  const rows = await getIvHistory(symbol, days);
  return rows.map(r => ({ date: r.date, iv: r.iv_atm }));
}