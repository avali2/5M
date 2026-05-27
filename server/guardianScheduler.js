import { analyzeGuardianLearning } from '../src/features/options-guardian-agent/agentLearning.js';
import { getMarketStatus, processGuardianContext } from '../src/features/options-guardian-agent/agentEngine.js';
import { AGENT_CHANNELS, DEFAULT_GUARDIAN_SETTINGS, mergeGuardianSettings } from '../src/features/options-guardian-agent/agentTypes.js';

function journalSummary(entries) {
  let consecutiveLosses = 0;
  for (const entry of entries) {
    if (Number(entry.pnl) < 0) consecutiveLosses += 1;
    else break;
  }
  return {
    consecutiveLosses,
    entriesReviewed: entries.length,
    fomoEntries: entries.filter((entry) => String(entry.mentalState || entry.mental_state || '').toUpperCase() === 'FOMO').length,
    revengeEntries: entries.filter((entry) => String(entry.mentalState || entry.mental_state || '').toUpperCase() === 'REVENGE').length
  };
}

function closedMarketScan() {
  return {
    asOf: new Date().toISOString(),
    marketDataMode: 'snapshot/manual/educativo',
    decision: { status: 'closed', label: 'MERCADO CERRADO' },
    opportunities: [],
    conditionalIdeas: [],
    dataHealth: { endpointErrors: [] }
  };
}

export class GuardianScheduler {
  constructor({ scanScheduler, repository, pushService, enabled = true, now = () => new Date(), setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.scanScheduler = scanScheduler;
    this.repository = repository;
    this.pushService = pushService;
    this.enabled = enabled;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timer = null;
    this.running = null;
    this.lastRun = null;
    this.nextRun = null;
    this.lastError = null;
    this.latestResult = null;
  }

  async runNow(mode = 'scheduled') {
    if (this.running) return this.running;
    this.running = this.execute(mode).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async execute(mode) {
    const startedAt = this.now().toISOString();
    const marketStatus = getMarketStatus(this.now());
    const settings = mergeGuardianSettings(await this.repository.getGuardianSettings(DEFAULT_GUARDIAN_SETTINGS));
    if (!settings.enabled && mode !== 'manual') {
      const result = {
        mode,
        marketStatus,
        events: [],
        notifications: [],
        learning: await this.repository.getGuardianLearningProfile(),
        settings,
        paused: true,
        nextCadenceMinutes: settings.scanCadence.learningMinutesWhenClosed,
        completedAt: this.now().toISOString()
      };
      this.lastRun = result.completedAt;
      this.latestResult = result;
      return result;
    }
    const priorEvents = await this.repository.listGuardianEvents(200);
    const journal = await this.repository.listJournal();
    const feedback = await this.repository.listGuardianFeedback(200);
    const previousLearning = await this.repository.getGuardianLearningProfile() || {};
    const learning = analyzeGuardianLearning({ journal, events: priorEvents, feedback, previous: previousLearning });
    let scan = closedMarketScan();
    if (marketStatus !== 'closed') {
      scan = await this.scanScheduler.run(true);
      for (const setup of (scan.opportunities || []).slice(0, 3)) {
        await this.repository.saveGuardianMarketSnapshot({
          id: `snapshot-${setup.symbol}-${Date.parse(startedAt)}`,
          symbol: setup.symbol,
          snapshotType: 'guardian-opportunity',
          data: setup,
          source: setup.source || 'Scanner sourced chain',
          isLive: scan.marketDataMode === 'live',
          isDelayed: scan.marketDataMode === 'delayed'
        });
      }
    }
    const result = processGuardianContext({
      scan,
      settings,
      now: startedAt,
      marketStatus,
      journalSummary: journalSummary(journal),
      learningProfile: learning,
      previousScan: this.previousScan
    }, priorEvents);
    this.previousScan = marketStatus === 'closed' ? this.previousScan : scan;

    await this.repository.saveGuardianEvents(result.events);
    await this.repository.saveGuardianLearningProfile(learning);
    let notificationsSent = 0;
    for (const event of result.notifications) {
      if (!event.channels.includes(AGENT_CHANNELS.WEB_PUSH)) continue;
      const delivery = await this.pushService.sendGuardianEvent(event);
      event.notificationSent = delivery.sent > 0;
      event.notificationChannel = delivery.sent > 0 ? AGENT_CHANNELS.WEB_PUSH : null;
      event.notificationError = delivery.error || null;
      notificationsSent += delivery.sent;
      await this.repository.updateGuardianEvent(event.id, {
        notificationSent: event.notificationSent,
        notificationChannel: event.notificationChannel,
        notificationError: event.notificationError
      });
      await this.repository.saveGuardianCooldown({
        id: `cooldown-${event.type}-${event.symbol || 'market'}`,
        symbol: event.symbol,
        eventType: event.type,
        cooldownUntil: new Date(new Date(startedAt).getTime() + settings.cooldowns.perSymbolMinutes * 60000).toISOString(),
        reason: 'Work Mode notification cooldown'
      });
    }
    const completedAt = this.now().toISOString();
    const run = {
      id: `guardian-run-${Date.parse(startedAt)}`,
      mode,
      marketStatus,
      symbolsScanned: marketStatus === 'closed' ? 0 : (scan.watchlist?.symbols?.length || 0),
      signalsFound: scan.opportunities?.length || 0,
      eventsCreated: result.events.length,
      notificationsSent,
      errors: [],
      startedAt,
      completedAt
    };
    await this.repository.saveGuardianScanRun(run);
    this.lastRun = completedAt;
    this.lastError = null;
    this.latestResult = { ...result, ...run, events: result.events, notifications: result.notifications, learning };
    return this.latestResult;
  }

  schedule(minutes = DEFAULT_GUARDIAN_SETTINGS.scanCadence.regularMinutes) {
    if (!this.enabled) return;
    if (this.timer) this.clearTimer(this.timer);
    this.nextRun = new Date(this.now().getTime() + minutes * 60000).toISOString();
    this.timer = this.setTimer(async () => {
      try {
        const result = await this.runNow();
        this.schedule(result.nextCadenceMinutes);
      } catch (error) {
        this.lastError = error.message;
        this.schedule(DEFAULT_GUARDIAN_SETTINGS.scanCadence.regularMinutes);
      }
    }, minutes * 60000);
  }

  start() {
    if (!this.enabled || this.timer) return;
    this.runNow().then((result) => this.schedule(result.nextCadenceMinutes)).catch((error) => {
      this.lastError = error.message;
      this.schedule(DEFAULT_GUARDIAN_SETTINGS.scanCadence.regularMinutes);
    });
  }

  stop() {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.nextRun = null;
  }

  status(persistence = 'server') {
    return {
      enabled: this.enabled,
      backendScheduler: Boolean(this.timer || this.running),
      lastScan: this.lastRun,
      nextScan: this.nextRun,
      lastError: this.lastError,
      marketStatus: getMarketStatus(this.now()),
      persistence
    };
  }
}
