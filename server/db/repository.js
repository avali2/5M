import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from '../config.js';
import {
  addGuardianFeedback as addLocalGuardianFeedback,
  addTradeJournal as addLocalJournal,
  getGuardianLearningProfile as getLocalGuardianLearning,
  getGuardianSettings as getLocalGuardianSettings,
  getCollectionStats as getLocalStats,
  getRiskProfile as getLocalRiskProfile,
  getWatchlist as getLocalWatchlist,
  listGuardianEvents as listLocalGuardianEvents,
  listGuardianFeedback as listLocalGuardianFeedback,
  listGuardianPushSubscriptions as listLocalGuardianSubscriptions,
  listTradeJournal as listLocalJournal,
  normalizeRiskProfile,
  recordIvObservation as recordLocalIv,
  saveGuardianCooldown as saveLocalGuardianCooldown,
  saveGuardianEvents as saveLocalGuardianEvents,
  saveGuardianLearningProfile as saveLocalGuardianLearning,
  saveGuardianMarketSnapshot as saveLocalGuardianMarketSnapshot,
  saveGuardianPushSubscription as saveLocalGuardianSubscription,
  saveGuardianScanRun as saveLocalGuardianScanRun,
  saveGuardianSettings as saveLocalGuardianSettings,
  saveRiskProfile as saveLocalRiskProfile,
  saveWatchlist as saveLocalWatchlist,
  saveLatestOptionsSnapshot,
  updateGuardianEvent as updateLocalGuardianEvent,
  updateGuardianPushSubscription as updateLocalGuardianSubscription
} from '../lib/store.js';
import { ivStatistics } from '../lib/math.js';

const jsonParam = (value, fallback = {}) => JSON.stringify(value ?? fallback);

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

  async getWatchlist(defaultSymbols) {
    if (!this.pool) return getLocalWatchlist(defaultSymbols);
    await this.initialize();
    const result = await this.pool.query("SELECT value FROM app_settings WHERE key = 'watchlist'");
    return result.rows[0]?.value || { symbols: defaultSymbols, updatedAt: null };
  }

  async saveWatchlist(symbols) {
    if (!this.pool) return saveLocalWatchlist(symbols);
    await this.initialize();
    const clean = [...new Set(symbols.map((symbol) => String(symbol).toUpperCase().trim()).filter(Boolean))].slice(0, 40);
    const value = { symbols: clean, updatedAt: new Date().toISOString() };
    await this.pool.query(
      `INSERT INTO app_settings(key, value, updated_at) VALUES ('watchlist', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [jsonParam(value)]
    );
    return value;
  }

  async getRiskProfile(defaults) {
    if (!this.pool) return getLocalRiskProfile(defaults);
    await this.initialize();
    const result = await this.pool.query("SELECT value FROM app_settings WHERE key = 'risk_profile'");
    return result.rows[0]?.value ? { ...defaults, ...result.rows[0].value } : defaults;
  }

  async saveRiskProfile(profile, defaults) {
    if (!this.pool) return saveLocalRiskProfile(profile, defaults);
    await this.initialize();
    const value = normalizeRiskProfile(profile, defaults);
    await this.pool.query(
      `INSERT INTO app_settings(key, value, updated_at) VALUES ('risk_profile', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [jsonParam(value)]
    );
    return value;
  }

  async addJournal(entry) {
    if (!this.pool) return addLocalJournal(entry);
    await this.initialize();
    const result = await this.pool.query(
      `INSERT INTO trade_journal(symbol, strategy, reason, regime, confidence, outcome, notes, planned_entry, real_entry, planned_exit, real_exit, pnl, mental_state, lesson, mae, mfe, error, rule_violated, rule_respected, signal_original)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [entry.symbol, entry.strategy, entry.reason, entry.regime, entry.confidence, entry.outcome || 'OPEN', entry.notes,
        entry.plannedEntry, entry.realEntry, entry.plannedExit, entry.realExit,
        Number.isFinite(Number(entry.pnl)) ? Number(entry.pnl) : null, entry.mentalState, entry.lesson,
        Number.isFinite(Number(entry.mae)) ? Number(entry.mae) : null, Number.isFinite(Number(entry.mfe)) ? Number(entry.mfe) : null,
        entry.error, entry.ruleViolated, entry.ruleRespected, entry.signalOriginal ? jsonParam(entry.signalOriginal) : null]
    );
    return result.rows[0];
  }

  async getGuardianSettings(defaults) {
    if (!this.pool) return getLocalGuardianSettings(defaults);
    await this.initialize();
    const result = await this.pool.query("SELECT settings_json FROM guardian_settings WHERE id = 'default'");
    return result.rows[0]?.settings_json || defaults;
  }

  async saveGuardianSettings(settings) {
    if (!this.pool) return saveLocalGuardianSettings(settings);
    await this.initialize();
    const value = { ...settings, updatedAt: new Date().toISOString() };
    await this.pool.query(
      `INSERT INTO guardian_settings
        (id, settings_json, enabled, work_mode_enabled, min_score_to_notify, max_alerts_per_hour, only_critical, include_conditional, include_paper_practice, silence_during_macro, updated_at)
       VALUES ('default',$1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (id) DO UPDATE SET settings_json=EXCLUDED.settings_json, enabled=EXCLUDED.enabled,
         work_mode_enabled=EXCLUDED.work_mode_enabled, min_score_to_notify=EXCLUDED.min_score_to_notify,
         max_alerts_per_hour=EXCLUDED.max_alerts_per_hour, only_critical=EXCLUDED.only_critical,
         include_conditional=EXCLUDED.include_conditional, include_paper_practice=EXCLUDED.include_paper_practice,
         silence_during_macro=EXCLUDED.silence_during_macro, updated_at=NOW()`,
      [jsonParam(value), Boolean(value.enabled), Boolean(value.workMode?.enabled), Number(value.workMode?.minScoreToNotify || 75),
        Number(value.workMode?.maxAlertsPerHour || 3), Boolean(value.workMode?.onlyCritical),
        Boolean(value.workMode?.includeConditional), Boolean(value.workMode?.includePaperPractice),
        Boolean(value.workMode?.silenceDuringHighImpactMacro)]
    );
    return value;
  }

  async listGuardianEvents(limit = 100) {
    if (!this.pool) return listLocalGuardianEvents(limit);
    await this.initialize();
    const result = await this.pool.query(
      `SELECT id, event_type AS type, severity, symbol, title, message, recommendation, source,
       data_json AS data, status, notification_sent AS "notificationSent",
       notification_channel AS "notificationChannel", notification_error AS "notificationError",
       created_at AS "createdAt", reviewed_at AS "reviewedAt"
       FROM guardian_events ORDER BY created_at DESC LIMIT $1`,
      [Math.min(500, Math.max(1, Number(limit)))]
    );
    return result.rows;
  }

  async saveGuardianEvents(events) {
    if (!this.pool) return saveLocalGuardianEvents(events);
    await this.initialize();
    for (const event of events) {
      await this.pool.query(
        `INSERT INTO guardian_events
          (id, event_type, severity, symbol, title, message, recommendation, source, data_json, status,
           notification_sent, notification_channel, notification_error, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, notification_sent=EXCLUDED.notification_sent,
           notification_channel=EXCLUDED.notification_channel, notification_error=EXCLUDED.notification_error`,
        [event.id, event.type, event.severity, event.symbol, event.title, event.message, event.recommendation,
          event.source, jsonParam(event.data || {}), event.status || 'new', Boolean(event.notificationSent),
          event.notificationChannel, event.notificationError, event.createdAt]
      );
    }
    return events;
  }

  async updateGuardianEvent(id, patch) {
    if (!this.pool) return updateLocalGuardianEvent(id, patch);
    await this.initialize();
    const result = await this.pool.query(
      `UPDATE guardian_events SET status=COALESCE($2,status),
       notification_sent=COALESCE($3,notification_sent), notification_channel=COALESCE($4,notification_channel),
       notification_error=COALESCE($5,notification_error), reviewed_at=CASE WHEN $2 = 'reviewed' THEN NOW() ELSE reviewed_at END
       WHERE id=$1 RETURNING id, event_type AS type, status`,
      [id, patch.status || null, patch.notificationSent ?? null, patch.notificationChannel || null, patch.notificationError || null]
    );
    return result.rows[0] || null;
  }

  async getGuardianLearningProfile() {
    if (!this.pool) return getLocalGuardianLearning();
    await this.initialize();
    const result = await this.pool.query("SELECT profile_json FROM guardian_learning_profile WHERE id = 'default'");
    return result.rows[0]?.profile_json || null;
  }

  async saveGuardianLearningProfile(profile) {
    if (!this.pool) return saveLocalGuardianLearning(profile);
    await this.initialize();
    await this.pool.query(
      `INSERT INTO guardian_learning_profile
        (id, preferred_strategies_json, weak_concepts_json, repeated_mistakes_json, best_setups_json, worst_setups_json,
         best_symbols_json, worst_symbols_json, notification_fatigue_score, discipline_score, fomo_risk_score,
         revenge_risk_score, last_learning_recommendation, coach_json, profile_json, updated_at)
       VALUES ('default',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (id) DO UPDATE SET preferred_strategies_json=EXCLUDED.preferred_strategies_json,
         weak_concepts_json=EXCLUDED.weak_concepts_json, repeated_mistakes_json=EXCLUDED.repeated_mistakes_json,
         best_setups_json=EXCLUDED.best_setups_json, worst_setups_json=EXCLUDED.worst_setups_json,
         best_symbols_json=EXCLUDED.best_symbols_json, worst_symbols_json=EXCLUDED.worst_symbols_json,
         notification_fatigue_score=EXCLUDED.notification_fatigue_score, discipline_score=EXCLUDED.discipline_score,
         fomo_risk_score=EXCLUDED.fomo_risk_score, revenge_risk_score=EXCLUDED.revenge_risk_score,
         last_learning_recommendation=EXCLUDED.last_learning_recommendation, coach_json=EXCLUDED.coach_json,
         profile_json=EXCLUDED.profile_json, updated_at=NOW()`,
      [jsonParam(profile.preferredStrategies || [], []), jsonParam(profile.weakConcepts || [], []), jsonParam(profile.repeatedMistakes || {}, {}),
        jsonParam(profile.bestSetups || [], []), jsonParam(profile.worstSetups || [], []), jsonParam(profile.bestSymbols || [], []), jsonParam(profile.worstSymbols || [], []),
        Number(profile.notificationFatigueScore || 0), Number(profile.disciplineScore || 0), Number(profile.fomoRiskScore || 0),
        Number(profile.revengeRiskScore || 0), profile.lastLearningRecommendation || '', jsonParam(profile.coach || {}, {}), jsonParam(profile, {})]
    );
    return profile;
  }

  async listGuardianFeedback(limit = 200) {
    if (!this.pool) return listLocalGuardianFeedback(limit);
    await this.initialize();
    const result = await this.pool.query(
      `SELECT id, event_id AS "eventId", event_type AS "eventType", symbol, action, feedback,
       created_at AS "createdAt" FROM guardian_user_feedback ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async addGuardianFeedback(entry) {
    if (!this.pool) return addLocalGuardianFeedback(entry);
    await this.initialize();
    const id = entry.id || `feedback-${Date.now()}`;
    const result = await this.pool.query(
      `INSERT INTO guardian_user_feedback(id, event_id, action, feedback, event_type, symbol)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, event_id AS "eventId", action, feedback, created_at AS "createdAt"`,
      [id, entry.eventId, entry.action, entry.feedback, entry.eventType, entry.symbol]
    );
    return result.rows[0];
  }

  async listGuardianPushSubscriptions() {
    if (!this.pool) return listLocalGuardianSubscriptions();
    await this.initialize();
    const result = await this.pool.query(
      `SELECT endpoint_hash AS "endpointHash", subscription_json AS subscription, user_agent AS "userAgent",
       platform, device_label AS "deviceLabel", is_active AS "isActive", last_success_at AS "lastSuccessAt",
       last_error AS "lastError" FROM guardian_push_subscriptions WHERE is_active = TRUE`
    );
    return result.rows;
  }

  async saveGuardianPushSubscription(subscription) {
    if (!this.pool) return saveLocalGuardianSubscription(subscription);
    await this.initialize();
    const result = await this.pool.query(
      `INSERT INTO guardian_push_subscriptions(endpoint_hash, subscription_json, user_agent, platform, device_label, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,TRUE,NOW())
       ON CONFLICT (endpoint_hash) DO UPDATE SET subscription_json=EXCLUDED.subscription_json, user_agent=EXCLUDED.user_agent,
       platform=EXCLUDED.platform, device_label=EXCLUDED.device_label, is_active=TRUE, last_error=NULL, updated_at=NOW()
       RETURNING endpoint_hash AS "endpointHash", is_active AS "isActive"`,
      [subscription.endpointHash, jsonParam(subscription.subscription, {}), subscription.userAgent, subscription.platform, subscription.deviceLabel]
    );
    return result.rows[0];
  }

  async updateGuardianPushSubscription(endpointHash, patch) {
    if (!this.pool) return updateLocalGuardianSubscription(endpointHash, patch);
    await this.initialize();
    const result = await this.pool.query(
      `UPDATE guardian_push_subscriptions SET is_active=COALESCE($2,is_active), last_success_at=COALESCE($3,last_success_at),
       last_error=$4, updated_at=NOW() WHERE endpoint_hash=$1 RETURNING endpoint_hash AS "endpointHash", is_active AS "isActive"`,
      [endpointHash, patch.isActive ?? null, patch.lastSuccessAt || null, patch.lastError || null]
    );
    return result.rows[0] || null;
  }

  async saveGuardianCooldown(item) {
    if (!this.pool) return saveLocalGuardianCooldown(item);
    await this.initialize();
    await this.pool.query(
      `INSERT INTO guardian_alert_cooldowns(id, symbol, event_type, cooldown_until, reason)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET cooldown_until=EXCLUDED.cooldown_until, reason=EXCLUDED.reason`,
      [item.id, item.symbol, item.eventType, item.cooldownUntil, item.reason]
    );
    return item;
  }

  async saveGuardianScanRun(run) {
    if (!this.pool) return saveLocalGuardianScanRun(run);
    await this.initialize();
    await this.pool.query(
      `INSERT INTO guardian_scan_runs(id, mode, market_status, symbols_scanned, signals_found, events_created,
       notifications_sent, errors_json, started_at, completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [run.id, run.mode, run.marketStatus, run.symbolsScanned, run.signalsFound, run.eventsCreated,
        run.notificationsSent, jsonParam(run.errors || [], []), run.startedAt, run.completedAt]
    );
    return run;
  }

  async saveGuardianMarketSnapshot(snapshot) {
    if (!this.pool) return saveLocalGuardianMarketSnapshot(snapshot);
    await this.initialize();
    await this.pool.query(
      `INSERT INTO guardian_market_snapshots(id, symbol, snapshot_type, data_json, source, is_live, is_delayed)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [snapshot.id, snapshot.symbol, snapshot.snapshotType, jsonParam(snapshot.data, {}), snapshot.source, Boolean(snapshot.isLive), Boolean(snapshot.isDelayed)]
    );
    return snapshot;
  }
}

export const repository = new InstitutionalRepository(config.database);
