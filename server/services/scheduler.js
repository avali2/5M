import { cache } from '../lib/cache.js';
import { runAutonomousScan } from '../engine/scanner.js';
import { applyGeminiGuardianGate } from '../ai/gemini-guardian-gate.js';
import { scanLock } from './scanLock.js';

export class ScanScheduler {
  constructor({
    providers,
    settings,
    useLock = false,
    lock = scanLock,
    persistence = null,
    readPersisted = false,
    stateServiceName = null
  }) {
    this.providers = providers;
    this.settings = settings;
    this.useLock = useLock;
    this.lock = lock;
    this.persistence = persistence;
    this.readPersisted = readPersisted;
    this.stateServiceName = stateServiceName;
    this.latest = null;
    this.lastError = null;
    this.running = null;
    this.timer = null;
  }

  async persistScheduledResult(scan) {
    if (!this.persistence || !this.stateServiceName) return;
    const run = await this.persistence.saveScan(scan, {
      mode: 'web-fallback',
      worker: this.stateServiceName
    });
    await this.persistence.saveWorkerState({
      serviceName: this.stateServiceName,
      status: 'ONLINE',
      lastScanAt: scan.asOf,
      lastSuccessAt: new Date().toISOString(),
      payload: { runId: run.id, source: 'server-side web fallback' }
    });
  }

  async runScheduledCycle(force = false) {
    try {
      const scan = await this.run(force);
      await this.persistScheduledResult(scan);
      return scan;
    } catch (error) {
      if (this.persistence && this.stateServiceName) {
        await this.persistence.saveWorkerState({
          serviceName: this.stateServiceName,
          status: 'ERROR',
          lastError: error.message,
          payload: { source: 'server-side web fallback' }
        }).catch(() => {});
      }
      throw error;
    }
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
      this.running = this.lock.withLock('scanner', 180_000, execute)
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
    this.runScheduledCycle().catch(() => {});
    this.timer = setInterval(() => this.runScheduledCycle(true).catch(() => {}), this.settings.refreshSeconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async snapshot() {
    if (this.readPersisted) {
      try {
        const persisted = await this.persistence?.latest();
        const scan = persisted?.scan;
        if (scan?.asOf) {
          const currentAt = new Date(this.latest?.asOf || 0).getTime();
          const persistedAt = new Date(scan.asOf).getTime();
          if (!this.latest || persistedAt >= currentAt) this.latest = scan;
        }
      } catch (error) {
        this.lastError = { message: error.message, at: new Date().toISOString() };
      }
      if (!this.latest) {
        const error = new Error('Background scanner has not persisted a scan yet');
        error.status = 503;
        throw error;
      }
      return this.latest;
    }
    return this.latest || this.run();
  }
}
