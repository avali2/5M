import express from 'express';
import { buildTradierOptionOrder, setupSignalKey } from '../services/tradierOrders.js';

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publicLiveAccount(snapshot = {}) {
  return {
    status: snapshot.status || 'UNKNOWN',
    source: snapshot.source || null,
    readOnly: true,
    orderExecutionEnabled: false,
    accountIdMasked: snapshot.accountIdMasked || null,
    accountType: snapshot.accountType || null,
    balances: snapshot.balances || null,
    positions: Array.isArray(snapshot.positions) ? snapshot.positions : [],
    asOf: snapshot.asOf || null,
    error: snapshot.error || null
  };
}

function allowedSettings(body = {}) {
  const keys = [
    'enabled', 'autoExecute', 'killSwitch', 'maxRiskPct', 'maxDailyLossPct',
    'maxOpenPositions', 'maxContracts', 'minScore', 'minPop',
    'takeProfitPct', 'stopLossPct', 'requireGeminiApproval'
  ];
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]));
}

function publicPreview(value = {}) {
  return {
    result: value.result ?? null,
    status: value.status || null,
    commission: finite(value.commission),
    cost: finite(value.cost),
    fees: finite(value.fees),
    marginChange: finite(value.margin_change ?? value.marginChange),
    reasonDescription: value.reason_description || value.reasonDescription || null
  };
}

export function createTradierRouter({ scheduler, providers, paperAutopilot } = {}) {
  const router = express.Router();

  router.get('/overview', async (_req, res, next) => {
    try {
      const [paper, live] = await Promise.all([
        paperAutopilot.status(),
        typeof providers.tradier?.getAccountSnapshot === 'function'
          ? providers.tradier.getAccountSnapshot()
          : Promise.resolve({ status: 'NOT_CONFIGURED', error: 'Tradier live provider is unavailable.' })
      ]);
      res.json({
        ok: true,
        live: publicLiveAccount(live),
        paper,
        policy: {
          live: 'Read-only balances, positions and preview. The app has no production submit endpoint.',
          paper: 'Autonomous order submission is restricted to the verified Tradier Sandbox host.'
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/paper/settings', async (req, res, next) => {
    try {
      const settings = await paperAutopilot.saveSettings(allowedSettings(req.body));
      res.json({ ok: true, settings });
    } catch (error) {
      next(error);
    }
  });

  router.post('/paper/run', async (_req, res, next) => {
    try {
      const result = await paperAutopilot.run({ mode: 'manual' });
      res.json({ ok: result.status !== 'ERROR', result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/paper/orders/:id/cancel', async (req, res, next) => {
    try {
      const orders = await paperAutopilot.store.listOrders(200);
      const tracked = orders.find((order) => order.id === req.params.id);
      if (!tracked) return res.status(404).json({ error: 'Tracked paper order not found.' });
      if (!tracked.brokerOrderId) return res.status(409).json({ error: 'Paper order has no Tradier Sandbox order id.' });
      const result = await providers.tradierPaper.cancelOrder(tracked.brokerOrderId);
      const updated = await paperAutopilot.store.updateOrder(tracked.id, { status: 'canceled', response: result?.order || result });
      return res.json({ ok: true, order: updated });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/live/preview', async (req, res, next) => {
    try {
      if (typeof providers.tradier?.previewOptionOrder !== 'function') {
        return res.status(503).json({ error: 'Tradier live preview is not configured.' });
      }
      const scan = await scheduler.snapshot();
      const opportunities = Array.isArray(scan?.opportunities) ? scan.opportunities : [];
      const signal = opportunities.find((setup) => setupSignalKey(setup) === String(req.body?.signalKey || ''));
      if (!signal || signal.status !== 'READY_GREEN') {
        return res.status(404).json({ error: 'READY_GREEN signal not found in the current server scan.' });
      }
      const requested = Math.max(1, Math.floor(finite(req.body?.contracts, 1)));
      const allowed = Math.max(1, Math.floor(finite(signal.positionSizeContracts, 1)));
      const contracts = Math.min(5, requested, allowed);
      const order = buildTradierOptionOrder(signal, contracts, { tagPrefix: 'valido-live-preview' });
      const preview = await providers.tradier.previewOptionOrder(order);
      return res.json({
        ok: true,
        submitted: false,
        environment: 'TRADIER_PRODUCTION_PREVIEW_ONLY',
        signalKey: setupSignalKey(signal),
        contracts,
        preview: publicPreview(preview?.order || preview),
        note: 'No live order was submitted. Confirm or recreate the ticket manually in Tradier.'
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
