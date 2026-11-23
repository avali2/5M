/**
 * 5M · Forex paper bot (EUR/USD y GBP/USD), libro separado.
 * Datos gratis (Yahoo con fallback Stooq), spread simulado, stop ATR, objetivo 2R.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getForexSnapshot } from '../lib/forexData.js';
import { analyzeTask } from '../lib/aiAnalyst.js';
import { highImpactEvents } from '../lib/calendar.js';

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const round5 = (value) => Math.round(value * 100000) / 100000;
const round2 = (value) => Math.round(value * 100) / 100;

const DEFAULTS = {
  symbol: 'EURUSD',
  riskUsd: 250,
  atrStopMult: 1.5,
  targetR: 2,
  maxHoldHours: 96,
  minRsi: 35,
  maxRsi: 75,
  allowShort: true,
  sessionOnly: true,
  newsBlackoutMinutes: 15,
  feePct: 0
};

export class ForexPaper {
  constructor(options = {}) {
    const { env = process.env, now = () => new Date(), fetcher = null, stateFile = 'forex-paper.json', dataDir = null } = options;
    this.env = env;
    this.now = now;
    this.fetcher = fetcher || ((settings) => getForexSnapshot({ symbol: settings.symbol }));
    this.stateFile = stateFile;
    this.dataDir = dataDir || config.dataDir;
    this.configFile = 'forex-config.json';
    this.overrides = this.loadConfig();
    this.settings = { ...DEFAULTS, ...(config.forex || {}), ...this.overrides };
    this.aiReview = this.env.FOREX_AI_REVIEW === 'off' ? 'off' : 'on';
    this.state = this.load();
  }

  file() { return path.join(this.dataDir, this.stateFile); }
  configPath() { return path.join(this.dataDir, this.configFile); }

  load() {
    const empty = { armed: false, paused: false, position: null, history: [], log: [], lessons: [], lastRound: null, cycle: { state: 'INACTIVO', note: 'Forex paper sin armar.' } };
    try { return { ...empty, ...JSON.parse(fs.readFileSync(this.file(), 'utf8')) }; }
    catch { return empty; }
  }

  loadConfig() { try { return JSON.parse(fs.readFileSync(this.configPath(), 'utf8')) || {}; } catch { return {}; } }

  save() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(this.file(), JSON.stringify(this.state, null, 1), { mode: 0o600 });
      fs.writeFileSync(this.configPath(), JSON.stringify(this.overrides, null, 1), { mode: 0o600 });
    } catch { /* sin disco */ }
  }

  log(type, data = {}) {
    this.state.log = [...(this.state.log || []), { at: this.now().toISOString(), type, ...data }].slice(-300);
  }

  getConfig() {
    return { symbol: this.settings.symbol, riskUsd: this.settings.riskUsd, atrStopMult: this.settings.atrStopMult, targetR: this.settings.targetR, maxHoldHours: this.settings.maxHoldHours, allowShort: this.settings.allowShort };
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
    if (patch.symbol !== undefined) {
      const symbol = String(patch.symbol).toUpperCase();
      if (!['EURUSD', 'GBPUSD', 'AUDUSD', 'XAUUSD', 'USDJPY', 'USDCAD'].includes(symbol)) errors.push('par no soportado');
      else next.symbol = symbol;
    }
    if (patch.allowShort !== undefined) next.allowShort = Boolean(patch.allowShort);
    num('riskUsd', 25, 2000);
    num('atrStopMult', 0.5, 4);
    num('targetR', 1, 5);
    num('maxHoldHours', 6, 720);
    if (errors.length) return { ok: false, errors };
    this.overrides = next;
    this.settings = { ...this.settings, ...next };
    this.save();
    return { ok: true, config: this.getConfig() };
  }

  stats() {
    const closed = this.state.history || [];
    const wins = closed.filter((trade) => trade.realizedUsd > 0).length;
    const totalPnlUsd = round2(closed.reduce((sum, trade) => sum + trade.realizedUsd, 0));
    const pips = closed.reduce((sum, trade) => sum + (isNum(trade.pips) ? trade.pips : 0), 0);
    return { trades: closed.length, wins, losses: closed.length - wins, winRate: closed.length ? round2((wins / closed.length) * 100) : null, totalPnlUsd, expectancyUsd: closed.length ? round2(totalPnlUsd / closed.length) : null, totalPips: round2(pips), lessons: (this.state.lessons || []).slice(-5) };
  }

  status() {
    return {
      mode: 'paper', symbol: this.settings.symbol, armed: this.state.armed, paused: this.state.paused,
      cycle: this.state.cycle, position: this.state.position, lastRound: this.state.lastRound,
      history: (this.state.history || []).slice(-10), log: (this.state.log || []).slice(-25),
      stats: this.stats(), config: this.getConfig()
    };
  }

  arm() { this.state.armed = true; this.state.paused = false; this.state.cycle = { state: 'ARMADO', note: 'Forex paper armado.' }; this.log('ARM'); this.save(); return this.status(); }
  disarm() { this.state.armed = false; this.state.cycle = { state: 'INACTIVO', note: 'Forex paper desarmado.' }; this.log('DISARM'); this.save(); return this.status(); }
  pause(paused) { this.state.paused = Boolean(paused); this.state.cycle = { state: paused ? 'PAUSADO' : 'ARMADO', note: paused ? 'Pausado.' : 'Reanudado.' }; this.save(); return this.status(); }

  async runCycle() {
    if (!this.state.armed) { this.state.cycle = { state: 'INACTIVO', note: 'Armá el módulo forex.' }; return this.status(); }
    if (this.state.paused) { this.state.cycle = { state: 'PAUSADO', note: 'Pausado.' }; return this.status(); }
    let snapshot = null;
    try { snapshot = await this.fetcher(this.settings); }
    catch (error) { this.state.cycle = { state: 'ERROR', note: 'Sin datos: ' + error.message }; this.log('ERROR', { error: error.message }); this.save(); return this.status(); }
    this.state.lastRound = { at: this.now().toISOString(), price: round5(snapshot.price), source: snapshot.source, ema50: round5(snapshot.ema50), ema200: round5(snapshot.ema200), rsi14: round2(snapshot.rsi14), atr14: round5(snapshot.atr14), spreadPips: snapshot.spreadPips, marketOpen: snapshot.marketOpen };
    if (this.state.position) {
      if (this.state.position.symbol !== this.settings.symbol) {
        try { snapshot = await this.fetcher({ ...this.settings, symbol: this.state.position.symbol }); } catch { /* mantiene snapshot */ }
      }
      if (snapshot.symbol && this.state.position.symbol !== snapshot.symbol) {
        this.state.cycle = { state: 'ERROR', note: 'Snapshot de ' + snapshot.symbol + ' no coincide con la posición ' + this.state.position.symbol + '; no se gestiona.' };
        this.save();
        return this.status();
      }
      this.state.lastRound = { at: this.now().toISOString(), symbol: snapshot.symbol, price: round5(snapshot.price), source: snapshot.source, ema50: round5(snapshot.ema50), ema200: round5(snapshot.ema200), rsi14: round2(snapshot.rsi14), atr14: round5(snapshot.atr14), spreadPips: snapshot.spreadPips, session: snapshot.session, marketOpen: snapshot.marketOpen };
      await this.manage(snapshot);
      return this.status();
    }
    this.evaluate(snapshot);
    return this.status();
  }

  evaluate(snapshot) {
    const notes = [];
    const price = snapshot.price;
    const atr = snapshot.atr14;
    if (snapshot.marketOpen === false) notes.push('Mercado forex cerrado (viernes 17:00 a domingo 17:00 ET).');
    if (this.settings.sessionOnly && snapshot.session && snapshot.session !== 'LONDON_NY') notes.push('Fuera de sesión Londres/NY (UTC ' + String(new Date().getUTCHours()).padStart(2, '0') + ':00).');
    try {
      const now = this.now();
      const upcoming = highImpactEvents({ from: now, months: 1 });
      const blackoutMs = Number(this.settings.newsBlackoutMinutes || 15) * 60000;
      const eventNear = upcoming.find((event) => {
        const diff = Date.parse(event.scheduled_at_utc) - now.getTime();
        return diff >= -5 * 60000 && diff <= blackoutMs;
      });
      if (eventNear) notes.push('Noticia de alto impacto cerca (' + eventNear.event_type + ' ' + eventNear.scheduled_at_et + '): no operar.');
    } catch { /* calendario no disponible */ }
    const snapshotAt = Date.parse(snapshot.updatedAt || '');
    if (Number.isFinite(snapshotAt) && (this.now() - snapshotAt) > 60 * 60000) notes.push('dataQuality: datos de ' + Math.round((this.now() - snapshotAt) / 60000) + ' min (max 60) (NO_TRADE)');
    if (!isNum(price) || !isNum(atr) || atr <= 0) notes.push('Sin precio o ATR válido.');
    const trendUp = isNum(snapshot.ema50) && price > snapshot.ema50;
    const trendDown = isNum(snapshot.ema50) && price < snapshot.ema50;
    const side = trendUp ? 'LONG' : (trendDown && this.settings.allowShort ? 'SHORT' : null);
    if (!side) notes.push('Sin tendencia clara (EMA50) para operar.');
    const rsi = snapshot.rsi14;
    if (isNum(rsi)) {
      if (side === 'LONG' && (rsi < this.settings.minRsi || rsi > this.settings.maxRsi)) notes.push('RSI fuera de rango para long.');
      if (side === 'SHORT' && (rsi < 25 || rsi > 65)) notes.push('RSI fuera de rango para short.');
    }
    const stopDistance = atr * this.settings.atrStopMult;
    const quoteToUsd = Number(snapshot.quoteToUsd || 1);
    const spreadMultiplier = snapshot.session && snapshot.session !== 'LONDON_NY' ? 1.6 : 1;
    const pipSize = Number(snapshot.pipSize || 0.0001);
    const halfSpread = ((Number.isFinite(snapshot.spreadPrice) ? Number(snapshot.spreadPrice) : Number(snapshot.spreadPips || 1) * pipSize) * spreadMultiplier) / 2;
    const entry = side === 'SHORT' ? round5(snapshot.bid ?? price - halfSpread) : round5(snapshot.ask ?? price + halfSpread);
    const stop = side === 'SHORT' ? round5(entry + stopDistance) : round5(entry - stopDistance);
    const target = side === 'SHORT' ? round5(entry - stopDistance * this.settings.targetR) : round5(entry + stopDistance * this.settings.targetR);
    const units = stopDistance > 0 ? this.settings.riskUsd / (stopDistance * quoteToUsd) : 0;
    if (!(units > 0)) notes.push('Tamaño de posición inválido.');
    if (notes.length) { this.state.cycle = { state: 'ESPERANDO', note: notes[0] }; this.log('EVAL', { decision: 'SKIP', notes, price: round5(price) }); this.save(); return; }
    this.state.position = {
      symbol: this.settings.symbol, side, entry, stop, target,
      units: Math.round(units), notional: round2(units * entry), riskUsd: round2(units * stopDistance * quoteToUsd),
      spreadPips: snapshot.spreadPips, openedAt: this.now().toISOString(), mae: entry
    };
    this.state.cycle = { state: 'ABIERTO', note: side + ' ' + this.settings.symbol + ' en ' + entry + ' · stop ' + stop + ' · objetivo ' + target + '.' };
    this.log('ENTRY', { side, entry, stop, target, units: Math.round(units), riskUsd: this.state.position.riskUsd });
    this.save();
  }

  async manage(snapshot) {
    const position = this.state.position;
    if (snapshot.symbol && position.symbol !== snapshot.symbol) return;
    const price = snapshot.price;
    if (!isNum(price)) return;
    const pipSize = Number(snapshot.pipSize || 0.0001);
    const quoteToUsd = Number(snapshot.quoteToUsd || 1);
    const spreadMultiplier = snapshot.session && snapshot.session !== 'LONDON_NY' ? 1.6 : 1;
    const halfSpread = ((Number.isFinite(snapshot.spreadPrice) ? Number(snapshot.spreadPrice) : Number(snapshot.spreadPips || 1) * pipSize) * spreadMultiplier) / 2;
    const exit = position.side === 'LONG' ? (snapshot.bid ?? price - halfSpread) : (snapshot.ask ?? price + halfSpread);
    const direction = position.side === 'LONG' ? 1 : -1;
    const pnlUsd = round2((exit - position.entry) * position.units * direction * quoteToUsd);
    const pips = round2(((exit - position.entry) / Number(snapshot.pipSize || 0.0001)) * direction);
    const mae = position.side === 'LONG' ? Math.min(position.mae ?? position.entry, price) : Math.max(position.mae ?? position.entry, price);
    this.state.position = { ...position, price: round5(price), pnlUsd, pips, mae: round5(mae), updatedAt: this.now().toISOString() };
    const heldHours = (this.now() - Date.parse(position.openedAt)) / 3600000;
    let reason = null;
    if (position.side === 'LONG' ? exit <= position.stop : exit >= position.stop) reason = 'STOP';
    else if (position.side === 'LONG' ? exit >= position.target : exit <= position.target) reason = 'OBJETIVO';
    else if (heldHours >= this.settings.maxHoldHours) reason = 'TIEMPO';
    if (!reason) { this.save(); return; }
    const trade = { ...position, exit: round5(exit), pnlUsd, pips, realizedUsd: pnlUsd, closedAt: this.now().toISOString(), closeReason: reason };
    this.state.history = [...(this.state.history || []), trade].slice(-100);
    this.state.position = null;
    this.state.cycle = { state: 'CERRADO', note: 'Cierre ' + reason + ': ' + pnlUsd + ' USD (' + pips + ' pips).' };
    this.log('EXIT', { reason, pnlUsd, pips });
    this.save();
    void this.postMortem(trade);
  }

  async postMortem(trade) {
    if (this.aiReview === 'off') return;
    try {
      const result = await analyzeTask({ task: 'journal', provider: 'auto', payload: { mode: 'forex-paper', symbol: trade.symbol, side: trade.side, entry: trade.entry, exit: trade.exit, pnlUsd: trade.realizedUsd, pips: trade.pips, closeReason: trade.closeReason } });
      const lesson = { at: this.now().toISOString(), provider: result.provider, text: String(result.text || '').slice(0, 500) };
      this.state.lessons = [...(this.state.lessons || []), lesson].slice(-20);
      this.log('AI_LESSON', { text: lesson.text.slice(0, 120) });
      this.save();
    } catch (error) { this.log('AI_ERROR', { error: error.message }); this.save(); }
  }
}