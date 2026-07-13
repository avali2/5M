import express from 'express';
import { loadBrokerPositions } from '../services/brokerPositionsService.js';
import { analyzePortfolioRisk, analyzePositionRisk } from '../services/positionRiskAnalyzer.js';

export function createRiskRouter({ scheduler, repository, providers }) {
  const router = express.Router();

  async function portfolio() {
    const scan = await scheduler.snapshot();
    const broker = await loadBrokerPositions({ repository, providers });
    return { scan, broker, analysis: analyzePortfolioRisk({ positions: broker.positions, market: scan.market || {} }) };
  }

  router.get('/portfolio', async (_req, res, next) => {
    try {
      const value = await portfolio();
      res.json({
        ...value.analysis,
        source: value.broker.source,
        brokerConfigured: value.broker.brokerConfigured,
        brokerConnected: value.broker.brokerConnected,
        account: value.broker.account ? {
          status: value.broker.account.status,
          source: value.broker.account.source,
          readOnly: true,
          accountIdMasked: value.broker.account.accountIdMasked,
          accountType: value.broker.account.accountType,
          balances: value.broker.account.balances,
          asOf: value.broker.account.asOf,
          error: value.broker.account.error || null
        } : null,
        counts: { broker: value.broker.brokerPositions.length, manual: value.broker.manualPositions.length },
        note: value.broker.note
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/positions', async (_req, res, next) => {
    try {
      const value = await portfolio();
      res.json({ ok: true, positions: value.analysis.positions, source: value.broker.source, brokerConnected: value.broker.brokerConnected, asOf: value.scan.asOf });
    } catch (error) {
      next(error);
    }
  });

  router.post('/analyze', async (req, res, next) => {
    try {
      const scan = await scheduler.snapshot();
      const positions = Array.isArray(req.body?.positions) ? req.body.positions : [req.body || {}];
      res.json(analyzePortfolioRisk({ positions, market: scan.market || {} }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:positionId/plan', async (req, res, next) => {
    try {
      const scan = await scheduler.snapshot();
      const broker = await loadBrokerPositions({ repository, providers });
      const position = broker.positions.find((item) => String(item.id) === String(req.params.positionId)) || req.body || {};
      res.json({ ok: true, plan: analyzePositionRisk(position, scan.market || {}).plan });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
