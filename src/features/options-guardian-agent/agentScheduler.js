import { guardianCadenceMinutes, getMarketStatus } from './agentEngine.js';
import { mergeGuardianSettings } from './agentTypes.js';

export class GuardianClientScheduler {
  constructor({ run, onResult = () => {}, settings = {}, visibility = () => document.visibilityState, now = () => new Date() }) {
    this.run = run;
    this.onResult = onResult;
    this.settings = mergeGuardianSettings(settings);
    this.visibility = visibility;
    this.now = now;
    this.timer = null;
    this.running = false;
    this.lastRun = null;
    this.nextRun = null;
    this.lastError = null;
  }

  async runNow() {
    if (this.running || !this.settings.enabled) return null;
    this.running = true;
    try {
      const result = await this.run();
      this.lastRun = new Date(this.now()).toISOString();
      this.lastError = null;
      this.onResult(result);
      return result;
    } catch (error) {
      this.lastError = error.message;
      return null;
    } finally {
      this.running = false;
    }
  }

  schedule(result = {}) {
    if (!this.settings.enabled) return;
    const marketStatus = result.marketStatus || getMarketStatus(this.now());
    const minutes = guardianCadenceMinutes({
      marketStatus,
      events: result.events || [],
      settings: this.settings,
      hasOpenPaperTrade: Boolean(result.hasOpenPaperTrade)
    });
    const hiddenMultiplier = this.visibility() === 'hidden' ? 3 : 1;
    const delay = Math.max(60000, minutes * hiddenMultiplier * 60000);
    this.nextRun = new Date(new Date(this.now()).getTime() + delay).toISOString();
    this.timer = window.setTimeout(async () => {
      const response = await this.runNow();
      this.schedule(response || {});
    }, delay);
  }

  start() {
    this.stop();
    if (!this.settings.enabled) return;
    this.runNow().then((result) => this.schedule(result || {}));
  }

  stop() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = null;
    this.nextRun = null;
  }

  updateSettings(settings) {
    this.settings = mergeGuardianSettings(settings);
    this.start();
  }

  getStatus() {
    return { running: this.running, lastRun: this.lastRun, nextRun: this.nextRun, lastError: this.lastError };
  }
}
