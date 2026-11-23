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
import { notifyReadySignal, pushStatus, savePushSubscription, sendTestPush, sendPushAll } from './lib/push.js';
import { getSnapshot, isDemoActive, dataSourceLabel, providerStatus } from './lib/marketData.js';
import { freeProbe } from './lib/freeData.js';
import { buildQuickScan } from './lib/quickScan.js';
import { CryptoPaper } from './trading/cryptoPaper.js';
import { ForexPaper } from './trading/forexPaper.js';
import { binanceAccount } from './lib/binanceUS.js';
import { getCryptoSnapshot } from './lib/cryptoData.js';
import { getForexSnapshot } from './lib/forexData.js';
import { scanCapitulation } from './lib/capitulation.js';
import { syncCryptoHistory, historyStatus } from './lib/cryptoHistory.js';
import { syncStockHistory, stockStatus } from './lib/stockHistory.js';
import { Orchestrator } from './lib/orchestrator.js';
import { record, queryEvents, telemetryStats, collect } from './lib/telemetry.js';
import { refreshCalendar, calendarStatus } from './lib/calendar.js';
import { killSwitchStatus, setKillActive } from './lib/killSwitch.js';
import { authorized as mt5Authorized, receiveState, status as mt5Status, enqueueCommand, takeCommands, ackCommand } from './lib/mt5Bridge.js';
import { decideOpportunityAlerts, decidePositionAlerts, AlertCenter } from './lib/alerts.js';
import { CreditBot } from './trading/creditBot.js';
import { newsStatus, resetNewsCache } from './lib/news.js';
import { analyzePositions } from './lib/positions.js';
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
let providerHealth = null;
let lastAlertResult = null;
let alertTimer = null;
const alertCenter = new AlertCenter({ cooldownMinutes: config.alerts.cooldownMinutes });
function botEnv(mode) {
  const specific = process.env['CREDIT_BOT_PROFILE_' + mode.toUpperCase()];
  return { ...process.env, CREDIT_BOT_PROFILE: specific || process.env.CREDIT_BOT_PROFILE || 'prudent' };
}
const bots = {
  paper: new CreditBot({ mode: 'paper', stateFile: 'bot-paper.json', env: botEnv('paper') }),
  live: new CreditBot({ mode: 'live', stateFile: 'bot-live.json', env: botEnv('live') })
};
const creditBot = bots.paper;
let creditBotTimer = null;
let lastBriefing = null;
let briefingTimer = null;
const CRON_TOKEN = process.env.CRON_TOKEN || '';
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
    creditBot: { enabled: config.creditBot.enabled, mode: creditBot.mode, armed: creditBot.state.armed },
    bots: { paperArmed: bots.paper.state.armed, liveArmed: bots.live.state.armed },
    providers: providerStatus(),
    providerHealth: providerHealth,
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

async function runQuickScan({ symbols, limit = 6, accountUsd = 0, profile = config.spreads.activeProfile } = {}) {
  const batches = await snapshotsFor(symbols);
  const items = [];
  const errors = [];
  for (const batch of batches) {
    if (batch.error) { errors.push({ symbol: batch.symbol, error: batch.error }); continue; }
    try {
      const nito = buildDirectionalSignals({ snapshot: batch.snapshot, settings: { ...config.nito, side: 'both' }, account: { sizeUsd: accountUsd, riskPct: config.nito.riskPct } });
      const spreads = buildSpreadIdeas({ snapshot: batch.snapshot, profile: String(profile).toLowerCase(), settings: config.spreads });
      items.push({ symbol: batch.symbol, snapshot: batch.snapshot, nito, spreads });
    } catch (error) { errors.push({ symbol: batch.symbol, error: error.message }); }
  }
  const scan = buildQuickScan({ items, limit, now: new Date() });
  return { ok: true, dataSource: dataSourceLabel(), demo: items.some((item) => item.snapshot?.simulated), accountUsd: accountUsd || null, ...scan, errors };
}

async function runPositionsAnalysis() {
  const trading = tradingDesk.status();
  const trades = tradingDesk.journal?.activeTrades?.() || [];
  const symbols = [...new Set(trades.map((trade) => trade.plan?.root || trade.plan?.underlying).filter(Boolean))];
  const snapshots = {};
  const errors = [];
  for (const symbol of symbols) {
    try { snapshots[symbol] = await getSnapshot(symbol, { tradier }); }
    catch (error) { errors.push({ symbol, error: error.message }); }
  }
  const analysis = analyzePositions({ trades, snapshots });
  return {
    ok: true, mode: trading.mode, blocked: Boolean(trading.blocked), paused: trading.paused,
    cycle: { state: trading.state || null, note: trading.note || null },
    dataSource: dataSourceLabel(), demo: isDemoActive(), ...analysis, errors
  };
}

app.get('/api/quick-scan', requireAccess, async (request, response) => {
  response.set('Cache-Control', 'no-store');
  const symbols = readSymbols(request.query.symbols, config.nito.symbols.slice(0, 6), 8);
  const limit = Math.min(8, Math.max(1, Number(request.query.limit) || 5));
  const accountUsd = Math.max(0, Number(request.query.account) || 0);
  const started = Date.now();
  try {
    const result = await runQuickScan({ symbols, limit, accountUsd, profile: request.query.profile });
    return response.json({ ...result, durationMs: Date.now() - started });
  } catch (error) {
    return response.status(503).json({ ok: false, error: error.message, demo: isDemoActive() });
  }
});

app.get('/api/positions', requireAccess, async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  try { return response.json(await runPositionsAnalysis()); }
  catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
});

function hasCronAccess(request) {
  if (hasValidAccessKey(request)) return true;
  const supplied = String(request.get('X-Cron-Token') || request.query.token || '');
  if (!CRON_TOKEN || supplied.length !== CRON_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(CRON_TOKEN));
}

app.post('/api/credit-bot/tick', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  if (!hasCronAccess(request)) return response.status(401).json({ error: 'Token de cron inválido.' });
  const results = {};
  for (const [botName, instance] of Object.entries(bots)) {
    instance.maybeAutoArm();
    const status = await instance.runCycle();
    results[botName] = { cycle: status.cycle, armed: status.armed, position: Boolean(status.position), aiLast: status.aiLast, notes: status.lastDecision?.notes?.slice(0, 3) || [] };
  }
  return response.json({ ok: true, bots: results });
});

app.post('/api/credit-bot/briefing', requireAccess, async (_request, response) => {
  try { return response.json({ ok: true, ...(await sendMorningBriefing({ force: true })) }); }
  catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
});

app.get('/api/news', requireAccess, async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  try { return response.json({ ok: true, ...(await newsStatus({ symbol: config.creditBot.symbol })) }); }
  catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
});

app.post('/api/news/refresh', requireAccess, async (_request, response) => {
  resetNewsCache();
  try { return response.json({ ok: true, ...(await newsStatus({ symbol: config.creditBot.symbol, force: true })) }); }
  catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
});

for (const [botName, instance] of Object.entries(bots)) {
  app.get('/api/bots/' + botName, requireAccess, (_request, response) => response.json({ ok: true, bot: botName, ...instance.status() }));
  app.post('/api/bots/' + botName + '/arm', requireAccess, (request, response) => {
    const result = instance.arm(botName);
    return response.status(result.ok ? 200 : 409).json({ ok: result.ok, bot: botName, ...instance.status(), gates: result.gates });
  });
  app.post('/api/bots/' + botName + '/pause', requireAccess, (request, response) => {
    if (typeof request.body?.paused !== 'boolean') return response.status(400).json({ error: 'Enviá { paused: true|false }.' });
    return response.json({ ok: true, bot: botName, ...instance.pause(request.body.paused) });
  });
  app.post('/api/bots/' + botName + '/disarm', requireAccess, (_request, response) => response.json({ ok: true, bot: botName, ...instance.disarm() }));
  app.post('/api/bots/' + botName + '/run', requireAccess, async (_request, response) => {
    try { return response.json({ ok: true, bot: botName, ...(await instance.runCycle()) }); }
    catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
  });
  app.post('/api/bots/' + botName + '/close', requireAccess, async (_request, response) => {
    if (!instance.state.position) return response.status(409).json({ error: 'No hay posición abierta.' });
    await instance.closePosition('CIERRE_MANUAL', instance.state.position.currentCredit ?? instance.state.position.credit);
    return response.json({ ok: true, bot: botName, ...instance.status() });
  });
  app.post('/api/bots/' + botName + '/verify', requireAccess, async (_request, response) => {
    try { return response.json({ ok: true, bot: botName, verify: await instance.verifyLiveToken() }); }
    catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
  });
  app.get('/api/bots/' + botName + '/config', requireAccess, (_request, response) => response.json({ ok: true, bot: botName, config: instance.getConfig() }));
  app.put('/api/bots/' + botName + '/config', requireAccess, (request, response) => {
    const result = instance.updateConfig(request.body || {});
    return response.status(result.ok ? 200 : 400).json({ ok: result.ok, bot: botName, ...result });
  });
  app.get('/api/bots/' + botName + '/stats', requireAccess, (_request, response) => response.json({ ok: true, bot: botName, ...instance.stats() }));
  app.get('/api/bots/' + botName + '/log', requireAccess, (request, response) => {
    const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
    return response.json({ ok: true, bot: botName, log: (instance.state.log || []).slice(-limit) });
  });
  app.post('/api/bots/' + botName + '/review', requireAccess, async (_request, response) => {
    const last = (instance.state.history || []).slice(-1)[0];
    if (!last) return response.status(409).json({ error: 'Sin operaciones cerradas todavía.' });
    const lesson = await instance.postMortem(last);
    return response.json({ ok: Boolean(lesson), lesson, stats: instance.stats() });
  });
  app.post('/api/bots/' + botName + '/tick', async (request, response) => {
    if (!hasCronAccess(request)) return response.status(401).json({ error: 'Token inválido.' });
    instance.maybeAutoArm();
    try { return response.json({ ok: true, bot: botName, ...(await instance.runCycle()) }); }
    catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
  });
}

app.get('/api/credit-bot', requireAccess, (_request, response) => response.json({ ok: true, ...creditBot.status() }));

app.post('/api/credit-bot/arm', requireAccess, (request, response) => {
  const result = creditBot.arm(request.body?.mode);
  return response.status(result.ok ? 200 : 409).json({ ok: result.ok, ...creditBot.status(), gates: result.gates });
});

app.post('/api/credit-bot/pause', requireAccess, (request, response) => {
  if (typeof request.body?.paused !== 'boolean') return response.status(400).json({ error: 'Enviá { paused: true|false }.' });
  return response.json({ ok: true, ...creditBot.pause(request.body.paused) });
});

app.post('/api/credit-bot/disarm', requireAccess, (_request, response) => response.json({ ok: true, ...creditBot.disarm() }));

app.post('/api/credit-bot/run', requireAccess, async (_request, response) => {
  try { return response.json({ ok: true, ...(await creditBot.runCycle()) }); }
  catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
});

app.post('/api/credit-bot/close', requireAccess, async (_request, response) => {
  if (!creditBot.state.position) return response.status(409).json({ error: 'No hay posición abierta.' });
  await creditBot.closePosition('CIERRE_MANUAL', creditBot.state.position.currentCredit ?? creditBot.state.position.credit);
  return response.json({ ok: true, ...creditBot.status() });
});


// Crypto SOL (paper, libro separado del bot de opciones)
const cryptoBooks = {
  pepe: new CryptoPaper({ stateFile: 'crypto-paper-pepe.json', configFile: 'crypto-config-pepe.json', symbol: 'PEPEUSDT' }),
  near: new CryptoPaper({ stateFile: 'crypto-paper-near.json', configFile: 'crypto-config-near.json', symbol: 'NEARUSDT' }),
  inj: new CryptoPaper({ stateFile: 'crypto-paper-inj.json', configFile: 'crypto-config-inj.json', symbol: 'INJUSDT' })
};
const cryptoPaper = cryptoBooks.pepe;
function cryptoBook(request) {
  const key = String(request?.query?.book || 'pepe').toLowerCase();
  return cryptoBooks[key] || cryptoBooks.pepe;
}
const forexPaper = new ForexPaper({});
// Tick interno de los bots de opciones (plan pago, siempre encendido).
const botTickTimer = setInterval(async () => {
  if (process.env.BOT_INTERNAL_TICK !== 'true') return;
  for (const instance of Object.values(bots)) {
    try { const status = instance.status(); if (status.armed && !status.paused) await instance.runCycle(); }
    catch { /* el ciclo tiene su propio manejo de errores */ }
  }
}, 10 * 60 * 1000);
botTickTimer.unref?.();

const cryptoTickTimer = setInterval(() => {
  for (const book of Object.values(cryptoBooks)) {
    if (book.status().armed && !book.status().paused) book.runCycle().catch(() => {});
  }
}, 15 * 60 * 1000);
cryptoTickTimer.unref?.();
app.get('/api/crypto/paper', requireAccess, (request, response) => response.json({ ok: true, ...cryptoBook(request).status() }));
app.get('/api/crypto/paper/config', requireAccess, (request, response) => response.json({ ok: true, config: cryptoBook(request).getConfig() }));
app.put('/api/crypto/paper/config', requireAccess, (request, response) => {
  const result = cryptoBook(request).updateConfig(request.body || {});
  return response.status(result.ok ? 200 : 400).json({ ok: result.ok, ...result });
});
app.get('/api/crypto/paper/log', requireAccess, (request, response) => {
  const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
  response.json({ ok: true, log: (cryptoBook(request).status().log || []).slice(-limit) });
});
app.post('/api/crypto/paper/tick', async (request, response) => {
  if (!hasCronAccess(request)) return response.status(401).json({ error: 'Token de cron inválido.' });
  const status = await cryptoBook(request).runCycle();
  return response.json({ ok: true, ...status });
});
app.post('/api/crypto/paper/arm', requireAccess, (request, response) => response.json({ ok: true, ...cryptoBook(request).arm() }));
app.post('/api/crypto/paper/pause', requireAccess, (request, response) => response.json({ ok: true, ...cryptoBook(request).pause(true) }));
app.post('/api/crypto/paper/disarm', requireAccess, (request, response) => response.json({ ok: true, ...cryptoBook(request).disarm() }));


// Históricos crypto (SQLite en disco persistente) + estado de claves Binance.US
const historySyncTimer = setTimeout(() => {
  if (process.env.CRYPTO_SYNC !== 'false') syncCryptoHistory({ symbol: 'SOLUSDT' }).catch(() => {});
}, 6000);
historySyncTimer.unref?.();
app.get('/api/crypto/history', requireAccess, (_request, response) => response.json({ ok: true, ...historyStatus() }));
app.post('/api/crypto/history/sync', requireAccess, async (_request, response) => {
  const result = await syncCryptoHistory({ symbol: 'SOLUSDT' });
  return response.json({ ok: true, ...result });
});
app.get('/api/crypto/binance', requireAccess, async (_request, response) => response.json({ ok: true, ...(await binanceAccount()) }));


// Históricos de acciones/índices (SQLite en disco persistente)
const stockSyncTimer = setTimeout(() => {
  if (process.env.STOCK_SYNC !== 'false') syncStockHistory({ days: 1825 }).catch(() => {});
}, 16000);
stockSyncTimer.unref?.();
app.get('/api/stocks/history', requireAccess, (_request, response) => response.json({ ok: true, ...stockStatus() }));
app.post('/api/stocks/history/sync', requireAccess, async (_request, response) => {
  const result = await syncStockHistory({ days: 1825 });
  return response.json({ ok: true, ...result });
});


// Orquestador de roles: riesgo, datos y aprendizaje (sin costo de IA)
const orchestrator = new Orchestrator({ bots, cryptoPaper });
const orchestrationTimer = setInterval(() => { orchestrator.runOnce().catch(() => {}); }, 10 * 60 * 1000);
orchestrationTimer.unref?.();
setTimeout(() => { orchestrator.runOnce().catch(() => {}); }, 25000).unref?.();
app.get('/api/orchestrator', requireAccess, (_request, response) => response.json({ ok: true, ...orchestrator.status() }));


// Telemetría central: registra todo lo que hacen los bots cada 5 min
function tradeStatsFor(instance) {
  const history = instance && instance.state && Array.isArray(instance.state.history) ? instance.state.history : [];
  const closed = history.filter((trade) => Number.isFinite(trade.realizedUsd));
  const wins = closed.filter((trade) => trade.realizedUsd > 0).length;
  const total = closed.reduce((sum, trade) => sum + trade.realizedUsd, 0);
  const captures = closed.map((trade) => trade.premiumCapturePct).filter((value) => Number.isFinite(value));
  const maes = closed.map((trade) => trade.maePctOfCredit).filter((value) => Number.isFinite(value));
  const strategies = {};
  for (const trade of closed) {
    const key = trade.strategy || 'OTRA';
    strategies[key] = strategies[key] || { trades: 0, wins: 0, pnl: 0 };
    strategies[key].trades += 1;
    strategies[key].pnl = Math.round((strategies[key].pnl + trade.realizedUsd) * 100) / 100;
    if (trade.realizedUsd > 0) strategies[key].wins += 1;
  }
  return {
    trades: closed.length, wins, losses: closed.length - wins,
    winRate: closed.length ? Math.round((wins / closed.length) * 1000) / 10 : null,
    totalPnlUsd: Math.round(total * 100) / 100,
    expectancyUsd: closed.length ? Math.round((total / closed.length) * 100) / 100 : null,
    avgCapturePct: captures.length ? Math.round((captures.reduce((sum, value) => sum + value, 0) / captures.length) * 100) / 100 : null,
    avgMaePct: maes.length ? Math.round((maes.reduce((sum, value) => sum + value, 0) / maes.length) * 100) / 100 : null,
    strategies
  };
}
function telemetryCollection() {
  try { collect({ bots, cryptoPaper, orchestrator }); } catch { /* aislado */ }
}
const telemetryTimer = setInterval(telemetryCollection, 5 * 60 * 1000);
telemetryTimer.unref?.();
setTimeout(telemetryCollection, 20000).unref?.();
record({ module: 'system', type: 'deploy', message: 'Servidor iniciado · commit ' + String(process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7) });
app.get('/api/telemetry', requireAccess, (request, response) => {
  response.json({ ok: true, events: queryEvents({ limit: request.query.limit, module: request.query.module, level: request.query.level, since: request.query.since }) });
});
app.get('/api/telemetry/stats', requireAccess, (_request, response) => {
  const botsSummary = {};
  for (const [mode, instance] of Object.entries(bots)) {
    const status = instance.status();
    botsSummary[mode] = { armed: Boolean(status.armed), paused: Boolean(status.paused), cycle: status.cycle, position: status.position ? { strategy: status.position.strategy, pnlUsd: status.position.pnlUsd, dte: status.position.dte } : null, ...tradeStatsFor(instance) };
  }
  const cryptoStatus = cryptoPaper.status();
  response.json({
    ok: true,
    telemetry: telemetryStats(),
    bots: botsSummary,
    crypto: { armed: Boolean(cryptoStatus.armed), cycle: cryptoStatus.cycle, position: cryptoStatus.position ? { side: cryptoStatus.position.side, entry: cryptoStatus.position.entry, pnlUsd: cryptoStatus.position.pnlUsd } : null, ...tradeStatsFor(cryptoPaper) },
    forex: { armed: Boolean(forexPaper.status().armed), cycle: forexPaper.status().cycle, position: forexPaper.status().position ? { side: forexPaper.status().position.side, entry: forexPaper.status().position.entry, pnlUsd: forexPaper.status().position.pnlUsd } : null, ...tradeStatsFor(forexPaper) },
    data: { crypto: historyStatus(), stocks: (stockStatus().coverage || {}) },
    orchestrator: orchestrator.status()
  });
});


// Calendario oficial: BLS (CPI/NFP), BEA (PCE), Fed (FOMC), OCC (OPEX)
async function refreshCalendarSafe() {
  try {
    const data = await refreshCalendar();
    record({ module: 'data', type: 'calendar', message: 'Calendario actualizado: ' + data.events.length + ' eventos · BLS ' + (data.sources.bls?.ok ? 'OK' : 'falló') + ' · BEA ' + (data.sources.bea?.ok ? 'OK' : 'falló') });
    return data;
  } catch (error) {
    record({ module: 'data', level: 'warn', type: 'calendar', message: 'Calendario no actualizado: ' + error.message });
    return null;
  }
}
setTimeout(refreshCalendarSafe, 5000).unref?.();
const calendarTimer = setInterval(refreshCalendarSafe, 6 * 60 * 60 * 1000);
calendarTimer.unref?.();
app.get('/api/calendar', requireAccess, (_request, response) => response.json({ ok: true, ...calendarStatus() }));

app.get('/api/validation', requireAccess, (_request, response) => response.json({ ok: true, liveTrading: process.env.LIVE_TRADING === 'true', live: bots.live.validationStatus() }));
app.get('/api/kill-switch', requireAccess, (_request, response) => response.json({ ok: true, ...killSwitchStatus() }));
app.post('/api/kill-switch', requireAccess, (request, response) => {
  const active = Boolean(request.body && request.body.active);
  const state = setKillActive(active, String((request.body && request.body.reason) || 'manual'));
  if (active) {
    for (const instance of Object.values(bots)) { try { instance.pause(true); } catch { /* aislado */ } }
    try { cryptoPaper.pause(true); } catch { /* aislado */ }
  }
  try { record({ module: 'system', level: active ? 'warn' : 'info', type: 'kill-switch', message: active ? 'Kill switch ACTIVADO' : 'Kill switch desactivado' }); } catch { /* aislado */ }
  return response.json({ ok: true, ...state });
});


// Forex paper (EUR/USD y GBP/USD)
const forexTickTimer = setInterval(() => {
  if (process.env.FOREX_INTERNAL_TICK === 'false') return;
  if (forexPaper.status().armed && !forexPaper.status().paused) forexPaper.runCycle().catch(() => {});
}, 15 * 60 * 1000);
forexTickTimer.unref?.();
app.get('/api/forex/paper', requireAccess, (_request, response) => response.json({ ok: true, ...forexPaper.status() }));
app.get('/api/forex/paper/config', requireAccess, (_request, response) => response.json({ ok: true, config: forexPaper.getConfig() }));
app.put('/api/forex/paper/config', requireAccess, (request, response) => {
  const result = forexPaper.updateConfig(request.body || {});
  return response.status(result.ok ? 200 : 400).json({ ok: result.ok, ...result });
});
app.get('/api/forex/paper/log', requireAccess, (request, response) => {
  const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
  response.json({ ok: true, log: (forexPaper.status().log || []).slice(-limit) });
});
app.post('/api/forex/paper/tick', async (request, response) => {
  if (!hasCronAccess(request)) return response.status(401).json({ error: 'Token de cron inválido.' });
  const status = await forexPaper.runCycle();
  return response.json({ ok: true, ...status });
});
app.post('/api/forex/paper/arm', requireAccess, (_request, response) => response.json({ ok: true, ...forexPaper.arm() }));
app.post('/api/forex/paper/pause', requireAccess, (_request, response) => response.json({ ok: true, ...forexPaper.pause(true) }));
app.post('/api/forex/paper/disarm', requireAccess, (_request, response) => response.json({ ok: true, ...forexPaper.disarm() }));


// Puente MT5: el EA de Windows hace polling y reporta estado
app.post('/api/mt5/bridge/state', express.text({ type: '*/*', limit: '200kb' }), (request, response) => {
  if (!mt5Authorized(request.query.token || request.get('X-MT5-Token'))) return response.status(401).json({ error: 'Token MT5 inválido.' });
  const status = receiveState(typeof request.body === 'string' ? request.body : '');
  return response.json({ ok: true, connected: status.connected, positions: status.positions.length });
});
app.get('/api/mt5/bridge/commands', (request, response) => {
  if (!mt5Authorized(request.query.token || request.get('X-MT5-Token'))) return response.status(401).json({ error: 'Token MT5 inválido.' });
  const { lines } = takeCommands();
  response.type('text/plain').send(lines.join('\n'));
});
app.post('/api/mt5/bridge/ack', (request, response) => {
  if (!mt5Authorized(request.query.token || request.get('X-MT5-Token'))) return response.status(401).json({ error: 'Token MT5 inválido.' });
  const command = ackCommand(request.query.id, request.query.result || 'ok');
  return response.json({ ok: Boolean(command), command });
});
app.get('/api/mt5/status', requireAccess, (_request, response) => response.json({ ok: true, ...mt5Status() }));
app.post('/api/mt5/command', requireAccess, (request, response) => {
  const command = enqueueCommand(request.body || {});
  return response.json({ ok: true, command });
});


// Gráficos en tiempo real (crypto y forex)
const chartCache = new Map();
function chartCached(key, ttl, loader) {
  const hit = chartCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = loader();
  chartCache.set(key, { at: Date.now(), value });
  return value;
}
app.get('/api/crypto/chart', requireAccess, async (request, response) => {
  try {
    const book = cryptoBook(request);
    const config = book.status().config || {};
    const snapshot = await chartCached('crypto:' + config.symbol, 30000, () => getCryptoSnapshot({ symbol: config.symbol, interval: config.interval || '1h' }));
    return response.json({ ok: true, symbol: config.symbol, price: snapshot.price, ema50: snapshot.ema50, ema200: snapshot.ema200, rsi14: snapshot.rsi14, source: snapshot.source, updatedAt: snapshot.updatedAt, bars: (snapshot.bars || []).slice(-120).map((bar) => ({ t: bar.time, c: bar.close })), position: book.status().position || null });
  } catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
});
app.get('/api/forex/chart', requireAccess, async (request, response) => {
  try {
    const config = forexPaper.status().config || {};
    const symbol = String(request.query.symbol || config.symbol || 'EURUSD').toUpperCase();
    const snapshot = await chartCached('forex:' + symbol, 30000, () => getForexSnapshot({ symbol }));
    const forexStatus = forexPaper.status();
    return response.json({ ok: true, symbol, price: snapshot.price, ema50: snapshot.ema50, ema200: snapshot.ema200, rsi14: snapshot.rsi14, source: snapshot.source, updatedAt: snapshot.updatedAt, session: snapshot.session, bars: (snapshot.bars || []).slice(-120).map((bar) => ({ t: bar.time, c: bar.close })), position: forexStatus.position && forexStatus.position.symbol === symbol ? forexStatus.position : null });
  } catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
});

app.get('/api/capitulation', requireAccess, async (_request, response) => {
  try { return response.json({ ok: true, ...(await scanCapitulation()) }); }
  catch (error) { return response.status(503).json({ ok: false, error: error.message }); }
});

app.get('/api/alerts/status', requireAccess, (_request, response) => response.json({
  ok: true,
  enabled: config.alerts.enabled,
  intervalMinutes: config.alerts.intervalMinutes,
  minScore: config.alerts.minScore,
  cooldownMinutes: config.alerts.cooldownMinutes,
  pushConfigured: pushStatus().configured,
  pushEnabled: pushStatus().enabled,
  lastRun: lastAlertResult,
  recent: alertCenter.peek().slice(-8)
}));

app.get('/api/bot', requireAccess, (_request, response) => {
  const status = tradingDesk.status();
  return response.json({
    ok: true,
    mode: status.mode, blocked: Boolean(status.blocked), paused: status.paused,
    profile: status.profile, root: status.root, maxRiskUsd: status.maxRiskUsd,
    cycle: { state: status.state ?? null, note: status.note ?? null },
    condorEnabled: status.condorEnabled,
    trades: status.trades ?? [], orders: status.orders ?? [],
    journal: tradingDesk.journal ? { active: tradingDesk.journal.activeTrades().length, pending: tradingDesk.journal.pending().length } : null
  });
});

app.post('/api/bot/trade/:tradeId/exit', requireAccess, (request, response) => {
  if (tradingDesk.mode !== 'paper') return response.status(409).json({ error: 'El cierre manual solo está habilitado en modo paper.' });
  const reason = String(request.body?.reason || 'UMBRAL_DE_PERDIDA');
  if (!['VENCIMIENTO_CERCANO', 'UMBRAL_DE_PERDIDA', 'STRIKE_CORTO_ALCANZADO'].includes(reason)) {
    return response.status(400).json({ error: 'Motivo de cierre inválido.' });
  }
  const ok = tradingDesk.journal?.requestExit?.(String(request.params.tradeId), reason);
  if (!ok) return response.status(404).json({ error: 'La posición no está abierta o ya tiene una salida pedida.' });
  return response.json({ ok: true, reason });
});

app.get('/api/diagnostics/data', requireAccess, async (request, response) => {
  response.set('Cache-Control', 'no-store');
  const symbol = String(request.query.symbol || 'SPY').toUpperCase();
  try {
    const probe = await freeProbe(symbol);
    const snapshot = await getSnapshot(symbol, { tradier, force: true });
    return response.json({
      ok: probe.ok && Boolean(snapshot.quote?.price),
      providers: providerStatus(),
      probe,
      snapshot: {
        symbol: snapshot.symbol, source: snapshot.source, simulated: snapshot.simulated,
        price: snapshot.quote?.price, expirations: snapshot.expirations,
        bars: snapshot.history?.length, intraday: snapshot.intraday?.length,
        strikes: Object.values(snapshot.chains || {}).reduce((sum, chain) => sum + chain.length, 0),
        warnings: snapshot.warnings
      }
    });
  } catch (error) {
    return response.status(503).json({ ok: false, error: error.message, providers: providerStatus() });
  }
});

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
    return response.json({ ok: true, dataSource: dataSourceLabel(), source: snapshot.source, demo: Boolean(snapshot.simulated), snapshot: snapshotSummary(snapshot), positioning, derived });
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
      demo: batches.some((batch) => batch.snapshot?.simulated),
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
      ok: true, demo: batches.some((batch) => batch.snapshot?.simulated), dataSource: dataSourceLabel(),
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
      ok: true, demo: Boolean(snapshot.simulated), dataSource: dataSourceLabel(),
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
    alerts: { enabled: config.alerts.enabled, intervalMinutes: config.alerts.intervalMinutes, minScore: config.alerts.minScore, pushConfigured: pushStatus().configured, lastRun: lastAlertResult },
    creditBot: { enabled: config.creditBot.enabled, mode: creditBot.mode, armed: creditBot.state.armed, paused: creditBot.state.paused, cycle: creditBot.state.cycle, aiReview: creditBot.aiReview, aiLast: creditBot.state.aiLast || null, lastBriefing },
    bots: Object.fromEntries(Object.entries(bots).map(([name, instance]) => [name, { mode: instance.mode, armed: instance.state.armed, paused: instance.state.paused, cycle: instance.state.cycle, position: Boolean(instance.state.position), aiLast: instance.state.aiLast || null }])),
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

async function sendMorningBriefing({ force = false } = {}) {
  const scan = await runQuickScan({ symbols: config.nito.symbols.slice(0, 6), limit: 3, accountUsd: 0 });
  const positions = await runPositionsAnalysis();
  let text = '';
  try {
    const result = await analyzeTask({ task: 'journal', provider: 'auto', payload: { mode: creditBot.mode, armed: creditBot.state.armed, cycle: creditBot.state.cycle, aiLast: creditBot.state.aiLast, opportunities: (scan.opportunities || []).slice(0, 3), positions: positions.positions, summary: positions.summary } });
    text = result.text || '';
    lastBriefing = { at: new Date().toISOString(), provider: result.provider, text, sent: 0 };
  } catch (error) {
    text = scan.summary;
    lastBriefing = { at: new Date().toISOString(), error: error.message, text };
  }
  if (text) {
    const push = await sendPushAll({ title: '5M · Briefing del bot', body: text.slice(0, 240), tag: '5m-briefing', url: '/#quick' });
    lastBriefing.sent = push.sent || 0;
    if (force) lastBriefing.forced = true;
  }
  return lastBriefing;
}

function briefingMinuteET(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return parts.hour === '09' && parts.minute === '10';
}

async function alertCycle() {
  if (!config.alerts.enabled) return;
  const push = pushStatus();
  if (!push.configured) { lastAlertResult = { at: new Date().toISOString(), skipped: 'push-no-configurado' }; return; }
  const started = Date.now();
  try {
    const scan = await runQuickScan({ symbols: config.nito.symbols.slice(0, 6), limit: 6, accountUsd: 0 });
    const positions = await runPositionsAnalysis();
    const candidates = [
      ...decideOpportunityAlerts({ scan, minScore: config.alerts.minScore }),
      ...decidePositionAlerts({ analysis: positions })
    ];
    const due = alertCenter.due(candidates);
    let sent = 0;
    const titles = [];
    for (const alert of due) {
      const result = await sendPushAll({ title: alert.title, body: alert.body, tag: '5m-' + alert.key, url: alert.url });
      sent += result.sent || 0;
      titles.push(alert.title);
    }
    lastAlertResult = { at: new Date().toISOString(), candidates: candidates.length, due: due.length, sent, titles, durationMs: Date.now() - started };
  } catch (error) {
    lastAlertResult = { at: new Date().toISOString(), error: error.message };
  }
}

function startAlertScheduler() {
  if (alertTimer || !config.alerts.enabled) return;
  alertTimer = setInterval(() => { alertCycle().catch(() => {}); }, config.alerts.intervalMinutes * 60000);
  alertTimer.unref?.();
  setTimeout(() => alertCycle().catch(() => {}), 60000).unref?.();
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

async function warmupProviders() {
  try {
    const probe = await freeProbe(config.nito.symbols?.[0] || 'SPY');
    providerHealth = { at: new Date().toISOString(), ...probe };
    if (!probe.ok) console.warn('[5M] Proveedor gratuito con fallos:', probe.steps.filter((step) => !step.ok).map((step) => step.name).join(', '));
  } catch (error) {
    providerHealth = { at: new Date().toISOString(), ok: false, error: error.message };
  }
}

if (process.env.NODE_ENV !== 'test' && !process.argv.includes('--test')) {
  app.listen(config.port, config.host, () => {
    console.info(`[5M] http://${config.host}:${config.port} · Tradier ${isTradierConfigured() ? 'configurado' : 'no configurado'} · Gemini ${isGeminiConfigured() ? 'configurado' : 'no configurado'}`);
  });
  startScannerScheduler();
  tradingDesk.start();
  setTimeout(warmupProviders, 300);
  startAlertScheduler();
  for (const instance of Object.values(bots)) instance.maybeAutoArm();
  briefingTimer = setInterval(() => {
    if (!briefingMinuteET()) return;
    const day = new Date().toISOString().slice(0, 10);
    if (lastBriefing?.day === day) return;
    sendMorningBriefing().then((result) => { if (result) lastBriefing = { ...result, day }; }).catch(() => {});
  }, 60000);
  briefingTimer.unref?.();
  if (config.creditBot.enabled) {
    creditBotTimer = setInterval(() => { for (const instance of Object.values(bots)) instance.runCycle().catch(() => {}); }, config.creditBot.intervalMinutes * 60000);
    creditBotTimer.unref?.();
  }
}