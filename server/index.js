import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, publicConfig } from './config.js';
import { TradierClient, isTradierConfigured } from './lib/tradier.js';
import { GeminiReviewer, isGeminiConfigured } from './lib/gemini.js';
import { scanMarket } from './lib/scanner.js';
import { getStoreStatus, saveScan } from './lib/store.js';
import { notifyReadySignal, pushStatus, savePushSubscription, sendTestPush } from './lib/push.js';

export const app = express();
const tradier = new TradierClient();
const gemini = new GeminiReviewer();
let latestScan = null;
let lastScanError = null;
let scanInFlight = null;
let lastPushResult = null;

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: config.clientOrigin || true }));
app.use(express.json({ limit: '256kb' }));

function hasValidAccessKey(request) {
  if (!config.security.requireAccessKey) return true;
  const supplied = request.get('X-5M-Key') || request.query.key || '';
  return Boolean(config.security.accessKey) && supplied === config.security.accessKey;
}

function requireAccess(request, response, next) {
  if (hasValidAccessKey(request)) return next();
  return response.status(401).json({ error: 'Acceso protegido. Añade tu APP_ACCESS_KEY en la app.' });
}

app.get('/api/health', async (_request, response) => {
  response.json({
    ok: true,
    app: '5 MILLIONS',
    timestamp: new Date().toISOString(),
    configured: { tradier: isTradierConfigured(), gemini: isGeminiConfigured(), push: pushStatus().configured },
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
    scanner: { enabled: config.scanner.enabled, intervalMinutes: config.scanner.intervalMinutes, inFlight: Boolean(scanInFlight) }
  });
});

app.get('/api/scan', requireAccess, (_request, response) => {
  if (!latestScan) return response.status(404).json({ error: 'Todavía no hay una exploración. Pulsa Escanear ahora.' });
  return response.json(latestScan);
});

app.post('/api/scan', requireAccess, async (_request, response) => {
  try {
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
      if (!isTradierConfigured()) throw new Error('TRADIER_TOKEN no está configurado. Añádelo en Render o en .env.');
      const scan = await scanMarket({ tradier, gemini });
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
  if (config.scanner.enabled && isTradierConfigured()) {
    const intervalMs = config.scanner.intervalMinutes * 60000;
    setTimeout(() => runScan('startup').catch(() => {}), 5000);
    setInterval(() => runScan('timer').catch(() => {}), intervalMs);
  }
}
