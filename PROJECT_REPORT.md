# VALIDO 1M — Complete Project Report v4.0

> **Generated**: 2026-06-01 | **GitHub**: https://github.com/avali2/2M | **Live**: https://valido-1m.onrender.com
> **Architecture**: React 19 + Vite 7 + TypeScript + Tailwind CSS v4 + Express 5 + Node 22
> **AI**: Google Gemini 2.5 Flash Lite | **Data**: Tradier API, Polygon.io, Yahoo Finance, Alpha Vantage

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Folder Structure](#folder-structure)
3. [Architecture & Data Flow](#architecture--data-flow)
4. [Server Engine Modules](#server-engine-modules)
5. [Server Infrastructure](#server-infrastructure)
6. [Scheduler & Autonomous Worker](#scheduler--autonomous-worker)
7. [Strategy Catalog](#strategy-catalog)
8. [Market Universe](#market-universe)
9. [Scoring System](#scoring-system)
10. [Gemini Guardian](#gemini-guardian)
11. [API Endpoints](#api-endpoints)
12. [Frontend Components](#frontend-components)
13. [Notification System](#notification-system)
14. [Database & Historical Data](#database--historical-data)
15. [Environment Variables](#environment-variables)
16. [Deployment](#deployment)
17. [Commits History](#commits-history)

---

## Project Overview

**VALIDO 1M** is a professional options trading signal platform. It scans options chains in real-time, builds institutional-grade credit spread signals, and uses Google Gemini 2.5 Flash as a Guardian auditor to validate every ticket before approval.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4, Recharts, Motion |
| Backend | Express 5, Node 22, ES Modules |
| Data | Tradier API (quotes, chains, timesales, greeks), Polygon.io (tape), Yahoo Finance (history), Alpha Vantage (earnings) |
| AI | Google Gemini 2.5 Flash Lite (via `generateContent` API) |
| Storage | PostgreSQL (schema.sql), SQLite/local fallback, `data/iv-history.json` |
| Push | Web Push API + Service Worker + VAPID keys |
| Scheduler | Built-in `setInterval` — every 3 minutes during market hours |
| Deployment | Render (free tier) |

### Core Principles

1. **FAIL-CLOSED**: No signal without real Greeks, bid/ask, OI, volume
2. **Credit Spread Priority**: Bull Put Credit Spread = #1, Bear Call Credit Spread = #2
3. **Gemini as Auditor**: AI reviews tickets but never invents prices, Greeks, or POP
4. **Defined Risk Only**: Naked options and undefined risk strategies are BLOCKED or EDUCATIONAL_ONLY
5. **Market Session Awareness**: Scans only during market hours, with session-specific rules (pre, open-risky, optimal, midday, late, closing, post)
6. **White Theme**: Professional light UI, mobile-first responsive
7. **Autonomous Background Scanning**: Every 3 minutes during market hours
8. **Rate-Limited Push Notifications**: 5/hour, 12/day per device
9. **Position Monitoring**: Gemini advises on open positions every 5-10 minutes
10. **Historical Backtesting**: PostgreSQL tables for price history, IV history, earnings, and closed signals

---

## Folder Structure

```
2M/
├── .env.example                    # Template with API key instructions
├── institutional-os.html           # Vite entry HTML
├── package.json                    # Dependencies + scripts
├── render.yaml                     # Render deployment config
├── vite.config.js                  # Vite + React + Tailwind v4
├── tailwind.config.js              # Sigma color palette (light theme)
├── PROJECT_REPORT.md               # This file
│
├── data/                           # Runtime data storage
│   └── iv-history.json             # IV Rank fallback file
│
├── public/
│   ├── sw.js                       # Service Worker for push
│   ├── manifest.webmanifest
│   └── valido-mark.svg
│
├── scripts/
│   ├── downloadHistoricalData.js   # Yahoo Finance → PostgreSQL
│   ├── updateEarnings.js           # Alpha Vantage → PostgreSQL
│   ├── backtestGuardian.js
│   └── guardianYahooScan.js
│
├── server/                         # Express backend
│   ├── index.js                    # MAIN entry point (npm start)
│   ├── index.mjs                   # Alternative entry (institutional engine)
│   ├── institutional-engine.mjs    # runInstitutionalScan() orchestrator
│   ├── geminiAssistant.js          # GET /api/gemini/daily-summary
│   ├── strategy-suite.js           # buildCreditVerticals() + catalog
│   ├── strategy-permissions.mjs    # enforceStrategyPermission()
│   ├── config.js / explainers.js
│   ├── push.js / pushRoutes.js / pushStore.js
│   │
│   ├── engine/                     # Modular scanner (12 files)
│   │   ├── math.js                 # round(), clamp(), mean(), std()
│   │   ├── technicals.js           # ema/rsi/macd/vwap/computeTechnicals/deriveTechnicals
│   │   ├── wyckoff.js              # detectWyckoff()
│   │   ├── tape-polygon.js         # getPolygonTape(), evaluateTape()
│   │   ├── tradier-api.js          # getQuote/Chain/Expirations/Timesales
│   │   ├── ticket-creator.js       # createTicket/classifyTicket/makeLeg/netGreeks
│   │   ├── strategy-builders.js    # buildCreditVerticals/IronCondors/DebitSpreads
│   │   ├── scoring.js              # scoreSetup/classifySignal/technicalScore/institutionalScore
│   │   ├── iv-history.js           # updateIvHistory() – PostgreSQL + JSON fallback
│   │   ├── entryTimingEngine.js    # evaluateEntryTiming()
│   │   ├── exitTimingEngine.js     # evaluateExitTiming()
│   │   ├── backtestSimulator.js    # simulateSignal()
│   │   └── market-intelligence.js  # classifyEventRisk/classifySoftEventRisk
│   │
│   ├── lib/
│   │   ├── marketSessionClock.js   # getCurrentSession(), isTradingAllowed()
│   │   ├── earningsCalendar.js     # getEarningsRisk() – DB real + mock fallback
│   │   ├── geminiCache.js          # In-memory cache, TTL 10min
│   │   └── ...
│   │
│   ├── scheduler/
│   │   └── autonomousWorker.js    # Background scanner every 3min + push
│   │
│   ├── db/
│   │   ├── schema.sql              # PostgreSQL tables
│   │   ├── historyRepository.js    # price/iv/earnings/closed_signals
│   │   ├── positionsRepository.js  # Open positions CRUD
│   │   └── repository.js           # Main repository
│   │
│   ├── push/
│   │   └── rateLimiter.js          # 5/hour, 12/day
│   │
│   ├── routes/
│   │   └── positionsRoutes.js      # /api/positions CRUD + Gemini analysis
│   │
│   ├── ai/                         # provider-router, deterministic-tutor, budget-manager
│   └── services/                   # scheduler, providers
│
├── src/                            # React frontend
│   ├── main.jsx                    # Entry: imports AppPro
│   ├── AppPro.jsx                  # MAIN app: all sections
│   ├── App.jsx                     # Legacy app
│   ├── index.css                   # Tailwind + theme
│   ├── styles/theme.css            # Component classes
│   │
│   ├── components/                 # 12 components
│   │   ├── GeminiBriefCard.tsx     # Gemini Guardian card
│   │   ├── GeminiAssistant.jsx     # Daily summaries 3x/day
│   │   ├── MarketSentiment.jsx     # Real-time sentiment
│   │   ├── MarketPulseCard.jsx     # "Pulso del Mercado"
│   │   ├── SignalCard.jsx          # Signal ticket display
│   │   ├── NewsImpactList.jsx      # News with stars + dates
│   │   ├── NotificationManager.jsx # Push notification controls
│   │   ├── NotificationStatusCard.jsx # Notification status
│   │   ├── InfoTooltip.jsx         # ? explanatory tooltips
│   │   ├── LearningHub.jsx         # Mini lessons
│   │   └── HomePro.tsx             # Home dashboard
│   │
│   ├── config/
│   │   ├── marketUniverse.ts       # CORE (29), WATCHLIST (92), INDEX (9), SECTOR (16)
│   │   ├── strategyCatalog.ts      # 23 strategies with permissions
│   │   └── riskConfig.ts           # Risk settings
│   │
│   ├── lib/
│   │   ├── api.js                  # API client
│   │   └── guardian/
│   │       └── geminiGuardian.ts   # Frontend Gemini client
│   │
│   └── services/                   # notifications, newsImpactClassifier, proAlertEngine
│
└── tests/                          # Test files
```

---

## Architecture & Data Flow

```
SCAN FLOW (manual or automatic):
  POST /api/guardian/scan
    → runInstitutionalScan()
      → For each symbol in CORE (29 symbols):
        → getQuote(symbol)          [Tradier API]
        → getTimesales(symbol)      [Tradier API - 1min OHLCV]
        → computeTechnicals()       [EMA 9/21/50/200, RSI, MACD, VWAP]
        → detectWyckoff()           [Spring, Upthrust, SOS, SOW]
        → getPolygonTape(symbol)    [Polygon.io - real trades/quotes]
        → getExpirations(symbol)    [Tradier API]
        → getOptionChain(symbol)    [Tradier API - greeks=true]
        → updateIvHistory()         [PostgreSQL first, JSON fallback]
        → volatilityRegimeScore()   [IV vs HV, VIX range check]

        → buildCreditVerticals()    #1 priority (Bull Put + Bear Call)
        → buildIronCondors()        #2 priority
        → buildDebitSpreads()       #3 priority

        → createTicket() → netPremium, netGreeks, estimatePop
        → classifyTicket() → ENTRAR_AHORA / ESPERAR_CONFIRMACION / WATCHLIST / NO_TRADE
        → Sort by: priority × classification × score × POP

      → Return scan results + geminiInput for frontend audit

SCHEDULER (background, every 3min):
  autonomousWorker.js
    → runInstitutionalScan()
    → Filter ENTRAR_AHORA tickets
    → Gemini cache check (deduplicate)
    → sendPushToAll() with rate limiter (5/hour, 12/day)

POSITION MONITORING:
  GET /api/positions/:id/analysis
    → getQuote(symbol)
    → Calculate P&L
    → Gemini analyzes position status (SEGURA/VIGILANCIA/RIESGO/CRITICO)
    → Suggests MANTENER/AJUSTAR/CERRAR/HEDGE

GEMINI ASSISTANT:
  GET /api/gemini/daily-summary
    → runInstitutionalScan(['SPY', 'QQQ', 'VIX'])
    → Gemini generates market overview + tip of the day
    → Frontend displays in GeminiAssistant component
```

---

## Server Engine Modules (12 files)

### `server/engine/math.js`
`round()`, `clamp()`, `mean()`, `std()`

### `server/engine/technicals.js`
`ema()`, `rsi()`, `macd()`, `vwap()`, `realizedVol()`, `computeTechnicals()`, `deriveTechnicals()` (alias)

### `server/engine/wyckoff.js`
`detectWyckoff()` — Spring, Upthrust, Sign of Strength, Sign of Weakness

### `server/engine/tape-polygon.js`
`getPolygonTape()`, `evaluateTape()` — Real buy/sell pressure from Polygon.io

### `server/engine/tradier-api.js`
`getQuote()`, `getTimesales()`, `getExpirations()`, `getOptionChain()`, `normalizeOption()`

### `server/engine/ticket-creator.js`
`createTicket()`, `classifyTicket()`, `makeLeg()`, `netPremium()`, `netGreeksProd()`, `estimatePop()`, `optionQuality()`, `dte()`

### `server/engine/strategy-builders.js`
`buildCreditVerticals()`, `buildIronCondors()`, `buildDebitSpreads()`

### `server/engine/scoring.js`
`scoreSetup()`, `classifySignal()`, `technicalScoreForBias()`, `volatilityRegimeScore()`, `institutionalScore()`

### `server/engine/entryTimingEngine.js`
Session check, earnings check, VWAP chase distance, bid/ask quality

### `server/engine/exitTimingEngine.js`
Take profit (40%+), stop loss (80% maxRisk), theta decay, gamma risk

### `server/engine/backtestSimulator.js`
`simulateSignal()` — Entry at open, exit at TP/SL/expiration

### `server/engine/iv-history.js`
`updateIvHistory()` — PostgreSQL first, JSON file fallback, IV Rank calculation

---

## Server Infrastructure

### `server/lib/marketSessionClock.js`
- **pre** (before 9:30): No signals
- **open-risky** (9:30-9:40): No signals
- **optimal** (9:45-11:15): All allowed
- **midday** (11:15-13:45): Only credit spreads DTE > 7
- **late** (13:45-15:20): No new 0DTE credit spreads
- **closing** (15:20-16:00): No credit spreads 0DTE
- **post/closed/weekend**: No signals

### `server/lib/earningsCalendar.js`
PostgreSQL first → Alpha Vantage data → Mock fallback for 17 symbols

### `server/lib/geminiCache.js`
In-memory Map, TTL 10 minutes, key = `${symbol}-${strategy}-${hour}`

### `server/db/positionsRepository.js`
`addPosition()`, `closePosition()`, `getOpenPositions()`, `getAllPositions()`

### `server/push/rateLimiter.js`
`canSend()`, `recordSend()`, 5/hour, 12/day per endpoint

---

## Strategy Catalog (23 strategies)

| Priority | Strategy | Permission | Risk Type |
|----------|----------|-----------|------------|
| **100** | Bull Put Credit Spread | REAL_SIGNAL | DEFINED_RISK |
| **98** | Bear Call Credit Spread | REAL_SIGNAL | DEFINED_RISK |
| 94 | Iron Condor | REAL_SIGNAL | DEFINED_RISK |
| 92 | Iron Butterfly | REAL_SIGNAL | DEFINED_RISK |
| 90 | Broken Wing Condor | REAL_SIGNAL | DEFINED_RISK |
| 88 | Broken Wing Butterfly | REAL_SIGNAL | DEFINED_RISK |
| 86 | Cash Secured Put | REAL_SIGNAL | CASH_SECURED |
| 84 | Covered Call | REAL_SIGNAL | COVERED |
| 82 | Wheel | REAL_SIGNAL | ASSIGNMENT |
| 78 | Collar | REAL_SIGNAL | DEFINED_RISK |
| 76 | Protective Put | REAL_SIGNAL | DEFINED_RISK |
| 72 | Bull Call Debit Spread | REAL_SIGNAL | DEFINED_RISK |
| 70 | Bear Put Debit Spread | REAL_SIGNAL | DEFINED_RISK |
| 55 | Long Call | WATCHLIST_ONLY | DEFINED_RISK |
| 54 | Long Put | WATCHLIST_ONLY | DEFINED_RISK |
| 50 | Long Straddle | WATCHLIST_ONLY | DEFINED_RISK |
| 48 | Long Strangle | WATCHLIST_ONLY | DEFINED_RISK |
| 46 | Reverse Iron Condor | WATCHLIST_ONLY | DEFINED_RISK |
| 5 | Naked Short Call | BLOCKED | UNDEFINED_RISK |
| 5 | Naked Short Put | BLOCKED | UNDEFINED_RISK |
| 4 | Short Straddle | PAPER_ONLY | UNDEFINED_RISK |
| 4 | Short Strangle | PAPER_ONLY | UNDEFINED_RISK |

---

## Market Universe (146 symbols)

| Mode | Count | Examples |
|------|-------|---------|
| CORE | 29 | SPY, QQQ, IWM, DIA, AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA, SOFI, SMH, XLK, TLT... |
| WATCHLIST | 92 | JPM, BAC, JNJ, PG, DIS, WMT, V, BRK.B, MA... |
| INDEX_CONTEXT | 9 | SPX, XSP, NDX, RUT, VIX, VIX9D, VXN, RVX, VXST |
| SECTOR | 16 | XLK, XLF, XLE, XLV, SLEEP, TLT, GLD, SLV, USO... |

---

## Scoring System

```
institutionalScore = OptionsQuality × 0.25
                   + Volatility × 0.20
                   + Technical × 0.20
                   + TapeReading × 0.15
                   + Wyckoff × 0.10
                   + Macro × 0.10
```

### Classification

| Score | POP | Classification |
|-------|-----|----------------|
| >= 78 | >= 70% | ENTRAR_AHORA |
| >= 68 | >= 65% | ESPERAR_CONFIRMACION |
| >= 58 | — | WATCHLIST |
| < 58 | — | NO_TRADE |

### Stricter Rules (v4.0)

- **maxBidAskPct**: 12% (was 18%)
- **minOpenInterest**: 200 (was 100)
- **minOptionVolume**: 10 (was 5)
- **VWAP chase**: Block if > 2 × ATR from VWAP
- **Earnings**: Block credit strategies within 2 days
- **IV Rank insufficient**: Degrade to WATCHLIST
- **No real Greeks**: No signal

---

## Gemini Guardian

### Frontend Client: `src/lib/guardian/geminiGuardian.ts`
Calls Gemini 2.5 Flash with structured JSON schema (`approve`, `finalDecision`, `riskNotes`, `simpleExplanation`). Falls back to WATCHLIST if no API key.

### Backend Integration:
- **Cache**: 10-minute TTL per symbol+strategy+hour
- **Daily Summaries**: `GET /api/gemini/daily-summary` — market overview + tip
- **Position Analysis**: `GET /api/positions/:id/analysis` — status + recommendation
- **Scheduler**: Only pushes new ENTRAR_AHORA tickets (deduplication via cache)

### Gemini Prompt Rules:
- Gemini NEVER calculates prices, Greeks, POP, or EV
- Gemini ONLY audits data already calculated by the quantitative engine
- Missing data → automatic downgrade
- Invalid JSON → FAIL-CLOSED

---

## API Endpoints (21 total)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server + worker + session status |
| POST | `/api/guardian/scan` | Full scan with custom symbols/settings |
| GET | `/api/guardian/scan` | Quick scan with query params |
| POST | `/api/guardian/scan/auto` | Auto scan for scheduler |
| GET | `/api/gemini/daily-summary` | Gemini market overview + tip |
| GET | `/api/scheduler/status` | Worker status + scan count |
| POST | `/api/scheduler/start` | Start scheduler |
| POST | `/api/scheduler/stop` | Stop scheduler |
| GET | `/api/positions` | List open positions |
| POST | `/api/positions` | Add new position |
| PUT | `/api/positions/:id` | Close/update position |
| GET | `/api/positions/:id/analysis` | Gemini position analysis |
| GET | `/api/earnings/:symbol` | Earnings risk for symbol |
| GET | `/api/explainers` | AI explainer texts |
| GET | `/api/ai/status` | Gemini/OpenAI status |
| POST | `/api/ai/explain` | Ask Gemini to explain scan |
| POST | `/api/ai/test-gemini` | Test Gemini connection |
| POST | `/api/push/subscribe` | Register push subscription |
| GET | `/api/signals` | Approved + rejected signals |
| GET | `/api/scan` | Scan snapshot |
| POST | `/api/journal` | Add journal entry |

---

## Frontend Components (12)

| Component | Purpose |
|-----------|---------|
| `AppPro.jsx` | Main app layout, dark/light toggle |
| `GeminiBriefCard.tsx` | Gemini Guardian brief (protagonist card) |
| `GeminiAssistant.jsx` | Daily summaries 3x/day + tips |
| `MarketSentiment.jsx` | Real-time market sentiment (SPY, VIX, RSI, VWAP, tape) |
| `MarketPulseCard.jsx` | "Pulso del Mercado" + tape reading |
| `SignalCard.jsx` | Signal ticket with all risk data |
| `NewsImpactList.jsx` | News with star ratings + event dates |
| `NotificationManager.jsx` | Push notification controls + VAPID |
| `NotificationStatusCard.jsx` | Notification status display |
| `InfoTooltip.jsx` | ? explanatory tooltip for each metric |
| `LearningHub.jsx` | 5 mini lessons on options trading |
| `HomePro.tsx` | Home dashboard |

---

## Notification System

```
Autonomous Worker (every 3 min)
  → runInstitutionalScan()
  → Filter ENTRAR_AHORA tickets
  → Gemini cache deduplication
  → sendPushToAll({ title, body, tag, url })
       ↓
  Service Worker (public/sw.js)
       ↓
  Browser notification → click opens app at /archivo
```

**Rate Limiting**: 5 notifications/hour, 12/day per endpoint

---

## Database & Historical Data

### PostgreSQL Tables (schema.sql)

```sql
price_history    — Daily OHLCV data (Yahoo Finance)
iv_history       — ATM IV per day
earnings         — Earnings calendar (Alpha Vantage)
closed_signals   — Backtesting results
user_positions   — User portfolio positions
position_alerts  — Gemini position monitoring alerts
```

### Scripts

| Script | Purpose |
|--------|---------|
| `node scripts/downloadHistoricalData.js` | Download 1 year of prices from Yahoo Finance → PostgreSQL |
| `node scripts/updateEarnings.js` | Fetch earnings from Alpha Vantage → PostgreSQL |
| `node scripts/backtestGuardian.js` | Run backtest on closed signals |

### Backtesting

`server/engine/backtestSimulator.js` simulates signal outcomes:
- Entry: opening price after signal
- Exit: TP 40% credit / SL 80% max risk / expiration
- Stores results in `closed_signals` table

---

## Environment Variables

### Required

| Variable | Source |
|----------|--------|
| `TRADIER_TOKEN` | https://brokerage.tradier.com/settings/api |
| `VITE_GEMINI_API_KEY` | https://aistudio.google.com/apikey |

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `POLYGON_API_KEY` | — | Real tape reading |
| `ALPHA_VANTAGE_API_KEY` | — | Real earnings data |
| `DATABASE_URL` | — | PostgreSQL connection |
| `ACCOUNT_SIZE` | 2500 | Account size |
| `MAX_RISK_PCT` | 0.02 | Max risk per trade |
| `MAX_COLLATERAL_PCT` | 0.35 | Max collateral |
| `SCHEDULER_ENABLED` | true | Auto-start scanner |
| `GEMINI_CACHE_TTL_MINUTES` | 10 | Cache TTL |

---

## Deployment

### Render (render.yaml)

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
```

### Steps to Deploy

1. Set up Render service with `render.yaml`
2. Add environment variables (`TRADIER_TOKEN`, `VITE_GEMINI_API_KEY`)
3. Trigger **Manual Deploy → Deploy latest commit**
4. Wait ~3 minutes for build
5. App available at `https://valido-1m.onrender.com`

---

## Commits History (Latest 15)

```
18eabf4  fix: Render deploy — add classifySignal/scoreSetup/deriveTechnicals exports + positions routes
6b14073  fix: add deriveTechnicals alias in technicals.js for market-intelligence.js compatibility
b20da18  feat: UI components — InfoTooltip, MarketSentiment, GeminiAssistant, NotificationManager, LearningHub + Gemini API endpoint
3410e6b  feat: VALIDO 1M v4.0 — PostgreSQL schema, history repository, backtest simulator, earnings Alpha Vantage, IV history DB, tighter liquidity rules
4f788ce  feat: mostrar fechas en noticias y eventos — HOY / MAÑANA / PRÓXIMO + earnings calendar integrado
2775957  docs: regenerate PROJECT_REPORT.md v3.0
fdf050a  feat: FASES 2-7 — session clock, earnings, entry/exit timing, Gemini cache, scheduler, rate limiter, positions repo
01b6340  refactor: FASE 1 — modularizar escáner en 8 módulos
51df23e  feat: market universe classification + strategy catalog with permissions
1da7a91  docs: .env.example with API key instructions
f4c9304  feat: institutional engine (Tradier, Wyckoff, Polygon)
ef3cf3e  feat: strategy-suite.js with buildCreditVerticals
c747f2e  fix: 4 components converted to white theme
ab5957b  fix: notification buttons at bottom + white colors
a3f3643  fix: ROOT CAUSE — removed dark theme
```

---

### Project Statistics

- **Total files**: ~110
- **Server modules**: 30+
- **API endpoints**: 21
- **React components**: 12
- **Strategies**: 23 (13 REAL_SIGNAL, 5 WATCHLIST_ONLY, 5 BLOCKED)
- **Universe**: 146 symbols
- **Scoring layers**: 6 (Options, Volatility, Technical, Tape, Wyckoff, Macro)
- **Build**: 0 errors, 45 modules, 217 KB JS + 31 KB CSS

---

_End of PROJECT_REPORT.md — VALIDO 1M v4.0_