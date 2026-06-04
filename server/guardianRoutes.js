import express from 'express';
import { DEFAULT_GUARDIAN_SETTINGS, mergeGuardianSettings } from '../src/features/options-guardian-agent/agentTypes.js';

export function createGuardianRouter({ guardianScheduler, repository }) {
  const router = express.Router();
  router.get('/status', (_req, res) => res.json(guardianScheduler.status(repository.mode)));
  router.get('/events', async (_req, res, next) => {
    try {
      res.json(await repository.listGuardianEvents(100));
    } catch (error) {
      next(error);
    }
  });
  router.get('/settings', async (_req, res, next) => {
    try {
      res.json(mergeGuardianSettings(await repository.getGuardianSettings(DEFAULT_GUARDIAN_SETTINGS)));
    } catch (error) {
      next(error);
    }
  });
  router.put('/settings', async (req, res, next) => {
    try {
      const settings = await repository.saveGuardianSettings(mergeGuardianSettings(req.body || {}));
      if (settings.enabled) guardianScheduler.start();
      else guardianScheduler.stop();
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });
  router.get('/learning', async (_req, res, next) => {
    try {
      res.json(await repository.getGuardianLearningProfile());
    } catch (error) {
      next(error);
    }
  });
  router.post('/run', async (_req, res, next) => {
    try {
      res.json(await guardianScheduler.runNow('manual'));
    } catch (error) {
      next(error);
    }
  });
  router.get('/yahoo', async (req, res, next) => {
    try {
      const symbol = String(req.query.symbol || '').toUpperCase();
      const scan = await guardianScheduler.scanScheduler.run(true);
      const tickets = scan.guardianEdge?.tickets || [];
      res.json({
        source: 'Yahoo Finance fallback when primary providers are absent',
        timestamp: scan.asOf,
        marketDataMode: scan.marketDataMode,
        symbol: symbol || null,
        ticket: symbol ? tickets.find((item) => item.symbol === symbol) || null : scan.guardianEdge?.dailyBest || null,
        guardianEdge: scan.guardianEdge,
        dataHealth: scan.dataHealth
      });
    } catch (error) {
      next(error);
    }
  });
  router.get('/scan', async (req, res, next) => {
    try {
      const symbolsParam = String(req.query.symbols || 'SPY,VIX,QQQ');
      const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const scan = await guardianScheduler.scanScheduler.run(true);
      const results = symbols.map(symbol => {
        const result = scan?.results?.find(r => r.symbol === symbol);
        return result || { symbol, quote: null, technicals: null, wyckoff: null, tape: null };
      });
      res.json({
        results,
        asOf: scan.asOf || new Date().toISOString(),
        marketDataMode: scan.marketDataMode || 'live',
        dataHealth: scan.dataHealth || {}
      });
    } catch (error) {
      next(error);
    }
  });
  router.post('/events/:id/feedback', async (req, res, next) => {
    try {
      const entry = await repository.addGuardianFeedback({ ...req.body, eventId: req.params.id });
      if (req.body.action === 'reviewed') await repository.updateGuardianEvent(req.params.id, { status: 'reviewed' });
      res.status(201).json(entry);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function createPushRouter({ pushService, persistence = null }) {
  const router = express.Router();
  router.get('/public-key', (_req, res) => res.json(pushService.status()));
  router.post('/subscribe', async (req, res, next) => {
    try {
      res.status(201).json(await pushService.subscribe(req.body));
    } catch (error) {
      next(error);
    }
  });
  router.post('/unsubscribe', async (req, res, next) => {
    try {
      res.json(await pushService.unsubscribe(req.body.endpoint));
    } catch (error) {
      next(error);
    }
  });
  router.post('/test', async (req, res, next) => {
    try {
      if (req.body?.dryRun || req.body?.testMode === 'dryRun') {
        return res.json({
          ok: true,
          dryRun: true,
          aiCalled: false,
          sent: false,
          status: pushService.status(),
          note: 'Dry-run push: no notification was sent and no subscription was modified.'
        });
      }
      res.json(await pushService.test());
    } catch (error) {
      next(error);
    }
  });
  router.post('/send', async (req, res, next) => {
    try {
      const result = await pushService.send(req.body || {});
      await persistence?.recordPushEvent?.({
        signalId: req.body?.signalId || req.body?.data?.signalId || null,
        type: req.body?.type || req.body?.data?.type || null,
        payload: req.body || {},
        result
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  router.post('/guardian-alert', async (req, res, next) => {
    try {
      const event = {
        id: `manual-${Date.now()}`,
        type: 'DAILY_SUMMARY',
        severity: 'info',
        symbol: req.body?.symbol || null,
        message: req.body?.message || 'Revision manual solicitada desde Options Guardian.'
      };
      res.json(await pushService.sendGuardianEvent(event));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
