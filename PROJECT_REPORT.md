# VALIDO 1M — Complete Project Report

> Generated for AI analysis. Full source code and architecture documentation.
> GitHub: https://github.com/avali2/2M
> Live: https://valido-1m.onrender.com

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Folder Structure](#folder-structure)
3. [Architecture](#architecture)
4. [Files and Code](#files-and-code)
   - [Root Config Files](#root-config-files)
   - [Server](#server)
   - [Client Source](#client-source)
   - [Components](#components)
   - [Config](#config)
   - [Services](#services)
5. [Strategy Catalog](#strategy-catalog)
6. [Market Universe](#market-universe)
7. [Scoring System](#scoring-system)
8. [Environment Variables](#environment-variables)
9. [Deployment](#deployment)

---

## Project Overview

**VALIDO 1M** is a professional options trading signal platform built with:

- **Frontend**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + Recharts
- **Backend**: Express 5 + Node 22
- **Data Providers**: Tradier (options chains, quotes, timesales), Polygon.io (tape reading), Yahoo Finance (fallback)
- **AI**: Google Gemini 2.5 Flash as Guardian auditor
- **Database**: PostgreSQL (optional) / SQLite (local fallback) via repository pattern
- **Push**: Web Push API with VAPID keys + Service Worker
- **Deployment**: Render (free tier compatible)

### Core Features

1. **Gemini Guardian** — AI auditor that reviews all signal candidates
2. **Credit Spread Priority** — Bull Put Credit Spread is priority #1
3. **Institutional Engine** — Wyckoff analysis, Polygon tape reading, EMA/MACD/RSI/VWAP
4. **FAIL-CLOSED** — No signal is approved without real Greeks, bid/ask, OI, volume
5. **Strategy Permissions** — 23 strategies with REAL_SIGNAL / WATCHLIST_ONLY / BLOCKED tiers
6. **Market Universe** — CORE (29 symbols), WATCHLIST (92 symbols), INDEX, SECTOR
7. **White Theme** — Professional light theme, mobile-first responsive
8. **Push Notifications** — Service Worker + backend AutonomousWorker
9. **Risk Config** — Editable account size, risk %, collateral, PDT protection
10. **Trade Journal** — LocalStorage + backend persistence

---

## Folder Structure

```
c:/Users/jobva/2M/
├── .env.example              # Environment variables template
├── .gitignore
├── institutional-os.html     # Vite entry HTML
├── package.json              # Dependencies and scripts
├── render.yaml               # Render deployment config
├── vite.config.js            # Vite bundler config
├── tailwind.config.js        # Tailwind CSS theme
├── postcss.config.js
├── eslint.config.js
│
├── data/                     # Runtime data storage (IV history)
│
├── public/                   # Static assets
│   ├── manifest.webmanifest
│   ├── sw.js                 # Service Worker for push
│   ├── valido-mark.svg
│   └── icons/
│
├── scripts/                  # CLI utilities
│   ├── backtestGuardian.js
│   └── guardianYahooScan.js
│
├── server/                   # Express backend
│   ├── index.js              # MAIN server entry (old, still works)
│   ├── index.mjs             # NEW server entry (institutional engine)
│   ├── institutional-engine.mjs  # Full institutional scanner
│   ├── strategy-suite.js     # Strategy builder (buildCreditVerticals)
│   ├── strategy-permissions.mjs  # Strategy permission enforcement
│   ├── config.js             # Server config & universe
│   ├── explainers.js         # AI explainer texts
│   ├── push.js               # Web Push service
│   ├── pushRoutes.js         # Push subscription endpoints
│   ├── pushStore.js          # Push subscription storage
│   ├── autonomousSignalWorker.js  # Background scanner
│   ├── guardianScheduler.js  # Guardian scheduler
│   ├── guardianRoutes.js     # Guardian API routes
│   ├── ai/                   # AI provider router
│   │   ├── provider-router.js
│   │   ├── deterministic-tutor.js
│   │   └── budget-manager.js
│   ├── db/                   # Database repository
│   │   └── repository.js
│   ├── engine/               # Signal engine
│   │   ├── scanner.js        # Main scanner (universe → chain → strategies → scoring)
│   │   ├── strategies.js     # generateDefinedRiskSetups, CSP, CC, Debit Spreads
│   │   ├── scoring.js        # scoreSetup, classifySignal
│   │   ├── probability-edge.js
│   │   ├── risk-governor.js
│   │   ├── technicals.js     # deriveTechnicals (EMA, RSI, MACD, VWAP)
│   │   ├── market-intelligence.js
│   │   ├── guidance.js
│   │   └── data-health.js
│   ├── guardian/             # Guardian edge tickets
│   │   └── edge-tickets.js
│   ├── lib/                  # Server utilities
│   │   ├── cache.js
│   │   ├── math.js
│   │   └── store.js
│   ├── providers/            # Data providers
│   │   └── index.js
│   └── services/             # Scheduler
│       └── scheduler.js
│
├── src/                      # React frontend
│   ├── main.jsx              # Entry point (imports AppPro)
│   ├── AppPro.jsx            # MAIN app component
│   ├── App.jsx               # OLD app component (not imported)
│   ├── index.css             # Tailwind base + light theme variables
│   ├── styles/
│   │   └── theme.css         # Component CSS (signal-card, market-card, etc.)
│   ├── components/           # React components
│   │   ├── GeminiBriefCard.tsx    # Gemini Guardian brief display
│   │   ├── SignalCard.jsx         # Signal ticket card
│   │   ├── MarketPulseCard.jsx    # Market pulse with tape reading
│   │   ├── NewsImpactList.jsx     # News with star ratings
│   │   ├── NotificationStatusCard.jsx  # Notification controls
│   │   └── HomePro.tsx       # Home dashboard (imported by App.jsx)
│   ├── config/               # Frontend config
│   │   ├── marketUniverse.ts     # Universe definitions (CORE/WATCHLIST/INDEX)
│   │   ├── strategyCatalog.ts    # 23 strategies with permissions
│   │   └── riskConfig.ts         # Risk settings persistence
│   ├── lib/                  # Frontend utilities
│   │   ├── api.js            # API client
│   │   └── guardian/
│   │       └── geminiGuardian.ts  # Gemini Guardian frontend client
│   ├── services/             # Frontend services
│   │   ├── notifications.js      # Service worker registration
│   │   ├── notificationClient.js  # Local notification test
│   │   ├── proAlertEngine.ts
│   │   ├── newsImpactClassifier.ts # News star classification
│   │   └── geminiGuardian.js
│   └── utils/                # Utilities
│       └── proSignalAdapter.js
│
└── tests/                    # Test files
    ├── ai-engine.test.js
    ├── engine.test.js
    ├── guardian-agent.test.js
    ├── probability-edge.test.js
    └── ...
```

---

## Files and Code

### Root Config Files

#### `package.json`

```json
{
  "name": "valido-1m-options-assistant",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"vite --host 127.0.0.1\" \"node --watch server/index.js\"",
    "dev:api": "node --watch server/index.js",
    "build": "vite build",
    "start": "node server/index.js",
    "test": "node --test tests/*.test.js",
    "guardian:scan:yahoo": "node scripts/guardianYahooScan.js",
    "guardian:backtest": "node scripts/backtestGuardian.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.6.1",
    "express": "^5.1.0",
    "helmet": "^8.1.0",
    "motion": "^12.40.0",
    "p-limit": "^7.1.1",
    "pg": "^8.21.0",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "recharts": "^3.1.2",
    "web-push": "^3.6.7",
    "yahoo-finance2": "^3.14.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.24.0",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@vitejs/plugin-react": "^4.4.1",
    "concurrently": "^9.1.2",
    "eslint": "^9.24.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.20",
    "globals": "^16.0.0",
    "tailwindcss": "^4.1.4",
    "@tailwindcss/vite": "^4.1.4",
    "typescript": "~5.7.2",
    "vite": "^7.3.3"
  }
}
```

#### `vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const buildTimestamp = process.env.VITE_VALIDO_BUILD_TIMESTAMP || new Date().toISOString();
const buildVersion = process.env.VITE_VALIDO_BUILD_VERSION ||
  process.env.RENDER_GIT_COMMIT?.slice(0, 7) ||
  `local-${buildTimestamp.replace(/[-:TZ.]/g, '').slice(0, 12)}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_VALIDO_BUILD_VERSION': JSON.stringify(buildVersion),
    'import.meta.env.VITE_VALIDO_BUILD_TIMESTAMP': JSON.stringify(buildTimestamp)
  },
  build: {
    rollupOptions: {
      input: 'institutional-os.html',
      output: {
        manualChunks: {
          charts: ['recharts']
        }
      }
    }
  }
});
```

#### `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./institutional-os.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sigma: {
          bg: '#edf4ff',
          soft: '#f8fafc',
          card: '#ffffff',
          elevated: '#eef4fb',
          line: '#d7e2ef',
          gold: '#f5b942',
          green: '#22c55e',
          red: '#ef4444',
          amber: '#f59e0b',
          blue: '#2563eb',
          text: '#0f172a',
          muted: '#64748b'
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'Inter', 'Arial', 'sans-serif'],
        mono: ['Cascadia Mono', 'Consolas', 'monospace']
      },
      boxShadow: {
        panel: '0 18px 44px rgba(30, 64, 175, .08)'
      }
    }
  },
  plugins: []
};
```

#### `render.yaml`

```yaml
services:
  - type: web
    name: valido-1m
    runtime: node
    plan: free
    buildCommand: npm install --include=dev && npm run build
    startCommand: npm start
    healthCheckPath: /api/health
    autoDeploy: true
    envVars:
      - key: NODE_VERSION
        value: "22"
      - key: NODE_ENV
        value: production
      - key: NPM_CONFIG_PRODUCTION
        value: "false"
      - key: HOST
        value: "0.0.0.0"
      # ... (more env vars)
```

---

### Server

#### `server/institutional-engine.mjs` — Institutional Scanner

```js
import fs from "node:fs/promises";
import path from "node:path";

const TRADIER_BASE = process.env.TRADIER_BASE_URL || "https://api.tradier.com/v1";
const TRADIER_TOKEN = process.env.TRADIER_TOKEN || process.env.VITE_TRADIER_TOKEN;
const POLYGON_KEY = process.env.POLYGON_API_KEY || process.env.VITE_POLYGON_API_KEY;
const DATA_DIR = path.resolve(process.cwd(), ".data");
const IV_HISTORY_FILE = path.join(DATA_DIR, "iv-history.json");

const DEFAULT_UNIVERSE = ["SPY", "QQQ", "IWM", "DIA", "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "SOFI"];

const DEFAULT_SETTINGS = {
  accountSize: Number(process.env.ACCOUNT_SIZE || 2500),
  maxRiskPct: Number(process.env.MAX_RISK_PCT || 0.02),
  maxCollateralPct: Number(process.env.MAX_COLLATERAL_PCT || 0.35),
  minPopReady: 70,
  minPopCandidate: 65,
  maxBidAskPct: 18,
  minOpenInterest: 100,
  minOptionVolume: 5,
  maxSignalsPerScan: 12,
  creditDeltaMin: 0.14,
  creditDeltaMax: 0.32,
  ironCondorDeltaMin: 0.10,
  ironCondorDeltaMax: 0.22,
  preferDteMin: 7,
  preferDteMax: 45,
  idealDte: 21,
  zeroDteMaxRiskPct: 0.005
};

// ---- MATH HELPERS ----
function round(n, d = 2) {
  if (!Number.isFinite(Number(n))) return null;
  const m = 10 ** d;
  return Math.round(Number(n) * m) / m;
}
function clamp(n, min, max) {
  if (!Number.isFinite(Number(n))) return min;
  return Math.max(min, Math.min(max, Number(n)));
}
function mean(arr) {
  const x = arr.filter(Number.isFinite);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
}
function std(arr) {
  const m = mean(arr);
  if (m == null) return null;
  const x = arr.filter(Number.isFinite);
  if (x.length < 2) return null;
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
}

// ---- TECHNICAL INDICATORS ----
function ema(values, period) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length < period) return null;
  const k = 2 / (period + 1);
  let e = mean(clean.slice(0, period));
  for (let i = period; i < clean.length; i++) e = clean[i] * k + e * (1 - k);
  return e;
}

function rsi(values, period = 14) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = clean[i] - clean[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < clean.length; i++) {
    const diff = clean[i] - clean[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function macd(values) {
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  if (e12 == null || e26 == null) return null;
  const clean = values.map(Number).filter(Number.isFinite);
  const macdSeries = [];
  for (let i = 26; i <= clean.length; i++) {
    const sub = clean.slice(0, i);
    const a = ema(sub, 12); const b = ema(sub, 26);
    if (a != null && b != null) macdSeries.push(a - b);
  }
  const signal = ema(macdSeries, 9);
  return {
    line: round(e12 - e26, 4),
    signal: signal == null ? null : round(signal, 4),
    histogram: signal == null ? null : round(e12 - e26 - signal, 4)
  };
}

function vwap(bars) {
  let pv = 0, vol = 0;
  for (const b of bars) {
    const typical = ((b.high ?? b.close) + (b.low ?? b.close) + b.close) / 3;
    const v = Number(b.volume || 0);
    if (Number.isFinite(typical) && v > 0) { pv += typical * v; vol += v; }
  }
  return vol > 0 ? pv / vol : null;
}

function realizedVol(closes, barsPerYear = 252) {
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const s = std(returns);
  return s == null ? null : s * Math.sqrt(barsPerYear);
}

function dte(expiration) {
  const exp = new Date(`${expiration}T16:00:00-04:00`);
  return Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86_400_000));
}

// ---- TRADIER API ----
function tradierHeaders() {
  if (!TRADIER_TOKEN) throw new Error("Falta TRADIER_TOKEN en variables de entorno.");
  return { Authorization: `Bearer ${TRADIER_TOKEN}`, Accept: "application/json" };
}
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Respuesta no JSON: ${text.slice(0, 300)}`); }
}
function toArray(x) { if (!x) return []; return Array.isArray(x) ? x : [x]; }

async function getQuote(symbol) {
  const url = `${TRADIER_BASE}/markets/quotes?symbols=${encodeURIComponent(symbol)}`;
  const json = await fetchJson(url, { headers: tradierHeaders() });
  const q = toArray(json?.quotes?.quote)[0];
  if (!q) throw new Error(`Sin quote para ${symbol}`);
  return {
    symbol, price: Number(q.last || q.close || q.bid || q.ask),
    bid: Number(q.bid), ask: Number(q.ask), volume: Number(q.volume || 0),
    changePct: Number(q.change_percentage || 0), raw: q
  };
}

async function getTimesales(symbol, interval = "1min") {
  const end = new Date();
  const start = new Date(Date.now() - 6.5 * 60 * 60 * 1000);
  const qs = new URLSearchParams({
    symbol, interval,
    start: start.toISOString().slice(0, 19),
    end: end.toISOString().slice(0, 19),
    session_filter: "open"
  });
  const url = `${TRADIER_BASE}/markets/timesales?${qs}`;
  const json = await fetchJson(url, { headers: tradierHeaders() });
  return toArray(json?.series?.data).map(b => ({
    time: b.time, timestamp: Number(b.timestamp) * 1000 || new Date(b.time).getTime(),
    open: Number(b.open), high: Number(b.high), low: Number(b.low),
    close: Number(b.close || b.price), price: Number(b.price || b.close),
    volume: Number(b.volume || 0), vwap: Number(b.vwap)
  })).filter(b => Number.isFinite(b.close));
}

async function getExpirations(symbol) {
  const url = `${TRADIER_BASE}/markets/options/expirations?symbol=${encodeURIComponent(symbol)}&includeAllRoots=true&strikes=false`;
  const json = await fetchJson(url, { headers: tradierHeaders() });
  return toArray(json?.expirations?.date).filter(Boolean);
}

async function getOptionChain(symbol, expiration) {
  const url = `${TRADIER_BASE}/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${expiration}&greeks=true`;
  const json = await fetchJson(url, { headers: tradierHeaders() });
  return toArray(json?.options?.option).map(normalizeOption).filter(Boolean);
}

function normalizeOption(o) {
  const bid = Number(o.bid); const ask = Number(o.ask); const last = Number(o.last);
  const mid = Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid ? (bid + ask) / 2 : Number.isFinite(last) ? last : null;
  const g = o.greeks || {}; const type = String(o.option_type || o.type || "").toUpperCase();
  if (!["CALL", "PUT"].includes(type)) return null;
  return {
    symbol: o.symbol, underlying: o.root_symbol, expiration: o.expiration_date,
    strike: Number(o.strike), type, bid, ask, last, mid,
    volume: Number(o.volume || 0), openInterest: Number(o.open_interest || 0),
    delta: Number(g.delta), gamma: Number(g.gamma), theta: Number(g.theta),
    vega: Number(g.vega), rho: Number(g.rho), iv: Number(g.mid_iv || g.iv || g.smv_vol || 0), raw: o
  };
}

// ---- TECHNICAL ANALYSIS ----
function computeTechnicals(symbol, quote, bars) {
  const closes = bars.map(b => Number(b.close)).filter(Number.isFinite);
  const volumes = bars.map(b => Number(b.volume || 0));
  const last = quote.price || closes.at(-1);
  const vw = vwap(bars);
  const ema9 = ema(closes, 9), ema21 = ema(closes, 21), ema50 = ema(closes, 50), ema200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const recentHigh = Math.max(...bars.slice(-50).map(b => Number(b.high || b.close)));
  const recentLow = Math.min(...bars.slice(-50).map(b => Number(b.low || b.close)));
  const avgVol20 = mean(volumes.slice(-20));
  const lastVol = volumes.at(-1) || 0;
  const relVol = avgVol20 ? lastVol / avgVol20 : null;

  let trend = "RANGE";
  if (ema9 && ema21 && ema50 && last > ema9 && ema9 > ema21 && ema21 > ema50) trend = "BULL_TREND";
  if (ema9 && ema21 && ema50 && last < ema9 && ema9 < ema21 && ema21 < ema50) trend = "BEAR_TREND";

  let momentum = "neutral";
  if (r != null && r > 55 && m?.histogram != null && m.histogram > 0) momentum = "bullish";
  if (r != null && r < 45 && m?.histogram != null && m.histogram < 0) momentum = "bearish";

  const structure = detectStructure(bars);

  return {
    symbol, price: round(last, 2),
    ema9: round(ema9, 2), ema21: round(ema21, 2), ema50: round(ema50, 2), ema200: round(ema200, 2),
    rsi14: round(r, 2), macd: m,
    vwap: round(vw, 2), vwapBias: vw == null ? "VWAP_UNKNOWN" : last >= vw ? "ABOVE_VWAP" : "BELOW_VWAP",
    relativeVolume: round(relVol, 2), volumeSpike: relVol != null && relVol >= 1.7,
    support: round(recentLow, 2), resistance: round(recentHigh, 2),
    trend, momentum, structure,
    realizedVol: round(realizedVol(closes), 4)
  };
}

function detectStructure(bars) {
  const last = bars.slice(-20);
  if (last.length < 10) return "UNKNOWN";
  const highs = last.map(b => Number(b.high || b.close));
  const lows = last.map(b => Number(b.low || b.close));
  const fh = mean(highs.slice(0, 5)), lh = mean(highs.slice(-5));
  const fl = mean(lows.slice(0, 5)), ll = mean(lows.slice(-5));
  if (lh > fh && ll > fl) return "HH_HL";
  if (lh < fh && ll < fl) return "LH_LL";
  return "RANGE";
}

// ---- WYCKOFF ANALYSIS ----
function detectWyckoff(bars, technicals) {
  const recent = bars.slice(-80);
  if (recent.length < 30) return { phase: "NO_DATA", bias: "NEUTRAL", score: 0, evidence: ["No hay barras suficientes."] };
  const highs = recent.map(b => Number(b.high || b.close));
  const lows = recent.map(b => Number(b.low || b.close));
  const closes = recent.map(b => Number(b.close));
  const vols = recent.map(b => Number(b.volume || 0));
  const rangeHigh = Math.max(...highs), rangeLow = Math.min(...lows);
  const rangePct = (rangeHigh - rangeLow) / closes.at(-1);
  const avgVol = mean(vols.slice(0, -5)) || 1;
  const lastVol = mean(vols.slice(-5)) || 0;
  const volExpansion = lastVol / avgVol;
  const lastClose = closes.at(-1);
  const spring = lows.at(-1) < rangeLow * 1.01 && lastClose > rangeLow * 1.015 && volExpansion > 1.2;
  const upthrust = highs.at(-1) > rangeHigh * 0.99 && lastClose < rangeHigh * 0.985 && volExpansion > 1.2;
  const sos = technicals.structure === "HH_HL" && volExpansion > 1.15 && lastClose > technicals.vwap;
  const sow = technicals.structure === "LH_LL" && volExpansion > 1.15 && lastClose < technicals.vwap;

  let phase = "RANGE", bias = "NEUTRAL"; const evidence = [];
  if (rangePct < 0.08) evidence.push("Rango compacto.");
  if (spring) { phase = "SPRING"; bias = "BULLISH"; evidence.push("Spring: barrida bajo soporte y recuperación con volumen."); }
  else if (upthrust) { phase = "UPTHRUST"; bias = "BEARISH"; evidence.push("Upthrust: ruptura falsa sobre resistencia con rechazo."); }
  else if (sos) { phase = "SIGN_OF_STRENGTH"; bias = "BULLISH"; evidence.push("SOS: estructura HH/HL con volumen y precio sobre VWAP."); }
  else if (sow) { phase = "SIGN_OF_WEAKNESS"; bias = "BEARISH"; evidence.push("SOW: estructura LH/LL con volumen y precio bajo VWAP."); }
  else if (technicals.trend === "BULL_TREND") { phase = "ACCUMULATION_OR_MARKUP"; bias = "BULLISH"; evidence.push("Sesgo alcista por tendencia y estructura."); }
  else if (technicals.trend === "BEAR_TREND") { phase = "DISTRIBUTION_OR_MARKDOWN"; bias = "BEARISH"; evidence.push("Sesgo bajista por tendencia y estructura."); }
  const score = bias === "BULLISH" || bias === "BEARISH" ? 72 : 52;
  return { phase, bias, score, evidence, volumeExpansion: round(volExpansion, 2) };
}

// ---- POLYGON TAPE READING ----
async function getPolygonTape(symbol) {
  if (!POLYGON_KEY) {
    return { status: "NO_POLYGON_KEY", prints: [], score: 0, summary: "Sin POLYGON_API_KEY: tape real no disponible. Usando solo OHLCV/Tradier. Señal degradada." };
  }
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const startNs = nowNs - 10n * 60n * 1_000_000_000n;
  const tradeUrl = `https://api.polygon.io/v3/trades/${symbol}?timestamp.gte=${startNs}&timestamp.lte=${nowNs}&limit=5000&sort=timestamp&order=asc&apiKey=${POLYGON_KEY}`;
  const quoteUrl = `https://api.polygon.io/v3/quotes/${symbol}?timestamp.gte=${startNs}&timestamp.lte=${nowNs}&limit=5000&sort=timestamp&order=asc&apiKey=${POLYGON_KEY}`;
  try {
    const [tradesJson, quotesJson] = await Promise.all([fetchJson(tradeUrl), fetchJson(quoteUrl)]);
    const trades = toArray(tradesJson.results); const quotes = toArray(quotesJson.results);
    const prints = trades.map(t => {
      const ts = Number(t.sip_timestamp || t.participant_timestamp || t.timestamp);
      const price = Number(t.price); const size = Number(t.size || 0);
      const q = nearestQuote(quotes, ts);
      let side = "mid";
      if (q) { if (Number.isFinite(q.ask_price) && price >= Number(q.ask_price)) side = "ask"; else if (Number.isFinite(q.bid_price) && price <= Number(q.bid_price)) side = "bid"; }
      return { timestamp: ts, price, size, notional: price * size, side };
    }).filter(p => Number.isFinite(p.price));
    return evaluateTape(symbol, prints, "POLYGON_REAL_TAPE");
  } catch (e) { return { status: "TAPE_ERROR", prints: [], score: 0, summary: `Error tape Polygon: ${e.message}` }; }
}

function nearestQuote(quotes, ts) {
  if (!quotes.length) return null;
  let best = null;
  for (const q of quotes) { const qt = Number(q.sip_timestamp || q.participant_timestamp || q.timestamp); if (qt <= ts) best = q; else break; }
  return best;
}

function evaluateTape(symbol, prints, status = "REAL") {
  if (!prints.length) return { symbol, status: "NO_DATA", score: 0, buyPressure: 0, sellPressure: 0, printsPerSecond: 0, largeTradeDetected: false, summary: "Sin prints recientes." };
  const ask = prints.filter(p => p.side === "ask"); const bid = prints.filter(p => p.side === "bid");
  const askN = ask.reduce((s, p) => s + p.notional, 0); const bidN = bid.reduce((s, p) => s + p.notional, 0);
  const total = askN + bidN || 1;
  const buyPressure = askN / total; const sellPressure = bidN / total;
  const largeTradeDetected = prints.some(p => p.notional >= 500_000);
  const timestamps = prints.map(p => Number(p.timestamp)).filter(Number.isFinite);
  const seconds = Math.max(1, (Math.max(...timestamps) - Math.min(...timestamps)) / 1e9);
  const pps = prints.length / seconds;
  let score = 50 + (buyPressure - sellPressure) * 40;
  if (pps > 2) score += 5; if (largeTradeDetected) score += 5;
  const momentum = buyPressure > sellPressure + 0.10 ? "BUY_PRESSURE" : sellPressure > buyPressure + 0.10 ? "SELL_PRESSURE" : "BALANCED";
  return { symbol, status, score: Math.round(clamp(score, 0, 100)), momentum, buyPressure: round(buyPressure * 100, 1), sellPressure: round(sellPressure * 100, 1), printsPerSecond: round(pps, 2), largeTradeDetected, summary: `${momentum}: compra ${round(buyPressure * 100, 1)}% vs venta ${round(sellPressure * 100, 1)}%. Grande: ${largeTradeDetected ? "SÍ" : "NO"}.` };
}

// ---- IV HISTORY ----
async function updateIvHistory(symbol, currentIv) {
  if (!Number.isFinite(currentIv) || currentIv <= 0) return { ivRank: null, ivPercentile: null };
  await fs.mkdir(DATA_DIR, { recursive: true });
  let db = {};
  try { db = JSON.parse(await fs.readFile(IV_HISTORY_FILE, "utf8")); } catch { db = {}; }
  const today = new Date().toISOString().slice(0, 10);
  const rows = db[symbol] || [];
  const filtered = rows.filter(r => r.date !== today);
  filtered.push({ date: today, iv: currentIv });
  db[symbol] = filtered.slice(-252);
  await fs.writeFile(IV_HISTORY_FILE, JSON.stringify(db, null, 2));
  const hist = db[symbol].map(r => Number(r.iv)).filter(Number.isFinite);
  if (hist.length < 20) return { ivRank: null, ivPercentile: null, note: "IV history insuficiente." };
  const minIv = Math.min(...hist), maxIv = Math.max(...hist);
  const ivRank = maxIv > minIv ? ((currentIv - minIv) / (maxIv - minIv)) * 100 : null;
  const ivPercentile = hist.filter(v => v <= currentIv).length / hist.length * 100;
  return { ivRank: round(ivRank, 1), ivPercentile: round(ivPercentile, 1) };
}

// ---- OPTION CHAIN HELPERS ----
function avgIv(options) {
  const ivs = options.map(o => Number(o.iv)).filter(v => Number.isFinite(v) && v > 0);
  return mean(ivs);
}

function chooseExpirations(expirations) {
  return expirations.map(exp => ({ exp, dte: dte(exp) }))
    .filter(x => x.dte >= 0 && x.dte <= 365)
    .sort((a, b) => Math.abs(a.dte - DEFAULT_SETTINGS.idealDte) - Math.abs(b.dte - DEFAULT_SETTINGS.idealDte));
}

// ---- TICKET CONSTRUCTION ----
function optionQuality(legs, settings) {
  let score = 100; const reasons = [];
  for (const leg of legs) {
    const mid = leg.mid; const spreadPct = mid ? ((leg.ask - leg.bid) / mid) * 100 : 999;
    if (!Number.isFinite(leg.delta) || !Number.isFinite(leg.gamma) || !Number.isFinite(leg.theta) || !Number.isFinite(leg.vega)) { score -= 35; reasons.push(`Greeks incompletos en ${leg.symbol}.`); }
    if (!mid || mid <= 0 || leg.ask < leg.bid) { score -= 35; reasons.push(`Bid/ask inválido en ${leg.symbol}.`); }
    if (spreadPct > settings.maxBidAskPct) { score -= 20; reasons.push(`Bid/ask amplio ${round(spreadPct, 1)}% en ${leg.symbol}.`); }
    if ((leg.openInterest || 0) < settings.minOpenInterest) { score -= 10; reasons.push(`OI bajo en ${leg.symbol}.`); }
    if ((leg.volume || 0) < settings.minOptionVolume) { score -= 5; reasons.push(`Volumen bajo en ${leg.symbol}.`); }
  }
  return { score: clamp(score, 0, 100), reasons };
}

function makeLeg(action, option, qty = 1) {
  return { action, quantity: qty, symbol: option.symbol, expiration: option.expiration, strike: option.strike, type: option.type, bid: option.bid, ask: option.ask, mid: option.mid, delta: option.delta, gamma: option.gamma, theta: option.theta, vega: option.vega, iv: option.iv, openInterest: option.openInterest, volume: option.volume };
}

function netPremium(legs) {
  return legs.reduce((sum, l) => { const px = Number(l.mid || 0); return sum + (l.action === "SELL" ? px : -px) * l.quantity; }, 0);
}

function netGreeksProd(legs) {
  const sign = l => l.action === "SELL" ? -1 : 1;
  return { delta: round(legs.reduce((s, l) => s + sign(l) * Number(l.delta || 0) * l.quantity, 0), 4), gamma: round(legs.reduce((s, l) => s + sign(l) * Number(l.gamma || 0) * l.quantity, 0), 4), theta: round(legs.reduce((s, l) => s + sign(l) * Number(l.theta || 0) * l.quantity, 0), 4), vega: round(legs.reduce((s, l) => s + sign(l) * Number(l.vega || 0) * l.quantity, 0), 4) };
}

function estimatePop(strategy, legs) {
  const sp = legs.find(l => l.action === "SELL" && l.type === "PUT");
  const sc = legs.find(l => l.action === "SELL" && l.type === "CALL");
  if ((strategy === "BULL_PUT_CREDIT_SPREAD" || strategy === "CASH_SECURED_PUT") && sp?.delta != null) return round((1 - Math.abs(sp.delta)) * 100, 1);
  if (strategy === "BEAR_CALL_CREDIT_SPREAD" && sc?.delta != null) return round((1 - Math.abs(sc.delta)) * 100, 1);
  if (strategy.includes("IRON") && sp?.delta != null && sc?.delta != null) return round((1 - Math.abs(sp.delta) - Math.abs(sc.delta)) * 100, 1);
  return null;
}

// ---- SCORING ----
function institutionalScore({ optionsScore, volScore, techScore, tapeScore, wyckoffScore, macroScore }) {
  return Math.round(optionsScore * 0.25 + volScore * 0.20 + techScore * 0.20 + tapeScore * 0.15 + wyckoffScore * 0.10 + macroScore * 0.10);
}

function technicalScoreForBias(technicals, bias) {
  let score = 50;
  if (bias === "BULLISH") { if (technicals.trend === "BULL_TREND") score += 20; if (technicals.vwapBias === "ABOVE_VWAP") score += 10; if (technicals.momentum === "bullish") score += 10; if (technicals.structure === "HH_HL") score += 10; }
  if (bias === "BEARISH") { if (technicals.trend === "BEAR_TREND") score += 20; if (technicals.vwapBias === "BELOW_VWAP") score += 10; if (technicals.momentum === "bearish") score += 10; if (technicals.structure === "LH_LL") score += 10; }
  if (bias === "NEUTRAL") { if (technicals.trend === "RANGE") score += 20; if (technicals.rsi14 && technicals.rsi14 > 40 && technicals.rsi14 < 60) score += 10; }
  return clamp(score, 0, 100);
}

function volatilityRegimeScore({ avgIvValue, ivRank, ivPercentile, realizedVolValue, vix }) {
  let score = 50; const reasons = [];
  if (ivRank != null) { if (ivRank >= 50) { score += 25; reasons.push("IV Rank alto: favorece estrategias de crédito."); } else if (ivRank <= 20) { score -= 10; reasons.push("IV Rank bajo."); } else { score += 10; } }
  if (avgIvValue && realizedVolValue && avgIvValue > realizedVolValue * 1.05) { score += 10; reasons.push("IV > HV."); }
  if (vix && vix >= 12 && vix <= 25) score += 5; if (vix && vix > 30) score -= 15;
  return { score: clamp(score, 0, 100), reasons };
}

function classifyTicket(ticket, settings) {
  const blocked = [...(ticket.blockedReasons || [])];
  const maxTradeRisk = settings.accountSize * settings.maxRiskPct;
  const maxCollateral = settings.accountSize * settings.maxCollateralPct;
  if (!ticket.dataQuality.realData) blocked.push("Sin datos reales suficientes.");
  if (ticket.maxRisk == null || ticket.maxRisk <= 0) blocked.push("Riesgo máximo inválido.");
  if (ticket.maxRisk > maxTradeRisk) blocked.push(`Riesgo ${ticket.maxRisk} supera límite.`);
  if (ticket.collateral && ticket.collateral > maxCollateral) blocked.push(`Colateral supera límite.`);
  if ((ticket.optionsQuality?.score || 100) < 60) blocked.push("Calidad de opciones insuficiente.");
  if (ticket.strategyRisk === "UNDEFINED_RISK") blocked.push("Riesgo indefinido bloqueado.");
  if (blocked.length) return { ...ticket, classification: ticket.strategyRisk === "UNDEFINED_RISK" ? "EDUCATIONAL_ONLY" : "NO_TRADE", blockedReasons: blocked };
  if (ticket.score >= 78 && ticket.pop >= settings.minPopReady) return { ...ticket, classification: "ENTRAR_AHORA" };
  if (ticket.score >= 68 && ticket.pop >= settings.minPopCandidate) return { ...ticket, classification: "ESPERAR_CONFIRMACION" };
  if (ticket.score >= 58) return { ...ticket, classification: "WATCHLIST" };
  return { ...ticket, classification: "NO_TRADE", blockedReasons: ["Score insuficiente."] };
}

// ---- TICKET CREATOR ----
function createTicket({ symbol, strategy, bias, strategyRisk = "DEFINED_RISK", legs, spot, technicals, wyckoff, tape, volatility, settings, notes = [] }) {
  const premium = netPremium(legs);
  const credit = premium > 0 ? premium : 0; const debit = premium < 0 ? Math.abs(premium) : 0;
  const strikes = legs.map(l => l.strike); const width = Math.max(...strikes) - Math.min(...strikes);
  const isCredit = credit > 0;
  const maxProfit = isCredit ? credit * 100 : Math.max(0, (width - debit) * 100);
  const maxRisk = isCredit ? Math.max(0, (width - credit) * 100) : debit * 100;
  const pop = estimatePop(strategy, legs) ?? 50;
  const ev = (pop / 100) * (isCredit ? maxProfit * 0.5 : maxProfit * 0.6) - (1 - pop / 100) * (isCredit ? Math.min(maxRisk, credit * 200) : maxRisk * 0.5);
  const oq = optionQuality(legs, settings);
  const ts = technicalScoreForBias(technicals, bias);
  const score = institutionalScore({ optionsScore: oq.score, volScore: volatility.score, techScore: ts, tapeScore: tape.score || 0, wyckoffScore: wyckoff.score || 0, macroScore: 70 });

  // Compute breakeven
  let breakEven = null;
  if (strategy === "BULL_PUT_CREDIT_SPREAD") { const s = legs.find(l => l.action === "SELL" && l.type === "PUT"); breakEven = s ? s.strike - credit : null; }
  else if (strategy === "BEAR_CALL_CREDIT_SPREAD") { const s = legs.find(l => l.action === "SELL" && l.type === "CALL"); breakEven = s ? s.strike + credit : null; }
  else breakEven = "MULTI_LEG_RANGE";

  const ticket = {
    id: `${symbol}-${strategy}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    symbol, strategy, strategyRisk, bias, spot, expiration: legs[0]?.expiration, dte: legs[0]?.expiration ? dte(legs[0].expiration) : null,
    legs, entry: isCredit ? `Vender por crédito límite ≥ $${round(credit, 2)}` : `Comprar por débito límite ≤ $${round(debit, 2)}`,
    credit: round(credit, 2), debit: round(debit, 2), maxRisk: round(maxRisk, 2), maxProfit: round(maxProfit, 2), collateral: round(maxRisk, 2),
    breakEven: typeof breakEven === "number" ? round(breakEven, 2) : breakEven, pop: round(pop, 1), ev: round(ev, 2), greeks: netGreeksProd(legs),
    score, optionsQuality: oq, volatility, technicals, wyckoff, tape,
    takeProfit: isCredit ? `Tomar ganancia al 40%-60% del crédito recibido.` : "Tomar ganancia al 50%-70%.",
    stopLoss: isCredit ? `Cerrar si el spread vale 1.8x-2.0x el crédito recibido.` : "Cerrar si pierde 40%-50% del débito.",
    invalidation: bias === "BULLISH" ? `Invalida si pierde VWAP ${technicals.vwap} o soporte ${technicals.support}.` : bias === "BEARISH" ? `Invalida si rompe VWAP ${technicals.vwap} o resistencia ${technicals.resistance}.` : `Invalida si rompe rango ${technicals.support}-${technicals.resistance}.`,
    notes, dataQuality: { realData: true, hasGreeks: legs.every(l => Number.isFinite(l.delta) && Number.isFinite(l.gamma) && Number.isFinite(l.theta) && Number.isFinite(l.vega)), hasBidAsk: legs.every(l => Number.isFinite(l.bid) && Number.isFinite(l.ask)), source: "Tradier + optional Polygon" },
    warnings: [], blockedReasons: [], createdAt: new Date().toISOString()
  };
  return classifyTicket(ticket, settings);
}

// ---- FIND LEGS ----
function findLongBelow(shortOpt, puts, minWidth = 1, maxWidth = 20) {
  return puts.filter(p => p.strike < shortOpt.strike && shortOpt.strike - p.strike >= minWidth && shortOpt.strike - p.strike <= maxWidth).sort((a, b) => Math.abs(shortOpt.strike - a.strike - 5) - Math.abs(shortOpt.strike - b.strike - 5))[0];
}
function findLongAbove(shortOpt, calls, minWidth = 1, maxWidth = 20) {
  return calls.filter(c => c.strike > shortOpt.strike && c.strike - shortOpt.strike >= minWidth && c.strike - shortOpt.strike <= maxWidth).sort((a, b) => Math.abs(a.strike - shortOpt.strike - 5) - Math.abs(b.strike - shortOpt.strike - 5))[0];
}
function byAbsDeltaTarget(target) {
  return (a, b) => Math.abs(Math.abs(a.delta) - target) - Math.abs(Math.abs(b.delta) - target);
}

// ---- STRATEGY BUILDERS ----
function buildCreditVerticals(ctx) {
  const { symbol, chain, spot, technicals, wyckoff, tape, volatility, settings } = ctx;
  const puts = chain.filter(o => o.type === "PUT" && o.strike < spot && o.mid > 0.03).sort(byAbsDeltaTarget(0.22));
  const calls = chain.filter(o => o.type === "CALL" && o.strike > spot && o.mid > 0.03).sort(byAbsDeltaTarget(0.22));
  const tickets = [];
  const bullishOk = technicals.trend !== "BEAR_TREND" && wyckoff.bias !== "BEARISH";
  const bearishOk = technicals.trend !== "BULL_TREND" && wyckoff.bias !== "BULLISH";
  if (bullishOk) {
    for (const shortPut of puts.filter(p => Math.abs(p.delta) >= settings.creditDeltaMin && Math.abs(p.delta) <= settings.creditDeltaMax).slice(0, 5)) {
      const longPut = findLongBelow(shortPut, puts);
      if (!longPut) continue;
      tickets.push(createTicket({ symbol, strategy: "BULL_PUT_CREDIT_SPREAD", bias: "BULLISH", legs: [makeLeg("SELL", shortPut), makeLeg("BUY", longPut)], spot, technicals, wyckoff, tape, volatility, settings, notes: ["Prioridad #1: credit spread con riesgo definido."] }));
    }
  }
  if (bearishOk) {
    for (const shortCall of calls.filter(c => Math.abs(c.delta) >= settings.creditDeltaMin && Math.abs(c.delta) <= settings.creditDeltaMax).slice(0, 5)) {
      const longCall = findLongAbove(shortCall, calls);
      if (!longCall) continue;
      tickets.push(createTicket({ symbol, strategy: "BEAR_CALL_CREDIT_SPREAD", bias: "BEARISH", legs: [makeLeg("SELL", shortCall), makeLeg("BUY", longCall)], spot, technicals, wyckoff, tape, volatility, settings, notes: ["Prioridad #2: credit spread bajista."] }));
    }
  }
  return tickets;
}

function buildIronCondors(ctx) {
  // Builds Iron Condors from bull put + bear call spreads
  const { symbol, chain, spot, technicals, wyckoff, tape, volatility, settings } = ctx;
  if (technicals.trend !== "RANGE" && technicals.momentum !== "neutral") return [];
  const puts = chain.filter(o => o.type === "PUT" && o.strike < spot).sort(byAbsDeltaTarget(0.16));
  const calls = chain.filter(o => o.type === "CALL" && o.strike > spot).sort(byAbsDeltaTarget(0.16));
  const tickets = [];
  for (const sp of puts.slice(0, 3)) {
    const lp = findLongBelow(sp, puts); if (!lp) continue;
    for (const sc of calls.slice(0, 3)) {
      const lc = findLongAbove(sc, calls); if (!lc) continue;
      tickets.push(createTicket({ symbol, strategy: "IRON_CONDOR", bias: "NEUTRAL", legs: [makeLeg("BUY", lp), makeLeg("SELL", sp), makeLeg("SELL", sc), makeLeg("BUY", lc)], spot, technicals, wyckoff, tape, volatility, settings, notes: ["Iron Condor: bull put + bear call."] }));
    }
  }
  return tickets;
}

function buildDebitSpreads(ctx) {
  const { symbol, chain, spot, technicals, wyckoff, tape, volatility, settings } = ctx;
  const tickets = [];
  if (technicals.trend === "BULL_TREND" || wyckoff.bias === "BULLISH") {
    const calls = chain.filter(o => o.type === "CALL" && o.strike >= spot).sort(byAbsDeltaTarget(0.55));
    const lc = calls[0], sc = calls.find(c => lc && c.strike > lc.strike);
    if (lc && sc) tickets.push(createTicket({ symbol, strategy: "CALL_DEBIT_SPREAD", bias: "BULLISH", legs: [makeLeg("BUY", lc), makeLeg("SELL", sc)], spot, technicals, wyckoff, tape, volatility, settings, notes: ["Debit spread alcista."] }));
  }
  if (technicals.trend === "BEAR_TREND" || wyckoff.bias === "BEARISH") {
    const puts = chain.filter(o => o.type === "PUT" && o.strike <= spot).sort(byAbsDeltaTarget(0.55));
    const lp = puts[0], sp = puts.find(p => lp && p.strike < lp.strike);
    if (lp && sp) tickets.push(createTicket({ symbol, strategy: "PUT_DEBIT_SPREAD", bias: "BEARISH", legs: [makeLeg("BUY", lp), makeLeg("SELL", sp)], spot, technicals, wyckoff, tape, volatility, settings, notes: ["Debit spread bajista."] }));
  }
  return tickets;
}

function buildCashSecuredPutAndWheel(ctx) {
  const { symbol, chain, spot, technicals, wyckoff, tape, volatility, settings } = ctx;
  if (technicals.trend === "BEAR_TREND" || wyckoff.bias === "BEARISH") return [];
  const puts = chain.filter(o => o.type === "PUT" && o.strike < spot).sort(byAbsDeltaTarget(0.25));
  const shortPut = puts[0];
  if (!shortPut) return [];
  const leg = makeLeg("SELL", shortPut);
  const ticket = createTicket({ symbol, strategy: "CASH_SECURED_PUT", strategyRisk: "CASH_SECURED_ASSIGNMENT_RISK", bias: "BULLISH", legs: [leg], spot, technicals, wyckoff, tape, volatility, settings, notes: ["CSP: solo si aceptas assignment."] });
  ticket.maxRisk = round(shortPut.strike * 100 - (shortPut.mid || 0) * 100, 2);
  ticket.collateral = round(shortPut.strike * 100, 2);
  return [classifyTicket(ticket, settings)];
}

function buildEducationalBlockedStrategies(symbol, spot) {
  return ["SHORT_STRADDLE", "SHORT_STRANGLE", "NAKED_CALL", "NAKED_PUT", "RATIO_SPREAD_UNPROTECTED"].map(strategy => ({
    id: `${symbol}-${strategy}-EDU`, symbol, strategy, classification: "EDUCATIONAL_ONLY", strategyRisk: "UNDEFINED_RISK", spot, blockedReasons: ["Riesgo indefinido bloqueado."], notes: ["Solo educación."]
  }));
}

// ---- MAIN SCAN FUNCTION ----
async function scanSymbol(symbol, settings = DEFAULT_SETTINGS) {
  const warnings = [];
  const quote = await getQuote(symbol);
  const bars = await getTimesales(symbol);
  if (!bars.length) throw new Error(`${symbol}: sin OHLCV intradía.`);
  const technicals = computeTechnicals(symbol, quote, bars);
  const wyckoff = detectWyckoff(bars, technicals);
  const tape = await getPolygonTape(symbol);
  const expirations = chooseExpirations(await getExpirations(symbol));
  if (!expirations.length) throw new Error(`${symbol}: sin expiraciones.`);
  const primaryExp = expirations.find(x => x.dte >= settings.preferDteMin && x.dte <= settings.preferDteMax) || expirations[0];
  const chain = await getOptionChain(symbol, primaryExp.exp);
  if (!chain.length) throw new Error(`${symbol}: option chain vacía.`);
  if (!chain.some(o => Number.isFinite(o.delta) && Number.isFinite(o.gamma) && Number.isFinite(o.theta) && Number.isFinite(o.vega)))
    throw new Error(`${symbol}: sin Greeks reales.`);
  const avgIvValue = avgIv(chain);
  const ivHistory = await updateIvHistory(symbol, avgIvValue);
  let vix = null;
  try { vix = (await getQuote("VIX")).price; } catch { warnings.push("VIX no disponible."); }
  const volatility = volatilityRegimeScore({ avgIvValue, ivRank: ivHistory.ivRank, ivPercentile: ivHistory.ivPercentile, realizedVolValue: technicals.realizedVol, vix });
  volatility.avgIv = round(avgIvValue, 4); volatility.ivRank = ivHistory.ivRank; volatility.ivPercentile = ivHistory.ivPercentile; volatility.realizedVol = technicals.realizedVol; volatility.vix = vix;
  const ctx = { symbol, spot: quote.price, chain, technicals, wyckoff, tape, volatility, settings };
  const tickets = [...buildCreditVerticals(ctx), ...buildIronCondors(ctx), ...buildDebitSpreads(ctx), ...buildCashSecuredPutAndWheel(ctx), ...buildEducationalBlockedStrategies(symbol, quote.price)];
  const priority = { BULL_PUT_CREDIT_SPREAD: 100, BEAR_CALL_CREDIT_SPREAD: 98, IRON_CONDOR: 94, IRON_BUTTERFLY: 92, CASH_SECURED_PUT: 86, CALL_DEBIT_SPREAD: 70, PUT_DEBIT_SPREAD: 68 };
  tickets.sort((a, b) => {
    const rank = { ENTRAR_AHORA: 4, ESPERAR_CONFIRMACION: 3, WATCHLIST: 2, NO_TRADE: 1, EDUCATIONAL_ONLY: 0 };
    return (rank[b.classification] || 0) - (rank[a.classification] || 0) || (priority[b.strategy] || 0) - (priority[a.strategy] || 0) || (b.score || 0) - (a.score || 0) || (b.pop || 0) - (a.pop || 0);
  });
  return { symbol, quote, technicals, wyckoff, tape, volatility, warnings, bestTicket: tickets.find(t => ["ENTRAR_AHORA", "ESPERAR_CONFIRMACION", "WATCHLIST"].includes(t.classification)) || null, tickets: tickets.slice(0, settings.maxSignalsPerScan), scannedAt: new Date().toISOString() };
}

export async function runInstitutionalScan({ symbols = DEFAULT_UNIVERSE, settings = {} } = {}) {
  const finalSettings = { ...DEFAULT_SETTINGS, ...settings };
  const results = []; const errors = [];
  for (const symbol of symbols) {
    try { results.push(await scanSymbol(symbol.trim().toUpperCase(), finalSettings)); }
    catch (e) { errors.push({ symbol, classification: "NO_TRADE", reason: e.message, scannedAt: new Date().toISOString() }); }
  }
  const tickets = results.flatMap(r => r.tickets || []);
  const ready = tickets.filter(t => t.classification === "ENTRAR_AHORA");
  const confirm = tickets.filter(t => t.classification === "ESPERAR_CONFIRMACION");
  const watch = tickets.filter(t => t.classification === "WATCHLIST");
  return {
    status: ready.length ? "ENTRAR_AHORA" : confirm.length ? "ESPERAR_CONFIRMACION" : watch.length ? "WATCHLIST" : "NO_TRADE",
    summary: { scannedSymbols: symbols.length, ready: ready.length, confirm: confirm.length, watch: watch.length, noTradeErrors: errors.length },
    geminiInput: { instruction: "Audita estos tickets. No inventes datos. Devuelve JSON.", tickets: [...ready, ...confirm, ...watch].slice(0, 8) },
    results, errors, generatedAt: new Date().toISOString()
  };
}
```

#### `server/strategy-permissions.mjs`

```js
export const REAL_SIGNAL_ALLOWED = new Set([
  "BULL_PUT_CREDIT_SPREAD", "BEAR_CALL_CREDIT_SPREAD", "IRON_CONDOR", "IRON_BUTTERFLY",
  "BROKEN_WING_CONDOR", "BROKEN_WING_BUTTERFLY", "CASH_SECURED_PUT", "COVERED_CALL",
  "WHEEL", "COLLAR", "PROTECTIVE_PUT", "BULL_CALL_DEBIT_SPREAD", "BEAR_PUT_DEBIT_SPREAD"
]);

export const WATCHLIST_ONLY = new Set([
  "LONG_CALL", "LONG_PUT", "LONG_STRADDLE", "LONG_STRANGLE",
  "REVERSE_IRON_CONDOR", "REVERSE_IRON_BUTTERFLY", "PMCC", "CALENDAR_SPREAD", "DIAGONAL_SPREAD"
]);

export const BLOCKED_OR_PAPER_ONLY = new Set([
  "SHORT_CALL", "SHORT_PUT", "SHORT_STRADDLE", "SHORT_STRANGLE",
  "NAKED_CALL", "NAKED_PUT", "COVERED_PUT", "RATIO_SPREAD_UNPROTECTED"
]);

export function enforceStrategyPermission(ticket) {
  const strategy = ticket?.strategy;
  if (!strategy) return { ...ticket, classification: "NO_TRADE", blockedReasons: [...(ticket?.blockedReasons || []), "Estrategia no identificada."] };
  if (REAL_SIGNAL_ALLOWED.has(strategy)) return ticket;
  if (WATCHLIST_ONLY.has(strategy)) return { ...ticket, classification: ticket.classification === "ENTRAR_AHORA" ? "ESPERAR_CONFIRMACION" : ticket.classification || "WATCHLIST", warnings: [...(ticket.warnings || []), "Estrategia permitida solo con confirmación adicional."] };
  if (BLOCKED_OR_PAPER_ONLY.has(strategy)) return { ...ticket, classification: "EDUCATIONAL_ONLY", realSignalAllowed: false, blockedReasons: [...(ticket.blockedReasons || []), "Estrategia bloqueada para señales reales."] };
  return { ...ticket, classification: "WATCHLIST", warnings: [...(ticket.warnings || []), "Estrategia no clasificada."] };
}
```

#### `server/index.mjs` — API Entry

```js
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInstitutionalScan } from "./institutional-engine.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "VALIDO 1M Institutional Engine", time: new Date().toISOString() });
});

app.post("/api/guardian/scan", async (req, res) => {
  try {
    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : undefined;
    const settings = req.body?.settings || {};
    const data = await runInstitutionalScan({ symbols, settings });
    res.json(data);
  } catch (error) {
    res.status(500).json({ status: "NO_TRADE", error: error.message, time: new Date().toISOString() });
  }
});

app.get("/api/guardian/scan", async (req, res) => {
  try {
    const symbols = typeof req.query.symbols === "string" ? req.query.symbols.split(",").map(s => s.trim()).filter(Boolean) : undefined;
    const data = await runInstitutionalScan({ symbols });
    res.json(data);
  } catch (error) {
    res.status(500).json({ status: "NO_TRADE", error: error.message, time: new Date().toISOString() });
  }
});

const publicDir = path.resolve(__dirname, "../dist");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () => console.log(`VALIDO 1M server running on port ${PORT}`));
```

### Frontend Config

#### `src/config/marketUniverse.ts`

```ts
export const CORE_UNIVERSE = [
  "SPY", "QQQ", "IWM", "DIA",
  "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA",
  "AMD", "AVGO", "NFLX", "COST", "MCD", "JPM", "BAC", "XOM", "CVX", "LLY", "UNH", "SOFI",
  "SMH", "XLK", "XLF", "XLE", "TLT"
] as const;

export const INDEX_CONTEXT = [
  "SPX", "XSP", "NDX", "RUT", "VIX", "VIX9D", "VXN", "RVX", "VXST"
] as const;

export const WATCHLIST_UNIVERSE = [
  "MMM","ABT","ABBV","ACN","ADBE","ALL","AMGN","AXP","AIG","T",
  "BAC","BK","BRK.B","BIIB","BLK","BA","BKNG","BMY","COF","CAT",
  "SCHW","CHTR","CSCO","C","KO","CL","CMCSA","COP","CVS","DHR",
  "DOW","DD","DUK","EMR","EXC","FDX","F","GE","GD","GM",
  "GILD","GS","HD","HON","IBM","INTC","JNJ","KMI","KHC","LOW",
  "MA","MDT","MRK","MET","MDLZ","MS","NEE","NKE","OXY","ORCL",
  "PYPL","PEP","PFE","PM","PG","QCOM","RTX","CRM","SLB","SO",
  "SBUX","TMUS","TGT","TXN","TMO","UNP","UPS","USB","VZ","V",
  "WMT","WBA","DIS","WFC"
] as const;

export const SECTOR_ETFS = [
  "XLK","XLF","XLE","XLV","XLY","XLP","XLI","XLC","XLU","XLB","XLRE",
  "SMH","TLT","GLD","SLV","USO"
] as const;

export type MarketUniverseMode = "CORE" | "WATCHLIST" | "SECTOR" | "INDEX_CONTEXT" | "ALL";

export function getUniverse(mode: MarketUniverseMode = "CORE"): string[] {
  if (mode === "CORE") return [...CORE_UNIVERSE];
  if (mode === "WATCHLIST") return [...WATCHLIST_UNIVERSE];
  if (mode === "SECTOR") return [...SECTOR_ETFS];
  if (mode === "INDEX_CONTEXT") return [...INDEX_CONTEXT];
  return Array.from(new Set([...CORE_UNIVERSE, ...WATCHLIST_UNIVERSE, ...SECTOR_ETFS, ...INDEX_CONTEXT]));
}
```

#### `src/config/strategyCatalog.ts`

```ts
export type StrategyCategory = "CREDIT" | "DEBIT" | "INCOME" | "PROTECTION" | "VOLATILITY"
  | "DIRECTIONAL" | "CALENDAR" | "DIAGONAL" | "SYNTHETIC" | "EDUCATIONAL";

export type StrategyPermission = "REAL_SIGNAL" | "WATCHLIST_ONLY" | "PAPER_ONLY" | "EDUCATIONAL_ONLY" | "BLOCKED_UNDEFINED_RISK";

export type StrategyBias = "BULLISH" | "BEARISH" | "NEUTRAL" | "VOLATILITY_EXPANSION" | "VOLATILITY_CRUSH" | "PROTECTION";

export type StrategyDefinition = {
  id: string; label: string; aliases: string[];
  category: StrategyCategory; bias: StrategyBias; priority: number;
  permission: StrategyPermission;
  riskType: "DEFINED_RISK" | "CASH_SECURED" | "COVERED" | "ASSIGNMENT_RISK" | "UNDEFINED_RISK";
  preferredIvRegime: "LOW" | "NORMAL" | "HIGH" | "ANY";
  preferredMarketRegime: "TRENDING" | "RANGE" | "BREAKOUT" | "REVERSAL" | "ANY";
  realSignalAllowed: boolean; notes: string;
};

export const STRATEGY_CATALOG: StrategyDefinition[] = [
  { id: "BULL_PUT_CREDIT_SPREAD", label: "Bull Put Credit Spread", priority: 100, permission: "REAL_SIGNAL", category: "CREDIT", bias: "BULLISH", riskType: "DEFINED_RISK", preferredIvRegime: "HIGH", preferredMarketRegime: "TRENDING", realSignalAllowed: true, notes: "Estrategia núcleo." },
  { id: "BEAR_CALL_CREDIT_SPREAD", label: "Bear Call Credit Spread", priority: 98, permission: "REAL_SIGNAL", category: "CREDIT", bias: "BEARISH", riskType: "DEFINED_RISK", preferredIvRegime: "HIGH", preferredMarketRegime: "TRENDING", realSignalAllowed: true, notes: "Estrategia núcleo bajista." },
  { id: "IRON_CONDOR", label: "Iron Condor", priority: 94, permission: "REAL_SIGNAL", category: "CREDIT", bias: "NEUTRAL", riskType: "DEFINED_RISK", preferredIvRegime: "HIGH", preferredMarketRegime: "RANGE", realSignalAllowed: true, notes: "Bull put + bear call." },
  { id: "IRON_BUTTERFLY", label: "Iron Butterfly", priority: 92, permission: "REAL_SIGNAL", category: "CREDIT", bias: "NEUTRAL", riskType: "DEFINED_RISK", preferredIvRegime: "HIGH", preferredMarketRegime: "RANGE", realSignalAllowed: true, notes: "Crédito alto, gamma risk." },
  { id: "BROKEN_WING_CONDOR", label: "Broken Wing Condor", priority: 90, permission: "REAL_SIGNAL", category: "CREDIT", bias: "NEUTRAL", riskType: "DEFINED_RISK", preferredIvRegime: "HIGH", preferredMarketRegime: "RANGE", realSignalAllowed: true, notes: "Asimétrico." },
  { id: "BROKEN_WING_BUTTERFLY", label: "Broken Wing Butterfly", priority: 88, permission: "REAL_SIGNAL", aliases: ["BWB"], ... },
  { id: "CASH_SECURED_PUT", label: "Cash Secured Put", priority: 86, permission: "REAL_SIGNAL", aliases: ["CSP"], ... },
  { id: "COVERED_CALL", label: "Covered Call", priority: 84, permission: "REAL_SIGNAL", ... },
  { id: "WHEEL", label: "Wheel", priority: 82, permission: "REAL_SIGNAL", ... },
  { id: "COLLAR", label: "Collar", priority: 78, permission: "REAL_SIGNAL", ... },
  { id: "PROTECTIVE_PUT", label: "Protective Put", priority: 76, permission: "REAL_SIGNAL", ... },
  { id: "BULL_CALL_DEBIT_SPREAD", label: "Bull Call Debit Spread", priority: 72, permission: "REAL_SIGNAL", ... },
  { id: "BEAR_PUT_DEBIT_SPREAD", label: "Bear Put Debit Spread", priority: 70, permission: "REAL_SIGNAL", ... },
  { id: "LONG_CALL", label: "Long Call", priority: 55, permission: "WATCHLIST_ONLY", realSignalAllowed: false, ... },
  { id: "LONG_PUT", label: "Long Put", priority: 54, permission: "WATCHLIST_ONLY", realSignalAllowed: false, ... },
  { id: "LONG_STRADDLE", label: "Long Straddle", priority: 50, permission: "WATCHLIST_ONLY", realSignalAllowed: false, ... },
  { id: "LONG_STRANGLE", label: "Long Strangle", priority: 48, permission: "WATCHLIST_ONLY", realSignalAllowed: false, ... },
  { id: "REVERSE_IRON_CONDOR", label: "Reverse Iron Condor", priority: 46, permission: "WATCHLIST_ONLY", realSignalAllowed: false, ... },
  { id: "SHORT_CALL", label: "Naked Short Call", priority: 5, permission: "BLOCKED_UNDEFINED_RISK", realSignalAllowed: false, riskType: "UNDEFINED_RISK", ... },
  { id: "SHORT_PUT", label: "Naked Short Put", priority: 5, permission: "BLOCKED_UNDEFINED_RISK", realSignalAllowed: false, riskType: "UNDEFINED_RISK", ... },
  { id: "SHORT_STRADDLE", label: "Short Straddle", priority: 4, permission: "PAPER_ONLY", realSignalAllowed: false, riskType: "UNDEFINED_RISK", ... },
  { id: "SHORT_STRANGLE", label: "Short Strangle", priority: 4, permission: "PAPER_ONLY", realSignalAllowed: false, riskType: "UNDEFINED_RISK", ... },
];

export function getRealSignalStrategies() { return STRATEGY_CATALOG.filter(s => s.realSignalAllowed); }
export function getBlockedStrategies() { return STRATEGY_CATALOG.filter(s => !s.realSignalAllowed); }
export function getStrategyById(id: string) { return STRATEGY_CATALOG.find(s => s.id === id); }
```

### Frontend Gemini Guardian Client

#### `src/lib/guardian/geminiGuardian.ts`

```ts
export type GeminiAuditInput = { instruction: string; tickets: any[] };

export type GeminiAuditResult = {
  approve: boolean;
  finalDecision: "ENTRAR_AHORA" | "ESPERAR_CONFIRMACION" | "WATCHLIST" | "NO_TRADE";
  downgradeReason?: string;
  riskNotes: string[];
  simpleExplanation: string;
};

export async function auditTicketsWithGemini(input: GeminiAuditInput): Promise<GeminiAuditResult[]> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return input.tickets.map(t => ({
      approve: false,
      finalDecision: "WATCHLIST" as const,
      downgradeReason: "Gemini no configurado.",
      riskNotes: ["Falta VITE_GEMINI_API_KEY."],
      simpleExplanation: `El motor encontró ${t.strategy} en ${t.symbol}, pero Gemini Guardian no está configurado.`
    }));
  }

  const prompt = `Eres Gemini Guardian de VALIDO 1M. No inventes datos. Audita tickets. Devuelve JSON.\nINPUT: ${JSON.stringify(input)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                approve: { type: "BOOLEAN" },
                finalDecision: { type: "STRING", enum: ["ENTRAR_AHORA", "ESPERAR_CONFIRMACION", "WATCHLIST", "NO_TRADE"] },
                downgradeReason: { type: "STRING" },
                riskNotes: { type: "ARRAY", items: { type: "STRING" } },
                simpleExplanation: { type: "STRING" }
              },
              required: ["approve", "finalDecision", "riskNotes", "simpleExplanation"]
            }
          }
        }
      })
    }
  );

  if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  try { return JSON.parse(text); } catch { throw new Error("Gemini JSON inválido."); }
}
```

### Environment Variables

#### `.env.example`

```bash
# SERVER
PORT=10000
HOST=0.0.0.0
NODE_ENV=production

# GEMINI GUARDIAN (OBLIGATORIO) — Obtener en https://aistudio.google.com/apikey
VITE_GEMINI_API_KEY=

# TRADIER (OBLIGATORIO) — Obtener en https://brokerage.tradier.com/settings/api
TRADIER_TOKEN=
TRADIER_BASE_URL=https://api.tradier.com/v1

# POLYGON (OPCIONAL) — Obtener en https://polygon.io
POLYGON_API_KEY=

# SEGURIDAD
SESSION_SECRET=pon_una_clave_segura
APP_ACCESS_KEY=pon_una_clave_de_acceso
```

---

## Strategy Catalog

| Priority | Strategy | Type | Category | Permission |
|----------|----------|------|----------|------------|
| 100 | Bull Put Credit Spread | Credit | CREDIT | REAL_SIGNAL |
| 98 | Bear Call Credit Spread | Credit | CREDIT | REAL_SIGNAL |
| 94 | Iron Condor | Credit | CREDIT | REAL_SIGNAL |
| 92 | Iron Butterfly | Credit | CREDIT | REAL_SIGNAL |
| 90 | Broken Wing Condor | Credit | CREDIT | REAL_SIGNAL |
| 88 | Broken Wing Butterfly | Credit | CREDIT | REAL_SIGNAL |
| 86 | Cash Secured Put | Cash Secured | INCOME | REAL_SIGNAL |
| 84 | Covered Call | Covered | INCOME | REAL_SIGNAL |
| 82 | Wheel | Assignment | INCOME | REAL_SIGNAL |
| 78 | Collar | Defined Risk | PROTECTION | REAL_SIGNAL |
| 76 | Protective Put | Defined Risk | PROTECTION | REAL_SIGNAL |
| 72 | Bull Call Debit Spread | Debit | DEBIT | REAL_SIGNAL |
| 70 | Bear Put Debit Spread | Debit | DEBIT | REAL_SIGNAL |
| 55 | Long Call | Debit | DIRECTIONAL | WATCHLIST_ONLY |
| 54 | Long Put | Debit | DIRECTIONAL | WATCHLIST_ONLY |
| 50 | Long Straddle | Debit | VOLATILITY | WATCHLIST_ONLY |
| 48 | Long Strangle | Debit | VOLATILITY | WATCHLIST_ONLY |
| 46 | Reverse Iron Condor | Debit | VOLATILITY | WATCHLIST_ONLY |
| 5 | Naked Short Call | Credit | CREDIT | BLOCKED |
| 5 | Naked Short Put | Credit | CREDIT | BLOCKED |
| 4 | Short Straddle | Credit | CREDIT | PAPER_ONLY |
| 4 | Short Strangle | Credit | CREDIT | PAPER_ONLY |

---

## Market Universe

| Mode | Count | Examples |
|------|-------|---------|
| CORE | 29 | SPY, QQQ, AAPL, MSFT, NVDA, TSLA, SOFI... |
| WATCHLIST | 92 | JPM, BAC, JNJ, PG, DIS, WMT, V... |
| INDEX_CONTEXT | 9 | SPX, NDX, VIX, VXN, RVX... |
| SECTOR | 16 | XLK, XLF, XLE, XLV, SMH, TLT, GLD... |

---

## Scoring System

```
Score = OptionsQuality × 0.25 + Volatility × 0.20 + Technical × 0.20 + TapeReading × 0.15 + Wyckoff × 0.10 + Macro × 0.10
```

### Classification Thresholds

| Score | POP | Classification |
|-------|-----|----------------|
| >= 78 | >= 70% | ENTRAR_AHORA |
| >= 68 | >= 65% | ESPERAR_CONFIRMACION |
| >= 58 | — | WATCHLIST |
| < 58 | — | NO_TRADE |

### FAIL-CLOSED Conditions

Any of these block the signal:
- No real Greeks (delta, gamma, theta, vega)
- No bid/ask or invalid bid/ask
- maxRisk > accountSize × maxRiskPct
- Collateral > accountSize × maxCollateralPct
- Options quality score < 60
- Strategy is UNDEFINED_RISK

---

## Key Data Flow

```
User clicks "Scan" → fetch POST /api/guardian/scan
  → runInstitutionalScan()
    → For each symbol in CORE:
      → getQuote(symbol)          [Tradier API]
      → getTimesales(symbol)      [Tradier API - 1min OHLCV]
      → computeTechnicals()       [EMA 9/21/50/200, RSI, MACD, VWAP]
      → detectWyckoff()           [Spring, Upthrust, SOS, SOW]
      → getPolygonTape(symbol)    [Polygon.io - real trades/quotes]
      → getExpirations(symbol)    [Tradier API]
      → getOptionChain(symbol)    [Tradier API - with greeks=true]
      → updateIvHistory()         [IV Rank persistence]
      → volatilityRegimeScore()   [IV vs HV, VIX, IV Rank]
      
      → buildCreditVerticals()    #1 priority
      → buildIronCondors()        #2 priority
      → buildDebitSpreads()       #3 priority
      → buildCashSecuredPut()     #4 priority
      
      → createTicket() per candidate
      → classifyTicket()          [ENTRAR_AHORA / ESPERAR_CONFIRMACION / WATCHLIST / NO_TRADE]
      → sort by priority + score + POP
    
    → Return scan results

Frontend:
  → auditTicketsWithGemini()     [Gemini 2.5 Flash API]
  → Render signals in GeminiBriefCard + SignalCard components
```

---

## Deployment (Render)

```yaml
# render.yaml
services:
  - type: web
    name: valido-1m
    runtime: node
    plan: free
    buildCommand: npm install --include=dev && npm run build
    startCommand: npm start
    healthCheckPath: /api/health
    autoDeploy: true
```

### Required Environment Variables on Render

| Variable | Source | Required |
|----------|--------|----------|
| `TRADIER_TOKEN` | https://brokerage.tradier.com/settings/api | Yes |
| `VITE_GEMINI_API_KEY` | https://aistudio.google.com/apikey | Yes |
| `POLYGON_API_KEY` | https://polygon.io | No (tape degrades) |
| `SESSION_SECRET` | Generate random | For auth |
| `APP_ACCESS_KEY` | Choose a password | For private access |

---

## Commits (Latest)

```
51df23e  market universe + strategy catalog with permissions
1da7a91  .env.example with API key instructions
f4c9304  institutional engine (Tradier, Wyckoff, Polygon, scoring)
ef3cf3e  strategy-suite.js with buildCreditVerticals
c747f2e  white theme on all components
ab5957b  notification buttons at bottom
a3f3643  ROOT CAUSE FIX: removed dark theme from theme.css + AppPro
b87a9f2  white theme + autonomous worker + pipeline
```

---

_End of Project Report_