# VALIDO 1M — Complete Project Report v3.0

> Generated: 2026-05-31 | GitHub: https://github.com/avali2/2M | Live: https://valido-1m.onrender.com
> Architecture: React 19 + Vite 7 + Express 5 + Tailwind CSS v4 + TypeScript + Gemini 2.5 Flash

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
14. [Environment Variables](#environment-variables)
15. [Deployment](#deployment)
16. [Commits History](#commits-history)

---

## Project Overview

**VALIDO 1M** is a professional options trading signal platform. It scans options chains in real-time, builds institutional-grade credit spread signals, and uses Google Gemini 2.5 Flash as a Guardian auditor to validate every ticket before approval.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4, Recharts |
| Backend | Express 5, Node 22, ES Modules |
| Data | Tradier API (quotes, chains, timesales, greeks), Polygon.io (tape) |
| AI | Google Gemini 2.5 Flash Lite (via `generateContent` API) |
| Storage | SQLite/PostgreSQL (repository), `data/iv-history.json` |
| Push | Web Push API + Service Worker + VAPID keys |
| Scheduler | Built-in `setInterval` — every 3 minutes during market hours |
| Deployment | Render (free tier compatible) |

### Core Principles

1. **FAIL-CLOSED**: No signal without real Greeks, bid/ask, OI, volume
2. **Credit Spread Priority**: Bull Put Credit Spread = #1, Bear Call Credit Spread = #2
3. **Gemini as Auditor**: AI reviews tickets but never invents prices, Greeks, or POP
4. **Defined Risk Only**: Naked options and undefined risk strategies are BLOCKED or EDUCATIONAL_ONLY
5. **Market Session Awareness**: Scans only during market hours, with session-specific rules
6. **White Theme**: Professional light UI, mobile-first responsive
7. **Autonomous Background Scanning**: Every 3 minutes during market hours
8. **Rate-Limited Push Notifications**: 5/hour, 12/day per device

---

## Folder Structure

```
2M/
├── .env.example                    # Template with API key instructions
├── institutional-os.html           # Vite entry HTML
├── package.json                    # Dependencies: react, express, recharts, web-push, motion
├── render.yaml                     # Render deployment config (Node 22)
├── vite.config.js                  # Vite + React + Tailwind v4 plugin
├── tailwind.config.js              # Sigma color palette (light theme)
│
├── data/                           # Runtime IV history storage
│   └── iv-history.json
│
├── public/                         # Static assets
│   ├── sw.js                       # Service Worker for push notifications
│   ├── manifest.webmanifest
│   └── valido-mark.svg
│
├── server/                         # Express backend (ES Modules)
│   ├── index.mjs                   # MAIN API entry (17 endpoints)
│   ├── institutional-engine.mjs    # runInstitutionalScan() orchestrator
│   ├── strategy-suite.js           # buildCreditVerticals() with catalog
│   ├── strategy-permissions.mjs    # enforceStrategyPermission()
│   ├── config.js                   # Server config & universe
│   ├── explainers.js               # AI explainer constants
│   ├── push.js / pushRoutes.js     # Web Push service
│   ├── pushStore.js                # Subscription storage
│   │
│   ├── engine/                     # Modular scanner
│   │   ├── math.js                 # round(), clamp(), mean(), std()
│   │   ├── technicals.js           # ema(), rsi(), macd(), vwap(), computeTechnicals()
│   │   ├── wyckoff.js              # detectWyckoff() — Spring, Upthrust, SOS, SOW
│   │   ├── tape-polygon.js         # getPolygonTape(), evaluateTape()
│   │   ├── tradier-api.js          # getQuote(), getTimesales(), getChain(), normalizeOption()
│   │   ├── ticket-creator.js       # createTicket(), classifyTicket(), makeLeg(), netPremium(), netGreeksProd(), estimatePop()
│   │   ├── strategy-builders.js    # buildCreditVerticals(), buildIronCondors(), buildDebitSpreads()
│   │   ├── scoring.js              # institutionalScore(), technicalScoreForBias(), volatilityRegimeScore()
│   │   ├── iv-history.js           # updateIvHistory() — IV Rank persistence
│   │   ├── entryTimingEngine.js    # evaluateEntryTiming() — session, earnings, VWAP checks
│   │   └── exitTimingEngine.js     # evaluateExitTiming() — TP, SL, theta, gamma
│   │
│   ├── lib/                        # Server utilities
│   │   ├── marketSessionClock.js   # getCurrentSession(), isTradingAllowed()
│   │   ├── earningsCalendar.js     # getEarningsRisk() with mock data
│   │   ├── geminiCache.js          # In-memory Map cache, TTL 10min
│   │   ├── math.js / cache.js / store.js
│   │
│   ├── scheduler/
│   │   └── autonomousWorker.js    # Background scanner every 3min + push
│   │
│   ├── db/
│   │   ├── positionsRepository.js  # Open positions: add, close, get
│   │   └── repository.js           # PostgreSQL/SQLite persistence
│   │
│   ├── push/
│   │   └── rateLimiter.js          # 5/hour, 12/day per endpoint
│   │
│   ├── ai/                         # AI provider router
│   │   ├── provider-router.js      # AiProviderRouter with Gemini + OpenAI fallback
│   │   ├── deterministic-tutor.js
│   │   └── budget-manager.js
│   │
│   └── services/
│       └── scheduler.js            # ScanScheduler class
│
├── src/                            # React frontend (TypeScript + JSX)
│   ├── main.jsx                    # Entry: imports AppPro + index.css + theme.css
│   ├── AppPro.jsx                  # MAIN app: all sections
│   ├── App.jsx                     # Legacy app (not imported)
│   ├── index.css                   # Tailwind imports + Tailwind v4 theme
│   ├── styles/theme.css            # Component CSS (signal-card, market-card, etc.)
│   │
│   ├── components/
│   │   ├── GeminiBriefCard.tsx     # Gemini Guardian protagonizt card
│   │   ├── SignalCard.jsx          # Signal ticket display
│   │   ├── MarketPulseCard.jsx     # Market pulse + tape reading
│   │   ├── NewsImpactList.jsx      # News with star ratings ⭐
│   │   ├── NotificationStatusCard.jsx  # Push notification controls
│   │   └── HomePro.tsx             # Home dashboard
│   │
│   ├── config/
│   │   ├── marketUniverse.ts       # CORE (29), WATCHLIST (92), INDEX (9), SECTOR (16)
│   │   ├── strategyCatalog.ts      # 23 strategies with REAL_SIGNAL/WATCHLIST/BLOCKED
│   │   └── riskConfig.ts           # Risk settings persistence
│   │
│   ├── lib/
│   │   ├── api.js                  # API client
│   │   └── guardian/
│   │       └── geminiGuardian.ts   # auditTicketsWithGemini() frontend client
│   │
│   └── services/
│       ├── notifications.js        # Service worker registration
│       ├── notificationClient.js   # Local notification test
│       └── newsImpactClassifier.ts # News star classification
│
└── tests/                          # Test files
```

---

## Architecture & Data Flow

```
User clicks "Scan" → fetch POST /api/guardian/scan
  → runInstitutionalScan()
    → For each symbol in CORE (29 symbols):
      ├── getQuote(symbol)            → Tradier API /markets/quotes
      ├── getTimesales(symbol)        → Tradier API /markets/timesales (1min OHLCV)
      ├── computeTechnicals()         → EMA 9/21/50/200, RSI 14, MACD 12/26/9, VWAP, Realized Vol
      ├── detectWyckoff(bars)         → Spring, Upthrust, SOS, SOW, Accumulation, Distribution
      ├── getPolygonTape(symbol)      → Polygon.io trades + quotes (real buy/sell pressure)
      ├── getExpirations(symbol)      → Tradier API /markets/options/expirations
      ├── getOptionChain(symbol, exp) → Tradier API /markets/options/chains?greeks=true
      ├── updateIvHistory(symbol, iv) → Persist IV to .data/iv-history.json, compute IV Rank
      ├── volatilityRegimeScore()     → IV vs HV, VIX range check
      │
      ├── buildCreditVerticals()      → PRIORITY #1: Bull Put + Bear Call Credit Spreads
      ├── buildIronCondors()          → PRIORITY #2: Iron Condor (bull put + bear call)
      ├── buildDebitSpreads()         → PRIORITY #3: Call/Put Debit Spreads
      │
      ├── createTicket() for each candidate
      │   → netPremium(), netGreeksProd(), estimatePop()
      │   → institutionalScore() = Options×0.25 + Vol×0.20 + Tech×0.20 + Tape×0.15 + Wyckoff×0.10 + Macro×0.10
      │
      ├── classifyTicket() → ENTRAR_AHORA / ESPERAR_CONFIRMACION / WATCHLIST / NO_TRADE
      │
      └── Sort by: classification rank + strategy priority + score + POP
    │
    └── Return scan results with geminiInput for frontend audit

Scheduler (background, every 3min):
  → runInstitutionalScan()
  → Filter ENTRAR_AHORA tickets
  → Gemini cache check (skip duplicates within same hour)
  → sendPushToAll() with rate limiter (5/hour, 12/day)

Frontend:
  → auditTicketsWithGemini() → Gemini 2.5 Flash API → JSON schema validated
  → Render: GeminiBriefCard + SignalCard + MarketPulseCard + NewsImpactList
```

---

## Server Engine Modules

### `server/engine/math.js`
```js
export function round(n, d = 2)     // safe rounding
export function clamp(n, min, max)  // value bounding
export function mean(arr)           // array average
export function std(arr)            // standard deviation
```

### `server/engine/technicals.js`
```js
export function ema(values, period)         // Exponential Moving Average
export function rsi(values, period = 14)    // Relative Strength Index
export function macd(values)                // { line, signal, histogram }
export function vwap(bars)                  // Volume-Weighted Average Price
export function realizedVol(closes)         // Historical realized volatility
export function computeTechnicals(symbol, quote, bars)  // Full technical analysis
```
Computes: `{ symbol, price, ema9, ema21, ema50, ema200, rsi14, macd, vwap, vwapBias, relativeVolume, volumeSpike, support, resistance, trend, momentum, structure, realizedVol }`

### `server/engine/wyckoff.js`
```js
export function detectWyckoff(bars, technicals)
// Returns: { phase, bias, score, evidence, volumeExpansion }
// Phases: SPRING, UPTHRUST, SIGN_OF_STRENGTH, SIGN_OF_WEAKNESS, ACCUMULATION, DISTRIBUTION, RANGE, NO_DATA
```

### `server/engine/tape-polygon.js`
```js
export async function getPolygonTape(symbol)  // Polygon.io real trades + quotes
export function evaluateTape(symbol, prints)  // Buy/sell pressure, large trade detection
// Returns: { symbol, status, score, momentum, buyPressure%, sellPressure%, printsPerSecond, largeTradeDetected, summary }
```

### `server/engine/tradier-api.js`
```js
export async function getQuote(symbol)         // Real-time price, bid, ask, volume
export async function getTimesales(symbol)     // 1-min OHLCV bars for the day
export async function getExpirations(symbol)   // Available expiration dates
export async function getOptionChain(symbol, exp)  // Full chain with greeks=true
export function normalizeOption(raw)           // Standardize option object
```

### `server/engine/ticket-creator.js`
```js
export function createTicket({ symbol, strategy, legs, spot, ... })  // Full ticket builder
export function classifyTicket(ticket, settings)   // ENTRAR_AHORA / ESPERAR_CONFIRMACION / WATCHLIST / NO_TRADE
export function makeLeg(action, option)            // Standard leg format
export function netPremium(legs)                    // Net credit or debit
export function netGreeksProd(legs)                 // Combined { delta, gamma, theta, vega }
export function estimatePop(strategy, legs)         // Delta-based POP approximation
export function optionQuality(legs, settings)       // Liquidity scoring
export function dte(expiration)                    // Days to expiry
```

### `server/engine/strategy-builders.js`
```js
export function buildCreditVerticals(ctx)   // Bull Put + Bear Call Credit Spreads (#1 priority)
export function buildIronCondors(ctx)       // Iron Condors (combined credit spreads)
export function buildDebitSpreads(ctx)      // Call/Put Debit Spreads
```

### `server/engine/scoring.js`
```js
export function institutionalScore({ optionsScore, volScore, techScore, tapeScore, wyckoffScore, macroScore })
// = optionsScore×0.25 + volScore×0.20 + techScore×0.20 + tapeScore×0.15 + wyckoffScore×0.10 + macroScore×0.10

export function technicalScoreForBias(technicals, bias)  // 50 base + trend/momentum/structure bonuses
export function volatilityRegimeScore({ iv, ivRank, vix, realizedVol })  // 50 base + IV/HV/Vix adjustments
```

### `server/engine/iv-history.js`
```js
export async function updateIvHistory(symbol, currentIv)
// Persists IV to .data/iv-history.json, returns { ivRank, ivPercentile }
```

### `server/engine/entryTimingEngine.js`
```js
export function evaluateEntryTiming(ticket)
// Checks: market session, earnings risk, VWAP chase distance, bid/ask spread quality
// Returns: { allowed: boolean, reason: string, context }
```

### `server/engine/exitTimingEngine.js`
```js
export function evaluateExitTiming(position, currentPrice, currentGreeks, timeToExpiry)
// Checks: take profit (40%+), stop loss (80% maxRisk), time decay, gamma risk, VWAP break
// Returns: { action: 'TAKE_PROFIT_40PCT' | 'STOP_LOSS' | 'CLOSE_BEFORE_EXPIRY' | 'HOLD', reason }
```

---

## Server Infrastructure

### `server/lib/marketSessionClock.js`
```js
export function getCurrentSession()    // Returns: 'pre', 'open-risky', 'optimal', 'midday', 'late', 'closing', 'post', 'closed', 'weekend'
export function isTradingAllowed(strategy, dte, session)  // Session-specific trading rules
```
**Session rules:**
- **open-risky** (9:30-9:40): No signals
- **optimal** (9:45-11:15): All allowed
- **midday** (11:15-13:45): Only credit spreads with DTE > 7
- **late** (13:45-15:20): No new 0DTE credit spreads
- **closing** (15:20-16:00): No credit spreads 0DTE

### `server/lib/earningsCalendar.js`
```js
export function getEarningsRisk(symbol)
// Returns: { risk: 'BLOCK' | 'HIGH' | 'WATCH' | 'CLEAR', daysUntil, nextEarningsDate, reason }
```
Mock data for 17 symbols (AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA, JPM, BAC, AMD, SOFI, NFLX, COST, MCD, SPY, QQQ, IWM, DIA).

### `server/lib/geminiCache.js`
```js
export function getCacheKey(symbol, strategy)  // `${symbol}-${strategy}-${hour}`
export function getCached(key)                 // Returns cached value or null if expired
export function setCached(key, value)          // Sets value with TTL (default 10 min)
export function clearCache()                   // Clear all cache
```

### `server/db/positionsRepository.js`
```js
export function addPosition(position)         // Creates open position with ID
export function closePosition(id, result)     // Marks closed with result
export function getOpenPositions()            // Filter status === 'open'
export function getAllPositions()             // Return all
export function getPositionById(id)           // Find by ID
```

### `server/push/rateLimiter.js`
```js
export function canSend(endpoint)             // Check if within limits (5/hour, 12/day)
export function recordSend(endpoint)          // Record a send timestamp
export function getStats(endpoint)            // { hour: count, day: count }
```

---

## Scheduler & Autonomous Worker

### `server/scheduler/autonomousWorker.js`
```js
export function startAutonomousWorker({ onSignal, pushService })
// Starts setInterval every 3 minutes
// During market hours: runs runInstitutionalScan()
// Filters ENTRAR_AHORA tickets → checks Gemini cache → sends push with rate limiter

export function stopAutonomousWorker()  // Clears interval
export function getWorkerStatus()       // { started, scanCount, session }
```

### Schedule Intervals

| Session | Frequency | Action |
|---------|-----------|--------|
| market open (9:30-16:00) | Every 3 min | Full scan → push signals |
| closed / weekend | No scan | Idle |
| Scan with no signals | Every 3 min | Log only |

---

## Strategy Catalog

| Priority | ID | Type | Permission | Risk |
|----------|-----|------|-----------|------|
| **100** | BULL_PUT_CREDIT_SPREAD | Credit | **REAL_SIGNAL** | DEFINED_RISK |
| **98** | BEAR_CALL_CREDIT_SPREAD | Credit | **REAL_SIGNAL** | DEFINED_RISK |
| 94 | IRON_CONDOR | Credit | **REAL_SIGNAL** | DEFINED_RISK |
| 92 | IRON_BUTTERFLY | Credit | **REAL_SIGNAL** | DEFINED_RISK |
| 90 | BROKEN_WING_CONDOR | Credit | **REAL_SIGNAL** | DEFINED_RISK |
| 88 | BROKEN_WING_BUTTERFLY | Credit | **REAL_SIGNAL** | DEFINED_RISK |
| 86 | CASH_SECURED_PUT | Cash Secured | **REAL_SIGNAL** | CASH_SECURED |
| 84 | COVERED_CALL | Covered | **REAL_SIGNAL** | COVERED |
| 82 | WHEEL | Assignment | **REAL_SIGNAL** | ASSIGNMENT |
| 78 | COLLAR | Protection | **REAL_SIGNAL** | DEFINED_RISK |
| 76 | PROTECTIVE_PUT | Protection | **REAL_SIGNAL** | DEFINED_RISK |
| 72 | BULL_CALL_DEBIT_SPREAD | Debit | **REAL_SIGNAL** | DEFINED_RISK |
| 70 | BEAR_PUT_DEBIT_SPREAD | Debit | **REAL_SIGNAL** | DEFINED_RISK |
| 55 | LONG_CALL | Debit | **WATCHLIST_ONLY** | DEFINED_RISK |
| 54 | LONG_PUT | Debit | **WATCHLIST_ONLY** | DEFINED_RISK |
| 50 | LONG_STRADDLE | Volatility | **WATCHLIST_ONLY** | DEFINED_RISK |
| 48 | LONG_STRANGLE | Volatility | **WATCHLIST_ONLY** | DEFINED_RISK |
| 46 | REVERSE_IRON_CONDOR | Volatility | **WATCHLIST_ONLY** | DEFINED_RISK |
| 5 | SHORT_CALL (Naked) | Credit | **BLOCKED** | UNDEFINED_RISK |
| 5 | SHORT_PUT (Naked) | Credit | **BLOCKED** | UNDEFINED_RISK |
| 4 | SHORT_STRADDLE | Credit | **PAPER_ONLY** | UNDEFINED_RISK |
| 4 | SHORT_STRANGLE | Credit | **PAPER_ONLY** | UNDEFINED_RISK |

---

## Market Universe

### `src/config/marketUniverse.ts`

| Mode | Count | Examples |
|------|-------|---------|
| `CORE` | 29 | SPY, QQQ, IWM, DIA, AAPL, MSFT, NVDA, TSLA, SOFI, SMH, XLK, XLF, TLT... |
| `WATCHLIST` | 92 | JPM, BAC, JNJ, PG, DIS, WMT, V, BRK.B, MA... |
| `INDEX_CONTEXT` | 9 | SPX, XSP, NDX, RUT, VIX, VIX9D, VXN, RVX, VXST |
| `SECTOR` | 16 | XLK, XLF, XLE, XLV, XLY, SMH, TLT, GLD, SLV, USO... |

### `server/strategy-permissions.mjs`

```js
REAL_SIGNAL_ALLOWED  = [BULL_PUT_CREDIT_SPREAD, BEAR_CALL_CREDIT_SPREAD, IRON_CONDOR, IRON_BUTTERFLY,
                        BROKEN_WING_CONDOR, BROKEN_WING_BUTTERFLY, CASH_SECURED_PUT, COVERED_CALL,
                        WHEEL, COLLAR, PROTECTIVE_PUT, BULL_CALL_DEBIT_SPREAD, BEAR_PUT_DEBIT_SPREAD]

WATCHLIST_ONLY       = [LONG_CALL, LONG_PUT, LONG_STRADDLE, LONG_STRANGLE,
                        REVERSE_IRON_CONDOR, PMCC, CALENDAR_SPREAD, DIAGONAL_SPREAD]

BLOCKED_OR_PAPER     = [SHORT_CALL, SHORT_PUT, SHORT_STRADDLE, SHORT_STRANGLE,
                        NAKED_CALL, NAKED_PUT, COVERED_PUT, RATIO_SPREAD_UNPROTECTED]
```

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

### Classification Thresholds

| Score | POP | Classification |
|-------|-----|----------------|
| >= 78 | >= 70% | **ENTRAR_AHORA** |
| >= 68 | >= 65% | **ESPERAR_CONFIRMACION** |
| >= 58 | — | **WATCHLIST** |
| < 58 | — | **NO_TRADE** |

### FAIL-CLOSED Conditions

Any of these downgrade the signal to NO_TRADE:
- No real Greeks (delta, gamma, theta, vega)
- No bid/ask or invalid bid/ask
- `maxRisk > accountSize × maxRiskPct`
- Collateral > `accountSize × maxCollateralPct`
- Options quality score < 60
- Strategy is UNDEFINED_RISK
- Market session blocked (open-risky, closed)
- Earnings within 2 days (for credit strategies)

---

## Gemini Guardian

### Frontend Client: `src/lib/guardian/geminiGuardian.ts`

```ts
export async function auditTicketsWithGemini(input: GeminiAuditInput): Promise<GeminiAuditResult[]>
// Calls Gemini 2.5 Flash Lite with structured JSON schema
// responseSchema: { approve, finalDecision, downgradeReason, riskNotes, simpleExplanation }
// Returns WATCHLIST if no API key configured
// Throws if Gemini returns invalid JSON
```

### Backend Integration

- **Cache**: `server/lib/geminiCache.js` — 10-minute TTL per symbol+strategy+hour
- **Scheduler**: Only sends cached-rejected signals when there's a NEW ENTRAR_AHORA ticket
- **Prompt**: Gemini receives full market context (VIX, session, earnings, IV Rank, technicals, Greeks)

---

## API Endpoints

### `server/index.mjs` — 17 endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server status + worker status + session |
| POST | `/api/guardian/scan` | Full institutional scan with custom symbols/settings |
| GET | `/api/guardian/scan` | Quick scan with query params |
| POST | `/api/guardian/scan/auto` | Auto scan (for scheduler testing) |
| GET | `/api/scheduler/status` | Worker started? scan count? session? |
| POST | `/api/scheduler/start` | Start background scheduler |
| POST | `/api/scheduler/stop` | Stop background scheduler |
| POST | `/api/positions/add` | Add open position |
| POST | `/api/positions/:id/close` | Close position with result |
| GET | `/api/positions` | List open + all positions |
| GET | `/api/positions/:id` | Get position by ID |
| GET | `/api/earnings/:symbol` | Get earnings risk for symbol |
| GET | `/api/explainers` | AI explainer texts |
| GET | `/api/ai/status` | Gemini/OpenAI status |
| POST | `/api/ai/explain` | Ask Gemini to explain scan |
| POST | `/api/ai/test-gemini` | Test Gemini connection |
| POST | `/api/push/subscribe` | Register push subscription |

---

## Notification System

### Architecture

```
Autonomous Worker (every 3 min)
  → runInstitutionalScan()
  → Filter ENTRAR_AHORA tickets
  → Gemini cache check (deduplicate)
  → sendPushToAll({ title, body, tag, url })
       ↓
  Service Worker (public/sw.js)
       ↓
  Browser shows notification
  Click → opens app at /archivo
```

### Rate Limiting

- **5 notifications per hour** per subscription endpoint
- **12 notifications per day** per subscription endpoint
- Implemented in `server/push/rateLimiter.js`
- `canSend(endpoint)` + `recordSend(endpoint)`

---

## Environment Variables

### Required

| Variable | Source | Purpose |
|----------|--------|---------|
| `TRADIER_TOKEN` | https://brokerage.tradier.com/settings/api | Real-time quotes, chains, Greeks |
| `VITE_GEMINI_API_KEY` | https://aistudio.google.com/apikey | Gemini Guardian AI audit |

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `POLYGON_API_KEY` | — | Real tape reading (Trades + Quotes) |
| `ACCOUNT_SIZE` | 2500 | Simulation account size |
| `MAX_RISK_PCT` | 0.02 | Max risk per trade (2%) |
| `MAX_COLLATERAL_PCT` | 0.35 | Max collateral (35%) |
| `SCHEDULER_ENABLED` | true | Auto-start background scanner |
| `GEMINI_CACHE_TTL_MINUTES` | 10 | Gemini result cache duration |

---

## Deployment

### Render (`render.yaml`)

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

## Commits History (Latest 12)

```
fdf050a  feat: FASES 2-7 — session clock, earnings, entry/exit timing, Gemini cache, scheduler, rate limiter, positions repo
01b6340  refactor: FASE 1 — modularizar escáner en 8 módulos (math, technicals, wyckoff, tape-polygon, tradier-api, strategy-builders, ticket-creator, scoring)
51df23e  feat: market universe classification + strategy catalog with permissions
1da7a91  docs: .env.example with API key instructions
f4c9304  feat: institutional engine (Tradier, Wyckoff, Polygon, Credit Verticals, Gemini TS client)
ef3cf3e  feat: strategy-suite.js with buildCreditVerticals
c747f2e  fix: 4 components converted to white theme (MarketPulse, Gemini, SignalCard, NewsImpact)
ab5957b  fix: notification buttons at bottom + white colors
a3f3643  fix: ROOT CAUSE — removed dark theme from theme.css + AppPro
b87a9f2  fix: white theme + autonomous worker + pipeline
```

---

### Project Statistics

- **Total files**: ~80
- **Server modules**: 25
- **API endpoints**: 17
- **React components**: 6 (plus legacy)
- **Strategies**: 23 (13 REAL_SIGNAL, 5 WATCHLIST_ONLY, 5 BLOCKED)
- **Universe**: 146 symbols (CORE 29, WATCHLIST 92, INDEX 9, SECTOR 16)
- **Scoring layers**: 6 (Options, Volatility, Technical, Tape, Wyckoff, Macro)
- **Build**: 0 errors, 41 modules, 206 KB JS + 28 KB CSS

---

_End of PROJECT_REPORT.md — Generated for VALIDO 1M v3.0_