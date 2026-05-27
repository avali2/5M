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

ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS planned_entry TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS real_entry TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS planned_exit TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS real_exit TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS pnl DOUBLE PRECISION;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS mental_state TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS lesson TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS mae DOUBLE PRECISION;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS mfe DOUBLE PRECISION;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS rule_violated TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS rule_respected TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS signal_original TEXT;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guardian_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  user_id TEXT NOT NULL DEFAULT 'default',
  settings_json JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  work_mode_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  min_score_to_notify DOUBLE PRECISION NOT NULL DEFAULT 75,
  max_alerts_per_hour INTEGER NOT NULL DEFAULT 3,
  only_critical BOOLEAN NOT NULL DEFAULT FALSE,
  include_conditional BOOLEAN NOT NULL DEFAULT TRUE,
  include_paper_practice BOOLEAN NOT NULL DEFAULT TRUE,
  silence_during_macro BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guardian_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  symbol TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  recommendation TEXT,
  source TEXT,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  notification_channel TEXT,
  notification_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS guardian_events_lookup_idx
  ON guardian_events (created_at DESC, symbol, event_type);

CREATE TABLE IF NOT EXISTS guardian_alert_cooldowns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  symbol TEXT,
  event_type TEXT NOT NULL,
  cooldown_until TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guardian_learning_profile (
  id TEXT PRIMARY KEY DEFAULT 'default',
  user_id TEXT NOT NULL DEFAULT 'default',
  preferred_strategies_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  weak_concepts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  repeated_mistakes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  best_setups_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  worst_setups_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  best_symbols_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  worst_symbols_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ignored_alert_types_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  clicked_alert_types_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  notification_fatigue_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  discipline_score DOUBLE PRECISION NOT NULL DEFAULT 80,
  fomo_risk_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  revenge_risk_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_learning_recommendation TEXT,
  coach_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guardian_push_subscriptions (
  endpoint_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  subscription_json JSONB NOT NULL,
  user_agent TEXT,
  platform TEXT,
  device_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guardian_scan_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  mode TEXT NOT NULL,
  market_status TEXT NOT NULL,
  symbols_scanned INTEGER NOT NULL DEFAULT 0,
  signals_found INTEGER NOT NULL DEFAULT 0,
  events_created INTEGER NOT NULL DEFAULT 0,
  notifications_sent INTEGER NOT NULL DEFAULT 0,
  errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS guardian_user_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  event_id TEXT,
  action TEXT NOT NULL,
  feedback TEXT,
  event_type TEXT,
  symbol TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guardian_market_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  symbol TEXT NOT NULL,
  snapshot_type TEXT NOT NULL,
  data_json JSONB NOT NULL,
  source TEXT,
  is_live BOOLEAN NOT NULL DEFAULT FALSE,
  is_delayed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
