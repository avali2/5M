import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { config, providerStatus, UNIVERSE } from './config.js';
import { cache } from './lib/cache.js';
import { createProviders } from './providers/index.js';
import { explainers } from './explainers.js';
import { ScanScheduler } from './services/scheduler.js';
import { repository } from './db/repository.js';
import { GuardianPushStore } from './pushStore.js';
import { GuardianPushService } from './push.js';
import { GuardianScheduler } from './guardianScheduler.js';
import { createGuardianRouter, createPushRouter } from './guardianRoutes.js';

export function createApp(settings = config, customProviders = null, options = { startBackground: true }) {
  const app = express();
  const providers = customProviders || createProviders(settings);
  const scheduler = new ScanScheduler({ providers, settings });
  const pushService = new GuardianPushService(settings.webPush || {}, new GuardianPushStore(repository));
  const guardianScheduler = new GuardianScheduler({
    scanScheduler: scheduler,
    repository,
    pushService,
    enabled: settings.guardian?.enabled !== false
  });
  const defaults = { ...settings.policy, holdings: {}, activeSymbols: [], dailyLossPct: 0, weeklyLossPct: 0, collateralUsedPct: 0, consecutiveDailyLosses: 0, riskMode: 'CONSERVADOR', tradingPaused: false };
  const defaultWatchlist = [...UNIVERSE.indices, ...UNIVERSE.magnificent7, ...UNIVERSE.focusEquities, ...UNIVERSE.liquidEtfs];

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: settings.clientOrigin }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.path === '/health') return next();
    if (settings.security?.requireAccessKey && !settings.security?.accessKey) {
      return res.status(503).json({
        error: 'Private access is not configured',
        detail: 'Set APP_ACCESS_KEY in the hosting environment before using Valido 1M.'
      });
    }
    if (!settings.security?.accessKey) return next();
    const expected = Buffer.from(settings.security.accessKey);
    const supplied = Buffer.from(req.get('x-valido-key') || '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return res.status(401).json({ error: 'Access key required' });
    }
    return next();
  });
  app.locals.scheduler = scheduler;
  app.locals.guardianScheduler = guardianScheduler;
  app.locals.pushService = pushService;
  if (options.startBackground) {
    scheduler.start();
    guardianScheduler.start();
  }

  app.get('/api/health', (_req, res) => {
    const accessRequired = Boolean(settings.security?.requireAccessKey);
    const protectedAccess = Boolean(settings.security?.accessKey);
    res.json({
      status: 'ok',
      mode: 'fail-closed',
      timestamp: new Date().toISOString(),
      providers: accessRequired || protectedAccess ? undefined : providerStatus(),
      protected: protectedAccess,
      accessRequired,
      securityStatus: accessRequired && !protectedAccess ? 'configuration_required' : 'ready',
      refreshSeconds: settings.refreshSeconds,
      scheduler: {
        running: Boolean(scheduler.running),
        lastScan: scheduler.latest?.asOf || null,
        lastError: scheduler.lastError
      },
      guardian: guardianScheduler.status(repository.mode),
      webPush: { enabled: pushService.status().enabled, configured: pushService.status().configured }
    });
  });

  app.get('/api/scan', async (_req, res, next) => {
    try {
      res.json(await scheduler.snapshot());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/scan/refresh', async (_req, res, next) => {
    try {
      res.json(await scheduler.run(true));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/watchlist', async (_req, res, next) => {
    try {
      res.json(await repository.getWatchlist(defaultWatchlist));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/watchlist', async (req, res, next) => {
    try {
      if (!Array.isArray(req.body.symbols)) return res.status(400).json({ error: 'symbols array required' });
      cache.clear();
      const watchlist = await repository.saveWatchlist(req.body.symbols);
      scheduler.run(true).catch(() => {});
      return res.json(watchlist);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/profile', async (_req, res, next) => {
    try {
      res.json(await repository.getRiskProfile(defaults));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/profile', async (req, res, next) => {
    try {
      cache.clear();
      const profile = await repository.saveRiskProfile(req.body || {}, defaults);
      scheduler.run(true).catch(() => {});
      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/explainers', (_req, res) => res.json(explainers));

  app.get('/api/ai/status', (_req, res) => {
    res.json(typeof providers.openai.status === 'function' ? providers.openai.status() : {
      configured: Boolean(providers.openai.configured),
      enabled: false,
      automaticCalls: false
    });
  });

  app.post('/api/ai/explain', async (_req, res, next) => {
    try {
      if (!settings.openai?.enabled) {
        return res.status(409).json({ error: 'Asistente IA desactivado', detail: 'Configura ENABLE_AI_ASSISTANT=true para pedir explicaciones manualmente.' });
      }
      const scan = await scheduler.snapshot();
      const narrative = await providers.openai.summarize(scan);
      return res.json({ narrative, source: 'OpenAI - explicacion solicitada por el usuario', status: providers.openai.status() });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/collection', async (_req, res, next) => {
    try {
      res.json(await repository.collectionStats());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/journal', async (_req, res, next) => {
    try {
      res.json(await repository.listJournal());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/journal', async (req, res, next) => {
    try {
      if (!req.body?.symbol || !req.body?.strategy) return res.status(400).json({ error: 'symbol and strategy required' });
      return res.status(201).json(await repository.addJournal(req.body));
    } catch (error) {
      return next(error);
    }
  });

  app.use('/api/guardian', createGuardianRouter({ guardianScheduler, repository }));
  app.use('/api/push', createPushRouter({ pushService }));

  app.use((error, _req, res, _next) => {
    const status = error.status && error.status >= 400 ? error.status : 503;
    res.status(status).json({
      error: 'Market intelligence request failed',
      detail: error.message,
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

export async function startServer() {
  const app = createApp();
  const dist = path.resolve('dist');
  try {
    await access(path.join(dist, 'institutional-os.html'));
    app.use(express.static(dist));
    app.get('/', (_req, res) => res.redirect('/institutional-os.html'));
  } catch {
    app.get('/', (_req, res) => res.json({
      service: 'Valido 1M API',
      message: 'Run npm run dev for the React client or npm run build before production start.'
    }));
  }
  return app.listen(config.port, config.host, () => {
    console.log(`Valido 1M API listening on http://${config.host}:${config.port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  startServer();
}
