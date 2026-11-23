/**
 * 5M · Crypto paper bot (SOL/USDT, Binance.US).
 * Libro separado del bot de opciones: un solo activo, long-only spot, riesgo fijo,
 * stop por ATR, objetivo 2R y salida por tiempo. Nunca ejecuta dinero real.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getCryptoSnapshot } from '../lib/cryptoData.js';
import { analyzeTask } from '../lib/aiAnalyst.js';

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const round2 = (value) => Math.round(value * 100) / 100;
const priceDecimals = (value) => { const abs = Math.abs(value); return abs >= 100 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : abs >= 0.0001 ? 8 : 10; };
const roundPrice = (value) => { if (!Number.isFinite(value)) return value; const factor = 10 ** priceDecimals(value); return Math.round(value * factor) / factor; };

const DEFAULTS = {
  symbol: 'SOLUSDT',
  interval: '1h',
  riskUsd: 250,
  maxNotional: 10000,
  atrStopMult: 1,
  targetR: 3,
  maxHoldHours: 72,
  minRsi: 30,
  maxRsi: 82,
  sideMode: 'both',
  strictTrend: false,
  feePct: 0.001
};

export class CryptoPaper {
  constructor(options = {}) {
    const { env = process.env, now = () => new Date(), fetcher = null, stateFile = 'crypto-paper.json', dataDir = null, configFile = 'crypto-config.json', symbol = null } = options;
    this.env = env;
    this.now = now;
    this.fetcher = fetcher || ((settings) => getCryptoSnapshot({ symbol: settings.symbol, interval: settings.interval }));
    this.stateFile = stateFile;
    this.dataDir = dataDir || config.dataDir;
    this.configFile = configFile;
    this.overrides = this.loadConfig();
    this.settings = { ...DEFAULTS, ...(config.crypto || {}), ...this.overrides };
    if (symbol) this.settings.symbol = String(symbol).toUpperCase();
    this.aiReview = this.env.CRYPTO_AI_REVIEW === 'off' ? 'off' : 'on';
    this.state = this.load();
  }

  file() { return path.join(this.dataDir, this.stateFile); }
  configPath() { return path.join(this.dataDir, this.configFile); }

  load() {
    const empty = { armed: false, paused: false, position: null, history: [], log: [], lessons: [], lastRound: null, cycle: { state: 'INACTIVO', note: 'Módulo crypto sin armar.' } };
    try { return { ...empty, ...JSON.parse(fs.readFileSync(this.file(), 'utf8')) }; }
    catch { return empty; }
  }

  loadConfig() {
    try { return JSON.parse(fs.readFileSync(this.configPath(), 'utf8')) || {}; }
    catch { return {}; }
  }

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
    return {
      symbol: this.settings.symbol,
      interval: this.settings.interval,
      riskUsd: this.settings.riskUsd,
      maxNotional: this.settings.maxNotional,
      atrStopMult: this.settings.atrStopMult,
      targetR: this.settings.targetR,
      maxHoldHours: this.settings.maxHoldHours,
      minRsi: this.settings.minRsi,
      maxRsi: this.settings.maxRsi
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
    if (patch.symbol !== undefined) {
      const symbol = String(patch.symbol).toUpperCase();
      if (!['SOLUSDT', 'SOLUSD', 'SOLUSDC'].includes(symbol)) errors.push('símbolo no soportado');
      else next.symbol = symbol;
    }
    num('riskUsd', 25, 2000);
    num('maxNotional', 100, 100000);
    num('atrStopMult', 0.5, 4);
    num('targetR', 1, 5);
    num('maxHoldHours', 6, 720);
    num('minRsi', 20, 70);
    num('maxRsi', 50, 95);
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
    return {
      trades: closed.length,
      wins,
      losses: closed.length - wins,
      winRate: closed.length ? round2((wins / closed.length) * 100) : null,
      totalPnlUsd,
      expectancyUsd: closed.length ? round2(totalPnlUsd / closed.length) : null,
      lessons: (this.state.lessons || []).slice(-5)
    };
  }

  status() {
    return {
      mode: 'paper',
      source: 'binance.us',
      armed: this.state.armed,
      paused: this.state.paused,
      cycle: this.state.cycle,
      position: this.state.position,
      lastRound: this.state.lastRound,
      history: (this.state.history || []).slice(-10),
      log: (this.state.log || []).slice(-25),
      stats: this.stats(),
      config: this.getConfig(),
      settings: { symbol: this.settings.symbol }
    };
  }

  arm() {
    this.state.armed = true;
    this.state.paused = false;
    this.state.cycle = { state: 'ARMADO', note: 'Crypto paper armado.' };
    this.log('ARM');
    this.save();
    return this.status();
  }

  disarm() {
    this.state.armed = false;
    this.state.cycle = { state: 'INACTIVO', note: 'Crypto paper desarmado.' };
    this.log('DISARM');
    this.save();
    return this.status();
  }

  pause(paused) {
    this.state.paused = Boolean(paused);
    this.state.cycle = { state: paused ? 'PAUSADO' : 'ARMADO', note: paused ? 'Pausado.' : 'Reanudado.' };
    this.save();
    return this.status();
  }

  async runCycle() {
    if (!this.state.armed) { this.state.cycle = { state: 'INACTIVO', note: 'Armá el módulo crypto.' }; return this.status(); }
    if (this.state.paused) { this.state.cycle = { state: 'PAUSADO', note: 'Pausado.' }; return this.status(); }
    let snapshot = null;
    try {
      snapshot = await this.fetcher(this.settings);
    } catch (error) {
      this.state.cycle = { state: 'ERROR', note: 'Sin datos: ' + error.message };
      this.log('ERROR', { error: error.message });
      this.save();
      return this.status();
    }
    this.state.lastRound = { at: this.now().toISOString(), symbol: snapshot.symbol, price: roundPrice(snapshot.price), source: snapshot.source, ema50: roundPrice(snapshot.ema50), ema200: roundPrice(snapshot.ema200), rsi14: round2(snapshot.rsi14), atr14: roundPrice(snapshot.atr14) };
    if (this.state.position) { await this.manage(snapshot); return this.status(); }
    this.evaluate(snapshot);
    return this.status();
  }

  evaluate(snapshot) {
    const notes = [];
    const price = snapshot.price;
    const atr = snapshot.atr14;
    const snapshotAt = Date.parse(snapshot.updatedAt || '');
    if (Number.isFinite(snapshotAt) && (this.now() - snapshotAt) > 15 * 60000) notes.push('dataQuality: snapshot de ' + Math.round((this.now() - snapshotAt) / 60000) + ' min (max 15) (NO_TRADE)');
    if (!isNum(price) || !isNum(atr) || atr <= 0) notes.push('Sin precio o ATR válido.');
    const trendUp = this.settings.strictTrend
      ? (isNum(snapshot.ema50) && isNum(snapshot.ema200) && price > snapshot.ema50 && snapshot.ema50 > snapshot.ema200)
      : (isNum(snapshot.ema50) && price > snapshot.ema50);
    const trendDown = this.settings.strictTrend
      ? (isNum(snapshot.ema50) && isNum(snapshot.ema200) && price < snapshot.ema50 && snapshot.ema50 < snapshot.ema200)
      : (isNum(snapshot.ema50) && price < snapshot.ema50);
    const side = trendUp ? 'LONG' : (trendDown && this.settings.sideMode === 'both' && this.env.CRYPTO_ALLOW_SHORT === 'true' ? 'SHORT' : null);
    if (!side) notes.push('Sin tendencia clara para operar.');
    const rsi = snapshot.rsi14;
    if (isNum(rsi)) {
      if (side === 'LONG' && (rsi < this.settings.minRsi || rsi > this.settings.maxRsi)) notes.push('RSI fuera de rango para long.');
      if (side === 'SHORT' && (rsi < 20 || rsi > 65)) notes.push('RSI fuera de rango para short.');
    }
    const riskPerUnit = atr * this.settings.atrStopMult;
    const stop = side === 'SHORT' ? price + riskPerUnit : price - riskPerUnit;
    const target = side === 'SHORT' ? price - riskPerUnit * this.settings.targetR : price + riskPerUnit * this.settings.targetR;
    const units = riskPerUnit > 0 ? Math.min(this.settings.maxNotional / price, this.settings.riskUsd / riskPerUnit) : 0;
    if (!(units > 0)) notes.push('Tamaño de posición inválido.');
    if (notes.length) {
      this.state.cycle = { state: 'ESPERANDO', note: notes[0] };
      this.log('EVAL', { decision: 'SKIP', notes, price: round2(price) });
      this.save();
      return;
    }
    const position = {
      symbol: this.settings.symbol,
      side,
      entry: price,
      stop: roundPrice(stop),
      target: roundPrice(target),
      units: round2(units),
      notional: round2(units * price),
      riskUsd: round2(units * riskPerUnit),
      openedAt: this.now().toISOString(),
      mae: price,
      feesPct: this.settings.feePct
    };
    this.state.position = position;
    this.state.cycle = { state: 'ABIERTO', note: side + ' ' + this.settings.symbol.replace('USDT', '') + ' paper en ' + roundPrice(price) + ' · stop ' + roundPrice(stop) + ' · objetivo ' + roundPrice(target) + '.' };
    this.log('ENTRY', { side, symbol: this.settings.symbol, price: roundPrice(price), stop: roundPrice(stop), target: roundPrice(target), units: round2(units), riskUsd: position.riskUsd });
    this.save();
  }

  async manage(snapshot) {
    const position = this.state.position;
    const price = snapshot.price;
    if (!isNum(price)) return;
    const short = position.side === 'SHORT';
    const mae = short ? Math.max(position.mae ?? position.entry, price) : Math.min(position.mae ?? position.entry, price);
    const pnlUsd = round2((short ? position.entry - price : price - position.entry) * position.units);
    this.state.position = { ...position, price: roundPrice(price), pnlUsd, mae: roundPrice(mae), updatedAt: this.now().toISOString() };
    const heldHours = (this.now() - Date.parse(position.openedAt)) / 3600000;
    let reason = null;
    if (short ? price >= position.stop : price <= position.stop) reason = 'STOP';
    else if (short ? price <= position.target : price >= position.target) reason = 'OBJETIVO';
    else if (heldHours >= this.settings.maxHoldHours) reason = 'TIEMPO';
    if (!reason) { this.save(); return; }
    const exit = price;
    const gross = (short ? position.entry - exit : exit - position.entry) * position.units;
    const fees = (position.entry + exit) * position.units * this.settings.feePct;
    const realized = round2(gross - fees);
    const trade = { ...position, exit: roundPrice(exit), pnlUsd, realizedUsd: realized, fees: round2(fees), closedAt: this.now().toISOString(), closeReason: reason, maePct: round2(((short ? mae - position.entry : position.entry - mae) / position.entry) * 100) };
    this.state.history = [...(this.state.history || []), trade].slice(-100);
    this.state.position = null;
    this.state.cycle = { state: 'CERRADO', note: 'Cierre ' + reason + ': P/L ' + realized + ' USD.' };
    this.log('EXIT', { reason, pnlUsd: realized, price: roundPrice(exit) });
    this.save();
    void this.postMortem(trade);
  }

  async postMortem(trade) {
    if (this.aiReview === 'off') return;
    try {
      const result = await analyzeTask({ task: 'journal', provider: 'auto', payload: {
        mode: 'crypto-paper', symbol: trade.symbol, entry: trade.entry, exit: trade.exit,
        pnlUsd: trade.realizedUsd, closeReason: trade.closeReason, maePct: trade.maePct
      } });
      const lesson = { at: this.now().toISOString(), provider: result.provider, text: String(result.text || '').slice(0, 500) };
      this.state.lessons = [...(this.state.lessons || []), lesson].slice(-20);
      this.log('AI_LESSON', { text: lesson.text.slice(0, 120) });
      this.save();
    } catch (error) {
      this.log('AI_ERROR', { error: error.message });
      this.save();
    }
  }
}