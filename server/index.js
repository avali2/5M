import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, publicConfig } from './config.js';
import { TradierClient, isTradierConfigured } from './lib/tradier.js';
import { GeminiReviewer, isGeminiConfigured } from './lib/gemini.js';
import { scanMarket } from './lib/scanner.js';
import { getLatestScan, getLearningSummary, getPortfolioState, getScanHistory, getStoreStatus, savePortfolioState, saveScan, saveSignalFeedback } from './lib/store.js';
import { TradingDesk } from './trading/desk.js';
import { notifyReadySignal, pushStatus, savePushSubscription, sendTestPush } from './lib/push.js';

export const app = express();
const tradier = new TradierClient();
const gemini = new GeminiReviewer();
const tradingDesk = new TradingDesk(config, gemini);
let latestScan = null;
let lastScanError = null;
let scanInFlight = null;
let lastPushResult = null;
let lastManualScanAt = 0;
let schedulerTimer = null;
const schedulerState = { startedAt: null, lastRunAt: null, nextRunAt: null, lastSkippedAt: null };

try { latestScan = await getLatestScan(); }
catch (error) { console.warn(`[5M] No se pudo restaurar el último scan: ${error.message}`); }

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      workerSrc: ["'self'"]
    }
  }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.nodeEnv !== 'production' || config.clientOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no autorizado por CORS.'));
  },
  allowedHeaders: ['Content-Type', 'X-5M-Key'],
  methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json({ limit: '256kb' }));

function hasValidAccessKey(request) {
  if (!config.security.requireAccessKey) return true;
  const supplied = request.get('X-5M-Key') || '';
  const expected = config.security.accessKey;
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function requireAccess(request, response, next) {
  if (hasValidAccessKey(request)) return next();
  return response.status(401).json({ error: 'Acceso protegido. Añade tu APP_ACCESS_KEY en la app.' });
}

app.get('/api/health', async (_request, response) => {
  response.json({
    ok: true,
    app: '5 MILLIONS',
    botEngine: 1,
    timestamp: new Date().toISOString(),
    configured: { tradier: isTradierConfigured(), gemini: isGeminiConfigured(), push: pushStatus().configured },
    marketData: { realtimeEntitled: config.tradier.realtimeEntitled, mode: publicConfig().integrations.tradierMode },
    security: { requiresKey: config.security.requireAccessKey }
  });
});

app.get('/api/config', requireAccess, (_request, response) => response.json(publicConfig()));

app.get('/api/status', requireAccess, async (_request, response) => {
  response.json({
    app: '5 MILLIONS',
    latestScan: latestScan ? { id: latestScan.id, generatedAt: latestScan.generatedAt, summary: latestScan.summary, source: latestScan.source } : null,
    lastScanError,
    integrations: publicConfig().integrations,
    push: pushStatus(),
    store: await getStoreStatus(),
    scanner: { enabled: config.scanner.enabled, intervalMinutes: config.scanner.intervalMinutes, inFlight: Boolean(scanInFlight), ...schedulerState },
    trading: tradingDesk.status(),
    lastPushResult
  });
});

app.post('/api/bot/pause', requireAccess, (request, response) => {
  if (!config.security.requireAccessKey || !config.security.accessKey) {
    return response.status(403).json({ error: 'El control del bot requiere autenticación.' });
  }
  if (typeof request.body?.paused !== 'boolean') {
    return response.status(400).json({ error: 'Envía un estado de pausa válido.' });
  }
  if (!tradingDesk.pause(request.body.paused)) {
    return response.status(409).json({ error: 'El motor de ejecución no está habilitado.' });
  }
  return response.json(tradingDesk.status());
});

app.get('/api/scan', requireAccess, (_request, response) => {
  if (!latestScan) return response.status(404).json({ error: 'Todavía no hay una exploración. Pulsa Escanear ahora.' });
  return response.json(latestScan);
});

app.get('/api/history', requireAccess, async (request, response) => {
  response.json({ items: await getScanHistory(request.query.limit) });
});

app.get('/api/learning', requireAccess, async (_request, response) => {
  response.json(await getLearningSummary());
});

app.get('/api/portfolio', requireAccess, async (_request, response) => {
  const portfolio = await getPortfolioState();
  const updatedAt = portfolio.updatedAt ? new Date(portfolio.updatedAt) : null;
  const ageHours = updatedAt ? (Date.now() - updatedAt.getTime()) / 3600000 : null;
  return response.json({ ...portfolio, fresh: ageHours !== null && ageHours >= 0 && ageHours <= config.policy.portfolioFreshHours, maxAgeHours: config.policy.portfolioFreshHours });
});

app.post('/api/portfolio', requireAccess, async (request, response) => {
  try {
    const portfolio = await savePortfolioState(request.body);
    return response.json({ ...portfolio, fresh: true, maxAgeHours: config.policy.portfolioFreshHours });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
});

app.post('/api/signals/:signalId/feedback', requireAccess, async (request, response) => {
  try {
    const feedback = await saveSignalFeedback({ ...request.body, signalId: request.params.signalId });
    return response.json({ feedback, learning: await getLearningSummary() });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
});

app.post('/api/scan', requireAccess, async (_request, response) => {
  try {
    const cooldownMs = config.scanner.manualCooldownSeconds * 1000;
    const remainingMs = cooldownMs - (Date.now() - lastManualScanAt);
    if (remainingMs > 0) return response.status(429).json({ error: `Espera ${Math.ceil(remainingMs / 1000)} segundos antes de iniciar otra revisión.` });
    lastManualScanAt = Date.now();
    const scan = await runScan('manual');
    return response.json(scan);
  } catch (error) {
    return response.status(503).json({ error: error.message, integrations: publicConfig().integrations });
  }
});

app.get('/api/notifications/public-key', requireAccess, (_request, response) => response.json({ configured: pushStatus().configured, publicKey: pushStatus().publicKey }));

app.post('/api/notifications/subscribe', requireAccess, async (request, response) => {
  try {
    const count = await savePushSubscription(request.body);
    return response.json({ ok: true, subscriptions: count });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
});

app.post('/api/notifications/test', requireAccess, async (_request, response) => {
  try { return response.json({ ok: true, ...(await sendTestPush()) }); }
  catch (error) { return response.status(400).json({ error: error.message }); }
});

async function runScan(reason = 'timer') {
  if (scanInFlight) return scanInFlight;
  scanInFlight = (async () => {
    try {
      if (!isTradierConfigured()) throw new Error('TRADIER_TOKEN no está configurado. Añádelo en el servicio o en .env.');
      if (reason === 'timer' && config.scanner.marketOpenOnly) {
        const clock = await tradier.getMarketClock();
        if (String(clock?.state || '').toLowerCase() !== 'open') {
          schedulerState.lastSkippedAt = new Date().toISOString();
          console.info(`[5M] Scan timer omitido: mercado ${clock?.state || 'unknown'}.`);
          return latestScan;
        }
      }
      const learning = await getLearningSummary();
      const portfolioState = await getPortfolioState();
      const scan = await scanMarket({ tradier, gemini, learningContext: learning.advisory, portfolioState });
      latestScan = scan;
      lastScanError = null;
      await saveScan(scan);
      for (const signal of scan.signals.filter((item) => item.status === 'READY')) {
        lastPushResult = await notifyReadySignal(signal, config.publicBaseUrl);
      }
      console.info(`[5M] Scan ${reason}: ${scan.summary.ready} READY, ${scan.summary.watch} WATCH, ${scan.durationMs}ms`);
      return scan;
    } catch (error) {
      lastScanError = { message: error.message, at: new Date().toISOString() };
      console.error(`[5M] Scan ${reason} falló: ${error.message}`);
      throw error;
    } finally {
      scanInFlight = null;
    }
  })();
  return scanInFlight;
}

export { runScan };

function scheduleNextScan(delayMs) {
  schedulerState.nextRunAt = new Date(Date.now() + delayMs).toISOString();
  schedulerTimer = setTimeout(async () => {
    schedulerState.lastRunAt = new Date().toISOString();
    try { await runScan('timer'); }
    catch { /* runScan records and logs the error */ }
    finally { scheduleNextScan(config.scanner.intervalMinutes * 60000); }
  }, delayMs);
  schedulerTimer.unref?.();
}

function startScannerScheduler() {
  if (schedulerTimer || !config.scanner.enabled || !isTradierConfigured()) return;
  schedulerState.startedAt = new Date().toISOString();
  scheduleNextScan(5000);
}

const distPath = path.join(config.root, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((request, response, next) => {
    if (request.path.startsWith('/api/')) return next();
    return response.sendFile(path.join(distPath, 'index.html'));
  });
}

if (process.env.NODE_ENV !== 'test' && !process.argv.includes('--test')) {
  app.listen(config.port, config.host, () => {
    console.info(`[5M] http://${config.host}:${config.port} · Tradier ${isTradierConfigured() ? 'configurado' : 'no configurado'} · Gemini ${isGeminiConfigured() ? 'configurado' : 'no configurado'}`);
  });
  startScannerScheduler();
  tradingDesk.start();
}
