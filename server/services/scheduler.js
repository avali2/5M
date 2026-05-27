import { cache } from '../lib/cache.js';
import { runAutonomousScan } from '../engine/scanner.js';

export class ScanScheduler {
  constructor({ providers, settings }) {
    this.providers = providers;
    this.settings = settings;
    this.latest = null;
    this.lastError = null;
    this.running = null;
    this.timer = null;
  }

  async run(force = false) {
    if (this.running) return this.running;
    if (force) cache.clear();
    this.running = runAutonomousScan({ providers: this.providers, settings: this.settings, force })
      .then((scan) => {
        this.latest = scan;
        this.lastError = null;
        return scan;
      })
      .catch((error) => {
        this.lastError = { message: error.message, at: new Date().toISOString() };
        throw error;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  start() {
    if (this.timer) return;
    this.run().catch(() => {});
    this.timer = setInterval(() => this.run(true).catch(() => {}), this.settings.refreshSeconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async snapshot() {
    return this.latest || this.run();
  }
}
