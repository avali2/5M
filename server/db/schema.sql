-- VALIDO 1M v4.0 — Database Schema
-- Ejecutar una vez en PostgreSQL

CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    open DECIMAL(10,4),
    high DECIMAL(10,4),
    low DECIMAL(10,4),
    close DECIMAL(10,4) NOT NULL,
    volume BIGINT,
    UNIQUE(symbol, date)
);

CREATE TABLE IF NOT EXISTS iv_history (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    iv_atm DECIMAL(8,6) NOT NULL,
    UNIQUE(symbol, date)
);

CREATE TABLE IF NOT EXISTS earnings (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    earnings_date DATE NOT NULL,
    estimated_eps DECIMAL(8,4),
    actual_eps DECIMAL(8,4),
    fiscal_quarter VARCHAR(10),
    UNIQUE(symbol, earnings_date)
);

CREATE TABLE IF NOT EXISTS closed_signals (
    id TEXT PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    strategy VARCHAR(50) NOT NULL,
    entry_price DECIMAL(10,4),
    exit_price DECIMAL(10,4),
    max_risk DECIMAL(10,4),
    max_profit DECIMAL(10,4),
    pnl DECIMAL(10,4),
    pnl_percent DECIMAL(8,4),
    entry_time TIMESTAMP,
    exit_time TIMESTAMP,
    classification_at_entry VARCHAR(20),
    duration_hours DECIMAL(8,2),
    was_profitable BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_price_symbol_date ON price_history(symbol, date);
CREATE INDEX IF NOT EXISTS idx_iv_symbol_date ON iv_history(symbol, date);
CREATE INDEX IF NOT EXISTS idx_earnings_symbol_date ON earnings(symbol, earnings_date);