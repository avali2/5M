import express from 'express';
import { scanPersistence } from '../services/scanPersistence.js';
import { readyGreenSignals } from '../engine/greenSignalPolicy.js';

function list(value) {
  return Array.isArray(value) ? value : [];
}

function compactSignal(signal = {}) {
  const id = signal.id || `${signal.symbol}-${signal.strategy}-${signal.expiration}`;
  return {
    id,
    status: signal.status || signal.signalStatus || 'CANDIDATE',
    symbol: signal.symbol,
    strategy: signal.strategy,
    expiration: signal.expiration,
    dte: signal.dte,
    strikes: signal.strikes,
    orderType: signal.orderType || 'LIMIT',
    creditDebit: signal.creditDebit || (Number.isFinite(signal.credit) ? { type: 'credit', value: signal.credit } : Number.isFinite(signal.debit) ? { type: 'debit', value: signal.debit } : null),
    limitPrice: signal.limitPrice ?? signal.credit ?? signal.debit ?? null,
    maxRisk: signal.maxRisk ?? null,
    maxProfit: signal.maxProfit ?? null,
    breakeven: signal.breakeven ?? signal.breakEven ?? null,
    pop: signal.pop ?? signal.edge?.probabilityOfProfit ?? null,
    score: signal.confidenceScore ?? signal.score ?? null,
    shortDelta: signal.shortDelta ?? null,
    longDelta: signal.longDelta ?? null,
    theta: signal.theta ?? null,
    vega: signal.vega ?? null,
    gamma: signal.gamma ?? null,
    legs: signal.legs || [],
    exitPlan: signal.exitPlan,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    invalidation: signal.invalidation,
    approvalReason: signal.approvalReason,
    geminiSummary: signal.geminiReview?.summary || null,
    rejectionReasons: signal.greenPolicy?.reasons || signal.blocks || []
  };
}

function candidateSignals(scan = {}) {
  return [...list(scan.rejected), ...list(scan.conditionalIdeas)]
    .filter((signal) => ['CANDIDATE', 'WATCHLIST', 'DATA_ERROR', 'BLOCKED'].includes(signal.status || signal.signalStatus))
    .map(compactSignal);
}

export function createScanDiagnosticsRouter({ scheduler, persistence = scanPersistence, runNow = null, providerHealth = null, scanProvider = null }) {
  const router = express.Router();
  const readScan = async () => scanProvider ? scanProvider() : scheduler.snapshot();

  router.get('/scan/latest', async (_req, res, next) => {
    try {
      const scan = await readScan();
      res.json({ ok: true, scan, asOf: scan.asOf, readyGreen: readyGreenSignals(scan).map(compactSignal) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/scan/run', async (_req, res, next) => {
    try {
      const result = runNow ? await runNow() : { value: { scan: await readScan() } };
      const scan = result.value?.scan || result.value || result.scan;
      if (scan?.asOf && !result.value?.run) await persistence.saveScan(scan, { mode: 'api-run' });
      res.json({ ok: true, result, scan });
    } catch (error) {
      next(error);
    }
  });

  router.get('/scan/diagnostics', async (_req, res, next) => {
    try {
      const scan = await readScan();
      res.json(await persistence.diagnostics(scan));
    } catch (error) {
      next(error);
    }
  });

  router.get('/signals/ready', async (_req, res, next) => {
    try {
      const scan = await readScan();
      res.json({ ok: true, signals: readyGreenSignals(scan).map(compactSignal), asOf: scan.asOf });
    } catch (error) {
      next(error);
    }
  });

  router.get('/signals/candidates', async (_req, res, next) => {
    try {
      const scan = await readScan();
      res.json({ ok: true, signals: candidateSignals(scan), asOf: scan.asOf });
    } catch (error) {
      next(error);
    }
  });

  router.get('/provider-health', async (_req, res, next) => {
    try {
      const scan = await readScan();
      res.json({
        ok: true,
        providers: providerHealth ? providerHealth() : scan.providers || [],
        dataHealth: scan.dataHealth || null,
        ai: scan.aiStatus || scan.aiGuardian || null,
        asOf: scan.asOf
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
