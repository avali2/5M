/**
 * 5M · Orquestador de roles (sin IA, costo cero).
 * Cada 10 minutos audita los bots: riesgo diario, calidad de datos y aprendizaje
 * determinista. No decide entradas: supervisa y pausa cuando corresponde.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const round2 = (value) => Math.round(value * 100) / 100;
const STRATEGY_KEYS = { BULL_PUT_CREDIT: 'bullPut', BEAR_CALL_CREDIT: 'bearCall', IRON_CONDOR: 'ironCondor' };

export class Orchestrator {
  constructor(options = {}) {
    const { bots = {}, cryptoPaper = null, env = process.env, now = () => new Date(), dataDir = config.dataDir } = options;
    this.bots = bots;
    this.cryptoPaper = cryptoPaper;
    this.env = env;
    this.now = now;
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'orchestrator.json');
    this.state = this.load();
  }

  load() {
    const empty = { runs: 0, lastRun: null, alerts: [], learning: [], history: [] };
    try { return { ...empty, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; }
    catch { return empty; }
  }

  save() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(this.file, JSON.stringify(this.state, null, 1), { mode: 0o600 });
    } catch { /* sin disco */ }
  }

  log(kind, message, data = {}) {
    const entry = { at: this.now().toISOString(), kind, message, ...data };
    this.state.alerts = [entry, ...(this.state.alerts || [])].slice(-100);
    this.state.history = [...(this.state.history || []), entry].slice(-300);
    return entry;
  }

  dailyPnl(instance) {
    const today = this.now().toISOString().slice(0, 10);
    const history = (instance.state && Array.isArray(instance.state.history)) ? instance.state.history : [];
    return round2(history.filter((trade) => String(trade.closedAt || '').slice(0, 10) === today).reduce((sum, trade) => sum + (isNum(trade.realizedUsd) ? trade.realizedUsd : 0), 0));
  }

  strategyStats(instance) {
    const history = (instance.state && Array.isArray(instance.state.history)) ? instance.state.history : [];
    const groups = {};
    for (const trade of history) {
      const key = trade.strategy || 'OTRA';
      groups[key] = groups[key] || { trades: 0, wins: 0, pnl: 0 };
      groups[key].trades += 1;
      groups[key].pnl = round2(groups[key].pnl + (isNum(trade.realizedUsd) ? trade.realizedUsd : 0));
      if (trade.realizedUsd > 0) groups[key].wins += 1;
    }
    return groups;
  }

  riskCheck(label, instance, dailyLimit) {
    const status = instance.status();
    if (!status.armed) return;
    const daily = this.dailyPnl(instance);
    if (isNum(daily) && daily <= -Math.abs(dailyLimit)) {
      instance.pause(true);
      this.log('RIESGO', label + ': pérdida diaria ' + daily + ' USD, bot pausado por límite ' + dailyLimit + '.');
      return;
    }
    if (status.gates && status.gates.ok === false) {
      const fallos = (status.gates.checks || []).filter((check) => !check.ok).map((check) => check.name);
      instance.pause(true);
      this.log('RIESGO', label + ': gates incompletos (' + fallos.join(', ') + '), bot pausado.');
    }
  }

  dataQuality() {
    const now = this.now();
    if (!this.cryptoPaper) return;
    const status = this.cryptoPaper.status();
    if (!status.armed) return;
    const last = status.lastRound && status.lastRound.at ? Date.parse(status.lastRound.at) : 0;
    if (!last || now - last > 90 * 60000) {
      this.log('DATOS', 'Crypto: sin datos frescos hace más de 90 minutos; revisar conectividad.');
    }
  }

  learn(label, instance) {
    const stats = this.strategyStats(instance);
    const config = typeof instance.getConfig === 'function' ? instance.getConfig() : null;
    if (!config || !config.strategies) return;
    const strategies = { ...config.strategies };
    let changed = false;
    for (const [strategy, value] of Object.entries(stats)) {
      const key = STRATEGY_KEYS[strategy] || strategy;
      if (!(key in strategies)) continue;
      if (value.trades < 6) continue;
      const winRate = value.wins / value.trades;
      if (winRate < 0.4 && strategies[key] !== false) {
        strategies[key] = false;
        changed = true;
        this.log('APRENDIZAJE', label + ': ' + strategy + ' con win rate ' + Math.round(winRate * 100) + '% en ' + value.trades + ' trades; se desactiva.');
      }
    }
    if (!changed) return;
    if (typeof instance.updateConfig === 'function') instance.updateConfig({ strategies });
    const lesson = label + ': aprendizaje automático por estrategia (win rate y P/L).';
    if (Array.isArray(instance.state.lessons)) {
      instance.state.lessons = [...instance.state.lessons, { at: this.now().toISOString(), provider: 'orchestrator', text: lesson }].slice(-30);
    }
    if (typeof instance.save === 'function') instance.save();
    this.state.learning = [...(this.state.learning || []), { at: this.now().toISOString(), label, strategies }].slice(-20);
  }

  async runOnce() {
    const dailyLimit = Number(this.env.BOT_DAILY_LOSS_LIMIT || 500);
    for (const [label, instance] of Object.entries(this.bots)) {
      try { this.riskCheck(label, instance, dailyLimit); } catch { /* aislado por bot */ }
    }
    if (this.cryptoPaper) {
      try {
        const cryptoLimit = Number(this.env.CRYPTO_DAILY_LOSS_LIMIT || 250);
        const status = this.cryptoPaper.status();
        if (status.armed) {
          const daily = this.dailyPnl(this.cryptoPaper);
          if (daily <= -Math.abs(cryptoLimit)) {
            this.cryptoPaper.pause(true);
            this.log('RIESGO', 'crypto: pérdida diaria ' + daily + ' USD, pausado.');
          }
        }
      } catch { /* aislado */ }
    }
    try { this.dataQuality(); } catch { /* aislado */ }
    for (const [label, instance] of Object.entries(this.bots)) {
      try { this.learn(label, instance); } catch { /* aislado */ }
    }
    this.state.runs = (this.state.runs || 0) + 1;
    this.state.lastRun = this.now().toISOString();
    this.save();
    return this.status();
  }

  status() {
    return {
      roles: [
        { name: 'Riesgo', detail: 'pausa si la pérdida diaria supera el límite o faltan gates' },
        { name: 'Datos', detail: 'avisa si el feed crypto queda viejo' },
        { name: 'Aprendizaje', detail: 'desactiva estrategias con win rate < 40% tras 6 trades' }
      ],
      runs: this.state.runs || 0,
      lastRun: this.state.lastRun || null,
      alerts: (this.state.alerts || []).slice(0, 12),
      learning: (this.state.learning || []).slice(-5)
    };
  }
}