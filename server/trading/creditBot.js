/**
 * 5M · Bot de crédito Tradier (v3).
 * Bull put / bear call según tendencia + iron condor en rango.
 * Riesgo definido, stop por subyacente + stop duro 3x, objetivos 50%,
 * cierre por tiempo 21 DTE, filtros de IV (nivel y estructura), ATR/tendencia
 * y calendario macro (FOMC/CPI/NFP). DeepSeek aprueba cada plan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { TradierClient } from '../lib/tradier.js';
import { getSnapshot, optionChainFor, dteFor } from '../lib/marketData.js';
import { round2 } from '../lib/optionsMath.js';
import { TradingBroker, LIVE_URL } from './broker.js';
import { analyzeTask } from '../lib/aiAnalyst.js';
import { eventRisk } from '../lib/calendar.js';

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const DAY = 86400000;
const roundTick = (value) => Math.round(value * 100) / 100;

function ema(values, length) {
  const clean = values.filter(isNum);
  if (clean.length < length) return null;
  const k = 2 / (length + 1);
  let result = clean.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  for (const value of clean.slice(length)) result = value * k + result * (1 - k);
  return result;
}

function emaSlope(values, length = 50, lookback = 5) {
  const clean = values.filter(isNum);
  if (clean.length < length + lookback) return null;
  const now = ema(clean, length);
  const before = ema(clean.slice(0, clean.length - lookback), length);
  return isNum(now) && isNum(before) && before !== 0 ? ((now - before) / before) * 100 : null;
}

function rsi(values, length = 14) {
  const clean = values.filter(isNum);
  if (clean.length <= length) return null;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= length; index += 1) {
    const change = clean[index] - clean[index - 1];
    if (change >= 0) gains += change; else losses -= change;
  }
  let avgGain = gains / length;
  let avgLoss = losses / length;
  for (let index = length + 1; index < clean.length; index += 1) {
    const change = clean[index] - clean[index - 1];
    avgGain = (avgGain * (length - 1) + Math.max(0, change)) / length;
    avgLoss = (avgLoss * (length - 1) + Math.max(0, -change)) / length;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function realizedVol(history, window = 20) {
  const closes = history.map((bar) => bar?.close).filter(isNum);
  if (closes.length < window + 2) return null;
  const returns = [];
  for (let index = closes.length - window; index < closes.length; index += 1) returns.push(Math.log(closes[index] / closes[index - 1]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function atrSeries(history = [], length = 14) {
  const bars = history.filter((bar) => isNum(bar?.high) && isNum(bar?.low) && isNum(bar?.close));
  if (bars.length < length + 2) return null;
  const ranges = [];
  for (let index = 1; index < bars.length; index += 1) {
    ranges.push(Math.max(bars[index].high - bars[index].low, Math.abs(bars[index].high - bars[index - 1].close), Math.abs(bars[index].low - bars[index - 1].close)));
  }
  return ranges.slice(-length).reduce((sum, value) => sum + value, 0) / length;
}

function etMinutes(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function atmIvForChain(chain, spot) {
  const near = chain.filter((option) => isNum(option.iv) && isNum(option.strike))
    .map((option) => ({ ...option, distance: Math.abs(option.strike - spot) }))
    .sort((left, right) => left.distance - right.distance).slice(0, 6);
  return near.length ? near.reduce((sum, option) => sum + option.iv, 0) / near.length : null;
}

const DEFAULTS = {
  symbol: 'SPY',
  allowCondor: true,
  autoStrategy: true,
  adaptiveLearning: true,
  strategies: { bullPut: true, bearCall: true, ironCondor: true },
  dteMin: 35, dteMax: 50, targetDte: 45,
  shortDeltaMin: 0.16, shortDeltaMax: 0.20, targetDelta: 0.18,
  deltaStop: 0,
  blockBackwardationVix: true,
  vixBlockThreshold: 1.02,
  vixReentryFloor: 1.05,
  ivrFloor: 25,
  ivrMinSamples: 20,
  condorDeltaMin: 0.16, condorDeltaMax: 0.24, condorTargetDelta: 0.2,
  minCreditWidth: 0.15,
  minCreditUsd: 45,
  minIvRatio: 1.1,
  requireContango: true,
  minAtrTrend: 0.25,
  maxSpreadPct: 0.08,
  minOpenInterest: 100,
  riskPct: 1,
  contractsCap: 10,
  profitTargetPct: 50,
  stopMode: 'hybrid',
  stopMultiple: 2,
  hardStopMultiple: 3,
  timeExitDte: 21,
  hardExitDte: 7,
  entryBlockDays: 2,
  positionWarnDays: 1,
  fomcEntryBlockDays: 7,
  entryFromMinutes: 600,
  entryToMinutes: 900
};

export class CreditBot {
  constructor(options = {}) {
    const { env = process.env, now = () => new Date(), reviewer = null, mode = null, stateFile = null } = options;
    this.env = env;
    this.now = now;
    this.reviewer = reviewer;
    this.stateFile = stateFile || 'credit-bot.json';
    this.mode = String(mode || env.CREDIT_BOT_MODE || config.creditBot?.mode || 'paper').toLowerCase();
    this.profile = String(env.CREDIT_BOT_PROFILE || 'prudent').toLowerCase();
    const presets = this.profile === 'aggressive'
      ? { dteMin: 30, dteMax: 50, targetDte: 45, shortDeltaMin: 0.2, shortDeltaMax: 0.28, targetDelta: 0.24, minCreditWidth: 0.18, minIvRatio: 1.15, minCreditUsd: 60, condorDeltaMin: 0.2, condorDeltaMax: 0.3, condorTargetDelta: 0.25 }
      : { dteMin: 35, dteMax: 50, targetDte: 45, minIvRatio: 1.1, minCreditWidth: 0.15, minCreditUsd: 45 };
    this.settings = { ...DEFAULTS, ...(config.creditBot || {}), ...presets };
    this.aiReview = ['required', 'optional', 'off'].includes(String(env.CREDIT_BOT_AI_REVIEW || 'required').toLowerCase())
      ? String(env.CREDIT_BOT_AI_REVIEW || 'required').toLowerCase() : 'required';
    this.autoArm = this.mode === 'live' ? env.CREDIT_BOT_LIVE_AUTO_ARM === 'true' : env.CREDIT_BOT_AUTO_ARM !== 'false';
    this.configFile = 'bot-config-' + this.mode + '.json';
    this.state = this.load();
    this.overrides = this.loadConfig();
    this.settings = { ...this.settings, ...this.overrides };
    this.market = new TradierClient(config.tradier);
  }

  file() {
    return path.join(config.dataDir, this.stateFile);
  }

  configPath() {
    return path.join(config.dataDir, this.configFile);
  }

  loadConfig() {
    try { return JSON.parse(fs.readFileSync(this.configPath(), 'utf8')) || {}; }
    catch { return {}; }
  }

  saveConfig() {
    try {
      fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(this.configPath(), JSON.stringify(this.overrides, null, 1), { mode: 0o600 });
    } catch { /* sin disco */ }
  }

  getConfig() {
    return {
      profile: this.profile,
      autoStrategy: this.settings.autoStrategy,
      strategies: this.settings.strategies,
      riskUsd: Number(this.env.CREDIT_BOT_MAX_RISK_USD || 500),
      minCreditWidth: this.settings.minCreditWidth,
      minCreditUsd: this.settings.minCreditUsd,
      minIvRatio: this.settings.minIvRatio,
      requireContango: this.settings.requireContango,
      stopMode: this.settings.stopMode,
      stopMultiple: this.settings.stopMultiple,
      hardStopMultiple: this.settings.hardStopMultiple,
      ivrFloor: this.settings.ivrFloor,
      profitTargetPct: this.settings.profitTargetPct,
      timeExitDte: this.settings.timeExitDte,
      entryBlockDays: this.settings.entryBlockDays,
      minAtrTrend: this.settings.minAtrTrend,
      adaptiveLearning: this.settings.adaptiveLearning
    };
  }

  updateConfig(patch = {}) {
    const errors = [];
    const next = { ...this.overrides };
    const num = (key, min, max) => {
      if (patch[key] === undefined) return;
      const value = Number(patch[key]);
      if (!Number.isFinite(value) || value < min || value > max) { errors.push(key + ' fuera de rango'); return; }
      next[key] = value;
    };
    if (patch.profile !== undefined) {
      if (!['prudent', 'aggressive'].includes(String(patch.profile))) errors.push('perfil invalido');
      else this.profile = String(patch.profile);
    }
    if (patch.strategies && typeof patch.strategies === 'object') {
      next.strategies = {
        bullPut: Boolean(patch.strategies.bullPut ?? this.settings.strategies.bullPut),
        bearCall: Boolean(patch.strategies.bearCall ?? this.settings.strategies.bearCall),
        ironCondor: Boolean(patch.strategies.ironCondor ?? this.settings.strategies.ironCondor)
      };
    }
    if (patch.autoStrategy !== undefined) next.autoStrategy = Boolean(patch.autoStrategy);
    if (patch.adaptiveLearning !== undefined) next.adaptiveLearning = Boolean(patch.adaptiveLearning);
    if (patch.requireContango !== undefined) next.requireContango = Boolean(patch.requireContango);
    if (patch.stopMode !== undefined) {
      if (!['underlying', 'premium', 'hybrid'].includes(String(patch.stopMode))) errors.push('stopMode invalido');
      else next.stopMode = String(patch.stopMode);
    }
    num('minCreditWidth', 0.05, 0.6);
    num('minCreditUsd', 10, 500);
    num('minIvRatio', 0.5, 2);
    num('hardStopMultiple', 1, 6);
    num('stopMultiple', 1, 4);
    num('ivrFloor', 0, 90);
    num('profitTargetPct', 20, 90);
    num('timeExitDte', 5, 45);
    num('entryBlockDays', 0, 7);
    num('minAtrTrend', 0, 2);
    if (errors.length) return { ok: false, errors };
    this.overrides = next;
    this.settings = { ...this.settings, ...next };
    this.saveConfig();
    this.save();
    return { ok: true, config: this.getConfig() };
  }

  log(type, data = {}) {
    const entry = { at: this.now().toISOString(), type, ...data };
    this.state.log = [...(this.state.log || []), entry].slice(-400);
    return entry;
  }

  load() {
    const empty = { armed: false, paused: false, position: null, history: [], lastDecision: null, cycle: { state: 'INACTIVO', note: 'Bot sin armar.' } };
    try {
      return { ...empty, ...JSON.parse(fs.readFileSync(this.file(), 'utf8')) };
    } catch {
      return empty;
    }
  }

  save() {
    try {
      fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(this.file(), JSON.stringify(this.state, null, 1), { mode: 0o600 });
    } catch {
      /* sin disco: estado en memoria */
    }
  }

  gates() {
    const live = this.mode === 'live';
    const checks = [];
    const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
    add('Acceso', config.security.requireAccessKey && Boolean(config.security.accessKey), 'La app exige APP_ACCESS_KEY.');
    if (live) {
      add('Datos producción', Boolean(config.tradier.token) && !config.tradier.sandbox && config.tradier.baseUrl === LIVE_URL, 'TRADIER_TOKEN de producción, sin sandbox.');
      add('Tiempo real confirmado', config.tradier.realtimeEntitled, 'TRADIER_REALTIME_ENTITLED=true.');
      add('Cuenta live', /^[A-Z0-9]{4,20}$/i.test(String(this.env.BOT_ACCOUNT_ID || '').trim()), 'BOT_ACCOUNT_ID de la cuenta real.');
      add('Confirmación explícita', this.env.LIVE_CONFIRM === 'I_ACCEPT_REAL_MONEY', 'LIVE_CONFIRM=I_ACCEPT_REAL_MONEY.');
      add('Disco persistente', this.env.BOT_DURABLE_STORAGE === 'true' && path.isAbsolute(this.env.DATA_DIR || ''), 'BOT_DURABLE_STORAGE=true y DATA_DIR absoluto.');
    } else {
      add('Token sandbox', Boolean(this.env.TRADIER_SANDBOX_TOKEN), 'TRADIER_SANDBOX_TOKEN configurado.');
      add('Cuenta sandbox', /^[A-Z0-9]{4,20}$/i.test(String(this.env.BOT_SANDBOX_ACCOUNT_ID || '').trim()), 'BOT_SANDBOX_ACCOUNT_ID configurado.');
    }
    add('Riesgo máximo', isNum(Number(this.env.CREDIT_BOT_MAX_RISK_USD || 500)) && Number(this.env.CREDIT_BOT_MAX_RISK_USD || 500) >= 25, 'CREDIT_BOT_MAX_RISK_USD ≥ 25.');
    return { mode: this.mode, ok: checks.every((check) => check.ok), checks };
  }

  broker() {
    const live = this.mode === 'live';
    const account = String((live ? this.env.BOT_ACCOUNT_ID : this.env.BOT_SANDBOX_ACCOUNT_ID) || '').trim().toUpperCase();
    const token = live ? config.tradier.token : this.env.TRADIER_SANDBOX_TOKEN;
    return new TradingBroker({ mode: live ? 'live' : 'paper', account, token });
  }

  summary() {
    const closed = (this.state.history || []).filter((trade) => isNum(trade.realizedUsd));
    const wins = closed.filter((trade) => trade.realizedUsd > 0).length;
    const losses = closed.filter((trade) => trade.realizedUsd <= 0).length;
    const totalPnlUsd = roundTick(closed.reduce((sum, trade) => sum + trade.realizedUsd, 0));
    const captures = closed.map((trade) => trade.premiumCapturePct).filter(isNum);
    const maes = closed.map((trade) => trade.maePctOfCredit).filter(isNum);
    return {
      trades: closed.length,
      wins,
      losses,
      winRate: closed.length ? roundTick((wins / closed.length) * 100) : null,
      totalPnlUsd,
      expectancyUsd: closed.length ? roundTick(totalPnlUsd / closed.length) : null,
      avgCapturePct: captures.length ? roundTick(captures.reduce((sum, value) => sum + value, 0) / captures.length) : null,
      avgMaePct: maes.length ? roundTick(maes.reduce((sum, value) => sum + value, 0) / maes.length) : null
    };
  }

  stats() {
    const closed = (this.state.history || []).filter((trade) => isNum(trade.realizedUsd));
    const byStrategy = {};
    const byReason = {};
    for (const trade of closed) {
      const strategy = trade.strategy || 'OTRA';
      const reason = trade.closeReason || 'OTRA';
      byStrategy[strategy] = byStrategy[strategy] || { trades: 0, pnl: 0, wins: 0 };
      byStrategy[strategy].trades += 1;
      byStrategy[strategy].pnl = roundTick(byStrategy[strategy].pnl + trade.realizedUsd);
      if (trade.realizedUsd > 0) byStrategy[strategy].wins += 1;
      byReason[reason] = byReason[reason] || { trades: 0, pnl: 0 };
      byReason[reason].trades += 1;
      byReason[reason].pnl = roundTick(byReason[reason].pnl + trade.realizedUsd);
    }
    const equity = [];
    let running = 0;
    for (const trade of closed.slice().reverse()) {
      running = roundTick(running + trade.realizedUsd);
      equity.push({ at: trade.closedAt, pnl: running });
    }
    let peak = 0;
    let maxDrawdown = 0;
    let runningEquity = 0;
    for (const trade of closed.slice().reverse()) {
      runningEquity = roundTick(runningEquity + trade.realizedUsd);
      peak = Math.max(peak, runningEquity);
      maxDrawdown = Math.min(maxDrawdown, roundTick(runningEquity - peak));
    }
    const winsList = closed.filter((trade) => trade.realizedUsd > 0).map((trade) => trade.realizedUsd);
    const lossesList = closed.filter((trade) => trade.realizedUsd <= 0).map((trade) => trade.realizedUsd);
    return {
      summary: this.summary(),
      maxDrawdownUsd: roundTick(maxDrawdown),
      avgWinUsd: winsList.length ? roundTick(winsList.reduce((sum, value) => sum + value, 0) / winsList.length) : null,
      avgLossUsd: lossesList.length ? roundTick(lossesList.reduce((sum, value) => sum + value, 0) / lossesList.length) : null,
      byStrategy: Object.entries(byStrategy).map(([strategy, value]) => ({ strategy, ...value, winRate: value.trades ? roundTick((value.wins / value.trades) * 100) : null })),
      byExitReason: Object.entries(byReason).map(([reason, value]) => ({ reason, ...value })),
      equity,
      lessons: (this.state.lessons || []).slice(-10),
      riskMultiplier: this.riskMultiplier(),
      totals: { log: (this.state.log || []).length, lessons: (this.state.lessons || []).length }
    };
  }

  riskMultiplier() {
    if (!this.settings.adaptiveLearning) return 1;
    const closed = (this.state.history || []).filter((trade) => isNum(trade.realizedUsd)).slice(-8);
    if (closed.length < 4) return 1;
    let consecutiveLosses = 0;
    for (const trade of closed.slice().reverse()) {
      if (trade.realizedUsd <= 0) consecutiveLosses += 1;
      else break;
    }
    const wins = closed.filter((trade) => trade.realizedUsd > 0).length;
    if (consecutiveLosses >= 2) return 0.5;
    if (wins / closed.length < 0.4) return 0.6;
    return 1;
  }

  async postMortem(trade) {
    if (this.aiReview === 'off' || !trade) return null;
    try {
      const result = await analyzeTask({ task: 'journal', provider: 'auto', payload: {
        mode: this.mode, symbol: trade.symbol, strategy: trade.strategy, expiration: trade.expiration,
        entryCredit: trade.credit, contracts: trade.contracts, exit: trade.closePrice,
        pnlUsd: trade.realizedUsd, capturePct: trade.premiumCapturePct, maePct: trade.maePctOfCredit,
        closeReason: trade.closeReason
      } });
      const lesson = { at: this.now().toISOString(), tradeKey: trade.openedAt, provider: result.provider, text: String(result.text || '').slice(0, 600) };
      this.state.lessons = [...(this.state.lessons || []), lesson].slice(-30);
      trade.aiReview = lesson;
      this.log('AI_LESSON', { provider: result.provider, text: lesson.text.slice(0, 120) });
      this.save();
      return lesson;
    } catch (error) {
      this.log('AI_ERROR', { error: error.message });
      this.save();
      return null;
    }
  }

  status() {
    return {
      mode: this.mode,
      profile: this.profile,
      armed: this.state.armed,
      paused: this.state.paused,
      gates: this.gates(),
      cycle: this.state.cycle,
      lastDecision: this.state.lastDecision,
      position: this.state.position,
      history: this.state.history.slice(-12),
      summary: this.summary(),
      aiReview: this.aiReview,
      autoArm: this.autoArm,
      aiLast: this.state.aiLast || null,
      lastVerify: this.state.lastVerify || null,
      config: this.getConfig(),
      vixRegime: this.state.vixRegime || null,
      ivr: this.state.ivr || null,
      stats: this.stats(),
      log: (this.state.log || []).slice(-40),
      settings: {
        symbol: this.settings.symbol,
        dte: [this.settings.dteMin, this.settings.dteMax],
        delta: [this.settings.shortDeltaMin, this.settings.shortDeltaMax],
        condorDelta: [this.settings.condorDeltaMin, this.settings.condorDeltaMax],
        minCreditWidth: this.settings.minCreditWidth,
        minCreditUsd: this.settings.minCreditUsd,
        minIvRatio: this.settings.minIvRatio,
        profitTargetPct: this.settings.profitTargetPct,
        hardStopMultiple: this.settings.hardStopMultiple,
        stopMode: this.settings.stopMode,
        timeExitDte: this.settings.timeExitDte
      }
    };
  }

  maybeAutoArm() {
    if (this.state.armed || !this.autoArm) return this.state.armed;
    if (!this.gates().ok) return false;
    this.state.armed = true;
    this.state.cycle = { state: 'ARMADO', note: 'Auto-armado en ' + this.mode + '.' };
    this.save();
    return true;
  }

  async verifyLiveToken() {
    if (this.mode !== 'live') return { ok: true, mode: 'paper', note: 'El modo paper ya está validado con el token sandbox.' };
    const token = config.tradier.token || String(this.env.TRADIER_TOKEN || '');
    if (!token) {
      this.state.lastVerify = { ok: false, at: this.now().toISOString(), error: 'Falta TRADIER_TOKEN de producción.' };
      this.save();
      return this.state.lastVerify;
    }
    try {
      const live = new TradierClient({ token, baseUrl: LIVE_URL, sandbox: false, realtimeEntitled: true });
      const payload = await live.request('/user/profile');
      const account = payload?.profile?.account;
      const result = {
        ok: true,
        at: this.now().toISOString(),
        name: payload?.profile?.name || null,
        accountType: account?.type || null,
        optionLevel: account?.option_level ?? null,
        accounts: account?.account_number ? [{ id: account.account_number, type: account.type || null, status: account.status || null }] : []
      };
      this.state.lastVerify = result;
      this.save();
      return result;
    } catch (error) {
      this.state.lastVerify = { ok: false, at: this.now().toISOString(), error: error.message || 'Tradier rechazó el token.' };
      this.save();
      return this.state.lastVerify;
    }
  }

  async reviewPlan(plan, context) {
    const reviewer = this.reviewer || (async ({ plan: planPayload, context: contextPayload }) => {
      const result = await analyzeTask({ task: 'bot', provider: 'auto', payload: { plan: planPayload, context: contextPayload } });
      return { ...(result.structured || {}), provider: result.provider, model: result.model };
    });
    let review = null;
    try {
      const lessons = (this.state.lessons || []).slice(-5).map((lesson) => lesson.text);
      review = await reviewer({ plan, context: { ...context, recentLessons: lessons } });
    } catch (error) {
      review = { decision: 'WAIT', reasons: ['IA no disponible: ' + error.message] };
    }
    const decision = String(review?.decision || 'WAIT').toUpperCase();
    const normalized = {
      decision: ['APPROVE', 'REJECT', 'WAIT'].includes(decision) ? decision : 'WAIT',
      confidence: Number.isFinite(Number(review?.confidence)) ? Math.max(0, Math.min(100, Number(review.confidence))) : null,
      reasons: Array.isArray(review?.reasons) ? review.reasons.slice(0, 4).map(String) : [],
      risks: Array.isArray(review?.risks) ? review.risks.slice(0, 4).map(String) : [],
      adjustments: Array.isArray(review?.adjustments) ? review.adjustments.slice(0, 3).map(String) : [],
      provider: review?.provider || 'deepseek',
      at: this.now().toISOString()
    };
    this.state.aiLast = normalized;
    this.save();
    return normalized;
  }

  eventChecks(dte) {
    const events = eventRisk({ now: this.now(), dte, entryBlockDays: this.settings.entryBlockDays, positionWarnDays: this.settings.positionWarnDays });
    const blocking = [];
    if (events.blockEntry) blocking.push(events.note || 'Evento macro inminente.');
    const fomcSoon = events.upcoming.find((event) => event.type === 'FOMC' && Math.abs((Date.parse(event.date + 'T20:00:00Z') - this.now()) / DAY) <= this.settings.fomcEntryBlockDays);
    if (fomcSoon) blocking.push('FOMC el ' + fomcSoon.date + ': no abrir 7 días antes.');
    const warnings = events.duringTrade.map((event) => event.type + ' ' + event.date + ' dentro del vencimiento');
    return { blocking, warnings };
  }

  termStructure(snapshot, spot) {
    const points = [];
    for (const candidate of snapshot.expirations || []) {
      const candidateDte = dteFor(snapshot, candidate);
      if (!isNum(candidateDte) || candidateDte < 10) continue;
      const iv = atmIvForChain(optionChainFor(snapshot, candidate), spot);
      if (isNum(iv)) points.push({ dte: candidateDte, iv });
    }
    points.sort((left, right) => left.dte - right.dte);
    if (points.length < 2) return null;
    const front = points[0].iv;
    const back = points[points.length - 1].iv;
    return { front, back, inverted: front > back * 1.03, points };
  }

  readContext(snapshot) {
    const spot = snapshot?.quote?.price;
    const closes = (snapshot.history || []).map((bar) => bar?.close);
    const ema50 = ema(closes, 50);
    const ema200 = ema(closes, 200);
    const rsi14 = rsi(closes, 14);
    const atr = atrSeries(snapshot.history) || (isNum(spot) ? spot * 0.012 : null);
    return {
      spot,
      closes,
      ema50,
      ema200,
      rsi14,
      atr,
      slope: emaSlope(closes, 50, 5),
      distanceAtr: isNum(spot) && isNum(ema50) && isNum(atr) ? Math.abs(spot - ema50) / Math.max(atr, 0.01) : null,
      uptrend: isNum(spot) && isNum(ema50) && isNum(ema200) && spot > ema50 && ema50 > ema200,
      downtrend: isNum(spot) && isNum(ema50) && isNum(ema200) && spot < ema50 && ema50 < ema200,
      minutes: etMinutes(this.now()),
      rv: realizedVol(snapshot.history)
    };
  }

  updateVixRegime(ratio) {
    if (!isNum(ratio) || ratio <= 0) return this.state.vixRegime || null;
    const today = this.now().toISOString().slice(0, 10);
    const samples = (this.state.vixSamples || []).filter((sample) => sample.date !== today);
    samples.push({ date: today, ratio: round2(ratio) });
    const recent = samples.slice(-7);
    this.state.vixSamples = recent;
    const slope3 = recent.length >= 2 ? round2(recent[recent.length - 1].ratio - recent[Math.max(0, recent.length - 4)].ratio) : 0;
    const max5 = recent.length ? Math.max(...recent.slice(-5).map((sample) => sample.ratio)) : ratio;
    const block = this.settings.blockBackwardationVix && ratio > this.settings.vixBlockThreshold && slope3 > 0;
    const halfSize = !block && ratio >= 1 && ratio < max5 && max5 >= this.settings.vixReentryFloor;
    const regime = {
      at: this.now().toISOString(), ratio: round2(ratio), slope3, max5: round2(max5),
      state: block ? 'PAUSA' : halfSize ? 'REENTRADA_50' : 'NORMAL',
      block, sizeFactor: halfSize ? 0.5 : 1,
      note: block ? 'VIX/VIX3M escalando (' + round2(ratio) + '): pausa hasta que deje de subir' : halfSize ? 'Re-entrada post-pánico al 50% (ratio ' + round2(ratio) + ')' : null
    };
    this.state.vixRegime = regime;
    this.save();
    return regime;
  }

  vixSizeFactor() {
    return this.state.vixRegime?.sizeFactor ?? 1;
  }

  updateIvr(atmIv, rv) {
    if (!isNum(atmIv) || atmIv <= 0) return this.state.ivr || null;
    const today = this.now().toISOString().slice(0, 10);
    const samples = (this.state.ivHistory || []).filter((sample) => sample.date !== today);
    samples.push({ date: today, atmIv: round2(atmIv), rv: isNum(rv) ? round2(rv) : null });
    this.state.ivHistory = samples.slice(-252);
    const values = this.state.ivHistory.map((sample) => sample.atmIv).sort((left, right) => left - right);
    const low = values[0];
    const high = values[values.length - 1];
    const ivr = values.length >= 2 ? Math.round(((atmIv - low) / Math.max(0.0001, high - low)) * 100) : null;
    this.state.ivr = { at: this.now().toISOString(), value: ivr, samples: values.length >= 2 ? low : null, count: values.length };
    return this.state.ivr;
  }

  ivrBlock(atmIv, rv) {
    const info = this.updateIvr(atmIv, rv);
    if (!info || !isNum(info.value) || info.count < this.settings.ivrMinSamples) return { block: false, info, reason: null };
    if (info.value < this.settings.ivrFloor) return { block: true, info, reason: 'IV Rank ' + info.value + ' por debajo de ' + this.settings.ivrFloor + ': prima barata, esperar.' };
    return { block: false, info, reason: null };
  }

  playbook(snapshot) {
    const notes = [];
    const warnings = [];
    const ctx = this.readContext(snapshot);
    const spot = ctx.spot;
    if (!isNum(spot)) return { plan: null, notes: ['Sin precio.'], warnings };
    const { uptrend, downtrend, minutes } = ctx;
    if (minutes < this.settings.entryFromMinutes || minutes > this.settings.entryToMinutes) notes.push('Fuera de la ventana de entrada (10:00–15:00 ET).');
    if (!uptrend && !downtrend) {
      if (this.settings.allowCondor && this.settings.strategies.ironCondor) {
        const result = this.condorPlan(snapshot, ctx);
        result.strategySelected = 'IRON_CONDOR';
        return result;
      }
      notes.push(this.settings.strategies.ironCondor ? 'Sin tendencia clara (EMA50 y EMA200 alineadas requeridas).' : 'Iron condor deshabilitado.');
      return { plan: null, notes, warnings, dte: null, strategySelected: null };
    }
    if (uptrend && !this.settings.strategies.bullPut) return { plan: null, notes: ['Bull put deshabilitado.'], warnings, dte: null, strategySelected: null };
    if (downtrend && !this.settings.strategies.bearCall) return { plan: null, notes: ['Bear call deshabilitado.'], warnings, dte: null, strategySelected: null };
    if (isNum(ctx.distanceAtr) && ctx.distanceAtr < this.settings.minAtrTrend) notes.push('Precio pegado a la EMA50 (' + round2(ctx.distanceAtr) + ' ATR): riesgo de lateral.');
    if (isNum(ctx.slope) && ((uptrend && ctx.slope <= 0) || (downtrend && ctx.slope >= 0))) notes.push('Pendiente EMA50 no acompaña la tendencia.');
    if (uptrend && isNum(ctx.rsi14) && ctx.rsi14 > 78) notes.push('RSI en sobrecompra extrema.');
    if (downtrend && isNum(ctx.rsi14) && ctx.rsi14 < 22) notes.push('RSI en sobreventa extrema.');
    const type = downtrend && !uptrend ? 'call' : 'put';

    const candidates = (snapshot.expirations || [])
      .map((expiration) => ({ expiration, dte: dteFor(snapshot, expiration) }))
      .filter((row) => isNum(row.dte) && row.dte >= this.settings.dteMin && row.dte <= this.settings.dteMax)
      .sort((left, right) => Math.abs(left.dte - this.settings.targetDte) - Math.abs(right.dte - this.settings.targetDte));
    if (!candidates.length) notes.push('Sin vencimientos entre ' + this.settings.dteMin + ' y ' + this.settings.dteMax + ' días.');
    const expiration = candidates[0]?.expiration || null;
    const dte = candidates[0]?.dte ?? null;
    const chain = expiration ? optionChainFor(snapshot, expiration) : [];
    const atmIv = atmIvForChain(chain, spot);
    if (isNum(atmIv) && isNum(ctx.rv) && atmIv / ctx.rv < this.settings.minIvRatio) {
      notes.push('IV (' + round2(atmIv * 100) + '%) no supera la realizada (' + round2(ctx.rv * 100) + '%): sin ventaja.');
    }
    if (this.settings.requireContango) {
      const term = this.termStructure(snapshot, spot);
      if (term?.inverted) notes.push('Estructura de IV invertida (' + round2(term.front * 100) + '% vs ' + round2(term.back * 100) + '%): pánico, no vender prima.');
    }
    const vixRegime = this.state.vixRegime;
    if (vixRegime?.block) notes.push(vixRegime.note || 'VIX escalando: pausa.');
    const ivr = this.ivrBlock(atmIv, ctx.rv);
    if (ivr.block) notes.push(ivr.reason);
    const events = this.eventChecks(dte || 0);
    notes.push(...events.blocking);
    warnings.push(...events.warnings);
    warnings.push(...(vixRegime?.note ? [vixRegime.note] : []));

    const spreadPct = (option) => ((option.ask - option.bid) / ((option.ask + option.bid) / 2)) * 100;
    const legOptions = chain.filter((option) => option.type === type && isNum(option.delta) && isNum(option.bid) && option.bid > 0)
      .map((option) => ({ ...option, absDelta: Math.abs(option.delta) }))
      .filter((option) => option.absDelta >= this.settings.shortDeltaMin && option.absDelta <= this.settings.shortDeltaMax)
      .sort((left, right) => Math.abs(left.absDelta - this.settings.targetDelta) - Math.abs(right.absDelta - this.settings.targetDelta));
    const shortOption = legOptions[0] || null;
    if (!shortOption) notes.push('Sin contrato en la banda de delta ' + this.settings.shortDeltaMin + '–' + this.settings.shortDeltaMax + '.');
    const maxRisk = Number(this.env.CREDIT_BOT_MAX_RISK_USD || 500);
    const equity = Number(this.env.CREDIT_BOT_EQUITY || 0);
    const riskBudget = equity > 0 ? Math.min(maxRisk, equity * (this.settings.riskPct / 100)) : maxRisk;

    let best = null;
    if (shortOption) {
      for (const candidateWidth of [1, 2, 3, 4, 5, 6, 7]) {
        const targetStrike = type === 'put' ? shortOption.strike - candidateWidth : shortOption.strike + candidateWidth;
        const longCandidate = chain.filter((option) => option.type === type && isNum(option.strike) && isNum(option.ask) && option.ask > 0
          && (type === 'put' ? option.strike < shortOption.strike - 0.001 : option.strike > shortOption.strike + 0.001))
          .sort((left, right) => Math.abs(left.strike - targetStrike) - Math.abs(right.strike - targetStrike))[0] || null;
        if (!longCandidate) continue;
        const realWidth = Math.abs(shortOption.strike - longCandidate.strike);
        const candidateCredit = roundTick((shortOption.bid + shortOption.ask) / 2 - (longCandidate.bid + longCandidate.ask) / 2);
        if (!(candidateCredit > 0)) continue;
        const candidateCreditWidth = candidateCredit / realWidth;
        if (candidateCreditWidth < this.settings.minCreditWidth) continue;
        if (candidateCredit * 100 < this.settings.minCreditUsd) continue;
        if (spreadPct(shortOption) > this.settings.maxSpreadPct * 100 || spreadPct(longCandidate) > this.settings.maxSpreadPct * 100) continue;
        if ((shortOption.openInterest || 0) < this.settings.minOpenInterest || (longCandidate.openInterest || 0) < this.settings.minOpenInterest) continue;
        const candidateMaxLoss = roundTick((realWidth - candidateCredit) * 100);
        const candidateContracts = Math.max(0, Math.min(this.settings.contractsCap, Math.floor(riskBudget / candidateMaxLoss)));
        if (candidateContracts < 1) continue;
        const score = candidateCreditWidth * 100 + candidateContracts * 2;
        if (!best || score > best.score) best = { long: longCandidate, credit: candidateCredit, width: realWidth, creditWidth: candidateCreditWidth, maxLoss: candidateMaxLoss, contracts: candidateContracts, score };
      }
      if (!best) notes.push('Crédito/ancho insuficiente o ningún ancho entra en el presupuesto de riesgo ($' + Math.round(riskBudget) + ').');
    }

    const plan = best ? {
      symbol: this.settings.symbol,
      strategy: type === 'put' ? 'BULL_PUT_CREDIT' : 'BEAR_CALL_CREDIT',
      direction: type === 'put' ? 'BULLISH' : 'BEARISH',
      expiration,
      dte,
      spot: round2(spot),
      width: round2(best.width),
      credit: best.credit,
      creditWidth: round2(best.creditWidth * 100) / 100,
      maxLossPerContract: best.maxLoss,
      contracts: best.contracts,
      riskUsd: roundTick(best.maxLoss * best.contracts),
      shortStrike: shortOption.strike,
      longStrike: best.long.strike,
      legs: [
        { action: 'SELL', type, strike: shortOption.strike, price: roundTick((shortOption.bid + shortOption.ask) / 2), delta: round2(shortOption.delta), iv: shortOption.iv, oi: shortOption.openInterest, symbol: shortOption.symbol },
        { action: 'BUY', type, strike: best.long.strike, price: roundTick((best.long.bid + best.long.ask) / 2), delta: round2(best.long.delta), iv: best.long.iv, oi: best.long.openInterest, symbol: best.long.symbol }
      ],
      exits: {
        profitTargetUsd: roundTick(best.credit * 100 * best.contracts * this.settings.profitTargetPct / 100),
        stopLossUsd: roundTick(best.credit * 100 * best.contracts * -this.settings.hardStopMultiple),
        hardStopUsd: roundTick(best.credit * 100 * best.contracts * -this.settings.hardStopMultiple),
        stopMode: this.settings.stopMode,
        shortStrikeStop: shortOption.strike,
        timeExitDte: this.settings.timeExitDte,
        hardExitDte: this.settings.hardExitDte
      },
      context: {
        ema50: round2(ctx.ema50),
        ema200: round2(ctx.ema200),
        rsi14: round2(ctx.rsi14),
        slope: round2(ctx.slope),
        atr: round2(ctx.atr),
        distanceAtr: round2(ctx.distanceAtr),
        atmIv: round2(atmIv),
        realizedVol: round2(ctx.rv),
        ivRatio: isNum(atmIv) && isNum(ctx.rv) && ctx.rv > 0 ? round2(atmIv / ctx.rv) : null,
        eventsDuringTrade: events.warnings
      },
      generatedAt: this.now().toISOString()
    } : null;

    return { plan: notes.length ? null : plan, notes, warnings, dte };
  }

  condorPlan(snapshot, ctx) {
    const notes = [];
    const warnings = [];
    const spot = ctx.spot;
    if (false && this.settings.blockBackwardationVix && isNum(snapshot.vix?.ratio) && snapshot.vix.ratio >= 1) {
      notes.push('VIX en backwardation (ratio ' + round2(snapshot.vix.ratio) + '): no vender prima.');
    }
    if (ctx.minutes < this.settings.entryFromMinutes || ctx.minutes > this.settings.entryToMinutes) notes.push('Fuera de la ventana de entrada (10:00–15:00 ET).');
    if (!isNum(ctx.rsi14) || ctx.rsi14 < 38 || ctx.rsi14 > 62) notes.push('RSI fuera de 38–62: sin rango para condor.');
    if (isNum(ctx.distanceAtr) && ctx.distanceAtr > 0.9) notes.push('Precio lejos de la EMA50: no es rango.');
    const candidates = (snapshot.expirations || [])
      .map((expiration) => ({ expiration, dte: dteFor(snapshot, expiration) }))
      .filter((row) => isNum(row.dte) && row.dte >= this.settings.dteMin && row.dte <= this.settings.dteMax)
      .sort((left, right) => Math.abs(left.dte - this.settings.targetDte) - Math.abs(right.dte - this.settings.targetDte));
    if (!candidates.length) notes.push('Sin vencimientos en el rango del perfil.');
    const expiration = candidates[0]?.expiration || null;
    const dte = candidates[0]?.dte ?? null;
    const chain = expiration ? optionChainFor(snapshot, expiration) : [];
    const atmIv = atmIvForChain(chain, spot);
    if (isNum(atmIv) && isNum(ctx.rv) && atmIv / ctx.rv < this.settings.minIvRatio) notes.push('IV no supera la realizada: sin ventaja.');
    if (this.settings.requireContango) {
      const term = this.termStructure(snapshot, spot);
      if (term?.inverted) notes.push('Estructura de IV invertida: no vender prima.');
    }
    const vixRegime = this.state.vixRegime;
    if (vixRegime?.block) notes.push(vixRegime.note || 'VIX escalando: pausa.');
    const events = this.eventChecks(dte || 0);
    notes.push(...events.blocking);
    warnings.push(...events.warnings);

    const pick = (type) => chain.filter((option) => option.type === type && isNum(option.delta) && isNum(option.ask) && option.ask > 0)
      .map((option) => ({ ...option, absDelta: Math.abs(option.delta) }))
      .filter((option) => option.absDelta >= this.settings.condorDeltaMin && option.absDelta <= this.settings.condorDeltaMax)
      .sort((left, right) => Math.abs(left.absDelta - this.settings.condorTargetDelta) - Math.abs(right.absDelta - this.settings.condorTargetDelta))[0] || null;
    const shortPut = pick('put');
    const shortCall = pick('call');
    if (!shortPut || !shortCall) notes.push('Sin strikes en la banda de delta para el condor.');
    const maxRisk = Number(this.env.CREDIT_BOT_MAX_RISK_USD || 500);
    const equity = Number(this.env.CREDIT_BOT_EQUITY || 0);
    const baseBudget = equity > 0 ? Math.min(maxRisk, equity * (this.settings.riskPct / 100)) : maxRisk;
    const riskBudget = roundTick(Math.max(25, baseBudget * this.riskMultiplier() * this.vixSizeFactor()));
    const spreadPct = (option) => ((option.ask - option.bid) / ((option.ask + option.bid) / 2)) * 100;
    let best = null;
    if (shortPut && shortCall) {
      for (const candidateWidth of [1, 2, 3, 4, 5]) {
        const longPut = chain.filter((option) => option.type === 'put' && isNum(option.strike) && option.ask > 0 && option.strike < shortPut.strike - 0.001)
          .sort((left, right) => Math.abs(left.strike - (shortPut.strike - candidateWidth)) - Math.abs(right.strike - (shortPut.strike - candidateWidth)))[0] || null;
        const longCall = chain.filter((option) => option.type === 'call' && isNum(option.strike) && option.ask > 0 && option.strike > shortCall.strike + 0.001)
          .sort((left, right) => Math.abs(left.strike - (shortCall.strike + candidateWidth)) - Math.abs(right.strike - (shortCall.strike + candidateWidth)))[0] || null;
        if (!longPut || !longCall) continue;
        const width = Math.max(Math.abs(shortPut.strike - longPut.strike), Math.abs(longCall.strike - shortCall.strike));
        const credit = roundTick((shortPut.bid + shortPut.ask) / 2 - (longPut.bid + longPut.ask) / 2 + (shortCall.bid + shortCall.ask) / 2 - (longCall.bid + longCall.ask) / 2);
        if (!(credit > 0)) continue;
        const creditWidth = credit / width;
        if (creditWidth < this.settings.minCreditWidth) continue;
        if (credit * 100 < this.settings.minCreditUsd) continue;
        if ([shortPut, longPut, shortCall, longCall].some((option) => spreadPct(option) > this.settings.maxSpreadPct * 100)) continue;
        if ([shortPut, longPut, shortCall, longCall].some((option) => (option.openInterest || 0) < this.settings.minOpenInterest)) continue;
        const maxLoss = roundTick((width - credit) * 100);
        const contracts = Math.max(0, Math.min(this.settings.contractsCap, Math.floor(riskBudget / maxLoss)));
        if (contracts < 1) continue;
        const score = creditWidth * 100 + contracts * 2;
        if (!best || score > best.score) best = { shortPut, shortCall, longPut, longCall, width, credit, creditWidth, maxLoss, contracts, score };
      }
      if (!best) notes.push('Crédito/ancho insuficiente para un condor en el presupuesto.');
    }

    const plan = best ? {
      symbol: this.settings.symbol,
      strategy: 'IRON_CONDOR',
      direction: 'NEUTRAL',
      expiration,
      dte,
      spot: round2(spot),
      width: round2(best.width),
      credit: best.credit,
      creditWidth: round2(best.creditWidth * 100) / 100,
      maxLossPerContract: best.maxLoss,
      contracts: best.contracts,
      riskUsd: roundTick(best.maxLoss * best.contracts),
      shortPut: best.shortPut.strike,
      shortCall: best.shortCall.strike,
      longPut: best.longPut.strike,
      longCall: best.longCall.strike,
      legs: [
        { action: 'SELL', type: 'put', strike: best.shortPut.strike, price: roundTick((best.shortPut.bid + best.shortPut.ask) / 2), delta: round2(best.shortPut.delta), iv: best.shortPut.iv, oi: best.shortPut.openInterest, symbol: best.shortPut.symbol },
        { action: 'BUY', type: 'put', strike: best.longPut.strike, price: roundTick((best.longPut.bid + best.longPut.ask) / 2), delta: round2(best.longPut.delta), iv: best.longPut.iv, oi: best.longPut.openInterest, symbol: best.longPut.symbol },
        { action: 'SELL', type: 'call', strike: best.shortCall.strike, price: roundTick((best.shortCall.bid + best.shortCall.ask) / 2), delta: round2(best.shortCall.delta), iv: best.shortCall.iv, oi: best.shortCall.openInterest, symbol: best.shortCall.symbol },
        { action: 'BUY', type: 'call', strike: best.longCall.strike, price: roundTick((best.longCall.bid + best.longCall.ask) / 2), delta: round2(best.longCall.delta), iv: best.longCall.iv, oi: best.longCall.openInterest, symbol: best.longCall.symbol }
      ],
      exits: {
        profitTargetUsd: roundTick(best.credit * 100 * best.contracts * this.settings.profitTargetPct / 100),
        stopLossUsd: roundTick(best.credit * 100 * best.contracts * -this.settings.hardStopMultiple),
        hardStopUsd: roundTick(best.credit * 100 * best.contracts * -this.settings.hardStopMultiple),
        stopMode: this.settings.stopMode,
        timeExitDte: this.settings.timeExitDte,
        hardExitDte: this.settings.hardExitDte
      },
      context: {
        ema50: round2(ctx.ema50),
        ema200: round2(ctx.ema200),
        rsi14: round2(ctx.rsi14),
        distanceAtr: round2(ctx.distanceAtr),
        atmIv: round2(atmIv),
        realizedVol: round2(ctx.rv),
        ivRatio: isNum(atmIv) && isNum(ctx.rv) && ctx.rv > 0 ? round2(atmIv / ctx.rv) : null,
        eventsDuringTrade: events.warnings
      },
      generatedAt: this.now().toISOString()
    } : null;

    return { plan: notes.length ? null : plan, notes, warnings, dte };
  }

  async manage() {
    const position = this.state.position;
    if (!position) return;
    const broker = this.broker();
    const symbols = position.legs.map((leg) => leg.symbol);
    const quotes = await broker.getQuotes(symbols);
    const marks = symbols.map((symbol) => quotes.find((quote) => quote.symbol === symbol));
    if (marks.some((quote) => !quote || !isNum(quote.price))) {
      this.state.cycle = { state: 'ERROR', note: 'Sin cotización de las patas.' };
      return;
    }
    const creditNow = roundTick(position.legs.reduce((sum, leg, index) => sum + (leg.action === 'SELL' ? 1 : -1) * marks[index].price, 0));
    const pnlUsd = roundTick((position.credit - creditNow) * 100 * position.contracts);
    const dte = Math.round((Date.parse(position.expiration + 'T21:00:00Z') - this.now()) / DAY);
    const maeCredit = Math.max(position.maeCredit ?? position.credit, creditNow);
    this.state.position = {
      ...position,
      currentCredit: creditNow,
      pnlUsd,
      dte,
      maeCredit,
      maePctOfCredit: position.credit > 0 ? roundTick(((maeCredit - position.credit) / position.credit) * 100) : null
    };
    const targetUsd = position.credit * 100 * position.contracts * this.settings.profitTargetPct / 100;
    const premiumStopUsd = position.credit * 100 * position.contracts * this.settings.stopMultiple;
    const hardStopUsd = position.credit * 100 * position.contracts * this.settings.hardStopMultiple;
    let reason = null;
    if (pnlUsd >= targetUsd) reason = 'OBJETIVO';
    else if (this.settings.stopMode !== 'underlying' && pnlUsd <= -premiumStopUsd) reason = 'STOP_2X';
    else if (pnlUsd <= -hardStopUsd) reason = 'STOP_DURO';
    else if (dte <= this.settings.timeExitDte) reason = 'TIEMPO';
    if (!reason && this.settings.stopMode !== 'premium') {
      const snapshot = await getSnapshot(this.settings.symbol, { tradier: config.tradier.token ? this.market : undefined });
      const spot = snapshot?.quote?.price;
      if (isNum(spot)) {
        if (position.strategy === 'IRON_CONDOR') {
          if (isNum(position.shortPut) && spot <= position.shortPut) reason = 'SUBYACENTE';
          if (isNum(position.shortCall) && spot >= position.shortCall) reason = 'SUBYACENTE';
        } else {
          const shortLeg = position.legs.find((leg) => leg.action === 'SELL');
          if (shortLeg && ((shortLeg.type === 'put' && spot <= shortLeg.strike) || (shortLeg.type === 'call' && spot >= shortLeg.strike))) reason = 'SUBYACENTE';
        }
      }
    }
    if (!reason && isNum(this.settings.deltaStop) && this.settings.deltaStop > 0) {
      try {
        const snapshot = await getSnapshot(this.settings.symbol, { tradier: config.tradier.token ? this.market : undefined });
        const chain = optionChainFor(snapshot, position.expiration);
        const shortLeg = position.legs.find((leg) => leg.action === 'SELL');
        const match = shortLeg ? chain.find((option) => option.type === shortLeg.type && Math.abs(option.strike - shortLeg.strike) < 0.001) : null;
        if (match && isNum(match.delta) && Math.abs(match.delta) >= this.settings.deltaStop) reason = 'DELTA';
      } catch { /* sin cadena: sigue con las otras reglas */ }
    }
    if (!reason) {
      const events = eventRisk({ now: this.now(), dte: Math.max(0, dte), positionWarnDays: this.settings.positionWarnDays });
      if (events.soon.length && pnlUsd < targetUsd) reason = 'EVENTO';
    }
    if (!reason && dte > this.settings.hardExitDte) {
      this.save();
      return;
    }
    if (!reason) reason = 'TIEMPO';
    await this.closePosition(reason, creditNow);
  }

  async closePosition(reason, currentCredit) {
    const position = this.state.position;
    if (!position) return;
    const broker = this.broker();
    const trade = {
      root: position.symbol,
      width: position.width,
      legs: position.legs.map((leg) => ({ symbol: leg.symbol, direction: leg.action === 'SELL' ? -1 : 1 }))
    };
    const price = Math.max(0.01, roundTick(currentCredit));
    try {
      const tag = '5m-credit-close-' + position.openedAt.replace(/[^0-9]/g, '').slice(0, 12);
      const preview = await broker.preview(trade, 'CLOSE', price, tag);
      if (!preview) throw new Error('La previsualización de salida no fue aceptada.');
      const orderId = await broker.submit(trade, 'CLOSE', price, tag);
      const fees = preview.fees || 0;
      const realized = roundTick((position.credit - price) * 100 * position.contracts - fees);
      const capture = position.credit > 0 ? roundTick(((position.credit - price) / position.credit) * 100) : null;
      this.state.history = [...this.state.history, {
        ...position,
        closedAt: this.now().toISOString(),
        closePrice: price,
        closeReason: reason,
        orderId,
        fees,
        realizedUsd: realized,
        premiumCapturePct: capture,
        maePctOfCredit: position.maePctOfCredit ?? null
      }].slice(-100);
      this.state.position = null;
      this.state.cycle = { state: 'CERRADO', note: 'Cierre ' + reason + ': P/L USD ' + realized + ' · captura ' + (capture ?? 0) + '%.' };
      this.log('EXIT', { reason, pnlUsd: realized, capturePct: capture, maePct: position.maePctOfCredit ?? null });
      void this.postMortem(this.state.history[this.state.history.length - 1]);
    } catch (error) {
      this.state.cycle = { state: 'ERROR', note: 'No se pudo cerrar: ' + error.message };
    }
    this.save();
  }

  async openPlan(plan) {
    const broker = this.broker();
    const trade = {
      root: plan.symbol,
      width: plan.width,
      legs: plan.legs.map((leg) => ({ symbol: leg.symbol, direction: leg.action === 'SELL' ? -1 : 1 }))
    };
    const tag = '5m-credit-' + this.now().toISOString().replace(/[^0-9]/g, '').slice(0, 12);
    try {
      const price = Math.max(0.05, roundTick(plan.credit - 0.03));
      const preview = await broker.preview(trade, 'OPEN', price, tag);
      if (!preview) throw new Error('La previsualización de entrada no fue aceptada.');
      const orderId = await broker.submit(trade, 'OPEN', price, tag);
      this.state.position = {
        symbol: plan.symbol,
        strategy: plan.strategy,
        expiration: plan.expiration,
        dte: plan.dte,
        width: plan.width,
        credit: price,
        contracts: plan.contracts,
        riskUsd: plan.riskUsd,
        shortStrike: plan.shortStrike,
        shortPut: plan.shortPut ?? null,
        shortCall: plan.shortCall ?? null,
        longStrike: plan.longStrike ?? null,
        legs: plan.legs.map((leg) => ({ symbol: leg.symbol, strike: leg.strike, type: leg.type, action: leg.action })),
        openedAt: this.now().toISOString(),
        orderId,
        feesEstimated: preview.fees,
        exits: plan.exits,
        maeCredit: price
      };
      this.state.cycle = { state: 'ABIERTO', note: plan.strategy + ' abierto: crédito $' + price + ' x' + plan.contracts + '.' };
    } catch (error) {
      this.state.cycle = { state: 'ERROR', note: 'No se pudo abrir: ' + error.message };
    }
    this.save();
  }

  async runCycle() {
    if (!this.state.armed) {
      this.state.cycle = { state: 'INACTIVO', note: 'Armá el bot para que opere.' };
      return this.status();
    }
    if (this.state.paused) {
      this.state.cycle = { state: 'PAUSADO', note: 'Bot pausado manualmente.' };
      return this.status();
    }
    const gates = this.gates();
    if (!gates.ok) {
      this.state.cycle = { state: 'BLOQUEADO', note: gates.checks.filter((check) => !check.ok).map((check) => check.name).join(', ') };
      return this.status();
    }
    try {
      if (this.state.position) {
        await this.manage();
        return this.status();
      }
      if (this.mode === 'live' && (!config.tradier.token || config.tradier.sandbox)) {
        this.state.cycle = { state: 'BLOQUEADO', note: 'Live requiere datos de producción de Tradier.' };
        this.save();
        return this.status();
      }
      const snapshot = await getSnapshot(this.settings.symbol, { tradier: config.tradier.token ? this.market : undefined });
      // Régimen VIX: si VIX/VIX3M >= 1 hay backwardation (estrés) y no se vende prima.
      try {
        const vixQuotes = await this.market.getQuotes(['VIX', 'VIX3M']);
        const vix = vixQuotes.find((quote) => quote.symbol === 'VIX')?.price;
        const vix3m = vixQuotes.find((quote) => quote.symbol === 'VIX3M')?.price;
        if (isNum(vix) && isNum(vix3m) && vix3m > 0) { snapshot.vix = { vix: round2(vix), vix3m: round2(vix3m), ratio: round2(vix / vix3m) }; this.updateVixRegime(snapshot.vix.ratio); }
      } catch { /* el proveedor puede no ofrecer VIX: se usa el término de IV de SPY */ }
      const result = this.playbook(snapshot);
      this.state.lastDecision = { at: this.now().toISOString(), plan: result.plan, notes: result.notes, warnings: result.warnings, dte: result.dte ?? null, strategySelected: result.strategySelected || null };
      this.log('EVAL', { strategy: result.strategySelected || null, note: result.notes[0] || (result.plan ? 'plan valido' : 'sin plan'), plan: result.plan ? { strategy: result.plan.strategy, credit: result.plan.credit, riskUsd: result.plan.riskUsd } : null });
      if (!result.plan) {
        this.state.cycle = { state: 'ESPERANDO', note: result.notes[0] || 'Sin plan válido.' };
        this.save();
        return this.status();
      }
      if (this.aiReview !== 'off') {
        const review = await this.reviewPlan(result.plan, {
          spot: result.plan.spot,
          trend: result.plan.direction,
          dte: result.plan.dte,
          creditWidth: result.plan.creditWidth,
          contracts: result.plan.contracts,
          riskUsd: result.plan.riskUsd,
          context: result.plan.context,
          notes: result.notes,
          warnings: result.warnings,
          mode: this.mode,
          marketOpen: snapshot.marketOpen
        });
        this.state.lastDecision.ai = review;
        if (this.aiReview === 'required' && review.decision !== 'APPROVE') {
          this.state.cycle = { state: review.decision === 'REJECT' ? 'RECHAZADO_IA' : 'ESPERANDO_IA', note: 'DeepSeek ' + review.decision + (review.reasons[0] ? ': ' + review.reasons[0] : '') };
          this.save();
          return this.status();
        }
      }
      await this.openPlan(result.plan);
      this.log('ENTRY', { strategy: result.plan.strategy, credit: result.plan.credit, contracts: result.plan.contracts, riskUsd: result.plan.riskUsd });
      return this.status();
    } catch (error) {
      this.state.cycle = { state: 'ERROR', note: error.message };
      this.save();
      return this.status();
    }
  }

  arm(mode) {
    if (mode) this.mode = ['paper', 'live'].includes(String(mode).toLowerCase()) ? String(mode).toLowerCase() : this.mode;
    const gates = this.gates();
    if (!gates.ok) return { ok: false, gates };
    this.state.armed = true;
    this.state.paused = false;
    this.state.cycle = { state: 'ARMADO', note: 'Bot armado en ' + this.mode + '.' };
    this.save();
    return { ok: true, gates };
  }

  pause(paused) {
    this.state.paused = Boolean(paused);
    this.state.cycle = { state: paused ? 'PAUSADO' : 'ARMADO', note: paused ? 'Pausado manualmente.' : 'Reanudado.' };
    this.save();
    return this.status();
  }

  disarm() {
    this.state.armed = false;
    this.state.cycle = { state: 'INACTIVO', note: 'Bot desarmado.' };
    this.save();
    return this.status();
  }
}