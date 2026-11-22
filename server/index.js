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
import { safeScanSnapshot, createScanJob } from './lib/scanLifecycle.js';
import { getLatestScan, getLearningSummary, getPortfolioState, getScanHistory, getStoreStatus, savePortfolioState, saveScan, saveSignalFeedback } from './lib/store.js';
import { buildNito, dailyGreeting, NITO_SYMBOLS, isNitoAuthorized, publicNitoSnapshot } from './lib/nito.js';
import { TradingDesk } from './trading/desk.js';
import { notifyReadySignal, pushStatus, savePushSubscription, sendTestPush } from './lib/push.js';
import { getSnapshot, isDemoActive, dataSourceLabel } from './lib/marketData.js';
import { buildDirectionalSignals } from './lib/nitoDirectional.js';
import { buildSpreadIdeas } from './lib/aggressiveSpreads.js';
import { buildPositioning } from './lib/positioning.js';
import { aiStatus, analyzeTask, streamChat } from './lib/aiAnalyst.js';
import { isDeepSeekConfigured } from './lib/deepseek.js';

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
const manualScanJob = createScanJob(() => runScan('manual'), {cooldownMs:config.scanner.manualCooldownSeconds*1000});
function currentScan(scan=latestScan, blocked=Boolean(scanInFlight||lastScanError)) {
  return safeScanSnapshot(scan,{maxDataAgeMinutes:config.policy.maxDataAgeMinutes, newsCacheMinutes:config.gemini.newsCacheMinutes,portfolioFreshHours:config.policy.portfolioFreshHours,blocked});
}
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
      frameSrc: ["'self'"],
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
  allowedHeaders: ['Content-Type', 'X-5M-Key', 'X-NiTo-Key'],
  methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json({ limit: '256kb' }));
// TradingView executes only in the separate, sandboxed chart document.
app.use('/market-chart.html',(_request,response,next)=>{
  response.set('Content-Security-Policy',"default-src 'none'; script-src 'self' https://s3.tradingview.com; style-src 'unsafe-inline' https://s3.tradingview.com; frame-src https://*.tradingview.com; connect-src https://*.tradingview.com; img-src https://*.tradingview.com data:; font-src https://*.tradingview.com; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
  response.set('X-Frame-Options','SAMEORIGIN');
  next();
});

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
    botEngine: 2,
    deployedCommit: process.env.RENDER_GIT_COMMIT || null,
    execution: { mode: tradingDesk.mode, profile: tradingDesk.profile?.id ?? null, blocked: Boolean(tradingDesk.blocked) },
    timestamp: new Date().toISOString(),
    configured: { tradier: isTradierConfigured(), gemini: isGeminiConfigured(), deepseek: isDeepSeekConfigured(), push: pushStatus().configured },
    demo: { active: isDemoActive(), dataSource: dataSourceLabel() },
    signalReadiness: { configured: isTradierConfigured() && isGeminiConfigured(), missing: [!isTradierConfigured()?'Tradier':null,!isGeminiConfigured()?'Gemini':null].filter(Boolean) },
    marketData: { realtimeEntitled: config.tradier.realtimeEntitled, mode: publicConfig().integrations.tradierMode },
    security: { requiresKey: config.security.requireAccessKey }
  });
});


// NiTo is deliberately separate from the owner's account and order endpoints.
const nitoCache = new Map();
const nitoInFlight = new Map();
app.get('/api/nito', async (request,response) => {
  response.set('Cache-Control','no-store');
  const symbol=String(request.query.symbol||'AMD').toUpperCase();
  if (!NITO_SYMBOLS.includes(symbol)) return response.status(400).json({error:'Símbolo no admitido.'});
  const owner=config.security.accessKey;
  const supplied=request.get('X-NiTo-Key')||'';
  if (!config.security.requireAccessKey || !isNitoAuthorized({supplied,owner,guest:process.env.NITO_ACCESS_KEY||'',shareAuthorized:process.env.NITO_SHARE_AUTHORIZED==='true'})) return response.json(publicNitoSnapshot(symbol));
  const cached=nitoCache.get(symbol);
  if (cached && Date.now()-cached.at<30000) return response.json(cached.value);
  try {
    if (!nitoInFlight.has(symbol)) {
      const job=buildNito({tradier,entitled:config.tradier.realtimeEntitled&&!config.tradier.sandbox,symbol,newsRisk:latestScan?.marketRisk})
        .then(value=>{nitoCache.set(symbol,{at:Date.now(),value});return value;})
        .finally(()=>nitoInFlight.delete(symbol));
      nitoInFlight.set(symbol,job);
    }
    return response.json(await nitoInFlight.get(symbol));
  } catch(error) {
    console.warn('[NiTo] Error de datos:',error.name);
    return response.status(503).json({status:'NO_TRADE',greeting:dailyGreeting(),candidates:[],error:'Fuente de mercado no disponible. No utilices cotizaciones anteriores para operar.'});
  }
});


/* ================================================================== */
/* Capa de señales: mercado, NiTo direccional, spreads y posicionamiento */
/* ================================================================== */

function readSymbols(raw, fallback, max = 8) {
  const list = String(raw || '').toUpperCase().split(',').map((item) => item.trim()).filter((item) => /^[A-Z.^]{1,12}$/.test(item));
  const base = list.length ? list : fallback;
  return [...new Set(base)].slice(0, max);
}

async function snapshotsFor(symbols) {
  const results = [];
  for (const symbol of symbols) {
    try {
      results.push({ symbol, snapshot: await getSnapshot(symbol, { tradier }) });
    } catch (error) {
      results.push({ symbol, error: error.message });
    }
  }
  return results;
}

function snapshotSummary(snapshot) {
  const { chains, history, intraday, ...rest } = snapshot;
  return {
    ...rest,
    history: (history || []).slice(-160),
    intraday: (intraday || []).slice(-120),
    chains: Object.fromEntries(Object.entries(chains || {}).map(([expiration, chain]) => {
      const spot = snapshot.quote?.price ?? 0;
      const filtered = chain.filter((option) => spot > 0 && option.strike >= spot * 0.75 && option.strike <= spot * 1.25);
      return [expiration, filtered.length ? filtered : chain.slice(0, 80)];
    }))
  };
}

app.get('/api/market/:symbol', requireAccess, async (request, response) => {
  response.set('Cache-Control', 'no-store');
  try {
    const symbol = String(request.params.symbol || '').toUpperCase();
    const snapshot = await getSnapshot(symbol, { tradier, force: request.query.force === '1' });
    const expiration = request.query.expiration || snapshot.expirations?.[0] || null;
    const positioning = buildPositioning({ snapshot, expiration });
    const derived = {
      atmIv: positioning?.iv?.atm ?? null,
      ivVerdict: positioning?.iv?.verdict ?? null,
      ivLabel: positioning?.iv?.label ?? null,
      rvRatio: positioning?.iv?.rvRatio ?? null,
      expectedMove: positioning?.expectedMove ?? null,
      walls: positioning?.walls ?? null,
      regime: positioning?.regime ?? null
    };
    return response.json({ ok: true, dataSource: dataSourceLabel(), demo: isDemoActive(), snapshot: snapshotSummary(snapshot), positioning, derived });
  } catch (error) {
    return response.status(503).json({ ok: false, error: error.message, demo: isDemoActive() });
  }
});

app.get('/api/nito/directional', requireAccess, async (request, response) => {
  response.set('Cache-Control', 'no-store');
  const symbols = readSymbols(request.query.symbols, config.nito.symbols.slice(0, 6), 8);
  const side = ['call', 'put', 'both'].includes(String(request.query.side || 'both').toLowerCase())
    ? String(request.query.side || 'both').toLowerCase() : 'both';
  const accountUsd = Math.max(0, Number(request.query.account) || 0);
  const started = Date.now();
  try {
    const batches = await snapshotsFor(symbols);
    const signals = [];
    const gates = [];
    const errors = [];
    for (const batch of batches) {
      if (batch.error) { errors.push({ symbol: batch.symbol, error: batch.error }); continue; }
      const built = buildDirectionalSignals({
        snapshot: batch.snapshot,
        settings: { ...config.nito, side },
        account: { sizeUsd: accountUsd, riskPct: config.nito.riskPct }
      });
      gates.push({ symbol: batch.symbol, ...built.gate });
      signals.push(...(built.signals || []).map((signal) => ({ ...signal, symbol: batch.symbol })));
    }
    signals.sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
    return response.json({
      ok: true,
      demo: isDemoActive(),
      dataSource: dataSourceLabel(),
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      side,
      gate: gates[0] || { tradeable: false, status: 'NO_DATA', reasons: ['Sin datos.'], warnings: [] },
      gates,
      signals: signals.slice(0, Math.max(config.nito.maxSignals, signals.length)),
      errors
    });
  } catch (error) {
    return response.status(503).json({ ok: false, error: error.message, demo: isDemoActive() });
  }
});

app.get('/api/spreads', requireAccess, async (request, response) => {
  response.set('Cache-Control', 'no-store');
  const symbols = readSymbols(request.query.symbols, config.nito.symbols.slice(0, 4), 6);
  const profileKey = String(request.query.profile || config.spreads.activeProfile).toLowerCase();
  const profile = config.spreads.profiles[profileKey] ? profileKey : config.spreads.activeProfile;
  const strategies = request.query.strategy && request.query.strategy !== 'all'
    ? String(request.query.strategy).toUpperCase().split(',') : null;
  const started = Date.now();
  try {
    const batches = await snapshotsFor(symbols);
    const ideas = [];
    const errors = [];
    for (const batch of batches) {
      if (batch.error) { errors.push({ symbol: batch.symbol, error: batch.error }); continue; }
      const built = buildSpreadIdeas({ snapshot: batch.snapshot, profile, strategies, settings: config.spreads });
      ideas.push(...(built.ideas || []));
    }
    ideas.sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
    return response.json({
      ok: true, demo: isDemoActive(), dataSource: dataSourceLabel(),
      generatedAt: new Date().toISOString(), durationMs: Date.now() - started,
      profile, ideas: ideas.slice(0, 12), errors
    });
  } catch (error) {
    return response.status(503).json({ ok: false, error: error.message, demo: isDemoActive() });
  }
});

app.get('/api/positioning', requireAccess, async (request, response) => {
  response.set('Cache-Control', 'no-store');
  const symbol = String(request.query.symbol || 'SPY').toUpperCase();
  try {
    const snapshot = await getSnapshot(symbol, { tradier });
    const expiration = request.query.expiration || snapshot.expirations?.[0] || null;
    return response.json({
      ok: true, demo: isDemoActive(), dataSource: dataSourceLabel(),
      positioning: buildPositioning({ snapshot, expiration }),
      quote: snapshot.quote,
      expirations: snapshot.expirations,
      technical: snapshot.technical,
      flow: snapshot.flow
    });
  } catch (error) {
    return response.status(503).json({ ok: false, error: error.message, demo: isDemoActive() });
  }
});

app.get('/api/ai/status', requireAccess, (_request, response) => response.json({ ok: true, ...aiStatus() }));

app.post('/api/ai/analyze', requireAccess, async (request, response) => {
  const task = String(request.body?.task || 'signal');
  try {
    const result = await analyzeTask({
      task,
      provider: request.body?.provider,
      payload: request.body?.payload || {},
      question: request.body?.question || ''
    });
    return response.json({ ok: true, ...result });
  } catch (error) {
    return response.status(error.status || 503).json({ ok: false, error: error.message });
  }
});

app.post('/api/ai/chat', requireAccess, async (request, response) => {
  const messages = Array.isArray(request.body?.messages) ? request.body.messages.slice(-12) : [];
  if (!messages.length) return response.status(400).json({ ok: false, error: 'Falta el mensaje del usuario.' });
  response.set('Content-Type', 'text/event-stream');
  response.set('Cache-Control', 'no-store');
  response.set('Connection', 'keep-alive');
  response.flushHeaders?.();
  const send = (payload) => response.write(`data: ${JSON.stringify(payload)}\n\n`);
  try {
    const result = await streamChat({
      messages,
      provider: request.body?.provider,
      context: request.body?.context || {},
      onDelta: (delta) => send({ delta })
    });
    send({ done: true, provider: result.provider, model: result.model, usage: result.usage ?? null });
  } catch (error) {
    send({ error: error.message });
  } finally {
    response.end();
  }
});

app.get('/api/config', requireAccess, (_request, response) => response.json(publicConfig()));

app.get('/api/status', requireAccess, async (_request, response) => {
  response.json({
    app: '5 MILLIONS',
    latestScan: latestScan ? { id: latestScan.id, generatedAt: latestScan.generatedAt, summary: currentScan().summary, source: latestScan.source } : null,
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
  response.set('Cache-Control','no-store');
  return response.json(currentScan());
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

app.post('/api/scan/jobs', requireAccess, (_request,response) => {
  response.set('Cache-Control','no-store');
  if(!isTradierConfigured()) return response.status(503).json({error:'Tradier no está configurado en este servidor.'});
  const job=manualScanJob.start();
  return response.status(job.state==='running'?202:200).json({...job,result:currentScan(job.result)});
});
app.get('/api/scan/jobs', requireAccess, (_request,response) => {
  response.set('Cache-Control','no-store');
  const job=manualScanJob.status();
  return response.json({...job,result:currentScan(job.result)});
});

app.post('/api/scan', requireAccess, async (_request, response) => {
  try {
    const cooldownMs = config.scanner.manualCooldownSeconds * 1000;
    const remainingMs = cooldownMs - (Date.now() - lastManualScanAt);
    if (remainingMs > 0) return response.status(429).json({ error: `Espera ${Math.ceil(remainingMs / 1000)} segundos antes de iniciar otra revisión.` });
    lastManualScanAt = Date.now();
    const scan = await runScan('manual');
    return response.json(currentScan(scan));
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
      const checked = currentScan(scan,false);
      await saveScan(checked);
      latestScan = checked;
      lastScanError = null;
      for (const signal of checked.signals.filter((item) => item.status === 'READY')) {
        lastPushResult = await notifyReadySignal(signal, config.publicBaseUrl);
      }
      console.info(`[5M] Scan ${reason}: ${scan.summary.ready} READY, ${scan.summary.watch} WATCH, ${scan.durationMs}ms`);
      return checked;
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

app.get(['/nito','/nito/'], (_request, response, next) => {
  const indexFile = path.join(config.root, 'dist', 'index.html');
  if (fs.existsSync(indexFile)) return response.sendFile(indexFile);
  return next();
});
const distPath = path.join(config.root, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((request, response, next) => {
    if (request.path.startsWith('/api/')) return response.status(404).json({error:'Ruta de API no encontrada.'});
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