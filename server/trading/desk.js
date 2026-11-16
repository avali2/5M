import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { TradierClient } from '../lib/tradier.js';
import { toArray } from '../lib/http.js';
import { LIVE_URL, PAPER_URL, TradingBroker, reconcileFill, terminal } from './broker.js';
import { TradingJournal } from './journal.js';
import { buildSpreads, closingQuote, daysLeft, easternTime, fresh, repriceSpread, spreadPricing, trendFromHistory } from './strategy.js';

const supportedModes = ['off', 'shadow', 'paper', 'live'];
const intervalMs = 60000;
const candleWindowDays = 60;
const minutes = value => 60 * Number(value.slice(0, 2)) + Number(value.slice(3, 5));

function dataIsPersistent(settings, env) {
  if (env.BOT_DURABLE_STORAGE !== 'true' || !path.isAbsolute(env.DATA_DIR || '') || !fs.existsSync(settings.dataDir)) return false;
  if (!env.RENDER) return !['/', '/tmp', '/dev/shm'].some(temp =>
    settings.dataDir === temp || (temp !== '/' && settings.dataDir.startsWith(temp + '/')));
  const mount = env.BOT_PERSISTENT_MOUNT;
  if (!mount || mount === '/' || !path.isAbsolute(mount)) return false;
  const dir = fs.realpathSync(settings.dataDir);
  if (dir !== mount && !dir.startsWith(mount + '/')) return false;
  return fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some(line => line.split(' ')[4] === mount);
}

function rootFor(mode, market) {
  return mode === 'paper' || market.settings.baseUrl === PAPER_URL ? 'SPY' : 'XSP';
}

function touchesRoot(symbol, root) {
  return String(symbol || '').toUpperCase() === root || new RegExp('^' + root + '[0-9]').test(symbol);
}

function exactPosition(trade, positions) {
  const rootPositions = positions.filter(item => touchesRoot(item.symbol, trade.root));
  return rootPositions.length === trade.legs.length && trade.legs.every(leg =>
    rootPositions.some(item => item.symbol === leg.symbol && Number(item.quantity) === leg.direction));
}

function foreignWorkingOrder(orders, root) {
  return orders.some(order => !terminal.has(order.status)
    && (touchesRoot(order.symbol, root) || toArray(order.leg).some(leg => touchesRoot(leg.option_symbol, root))));
}

function tradeSummary(row) {
  const entryCredit = row.entry_credit ?? row.plan.credit;
  const roundUsd = amount => Math.round(amount * 100) / 100;
  return {
    state: row.state, root: row.plan.root, strategy: row.plan.strategy, expiration: row.plan.expiration,
    legs: row.plan.legs.map(({ symbol, direction, strike, type }) => ({ symbol, direction, strike, type })),
    entryCredit, feesEstimatedUsd: row.fees,
    maxRiskUsd: roundUsd((row.plan.width - entryCredit) * 100 + row.fees),
    closeDebit: row.close_debit,
    realizedUsd: row.state === 'CLOSED' ? roundUsd((entryCredit - row.close_debit) * 100 - row.fees) : null,
    note: row.note, createdAt: row.created_at
  };
}

export class TradingDesk {
  constructor(settings, gemini, env = process.env) {
    this.settings = settings;
    this.gemini = gemini;
    this.mode = env.BOT_MODE || 'shadow';
    this.condor = env.BOT_IRON_CONDOR === 'true' || (this.mode !== 'live' && env.BOT_IRON_CONDOR !== 'false');
    this.maxRisk = Number(env.BOT_MAX_RISK_USD || (this.mode === 'paper' ? 500 : 0));
    this.cycle = { state: 'ESPERANDO', note: 'Esperando el primer ciclo.', lastCycleAt: null };
    this.cached = {};
    this.lastResearch = 0;
    this.latest = null;
    this.busy = false;
    this.market = new TradierClient(settings.tradier);
    this.root = rootFor(this.mode, this.market);

    try {
      if (!supportedModes.includes(this.mode)) throw new Error('Modo de ejecución inválido.');
      if (this.mode === 'off') return this.setState('APAGADO', 'Motor desactivado.');
      if (this.mode === 'shadow') {
        if (!settings.tradier.token) throw new Error('Falta un token de datos de Tradier.');
        return;
      }

      const live = this.mode === 'live';
      if (!settings.security.requireAccessKey || !settings.security.accessKey) throw new Error('El panel de operaciones requiere acceso autenticado.');
      if (!this.maxRisk || !Number.isFinite(this.maxRisk) || this.maxRisk < 25) throw new Error('Falta BOT_MAX_RISK_USD o su valor es inválido.');
      if (live && (!dataIsPersistent(settings, env) || !settings.tradier.realtimeEntitled
        || settings.tradier.sandbox || settings.tradier.baseUrl !== LIVE_URL || !gemini.configured)) {
        throw new Error('Real requiere un volumen persistente, datos Tradier de producción confirmados y Gemini operativo.');
      }
      const account = (live ? env.BOT_ACCOUNT_ID : env.BOT_SANDBOX_ACCOUNT_ID)?.trim().toUpperCase();
      const token = live ? settings.tradier.token : env.TRADIER_SANDBOX_TOKEN;
      this.broker = new TradingBroker({ mode: this.mode, account, token });
      this.market = this.broker;
      const scope = createHash('sha256').update(`${this.mode}:${account}`).digest('hex').slice(0, 20);
      fs.mkdirSync(settings.dataDir, { recursive: true, mode: 0o700 });
      this.journal = new TradingJournal(path.join(settings.dataDir, `bot-${scope}.sqlite`));
    } catch (error) {
      this.blocked = true;
      this.setState('BLOQUEADO', this.broker ? 'No se pudo abrir el registro operativo de órdenes.' : error.message);
    }
  }

  get delay() {
    return this.market.settings.baseUrl === PAPER_URL ? 15 : 0;
  }

  setState(state, note) {
    this.cycle = { ...this.cycle, state, note };
  }

  status() {
    return {
      mode: this.mode, root: this.root, condorEnabled: this.condor, ...this.cycle,
      paused: this.journal?.paused() ?? null, scheduled: Boolean(this.timer), candidate: this.latest,
      maxRiskUsd: this.maxRisk || null, trades: this.journal?.trades().map(tradeSummary) ?? [],
      orders: this.journal?.recentOrders() ?? []
    };
  }

  pause(value) {
    if (!this.journal) return false;
    this.journal.setPaused(value);
    return true;
  }

  start() {
    if (this.blocked || this.mode === 'off' || this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
    void this.tick();
  }

  async session(now) {
    const clock = await this.market.getMarketClock();
    if (!clock?.state) throw new Error('Reloj del mercado incompleto.');
    const { day, minute } = easternTime(now);
    if (clock.state !== 'open') return { day, marketOpen: false, clock };
    if (this.cached.calendar?.day !== day) {
      const [year, month] = day.split('-');
      const result = await this.market.request('/markets/calendar', { year, month });
      const today = toArray(result.calendar?.days?.day).find(item => item.date === day);
      if (today?.status !== 'open' || !/^\d\d:\d\d$/.test(today?.open?.start)
        || !/^\d\d:\d\d$/.test(today?.open?.end)) throw new Error('Calendario de horario regular sin confirmar.');
      this.cached.calendar = { day, start: minutes(today.open.start), end: minutes(today.open.end) };
    }
    const { start, end } = this.cached.calendar;
    return { clock, day, marketOpen: minute >= start && minute < end,
      canEnter: minute >= start + 30 && minute < end - 60 };
  }

  async research(session, now, riskBudget = Infinity) {
    const { day } = session;
    if (this.cached.research?.day !== day) {
      const [daily, expirations] = await Promise.all([
        this.market.getHistory('SPY', candleWindowDays, 'daily', now),
        this.market.getExpirations(this.root)
      ]);
      this.cached.research = { day, trend: trendFromHistory(daily, day), expirations:
        expirations.filter(item => daysLeft(item, day) >= 21 && daysLeft(item, day) <= 45)
          .sort((a, b) => Math.abs(daysLeft(a, day) - 30) - Math.abs(daysLeft(b, day) - 30)).slice(0, 3) };
    }

    const { trend, expirations } = this.cached.research;
    if (!trend || trend.bias === 'INDEFINIDO') return this.setState('ESPERANDO', 'El régimen de SPY no cumple los umbrales de tendencia o volatilidad.');
    if (trend.bias === 'LATERAL' && !this.condor) return this.setState('ESPERANDO', 'Mercado lateral. Iron condor desactivado.');
    if (!expirations.length) return this.setState('ESPERANDO', 'Tradier no devolvió expiraciones entre 21 y 45 DTE.');

    const [underlying] = await this.market.getQuotes([this.root]);
    if (underlying?.symbol !== this.root || !(underlying.price > 0)
      || !fresh(underlying.tradeDate, new Date(), this.delay, 3)) {
      return this.setState('DATOS_INSUFICIENTES', `Cotización reciente de ${this.root} sin confirmar.`);
    }
    const chains = await Promise.all(expirations.map(expiration => this.market.getOptionChain(this.root, expiration)));
    const ideas = chains.flatMap((chain, index) => buildSpreads({
      chain, expiration: expirations[index], root: this.root, underlying, bias: trend.bias,
      now: new Date(), useDelta: this.delay === 0, condor: this.condor
    })).filter(idea => idea.maxRiskUsd <= riskBudget)
      .sort((a, b) => b.credit / b.width - a.credit / a.width).slice(0, 6);
    if (!ideas.length) return this.setState('ESPERANDO', 'Sin spreads que cumplan distancia, liquidez, delta y crédito para este régimen.');
    const updates = await this.market.getQuotes([this.root, ...ideas.flatMap(idea => idea.legs.map(leg => leg.symbol))]);
    this.latest = ideas.map(idea => this.priceCandidate(idea, updates, trend))
      .find(idea => idea && idea.maxRiskUsd <= riskBudget) ?? null;
    if (!this.latest) return this.setState('DATOS_INSUFICIENTES', 'Cotizaciones de ambas caras y crédito límite pendientes de confirmar.');
    return this.latest;
  }

  priceCandidate(plan, quotes, trend) {
    const now = new Date();
    const underlying = quotes.find(quote => quote.symbol === plan.root);
    if (!(underlying?.price > 0) || !fresh(underlying.tradeDate, now, this.delay, 3)) return null;
    const stillOutOfMoney = plan.legs.filter(leg => leg.direction === -1).every(leg =>
      (leg.type === 'put' ? underlying.price - leg.strike : leg.strike - underlying.price) >= underlying.price * 0.006);
    if (!stillOutOfMoney) return null;
    const repriced = repriceSpread(plan, quotes, now, this.delay);
    if (!repriced || repriced.legs.some(leg => (leg.ask - leg.bid) / ((leg.ask + leg.bid) / 2) > 0.30)) return null;
    const idea = spreadPricing({ ...repriced, underlying: underlying.price });
    return idea ? { ...idea, trend, evaluatedAt: new Date().toISOString(), quoteDelayMinutes: this.delay } : null;
  }

  async reconcile(session, accountOrders) {
    for (const pending of this.journal.pending()) {
      const tagged = accountOrders.filter(order => order.tag === pending.tag);
      if (tagged.length > 1) return this.setState('REVISIÓN', 'Tradier devolvió varias órdenes para la misma etiqueta. Entrada bloqueada.');
      const id = pending.broker_id ?? tagged[0]?.id;
      if (!id) return this.setState('REVISIÓN', 'Envío sin confirmación. El motor sigue buscando la etiqueta en Tradier.');
      if (!this.journal.renew()) return;
      if (!pending.broker_id) this.journal.submitted(pending.tag, String(id));
      const trade = this.journal.activeTrades().find(item => item.id === pending.trade_id);
      if (!trade) throw new Error('Orden activa sin operación registrada.');
      const order = await this.broker.getOrder(id);
      if (order.class !== 'multileg' || order.symbol !== trade.plan.root || (order.tag && order.tag !== pending.tag)) {
        return this.setState('REVISIÓN', 'La orden devuelta por Tradier no coincide con el ticket registrado.');
      }
      if (!this.journal.renew()) return;
      if (terminal.has(order.status)) {
        this.journal.finalize(pending, order.status, reconcileFill(order, trade.plan, pending.action));
      } else if (['open', 'pending', 'partially_filled'].includes(order.status) && session.marketOpen
        && (Date.now() - Date.parse(pending.created_at) >= 3 * 60000
          || (pending.action === 'OPEN' && (this.journal.paused() || !session.canEnter)))) {
        await this.broker.cancel(id);
        this.setState('ORDEN_PENDIENTE', 'Cancelación solicitada. Esperando estado terminal antes de enviar otra orden.');
      } else {
        this.setState('ORDEN_PENDIENTE', 'Tradier está procesando una orden multileg.');
      }
    }
  }

  remainingRisk(day) {
    return this.maxRisk + Math.min(0, this.journal.realized(day));
  }

  async place({ tradeId, plan, action, day, price, reason, buyingPower = 0, equity = 0 }) {
    const tag = '5m' + randomUUID().replaceAll('-', '').slice(0, 24);
    const preview = await this.broker.preview(plan, action, price, tag);
    if (!preview) return this.setState('AVISO', 'Tradier no aprobó la previsualización o no confirmó las comisiones.');
    if (action === 'OPEN') {
      const risk = plan.maxRiskUsd + 2 * preview.fees;
      const equityLimit = this.mode === 'live' ? equity * 0.01 : Infinity;
      if (!(risk <= Math.min(buyingPower, this.remainingRisk(day), equityLimit))) {
        return this.setState('LÍMITE_DE_RIESGO', 'El riesgo y las comisiones superan el presupuesto o poder de compra.');
      }
      if (this.journal.paused() || !fresh(plan.evaluatedAt, new Date(), 0, 0.5)) {
        return this.setState('ESPERANDO', 'Entrada en pausa o cotización por volver a confirmar.');
      }
    }
    const now = new Date();
    const market = easternTime(now);
    const calendar = this.cached.calendar;
    if (market.day !== day || calendar?.day !== day || market.minute >= calendar.end - (action === 'OPEN' ? 60 : 1)) return;
    if (!this.journal.renew()) return;
    if (!this.journal.reserve({ tag, tradeId, plan, action, day, now, price, reason, fees: preview.fees })) return;
    try {
      const id = await this.broker.submit(plan, action, price, tag);
      this.journal.submitted(tag, id);
      this.setState('ORDEN_PENDIENTE', 'Orden recibida por Tradier. Pendiente de confirmar todas las patas.');
    } catch {
      this.setState('REVISIÓN', 'Respuesta de envío ambigua. El ticket se guardó y el motor buscará la orden sin duplicarla.');
    }
  }

  async runBroker(session, now) {
    const { day } = session;
    const accountOrders = await this.broker.orders();
    await this.reconcile(session, accountOrders);
    if (this.journal.pending().length) return;
    const [trade] = this.journal.activeTrades();
    if (trade?.state === 'REVIEW') return this.setState('REVISIÓN', trade.note);
    if (!session.marketOpen) return this.setState('MERCADO_CERRADO', trade
      ? 'Posición abierta. Se reanudará la gestión durante la sesión regular.' : 'Fuera de la sesión regular.');
    const positions = await this.broker.positions();
    if (trade) {
      const { plan } = trade;
      if (foreignWorkingOrder(accountOrders, plan.root) || !exactPosition(plan, positions)) {
        return this.setState('REVISIÓN', 'La posición o las órdenes del broker no coinciden con el registro. Revisa Tradier.');
      }
      const quotes = await this.broker.getQuotes(plan.legs.map(leg => leg.symbol));
      const priced = repriceSpread(plan, quotes, new Date(), this.delay, { closing: true });
      const exit = priced && closingQuote(priced, trade.entry_credit, daysLeft(plan.expiration, day));
      if (!priced) return this.setState('DATOS_INSUFICIENTES', 'Posición abierta con cotizaciones de cierre pendientes.');
      if (exit) return this.place({ tradeId: trade.id, plan, action: 'CLOSE', day, price: exit.debit, reason: exit.reason });
      return this.setState('EN_POSICIÓN', 'Patas reconciliadas. Vigilando objetivo, pérdida y vencimiento.');
    }

    if (this.journal.paused()) return this.setState('PAUSA', 'Entradas en pausa.');
    if (!session.canEnter) return this.setState('ESPERANDO', 'Fuera de la ventana de entrada.');
    if (this.journal.entered(day)) return this.setState('ESPERANDO', 'Ya se registró una entrada para esta sesión.');
    if (this.remainingRisk(day) <= 0) return this.setState('LÍMITE_DE_RIESGO', 'Se alcanzó el umbral de pérdida neta de la sesión.');
    if (foreignWorkingOrder(accountOrders, this.root) || positions.some(item => touchesRoot(item.symbol, this.root))) {
      return this.setState('REVISIÓN', 'Hay posiciones u órdenes de este subyacente fuera del registro del bot.');
    }
    if (Date.now() - this.lastResearch < 180000) return;
    this.lastResearch = Date.now();
    this.latest = null;
    const balance = await this.broker.balance();
    const riskBudget = Math.min(balance.optionBuyingPower, this.remainingRisk(day),
      this.mode === 'live' ? balance.equity * 0.01 : Infinity);
    if (!(riskBudget >= 25)) return this.setState('LÍMITE_DE_RIESGO', 'Poder de compra insuficiente para el mínimo del bot.');
    const idea = await this.research(session, now, riskBudget);
    if (!idea) return;

    if (this.mode === 'live') {
      const risk = await this.gemini.reviewMarketRisk({ symbols: [this.root, 'SPY'], prioritySymbols: [this.root],
        contextIndices: ['SPX', 'VIX'], marketClock: session.clock, now: new Date(), purpose: 'credit-spreads' });
      if (risk?.status !== 'CLEAR' || !risk.coverageComplete || !fresh(risk.checkedAt, new Date(), 0, 5)) {
        return this.setState('NOTICIAS_EN_ESPERA', 'La cobertura macro o de noticias no permite abrir entradas.');
      }
    }
    const [latestBalance, quotes, currentPositions, currentOrders] = await Promise.all([
      this.broker.balance(), this.broker.getQuotes([this.root, ...idea.legs.map(leg => leg.symbol)]),
      this.broker.positions(), this.broker.orders()
    ]);
    if (foreignWorkingOrder(currentOrders, this.root) || currentPositions.some(item => touchesRoot(item.symbol, this.root))) {
      return this.setState('REVISIÓN', 'La exposición de la cuenta cambió antes del envío.');
    }
    const refreshed = this.priceCandidate(idea, quotes, idea.trend);
    if (!refreshed) return this.setState('DATOS_INSUFICIENTES', 'La prima o la cotización cambió antes de enviar.');
    if (!(await this.session(new Date())).canEnter) return this.setState('ESPERANDO', 'Terminó la ventana de entrada.');
    return this.place({ plan: refreshed, action: 'OPEN', day, price: refreshed.credit, reason: 'REGLAS_DE_ENTRADA',
      buyingPower: latestBalance.optionBuyingPower, equity: latestBalance.equity });
  }

  async tick() {
    if (this.busy || this.blocked || this.mode === 'off' || (this.journal && !this.journal.renew())) return;
    this.busy = true;
    const now = new Date();
    this.cycle.lastCycleAt = now.toISOString();
    try {
      const session = await this.session(now).catch(async error => {
        if (this.journal?.pending().length) {
          await this.reconcile({ marketOpen: false }, await this.broker.orders());
        }
        throw error;
      });
      if (this.broker) return await this.runBroker(session, now);
      if (!session.marketOpen) return this.setState('MERCADO_CERRADO', 'Los candidatos se actualizan durante la sesión regular.');
      if (Date.now() - this.lastResearch < 180000) return;
      this.lastResearch = Date.now();
      this.latest = null;
      if (await this.research(session, now)) this.setState('OBSERVACIÓN', 'Candidato evaluado. La conexión está en modo de observación.');
    } catch (error) {
      console.warn('[5M Bot] Ciclo interrumpido', error.message);
      this.setState('SERVICIO_NO_CONFIRMADO', 'Un servicio no respondió o devolvió datos incompletos. El motor volverá a comprobarlo.');
    } finally {
      this.busy = false;
      this.journal?.release();
    }
  }
}
