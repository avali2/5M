import { config } from '../config.js';
import { runAutonomousScan } from '../engine/scanner.js';
import { applyGeminiGuardianGate } from '../ai/gemini-guardian-gate.js';
import { ScanLock } from './scanLock.js';
import { buildTradierOptionOrder, setupSignalKey } from './tradierOrders.js';
import { paperBotDefaults, paperBotStore } from './paperBotStore.js';
import { selectBestStrategyForCapital } from './capitalStrategySelector.js';

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const parsed = finite(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function list(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function brokerOrder(response = {}) {
  return response?.order || response?.orders?.order || response || {};
}

function brokerOrderId(response = {}) {
  const value = brokerOrder(response)?.id;
  return value === null || value === undefined || value === '' ? null : String(value);
}

function previewAccepted(response = {}) {
  const order = brokerOrder(response);
  return order?.result === true || String(order?.result).toLowerCase() === 'true' || ['ok', 'approved'].includes(String(order?.status || '').toLowerCase());
}

function compactBrokerOrder(order = {}) {
  return {
    id: order.id === undefined ? null : String(order.id),
    type: order.type || null,
    class: order.class || null,
    symbol: order.symbol || null,
    status: order.status || null,
    side: order.side || null,
    quantity: finite(order.quantity),
    price: finite(order.price),
    avgFillPrice: finite(order.avg_fill_price ?? order.avgFillPrice),
    createDate: order.create_date || order.createDate || null,
    transactionDate: order.transaction_date || order.transactionDate || null,
    tag: order.tag || null,
    reasonDescription: order.reason_description || order.reasonDescription || null
  };
}

function premiumDetails(setup = {}) {
  const credit = finite(setup.credit ?? setup.netCredit);
  if (credit !== null && credit > 0) return { type: 'credit', price: credit };
  const debit = finite(setup.debit ?? setup.netDebit);
  if (debit !== null && debit > 0) return { type: 'debit', price: debit };
  const type = setup.creditDebit?.type;
  const value = finite(setup.creditDebit?.value ?? setup.limitPrice);
  return value !== null && value > 0 && ['credit', 'debit'].includes(type) ? { type, price: value } : null;
}

function daysTo(expiration) {
  const end = new Date(`${expiration}T20:00:00.000Z`).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

function dailyLossPct(account = {}) {
  const equity = Math.max(0, finite(account.balances?.totalEquity, 0));
  const closed = finite(account.balances?.closePl, 0);
  return equity > 0 && closed < 0 ? Math.abs(closed) / equity * 100 : 0;
}

function easternDayKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function geminiEntryPolicy(setup = {}) {
  const review = setup.geminiReview || null;
  const status = String(setup.aiVerificationStatus || '');
  const verdict = String(review?.verdict || review?.decision || '').toUpperCase();
  const unavailable = !review || review.aiStatus === 'UNAVAILABLE' || /UNAVAILABLE|BUDGET|COOLDOWN/.test(status);
  const hasStructuredApproval = Boolean(review) && Object.hasOwn(review, 'approved');
  const approved = status === 'APPROVED_BY_GEMINI_GUARDIAN' && (
    hasStructuredApproval ? review.approved === true : ['APPROVE', 'APPROVED'].includes(verdict)
  );
  const explicitVeto = Boolean(review) && !unavailable && !approved && (
    review.approved === false ||
    status === 'REQUIRES_MANUAL_REVIEW' ||
    ['BLOCK', 'BLOCKED', 'REJECTED', 'WATCH_ONLY', 'CAUTION', 'DOWNGRADE', 'NEEDS_DATA'].includes(verdict)
  );
  return { approved, unavailable, explicitVeto, verdict: verdict || (unavailable ? 'UNAVAILABLE' : 'UNREVIEWED') };
}

function effectiveBotSettings(settings, learning) {
  const effective = { ...settings };
  const adjustments = [];
  if (learning.sampleSize >= 30 && (finite(learning.winRate, 0) < 45 || finite(learning.realizedPnl, 0) < 0)) {
    effective.minScore = Math.min(95, settings.minScore + 3);
    effective.minPop = Math.min(85, settings.minPop + 3);
    effective.maxRiskPct = Math.max(0.25, round(settings.maxRiskPct * 0.75, 2));
    adjustments.push('Paper history tightened score, POP and risk after a negative sample of at least 30 closed trades.');
  }
  return {
    settings: effective,
    adaptive: adjustments.length > 0,
    adjustments,
    policy: 'Learning may tighten rules after 30 closed paper trades; it never loosens risk automatically.'
  };
}

function settingsForPaperScan(base, bot) {
  return {
    ...base,
    policy: {
      ...base.policy,
      riskPct: bot.maxRiskPct,
      maxDailyLossPct: bot.maxDailyLossPct,
      maxOpenTrades: bot.maxOpenPositions,
      allow0Dte: false,
      allow1DteApproval: Boolean(bot.allow1Dte),
      allowMargin: false,
      allowEarnings: false,
      defaultRiskMode: 'AGGRESSIVE_DEFINED_RISK'
    },
    signals: {
      ...base.signals,
      minScore: bot.minScore,
      minReadyScore: bot.minScore,
      minPop: bot.minPop,
      maxPerDay: 5,
      requireAiConfirmation: Boolean(bot.requireGeminiApproval),
      failClosedOnAiError: Boolean(bot.requireGeminiApproval)
    },
    ai: { ...base.ai, autoSignalDecision: true },
    agent: { ...base.agent, enabled: true, autoVerifySignals: true, mode: 'aggressive_defined_risk' },
    tradier: { ...base.tradier, syncRiskLimitsFromEnv: true }
  };
}

function compactRecommendation(selection = {}) {
  if (!selection.recommendation) return { ...selection, recommendation: null };
  const { setup, ...recommendation } = selection.recommendation;
  return {
    ...selection,
    recommendation: {
      ...recommendation,
      strikes: setup?.strikes || null,
      legs: list(setup?.legs).map((leg) => ({
        side: leg.side,
        type: leg.type,
        strike: leg.strike,
        symbol: leg.symbol
      })),
      gemini: setup?.geminiReview ? {
        verdict: setup.geminiReview.verdict || setup.geminiReview.decision,
        confidence: setup.geminiReview.confidence,
        summary: setup.geminiReview.summary
      } : null,
      aiVerificationStatus: setup?.aiVerificationStatus || null
    }
  };
}

function publicAccount(account = {}) {
  return {
    status: account.status || 'UNKNOWN',
    source: account.source || null,
    paperTrading: Boolean(account.paperTrading),
    readOnly: account.readOnly !== false,
    accountIdMasked: account.accountIdMasked || null,
    accountType: account.accountType || null,
    balances: account.balances || null,
    positions: list(account.positions),
    asOf: account.asOf || null,
    error: account.error || null
  };
}

export class PaperAutopilot {
  constructor({
    providers,
    settings = config,
    store = paperBotStore,
    lock = new ScanLock({ settings: settings.database, owner: `paper-autopilot-${process.pid}` }),
    scanRunner = runAutonomousScan,
    guardianGate = applyGeminiGuardianGate,
    strategySelector = selectBestStrategyForCapital
  } = {}) {
    this.providers = providers || {};
    this.settings = settings;
    this.store = store;
    this.lock = lock;
    this.scanRunner = scanRunner;
    this.guardianGate = guardianGate;
    this.strategySelector = strategySelector;
    this.running = null;
    this.timer = null;
    this.lastResult = null;
    this.lastError = null;
  }

  defaults() {
    return paperBotDefaults(this.settings.tradierPaper);
  }

  async getSettings() {
    return this.store.getSettings(this.defaults());
  }

  async saveSettings(input = {}) {
    const current = await this.getSettings();
    const next = { ...current, ...input };
    if (next.killSwitch) {
      next.enabled = false;
      next.autoExecute = false;
    }
    return this.store.saveSettings(next, this.defaults());
  }

  async applyAggressivePreset() {
    return this.store.saveSettings({
      ...this.defaults(),
      settingsVersion: 3,
      profile: 'AGGRESSIVE_DEFINED_RISK',
      enabled: true,
      autoExecute: true,
      requireGeminiApproval: false,
      killSwitch: false,
      updatedAt: null
    }, this.defaults());
  }

  async marketState() {
    const provider = this.providers.tradierPaper;
    const paperStatus = typeof provider?.status === 'function'
      ? provider.status()
      : { configured: Boolean(provider?.configured), error: 'Tradier Paper provider is unavailable.' };
    if (!paperStatus.configured) {
      return {
        verified: false,
        marketOpen: false,
        state: 'not_configured',
        description: paperStatus.error || 'Tradier Sandbox is not configured.'
      };
    }
    if (typeof provider.getMarketClock !== 'function') {
      return { verified: false, marketOpen: false, state: 'unknown', description: 'No Tradier Sandbox market clock is available.' };
    }
    try {
      const clock = await provider.getMarketClock();
      return {
        verified: true,
        marketOpen: String(clock?.state || '').toLowerCase() === 'open',
        state: String(clock?.state || 'unknown').toLowerCase(),
        description: clock?.description || null,
        nextChange: clock?.next_change || null,
        timestamp: clock?.timestamp || new Date().toISOString()
      };
    } catch (error) {
      return { verified: false, marketOpen: false, state: 'error', description: error.message };
    }
  }

  async syncTrackedOrders(brokerOrders = []) {
    const tracked = await this.store.listOrders(200);
    const byId = new Map(brokerOrders.map((order) => [String(order.id), order]));
    for (const item of tracked) {
      if (!item.brokerOrderId || !byId.has(String(item.brokerOrderId))) continue;
      const remote = byId.get(String(item.brokerOrderId));
      const status = String(remote.status || item.status || '').toLowerCase();
      let realizedPnl = item.realizedPnl;
      if (item.kind === 'EXIT' && status === 'filled' && realizedPnl === null) {
        const fill = finite(remote.avg_fill_price ?? remote.avgFillPrice);
        const entry = finite(item.request?.entryPremiumPrice);
        const contracts = Math.max(1, Math.floor(finite(item.request?.contracts, 1)));
        if (fill !== null && entry !== null) {
          realizedPnl = round((item.request?.entryPremiumType === 'credit' ? entry - fill : fill - entry) * 100 * contracts);
        }
      }
      if (status && (status !== String(item.status || '').toLowerCase() || realizedPnl !== item.realizedPnl)) {
        await this.store.updateOrder(item.id, { status, response: compactBrokerOrder(remote), realizedPnl });
      }
    }
    return this.store.listOrders(100);
  }

  closeLimit(setup, account) {
    const legs = list(setup?.legs);
    const raw = list(account?.rawPositions);
    const matches = legs.map((leg) => raw.find((position) => position.brokerSymbol === String(leg.symbol || '').toUpperCase().replaceAll(' ', '')));
    if (!legs.length || matches.some((position) => !position)) return null;
    let buyToClose = 0;
    let sellToClose = 0;
    for (let index = 0; index < legs.length; index += 1) {
      const ratio = Math.max(1, Math.floor(finite(legs[index].ratio ?? legs[index].quantity, 1)));
      if (/sell|short/i.test(String(legs[index].side || ''))) {
        const ask = finite(matches[index].ask);
        if (ask === null || ask <= 0) return null;
        buyToClose += ask * ratio;
      } else {
        const bid = finite(matches[index].bid);
        if (bid === null || bid < 0) return null;
        sellToClose += bid * ratio;
      }
    }
    const opening = premiumDetails(setup);
    if (!opening) return null;
    const price = opening.type === 'credit' ? buyToClose - sellToClose : sellToClose - buyToClose;
    return { opening, price: round(Math.max(0.01, price), 2) };
  }

  async managePositions({ account, trackedOrders, settings, canExecute }) {
    const recommendations = [];
    const entries = trackedOrders.filter((order) => order.kind === 'ENTRY' && !/rejected|canceled|error/i.test(String(order.status || '')));
    for (const entry of entries) {
      const setup = entry.setup || {};
      const setupSymbols = new Set(list(setup.legs).map((leg) => String(leg.symbol || '').toUpperCase().replaceAll(' ', '')));
      const position = list(account.positions).find((group) => {
        const positionSymbols = new Set(list(group.legs).map((leg) => leg.brokerSymbol));
        return group.symbol === setup.symbol && group.expiration === setup.expiration &&
          positionSymbols.size === setupSymbols.size &&
          [...setupSymbols].every((symbol) => positionSymbols.has(symbol));
      });
      if (!position) continue;
      const profitBasis = position.maxProfitUsd > 0 ? position.maxProfitUsd : position.maxRiskUsd;
      const profitProgress = profitBasis > 0 && position.openPnL > 0 ? position.openPnL / profitBasis * 100 : 0;
      const lossProgress = position.maxRiskUsd > 0 && position.openPnL < 0 ? Math.abs(position.openPnL) / position.maxRiskUsd * 100 : 0;
      const dte = daysTo(position.expiration);
      const reason = profitProgress >= settings.takeProfitPct
        ? `Take-profit reached (${round(profitProgress, 1)}% of modeled max profit).`
        : lossProgress >= settings.stopLossPct
          ? `Stop-loss reached (${round(lossProgress, 1)}% of modeled max risk).`
          : dte !== null && dte <= 3 ? `${dte} DTE remains; gamma/assignment risk requires an exit.` : null;
      recommendations.push({
        entryId: entry.id,
        symbol: position.symbol,
        strategy: position.strategy,
        openPnl: position.openPnL,
        profitProgress: round(profitProgress, 1),
        lossProgress: round(lossProgress, 1),
        dte,
        action: reason ? 'EXIT' : 'HOLD',
        reason: reason || 'Position remains inside paper take-profit, stop-loss and DTE rules.'
      });
      if (!reason || !canExecute) continue;
      const existingExit = trackedOrders.some((order) => order.kind === 'EXIT' && order.parentId === entry.id && !/rejected|canceled|error/i.test(String(order.status || '')));
      if (existingExit) continue;
      const close = this.closeLimit(setup, account);
      if (!close) continue;
      const closeSetup = {
        ...setup,
        credit: close.opening.type === 'credit' ? close.price : null,
        debit: close.opening.type === 'debit' ? close.price : null,
        creditDebit: { type: close.opening.type, value: close.price },
        limitPrice: close.price
      };
      const contracts = Math.max(1, Math.floor(finite(entry.request?.contracts, position.quantity || 1)));
      const order = buildTradierOptionOrder(closeSetup, contracts, { closing: true, tagPrefix: 'valido-paper-exit' });
      const preview = await this.providers.tradierPaper.previewOrder(order);
      if (!previewAccepted(preview)) continue;
      const submitted = await this.providers.tradierPaper.placeOrder(order);
      await this.store.recordOrder({
        brokerOrderId: brokerOrderId(submitted),
        signalKey: entry.signalKey,
        kind: 'EXIT',
        symbol: entry.symbol,
        strategy: entry.strategy,
        status: String(brokerOrder(submitted).status || 'submitted').toLowerCase(),
        request: {
          order,
          contracts,
          exitReason: reason,
          entryPremiumType: close.opening.type,
          entryPremiumPrice: close.opening.price
        },
        response: compactBrokerOrder(brokerOrder(submitted)),
        setup: closeSetup,
        parentId: entry.id
      });
    }
    return recommendations;
  }

  async cancelStaleOrders(trackedOrders, canExecute) {
    if (!canExecute) return [];
    const cutoff = Date.now() - 20 * 60_000;
    const stale = trackedOrders.filter((order) =>
      order.brokerOrderId && /open|pending|submitted/i.test(String(order.status || '')) &&
      new Date(order.createdAt).getTime() < cutoff
    );
    const canceled = [];
    for (const order of stale) {
      try {
        const response = await this.providers.tradierPaper.cancelOrder(order.brokerOrderId);
        await this.store.updateOrder(order.id, { status: 'canceled_stale', response: compactBrokerOrder(brokerOrder(response)) });
        canceled.push({ id: order.id, brokerOrderId: order.brokerOrderId, status: 'canceled_stale' });
      } catch (error) {
        canceled.push({ id: order.id, brokerOrderId: order.brokerOrderId, status: 'cancel_failed', error: error.message });
      }
    }
    return canceled;
  }

  async saveResult(payload, mode) {
    this.lastResult = payload;
    this.lastError = payload.status === 'ERROR' ? { message: payload.error, at: payload.asOf } : null;
    await this.store.saveRun(payload, mode).catch(() => {});
    return payload;
  }

  async executeCycle({ mode = 'scheduled' } = {}) {
    const savedSettings = await this.getSettings();
    const broker = this.providers.tradierPaper;
    const paperStatus = typeof broker?.status === 'function' ? broker.status() : { configured: false, error: 'Tradier Paper provider is unavailable.' };
    if (!paperStatus.configured) {
      return this.saveResult({ status: 'NOT_CONFIGURED', asOf: new Date().toISOString(), error: paperStatus.error }, mode);
    }
    if (savedSettings.killSwitch) {
      return this.saveResult({ status: 'KILL_SWITCH', asOf: new Date().toISOString(), reason: 'Paper bot kill switch is active.' }, mode);
    }
    if (mode === 'scheduled' && !savedSettings.enabled) {
      return { status: 'DISABLED', asOf: new Date().toISOString(), reason: 'Paper bot is disabled.' };
    }

    const locked = await this.lock.withLock('paper-autopilot', 180_000, async () => {
      const [market, account, brokerOrders, learning] = await Promise.all([
        this.marketState(),
        broker.getAccountSnapshot(),
        broker.getOrders().catch(() => []),
        this.store.learning()
      ]);
      if (account.status !== 'ONLINE') throw new Error(account.error || 'Tradier Sandbox account is not online.');
      const adaptation = effectiveBotSettings(savedSettings, learning);
      const effective = adaptation.settings;
      const trackedOrders = await this.syncTrackedOrders(brokerOrders);
      const canExecute = Boolean(savedSettings.enabled && savedSettings.autoExecute && market.verified && market.marketOpen);
      const staleOrders = await this.cancelStaleOrders(trackedOrders, canExecute);
      const activeTrackedOrders = staleOrders.length ? await this.store.listOrders(100) : trackedOrders;
      const management = market.marketOpen
        ? await this.managePositions({ account, trackedOrders: activeTrackedOrders, settings: effective, canExecute })
        : [];
      const basePayload = {
        asOf: new Date().toISOString(),
        market,
        account: publicAccount(account),
        management,
        staleOrders,
        learning,
        adaptation: { adaptive: adaptation.adaptive, adjustments: adaptation.adjustments, policy: adaptation.policy },
        execution: {
          environment: 'TRADIER_SANDBOX',
          liveOrderSubmissionAvailable: false,
          paperAutoExecuteEnabled: canExecute,
          previewRequired: true,
          decisionAuthority: effective.requireGeminiApproval ? 'GEMINI_REQUIRED' : 'AUTONOMOUS_DETERMINISTIC_WITH_GEMINI_VETO'
        }
      };
      if (!market.marketOpen) return { ...basePayload, status: 'MARKET_CLOSED', reason: market.description || `Tradier clock: ${market.state}` };
      const lossPct = dailyLossPct(account);
      if (lossPct >= effective.maxDailyLossPct) {
        return { ...basePayload, status: 'DAILY_LOSS_LOCK', reason: `Paper daily loss ${round(lossPct, 2)}% reached the ${effective.maxDailyLossPct}% limit.` };
      }
      const today = easternDayKey();
      const entriesToday = activeTrackedOrders.filter((order) =>
        order.kind === 'ENTRY' && easternDayKey(order.createdAt) === today && !/rejected|canceled|error/i.test(String(order.status || ''))
      ).length;
      if (entriesToday >= effective.maxEntriesPerDay) {
        return { ...basePayload, status: 'DAILY_ENTRY_LIMIT', entriesToday, reason: `Aggressive paper limit reached: ${entriesToday}/${effective.maxEntriesPerDay} entries today.` };
      }

      const scanSettings = settingsForPaperScan(this.settings, effective);
      const rawScan = await this.scanRunner({ providers: this.providers, settings: scanSettings, accountSnapshot: account });
      const scan = await this.guardianGate(rawScan, { providers: this.providers, settings: scanSettings });
      const recentOrders = activeTrackedOrders.filter((order) => Date.now() - new Date(order.createdAt).getTime() < 7 * 86_400_000);
      const selection = this.strategySelector({ scan, profile: scan.profile, settings: effective, recentOrders, learning });
      const summarized = compactRecommendation(selection);
      const scanSummary = {
        asOf: scan.asOf,
        decision: scan.decision || null,
        readyGreen: list(scan.opportunities).filter((setup) => setup.status === 'READY_GREEN').length,
        rejected: list(scan.rejected).length,
        gemini: scan.aiGuardian ? {
          reviewed: scan.aiGuardian.reviewed,
          approved: scan.aiGuardian.approved,
          unavailable: scan.aiGuardian.unavailable,
          reason: scan.aiGuardian.reason
        } : null
      };
      if (!selection.ok) return { ...basePayload, status: 'NO_TRADE', scan: scanSummary, selection: summarized, reason: selection.blockers[0] };

      const setup = selection.recommendation.setup;
      const signalKey = setupSignalKey(setup);
      if (await this.store.hasRecentSignal(signalKey, 24)) {
        return { ...basePayload, status: 'DUPLICATE_BLOCKED', scan: scanSummary, selection: summarized, reason: 'The same paper setup was already submitted in the last 24 hours.' };
      }
      const gemini = geminiEntryPolicy(setup);
      if (effective.requireGeminiApproval && !gemini.approved) {
        return { ...basePayload, status: 'GEMINI_BLOCKED', scan: scanSummary, selection: summarized, reason: 'Automatic paper execution requires explicit Gemini Guardian approval.' };
      }
      if (!effective.requireGeminiApproval && gemini.explicitVeto) {
        return { ...basePayload, status: 'GEMINI_VETO', scan: scanSummary, selection: summarized, reason: `Gemini vetoed this paper entry with ${gemini.verdict}.` };
      }
      const contracts = selection.recommendation.contracts;
      const order = buildTradierOptionOrder(setup, contracts, { tagPrefix: 'valido-paper-entry' });
      const preview = await broker.previewOrder(order);
      if (!previewAccepted(preview)) {
        return {
          ...basePayload,
          status: 'PREVIEW_REJECTED',
          scan: scanSummary,
          selection: summarized,
          preview: compactBrokerOrder(brokerOrder(preview)),
          reason: brokerOrder(preview)?.reason_description || 'Tradier Sandbox did not approve the mandatory preview.'
        };
      }
      if (!canExecute) {
        return {
          ...basePayload,
          status: 'PREVIEW_READY',
          scan: scanSummary,
          selection: summarized,
          preview: compactBrokerOrder(brokerOrder(preview)),
          reason: savedSettings.enabled ? 'Paper auto-execution is off; preview only.' : 'Paper bot is disabled; manual run produced a preview only.'
        };
      }

      const submitted = await broker.placeOrder(order);
      const tracked = await this.store.recordOrder({
        brokerOrderId: brokerOrderId(submitted),
        signalKey,
        kind: 'ENTRY',
        symbol: setup.symbol,
        strategy: setup.strategy,
        status: String(brokerOrder(submitted).status || 'submitted').toLowerCase(),
        request: { order, contracts, premium: premiumDetails(setup) },
        response: compactBrokerOrder(brokerOrder(submitted)),
        setup
      });
      return {
        ...basePayload,
        status: 'PAPER_ORDER_SUBMITTED',
        scan: scanSummary,
        selection: summarized,
        order: { id: tracked.id, brokerOrderId: tracked.brokerOrderId, status: tracked.status },
        reason: effective.requireGeminiApproval || gemini.approved
          ? 'A limit order was submitted only to Tradier Sandbox after preview and Gemini approval.'
          : gemini.unavailable
            ? 'A limit order was submitted only to Tradier Sandbox after preview; the deterministic READY_GREEN engine remained authoritative while Gemini was unavailable.'
            : 'A limit order was submitted only to Tradier Sandbox after preview and deterministic READY_GREEN approval.'
      };
    });
    if (locked.skipped) return { status: 'LOCKED', asOf: new Date().toISOString(), reason: 'Another paper bot cycle owns the lock.', lock: locked.lock };
    return this.saveResult(locked.value, mode);
  }

  async run(options = {}) {
    if (this.running) return this.running;
    this.running = this.executeCycle(options)
      .catch((error) => this.saveResult({ status: 'ERROR', asOf: new Date().toISOString(), error: error.message }, options.mode || 'scheduled'))
      .finally(() => { this.running = null; });
    return this.running;
  }

  start() {
    if (this.timer) return;
    const intervalMs = Math.max(60_000, finite(this.settings.tradierPaper?.intervalMinutes, 3) * 60_000);
    this.run({ mode: 'scheduled' }).catch(() => {});
    this.timer = setInterval(() => this.run({ mode: 'scheduled' }).catch(() => {}), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async status() {
    const broker = this.providers.tradierPaper;
    const paperStatus = typeof broker?.status === 'function' ? broker.status() : { configured: false, error: 'Tradier Paper provider is unavailable.' };
    const [settings, runs, trackedOrders, learning] = await Promise.all([
      this.getSettings(),
      this.store.recentRuns(12),
      this.store.listOrders(30),
      this.store.learning()
    ]);
    const [account, orders, market] = paperStatus.configured
      ? await Promise.all([
          broker.getAccountSnapshot(),
          broker.getOrders().catch(() => []),
          this.marketState()
        ])
      : [{ status: 'NOT_CONFIGURED', paperTrading: true, readOnly: false, error: paperStatus.error }, [], await this.marketState()];
    const adaptation = effectiveBotSettings(settings, learning);
    const intervalMinutes = Math.max(1, finite(this.settings.tradierPaper?.intervalMinutes, 3));
    const scheduledRun = runs.find((run) => /scheduled|worker/i.test(String(run.mode || '')));
    const lastCycleAt = this.lastResult?.asOf || runs[0]?.createdAt || null;
    const lastScheduledCycleAt = scheduledRun?.createdAt || null;
    const lastCycleTime = lastCycleAt ? new Date(lastCycleAt).getTime() : Number.NaN;
    const lastScheduledCycleTime = lastScheduledCycleAt ? new Date(lastScheduledCycleAt).getTime() : Number.NaN;
    const scheduledCycleAgeMs = Number.isFinite(lastScheduledCycleTime) ? Date.now() - lastScheduledCycleTime : null;
    const backgroundActive = Boolean(this.timer) || (scheduledCycleAgeMs !== null && scheduledCycleAgeMs <= Math.max(7, intervalMinutes * 2 + 1) * 60_000);
    const nextCycleAnchor = Number.isFinite(lastScheduledCycleTime)
      ? lastScheduledCycleTime
      : this.timer && Number.isFinite(lastCycleTime) ? lastCycleTime : Number.NaN;
    const blockers = [];
    if (!paperStatus.configured) blockers.push(paperStatus.error || 'Tradier Sandbox no esta configurado.');
    if (paperStatus.configured && account.status !== 'ONLINE') blockers.push(account.error || 'La cuenta Tradier Sandbox no esta disponible.');
    if (settings.killSwitch) blockers.push('El kill switch del bot paper esta activo.');
    if (!settings.killSwitch && !settings.enabled) blockers.push('El bot paper esta deshabilitado.');
    if (!settings.killSwitch && settings.enabled && !settings.autoExecute) blockers.push('La autoejecucion Sandbox esta deshabilitada.');
    if (paperStatus.configured && !backgroundActive) blockers.push('No se detecta un ciclo paper programado reciente.');
    if (paperStatus.configured && market.state === 'error') blockers.push(market.description || 'Fallo el reloj de mercado de Tradier Sandbox.');
    const operational = paperStatus.configured && account.status === 'ONLINE' && settings.enabled && settings.autoExecute &&
      !settings.killSwitch && backgroundActive && market.verified;
    const runtimeState = !paperStatus.configured
      ? 'NOT_CONFIGURED'
      : settings.killSwitch
        ? 'KILL_SWITCH'
        : !settings.enabled
          ? 'BOT_DISABLED'
          : !settings.autoExecute
            ? 'AUTO_EXECUTE_OFF'
            : account.status !== 'ONLINE'
              ? 'ACCOUNT_ERROR'
              : !backgroundActive
                ? 'BACKGROUND_STALE'
                : !market.verified
                  ? 'MARKET_CLOCK_ERROR'
                  : market.marketOpen ? 'ONLINE' : 'WAITING_MARKET';
    return {
      ok: true,
      safety: {
        productionOrderSubmission: false,
        productionMode: 'READ_ONLY_AND_PREVIEW',
        autonomousExecutionEnvironment: 'TRADIER_SANDBOX_ONLY',
        sandboxUrlVerified: Boolean(paperStatus.sandboxSafe)
      },
      runtime: {
        running: Boolean(this.running),
        scheduled: Boolean(this.timer),
        backgroundActive,
        operational,
        readyToTradeNow: operational && market.marketOpen,
        state: runtimeState,
        blockers,
        schedulerMode: this.settings.scanner?.runInWeb === false ? 'BACKGROUND_WORKER' : 'WEB_FALLBACK',
        intervalMinutes,
        lastCycleAt,
        lastScheduledCycleAt,
        nextCycleAt: Number.isFinite(nextCycleAnchor) ? new Date(nextCycleAnchor + intervalMinutes * 60_000).toISOString() : null,
        lastResult: this.lastResult,
        lastError: this.lastError
      },
      broker: paperStatus,
      market,
      settings,
      effectiveSettings: adaptation.settings,
      adaptation: { adaptive: adaptation.adaptive, adjustments: adaptation.adjustments, policy: adaptation.policy },
      account: publicAccount(account),
      brokerOrders: orders.map(compactBrokerOrder),
      trackedOrders,
      runs,
      learning
    };
  }
}
