import { cache } from '../lib/cache.js';
import { runAutonomousScan } from '../engine/scanner.js';
import { applyGeminiGuardianGate } from '../ai/gemini-guardian-gate.js';
import { scanLock } from './scanLock.js';

export class ScanScheduler {
  constructor({ providers, settings, useLock = false, lock = scanLock }) {
    this.providers = providers;
    this.settings = settings;
    this.useLock = useLock;
    this.lock = lock;
    this.latest = null;
    this.lastError = null;
    this.running = null;
    this.timer = null;
  }

  async run(force = false) {
    if (this.running) return this.running;
    if (force) cache.clear();
    const execute = () => runAutonomousScan({ providers: this.providers, settings: this.settings, force })
      .then((scan) => applyGeminiGuardianGate(scan, { providers: this.providers, settings: this.settings }))
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
    if (this.useLock) {
      this.running = this.lock.withLock('scanner', 170_000, execute)
        .then((result) => {
          if (result.skipped) {
            if (this.latest) return { ...this.latest, lockSkipped: true, lock: result.lock };
            const error = new Error('Scanner is already running in another process');
            error.status = 409;
            throw error;
          }
          return result.value;
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
    this.running = execute();
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
