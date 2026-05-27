CREATE TABLE IF NOT EXISTS iv_history (
  symbol TEXT NOT NULL,
  iv DOUBLE PRECISION NOT NULL,
  iv_rank DOUBLE PRECISION,
  iv_percentile DOUBLE PRECISION,
  date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, date)
);

CREATE TABLE IF NOT EXISTS options_snapshots (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  expiration DATE NOT NULL,
  strike DOUBLE PRECISION NOT NULL,
  option_type TEXT NOT NULL,
  iv DOUBLE PRECISION,
  delta DOUBLE PRECISION,
  gamma DOUBLE PRECISION,
  theta DOUBLE PRECISION,
  vega DOUBLE PRECISION,
  oi BIGINT,
  volume BIGINT,
  bid DOUBLE PRECISION,
  ask DOUBLE PRECISION,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS options_snapshots_lookup_idx
  ON options_snapshots (symbol, expiration, date DESC);

CREATE TABLE IF NOT EXISTS trade_journal (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  reason TEXT,
  regime TEXT,
  confidence DOUBLE PRECISION,
  outcome TEXT NOT NULL DEFAULT 'OPEN',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
