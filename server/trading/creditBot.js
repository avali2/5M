/**
 * 5M · Bot de crédito para Tradier.
 *
 * Estrategia elegida para dinero real: BULL PUT CREDIT SPREAD sobre un ETF líquido
 * (SPY por defecto). Fundamento: vender prima con delta bajo (~0.18), 30-45 DTE,
 * solo a favor de la tendencia (precio > EMA50 > EMA200), exigiendo crédito/ancho
 * mínimo y volatilidad implícita razonable. Salidas: 50% del crédito, stop 2,5x,
 * cierre por tiempo a 21 DTE. Máximo una posición y riesgo acotado por operación.
 *
 * Salvaguardas: sin token de producción no hay live; live exige confirmación
 * explícita (LIVE_CONFIRM), disco persistente, acceso autenticado y límite de
 * riesgo. El bot NUNCA garantiza ganancias: ejecuta reglas y corta pérdidas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { TradierClient } from '../lib/tradier.js';
import { getSnapshot, optionChainFor, dteFor } from '../lib/marketData.js';
import { impliedVol, yearFraction, round2 } from '../lib/optionsMath.js';
import { TradingBroker, PAPER_URL, LIVE_URL } from './broker.js';

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

function rsi(values, length = 14) {
  const clean = values.filter(isNum);
  if (clean.length <= length) return null;
  let gains = 0; let losses = 0;
  for (let index = 1; index <= length; index += 1) {
    const change = clean[index] - clean[index - 1];
    if (change >= 0) gains += change; else losses -= change;
  }
  let avgGain = gains / length; let avgLoss = losses / length;
  for (let index = length + 1; index < clean.length; index += 1) {
    const change = clean[index] - clean[index - 1];
    avgGain = (avgGain * (length - 1) + Math.max(0, change)) / length;
    avgLoss = (avgLoss * (length - 1) + Math.max(0, -change)) / length;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
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

function etMinutes(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(now).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return { minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: parts.weekday };
}

const DEFAULTS = {
  symbol: 'SPY',
  dteMin: 30, dteMax: 45, targetDte: 35,
  shortDeltaMin: 0.15, shortDeltaMax: 0.22, targetDelta: 0.18,
  widthPct: 0.0075,
  minCreditWidth: 0.2,
  maxSpreadPct: 0.08,
  minOpenInterest: 300,
  riskPct: 1.0,
  contractsCap: 10,
  profitTargetPct: 50,
  stopMultiple: 2.5,
  timeExitDte: 21,
  hardExitDte: 7,
  entryFromMinutes: 600,  // 10:00 ET
  entryToMinutes: 900    // 15:00 ET
};

export class CreditBot {
  constructor({ env = process.env, now = () => new Date() } = {}) {
    this.env = env;
    this.now = now;
    this.settings = { ...DEFAULTS, ...(config.creditBot || {}) };
    this.mode = String(env.CREDIT_BOT_MODE || config.creditBot?.mode || 'paper').toLowerCase();
    this.state = this.load();
    this.market = new TradierClient(config.tradier);
  }

  file() {
    return path.join(config.dataDir, 'credit-bot.json');
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file(), 'utf8');
      const parsed = JSON.parse(raw);
      return { armed: false, paused: false, position: null, history: [], lastDecision: null, cycle: { state: 'INACTIVO', note: 'Bot sin armar.' }, ...parsed };
    } catch {
      return { armed: false, paused: false, position: null, history: [], lastDecision: null, cycle: { state: 'INACTIVO', note: 'Bot sin armar.' } };
    }
  }

  save() {
    try {
      fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(this.file(), JSON.stringify(this.state, null, 1), { mode: 0o600 });
    } catch { /* sin disco: el estado vive en memoria */ }
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

  status() {
    return {
      mode: this.mode, armed: this.state.armed, paused: this.state.paused,
      gates: this.gates(), cycle: this.state.cycle, lastDecision: this.state.lastDecision,
      position: this.state.position, history: this.state.history.slice(-10),
      settings: { symbol: this.settings.symbol, dte: [this.settings.dteMin, this.settings.dteMax], delta: [this.settings.shortDeltaMin, this.settings.shortDeltaMax], profitTargetPct: this.settings.profitTargetPct, stopMultiple: this.settings.stopMultiple, timeExitDte: this.settings.timeExitDte }
    };
  }

  /** Construye el plan de una nueva posición si todas las reglas se cumplen. */
  playbook(snapshot) {
    const notes = [];
    const spot = snapshot?.quote?.price;
    if (!isNum(spot)) return { plan: null, notes: ['Sin precio.'] };
    const closes = (snapshot.history || []).map((bar) => bar?.close);
    const ema50 = ema(closes, 50);
    const ema200 = ema(closes, 200);
    const rsi14 = rsi(closes, 14);
    const marketMinutes = etMinutes(this.now());
    if (marketMinutes.minutes < this.settings.entryFromMinutes || marketMinutes.minutes > this.settings.entryToMinutes) {
      notes.push('Fuera de la ventana de entrada (10:00–15:00 ET).');
    }
    if (!(isNum(ema50) && isNum(ema200) && spot > ema50 && ema50 > ema200)) notes.push('Tendencia no alcista (precio > EMA50 > EMA200 requerido).');
    if (isNum(rsi14) && rsi14 > 78) notes.push('RSI demasiado alto: riesgo de comprar el techo.');
    const snapshotExpirations = snapshot.expirations || [];
    const candidates = snapshotExpirations
      .map((expiration) => ({ expiration, dte: dteFor(snapshot, expiration) }))
      .filter((row) => isNum(row.dte) && row.dte >= this.settings.dteMin && row.dte <= this.settings.dteMax)
      .sort((left, right) => Math.abs(left.dte - this.settings.targetDte) - Math.abs(right.dte - this.settings.targetDte));
    if (!candidates.length) notes.push('Sin vencimientos entre ' + this.settings.dteMin + ' y ' + this.settings.dteMax + ' días.');
    const expiration = candidates[0]?.expiration || null;
    const chain = expiration ? optionChainFor(snapshot, expiration) : [];
    const atmIvs = chain.filter((option) => isNum(option.iv) && option.iv > 0.02).slice(0, 12).map((option) => option.iv);
    const atmIv = atmIvs.length ? atmIvs.reduce((sum, value) => sum + value, 0) / atmIvs.length : null;
    const rv = realizedVol(snapshot.history);
    const ivRatio = isNum(atmIv) && isNum(rv) && rv > 0.02 ? atmIv / rv : null;
    if (isNum(ivRatio) && ivRatio < 0.85) notes.push('Prima barata: IV por debajo de la volatilidad realizada (ratio ' + round2(ivRatio) + ').');
    const puts = chain.filter((option) => option.type === 'put' && isNum(option.delta) && isNum(option.bid) && option.bid > 0)
      .map((option) => ({ ...option, absDelta: Math.abs(option.delta) }))
      .filter((option) => option.absDelta >= this.settings.shortDeltaMin && option.absDelta <= this.settings.shortDeltaMax)
      .sort((left, right) => Math.abs(left.absDelta - this.settings.targetDelta) - Math.abs(right.absDelta - this.settings.targetDelta));
    const shortPut = puts[0] || null;
    if (!shortPut) notes.push('Sin put vendido en la banda de delta ' + this.settings.shortDeltaMin + '–' + this.settings.shortDeltaMax + '.');
    const width = Math.max(1, Math.round(spot * this.settings.widthPct));
    let longPut = null;
    if (shortPut) {
      longPut = chain.filter((option) => option.type === 'put' && isNum(option.strike) && isNum(option.ask) && option.ask > 0 && option.strike < shortPut.strike - 0.001)
        .sort((left, right) => Math.abs(Math.abs(left.strike - (shortPut.strike - width))) - Math.abs(Math.abs(right.strike - (shortPut.strike - width))))[0] || null;
      if (!longPut || !(longPut.strike < shortPut.strike)) notes.push('No hay ala de protección adecuada.');
    }
    let credit = null; let creditWidth = null; let maxLossPerContract = null;
    if (shortPut && longPut) {
      credit = roundTick((shortPut.bid + shortPut.ask) / 2 - (longPut.bid + longPut.ask) / 2);
      const realWidth = shortPut.strike - longPut.strike;
      creditWidth = credit / realWidth;
      maxLossPerContract = roundTick((realWidth - credit) * 100);
      if (credit < 0) notes.push('El spread no paga crédito a los precios actuales.');
      if (creditWidth < this.settings.minCreditWidth) notes.push('Crédito/ancho ' + round2(creditWidth * 100) + '% por debajo del mínimo ' + Math.round(this.settings.minCreditWidth * 100) + '%.');
      const spreadPct = (option) => ((option.ask - option.bid) / ((option.ask + option.bid) / 2)) * 100;
      if (spreadPct(shortPut) > this.settings.maxSpreadPct * 100 || spreadPct(longPut) > this.settings.maxSpreadPct * 100) notes.push('Spread de la cadena demasiado ancho.');
      if ((shortPut.openInterest || 0) < this.settings.minOpenInterest || (longPut.openInterest || 0) < this.settings.minOpenInterest) notes.push('Open interest insuficiente.');
    }
    const maxRisk = Number(this.env.CREDIT_BOT_MAX_RISK_USD || 500);
    const equity = Number(this.env.CREDIT_BOT_EQUITY || 0);
    const riskBudget = equity > 0 ? Math.min(maxRisk, equity * (this.settings.riskPct / 100)) : maxRisk;
    const contracts = maxLossPerContract ? Math.max(0, Math.min(this.settings.contractsCap, Math.floor((riskBudget / maxLossPerContract)))) : 0;
    const plan = shortPut && longPut && credit > 0 && !notes.length && contracts > 0 ? {
      symbol: this.settings.symbol,
      strategy: 'BULL_PUT_CREDIT',
      expiration,
      dte: candidates[0].dte,
      spot: round2(spot),
      width: round2(shortPut.strike - longPut.strike),
      credit,
      creditWidth: round2(creditWidth * 100) / 100,
      maxLossPerContract,
      contracts,
      riskUsd: roundTick(maxLossPerContract * contracts),
      legs: [
        { action: 'SELL', type: 'put', strike: shortPut.strike, price: roundTick((shortPut.bid + shortPut.ask) / 2), delta: round2(shortPut.delta), iv: shortPut.iv, oi: shortPut.openInterest, symbol: shortPut.symbol },
        { action: 'BUY', type: 'put', strike: longPut.strike, price: roundTick((longPut.bid + longPut.ask) / 2), delta: round2(longPut.delta), iv: longPut.iv, oi: longPut.openInterest, symbol: longPut.symbol }
      ],
      exits: {
        profitTargetUsd: roundTick(credit * 100 * contracts * this.settings.profitTargetPct / 100),
        stopLossUsd: roundTick(credit * 100 * contracts * -this.settings.stopMultiple),
        timeExitDte: this.settings.timeExitDte,
        hardExitDte: this.settings.hardExitDte
      },
      context: { ema50: round2(ema50), ema200: round2(ema200), rsi14: round2(rsi14), atmIv: round2(atmIv), realizedVol: round2(rv), ivRatio: round2(ivRatio) },
      generatedAt: this.now().toISOString()
    } : null;
    return { plan, notes, expiration, dte: candidates[0]?.dte ?? null };
  }

  async manage() {
    const position = this.state.position;
    if (!position) return;
    const broker = this.broker();
    const symbols = position.legs.map((leg) => leg.symbol);
    const quotes = await broker.getQuotes(symbols);
    const marks = symbols.map((symbol) => quotes.find((quote) => quote.symbol === symbol));
    if (marks.some((quote) => !quote || !isNum(quote.price))) { this.state.cycle = { state: 'ERROR', note: 'Sin cotización de las patas.' }; return; }
    const shortMark = marks[0].price; const longMark = marks[1].price;
    const currentCredit = roundTick(shortMark - longMark);
    const pnlUsd = roundTick((position.credit - currentCredit) * 100 * position.contracts);
    const dte = Math.round((Date.parse(position.expiration + 'T21:00:00Z') - this.now()) / DAY);
    this.state.position = { ...position, currentCredit, pnlUsd, dte };
    const target = position.credit * 100 * position.contracts * this.settings.profitTargetPct / 100;
    const stop = position.credit * 100 * position.contracts * this.settings.stopMultiple;
    let reason = null;
    if (pnlUsd >= target) reason = 'OBJETIVO_50';
    else if (pnlUsd <= -stop) reason = 'STOP';
    else if (dte <= this.settings.timeExitDte) reason = 'TIEMPO';
    if (!reason && dte > this.settings.hardExitDte) { this.save(); return; }
    if (!reason) reason = 'TIEMPO';
    await this.closePosition(reason, currentCredit);
  }

  async closePosition(reason, currentCredit) {
    const position = this.state.position;
    if (!position) return;
    const broker = this.broker();
    const trade = {
      root: position.symbol,
      width: position.width,
      legs: [
        { symbol: position.legs[0].symbol, direction: -1 },
        { symbol: position.legs[1].symbol, direction: 1 }
      ]
    };
    const price = Math.max(0.01, roundTick(currentCredit));
    try {
      const tag = '5m-credit-close-' + position.openedAt.replace(/[^0-9]/g, '').slice(0, 12);
      const preview = await broker.preview(trade, 'CLOSE', price, tag);
      if (!preview) throw new Error('La previsualización de salida no fue aceptada.');
      const orderId = await broker.submit(trade, 'CLOSE', price, tag);
      const realized = roundTick((position.credit - price) * 100 * position.contracts - preview.fees);
      this.state.history = [...this.state.history, { ...position, closedAt: this.now().toISOString(), closePrice: price, closeReason: reason, orderId, realizedUsd: realized }].slice(-50);
      this.state.position = null;
      this.state.cycle = { state: 'CERRADO', note: 'Posición cerrada: ' + reason + '. P/L $' + realized + '.' };
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
      legs: [
        { symbol: plan.legs[0].symbol, direction: -1 },
        { symbol: plan.legs[1].symbol, direction: 1 }
      ]
    };
    const tag = '5m-credit-' + this.now().toISOString().replace(/[^0-9]/g, '').slice(0, 12);
    try {
      const price = Math.max(0.05, roundTick(plan.credit - 0.03));
      const preview = await broker.preview(trade, 'OPEN', price, tag);
      if (!preview) throw new Error('La previsualización de entrada no fue aceptada.');
      const orderId = await broker.submit(trade, 'OPEN', price, tag);
      this.state.position = {
        symbol: plan.symbol, strategy: plan.strategy, expiration: plan.expiration, dte: plan.dte,
        width: plan.width, credit: price, contracts: plan.contracts, riskUsd: plan.riskUsd,
        legs: plan.legs.map((leg) => ({ symbol: leg.symbol, strike: leg.strike, type: leg.type, action: leg.action })),
        openedAt: this.now().toISOString(), orderId, feesEstimated: preview.fees, exits: plan.exits
      };
      this.state.cycle = { state: 'ABIERTO', note: 'Bull put abierto: crédito $' + price + ' x' + plan.contracts + '.' };
    } catch (error) {
      this.state.cycle = { state: 'ERROR', note: 'No se pudo abrir: ' + error.message };
    }
    this.save();
  }

  async runCycle({ arm = false } = {}) {
    if (!this.state.armed) { this.state.cycle = { state: 'INACTIVO', note: 'Armá el bot para que opere.' }; return this.status(); }
    if (this.state.paused) { this.state.cycle = { state: 'PAUSADO', note: 'Bot pausado manualmente.' }; return this.status(); }
    const gates = this.gates();
    if (!gates.ok) { this.state.cycle = { state: 'BLOQUEADO', note: gates.checks.filter((check) => !check.ok).map((check) => check.name).join(', ') }; return this.status(); }
    try {
      if (this.state.position) { await this.manage(); return this.status(); }
      const snapshot = await getSnapshot(this.settings.symbol, { tradier: config.tradier.token ? this.market : undefined });
      const result = this.playbook(snapshot);
      this.state.lastDecision = { at: this.now().toISOString(), plan: result.plan, notes: result.notes, dte: result.dte ?? null };
      if (!result.plan) {
        this.state.cycle = { state: 'ESPERANDO', note: result.notes[0] || 'Sin plan válido.' };
        this.save();
        return this.status();
      }
      if (!this.state.armed) { this.state.cycle = { state: 'PLAN', note: 'Plan listo: armá para ejecutar.' }; this.save(); return this.status(); }
      if (this.state.position) { this.state.cycle = { state: 'ESPERANDO', note: 'Ya hay una posición abierta.' }; this.save(); return this.status(); }
      await this.openPlan(result.plan);
      void arm;
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