# VALIDO 1M OS - Institutional Options Intelligence Platform

VALIDO 1M OS is a semiautonomous scanner, trade-ticket desk and learning assistant for defined-risk options structures. It is designed for a trader who cannot monitor positions continuously: the engine filters first, produces reviewable trade tickets only from sourced data, and keeps AI in an explanation/tutor role.

## Architecture

- `institutional-os.html` is the Vite entry for the React dashboard.
- `src/` contains the React/Tailwind/Recharts client.
- `server/engine/` contains regime, technical, GEX, strategy, score, and approval logic.
- `server/providers/` contains Tradier, Yahoo Finance, Finnhub, Polygon, FMP, Benzinga, Gemini and OpenAI adapters.
- `server/ai/` contains the manual-only AI router, Gemini/OpenAI budget manager and deterministic tutor fallback.
- `server/db/` contains the PostgreSQL repository and production schema.
- `src/features/options-simulator/` contains pure payoff/Greek/scenario calculations and the embedded Options Strategy Lab.
- `src/features/pro-signals/`, `probability-edge-engine/` and `risk-governor/` present deterministic scored signals with source/formula auditing.
- `src/features/options-paper-trading/` and `practice-replay/` provide offline/manual practice and post-plan review without sending broker orders.
- `src/features/pro-data-map/`, `greeks-volatility-academy/`, `gex-dealer-positioning-lab/`, `moving-average-options-playbook/`, `options-strategy-library/`, `tape-reading-lab/`, `options-flow-lite/`, `algorithmic-strategy-lab/` and `pro-trading-plan/` form the learning desk.
- `src/services/notifications.js` and `public/sw.js` implement mobile-safe PWA notifications.
- `src/features/options-guardian-agent/` contains Options Guardian Agent Pro: deterministic event rules, learning coach, visible-tab scheduler, Web Push client and operational panel.
- `server/guardianScheduler.js`, `server/guardianRoutes.js`, `server/push.js` and `server/pushStore.js` run protected Guardian scans and optional VAPID Web Push from the backend.
- `server/services/paperAutopilot.js`, `server/services/tradierPaperBroker.js` and `server/routes/tradierRoutes.js` implement the server-side Tradier Sandbox autopilot and the production preview-only boundary.
- `data/` is a local development fallback for watchlists, snapshots, journal, alerts, risk mandate, and IV observations.
- The Express scheduler continues rescanning on the configured interval while the server is running, even when the browser tab is closed.
- The Guardian scheduler adds Work Mode throttles: no more than three noncritical pushes per hour, symbol/type cooldowns and no live Guardian scans while the market is closed.
- The default watchlist includes `SPY`, `SPX`, `QQQ`, `IWM`, `DIA`, Magnificent 7 and the focused equity `SOFI`.
- `XSP`, `NDX` and `RUT` can be added to the watchlist when the selected broker/data plan supports their chains.

## Live Provider Coverage

| Need | Provider Adapter | Required for executable shortlist |
| --- | --- | --- |
| Quotes, history, option chains, Greeks, IV, OI | Tradier or Polygon | Yes |
| Macro calendar and earnings | Finnhub or FMP | Yes |
| Breaking market news | Finnhub | Yes |
| Unusual options activity and block trades | Benzinga | Optional; adds flow confidence |
| User-requested contextual explanation | Gemini first, OpenAI optional | Optional/manual; never creates prices or trades |
| IV history, option snapshots, trade journal | PostgreSQL | Optional in development; recommended in production |

`Gamma Exposure` is intentionally labeled as an OI-weighted gamma proxy computed from the real chain. It is not presented as verified dealer positioning without a licensed positioning feed.
`Dark pools` are not mislabeled from block-trade data; they remain unavailable until a dedicated licensed feed is added.
`VIX9D`, aggregate put/call ratio, verified dealer positioning, skew and term structure display `No disponible` until a compatible sourced calculation/feed is implemented.

## Safety Policy

- No sliders or manual inputs exist for VIX, IV, trend, gamma, earnings, or macro events.
- Missing essential providers produces `NO TRADE - DATA PROVIDERS REQUIRED`.
- Work mode considers defined-risk spreads, cash-secured puts only when collateral fits, and covered calls only for recorded share holdings. The `SOFI Options Desk` explains CSP, bull put spreads, covered calls and Wheel without upgrading a rejected setup into a signal.
- The scanner collects and evaluates 0DTE/1DTE index condors; 0DTE is collection-only in work mode and 1DTE requires explicit mandate approval.
- Earnings before expiry, high-impact events, extreme VIX, negative gamma proxy, poor liquidity, insufficient IV history, flow conflict, or excess max loss block a setup.
- IV Rank is based on persisted real-IV observations and stays blocked while its history window is incomplete.
- Trade Quality Score weights are liquidity 20, technical context 15, volatility/IV edge 15, modeled probability 15, expected value 10, event/news safety 10, Tape/GEX/flow context 10 and account fit 5.
- A real-review candidate requires `Trade Validado` (`80-100`) and every Risk Governor gate; `70-79` is `Trade Condicional`, `60-69` is reduced-size educational review and below 60 is paper study only.
- Under `NO TRADE`, the dashboard may still show bullish, bearish and neutral conditional structures from a valid real chain with explicit activation gates; these are not approved trades.
- Collateral used at or above 80%, daily loss stop or weekly loss stop switches new recommendations to educational/paper review.

## Options Strategy Lab

The same dashboard includes a modular simulator for manual structures and scanner-loaded strategies. It computes expiration payoff, estimated max risk/profit, break-even, net Greeks, delta-based estimated probability and basic ATR/IV/theta scenarios. Lines labeled `estimated` use constant-Greek assumptions, while payoff at expiration is contractual from the entered legs and premiums.

Naked calls and unprotected short puts are blocked by validation unless the put is explicitly a cash-secured structure. Calendar, diagonal and PMCC structures remain educational simulations because exact pre-expiration valuation needs per-leg expiration surfaces and a volatility model.

## Paper Trading And Edge

`Paper Trading de Opciones` accepts a scanner plan, a simulator setup or an explicitly labeled manual/educational template even while the market is closed. It calculates payoff, break-even and risk from entered legs, stores practice locally, can send a closed practice to the journal and exposes a chain checklist. It never sends orders.

Probability and EV are displayed only when required inputs exist. Manual templates with no numeric Greeks show `No disponible`; the system does not replace missing Delta/IV with a favorable probability. For real-chain setups, `Probability & Edge Engine` labels POP, EV, ROC and slippage as modeled estimates and exposes the formula audit.

## Tradier Sandbox Autopilot

The `Tradier` dashboard tab deliberately separates two environments:

- Production Tradier is read-only. The app can retrieve balances/positions and request `preview=true` for a current `READY_GREEN` ticket, but it exposes no production order-submit endpoint.
- Autonomous entry, cancellation and rule-based exit are restricted to `https://sandbox.tradier.com/v1`. The paper broker rejects any other host before making a request.
- The paper heartbeat starts with the server/worker even while credentials are missing, so the dashboard reports the exact blocker instead of a false open market or an empty cycle history. It never borrows the production Tradier clock.
- Existing paper mandates migrate to autonomous Sandbox mode with Gemini as an optional veto: an explicit veto blocks an entry, while an unavailable Gemini/429 does not override the deterministic `READY_GREEN` engine. The kill switch always remains authoritative.
- The `AGGRESSIVE_DEFINED_RISK` profile is autonomous by default in Sandbox. Every entry must still be `READY_GREEN`, use one to four valid option legs, have defined maximum loss, at least 1 DTE, sufficient liquidity and fit available Sandbox buying power.
- Gemini is an advisory veto by default. An explicit Gemini rejection blocks an entry, while a 429 or unavailable response does not override a deterministic `READY_GREEN` decision. Operators can enable mandatory Gemini approval from the dashboard.
- Orders use day limit tickets and a mandatory Tradier preview. The bot deduplicates the same setup for 24 hours, blocks duplicate symbols, caps six entries per day, and enforces position, daily-loss, risk and contract limits. It checks paper take-profit, stop-loss and DTE exit rules each cycle.
- Paper runs, tracked orders and outcomes persist in PostgreSQL when configured, with ignored JSON fallback for local development. After five closed paper trades, per-strategy results can adjust ranking within a small bounded range; learning cannot increase risk or contract limits.
- The Render web service only reads persisted scans and serves the dashboard. The `npm run worker` process owns scheduled scanning and paper cycles. PostgreSQL is required so the shared lock, deduplication and history remain authoritative.

Configure a separate Tradier Sandbox token. Production and Sandbox credentials must never be reused or committed:

```text
TRADIER_PAPER_TOKEN=
TRADIER_PAPER_ACCOUNT_ID=
TRADIER_PAPER_BASE_URL=https://sandbox.tradier.com/v1
PAPER_BOT_PROFILE=AGGRESSIVE_DEFINED_RISK
PAPER_BOT_DEFAULT_ENABLED=true
PAPER_BOT_DEFAULT_AUTO_EXECUTE=true
```

## Optional AI Tutor

Gemini is the preferred low-cost tutor provider, OpenAI remains supported as a manual optional fallback, and the app also includes a deterministic tutor when no AI key exists. Keep `ENABLE_OPENAI=false` unless you intentionally want OpenAI explanations. The backend only calls AI after the user chooses `Explicar con IA` or `Probar Gemini`; scans, notifications and trade-ticket math never depend on AI.

The AI router enforces daily request/token budgets, cooldown after 429, compact payloads and cache. AI never calculates prices, strikes, POP, EV, Greeks, payoff, collateral, score or risk classification.

## Options Guardian Agent Pro

`Guardian` is a new dashboard tab and mobile shortcut. It turns sourced scanner results into auditable events:

- `SIGNAL_VALIDATED`, `SIGNAL_CONDITIONAL` and `SIGNAL_PAPER_ONLY` follow Trade Quality Score and Risk Governor output.
- `RISK_BLOCKED`, `CHAIN_WARNING`, `LIQUIDITY_WARNING`, `GAMMA_RISK` and `MACRO_RISK` explain why a real review is unsafe.
- When markets are closed, Guardian does not issue live signal claims; it suggests labeled paper practice and journal review.
- The Learning Coach computes FOMO, revenge, liquidity and gamma-study recommendations from journal/feedback data without AI calls.
- A Guardian alert can open the existing simulator or Paper Trading desk; no route transmits brokerage orders.

With PostgreSQL configured, the application creates `guardian_settings`, `guardian_events`, `guardian_alert_cooldowns`, `guardian_learning_profile`, `guardian_push_subscriptions`, `guardian_scan_runs`, `guardian_user_feedback` and `guardian_market_snapshots`. Without PostgreSQL, equivalent JSON records are written under ignored local `data/` files.

## Setup

```powershell
Copy-Item .env.example .env
# Add server-side provider credentials and optionally DATABASE_URL to .env.
# For a public deployment also add a long APP_ACCESS_KEY.
# Gemini/OpenAI are optional. Scanner, Guardian, simulator and paper trading work without AI.
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5173/institutional-os.html`.

For production:

```powershell
npm.cmd run build
npm.cmd start
```

Open `http://127.0.0.1:8787/institutional-os.html`.

For PostgreSQL persistence, set `DATABASE_URL` in `.env`; the application creates `iv_history`, `options_snapshots`, `trade_journal`, `app_settings` and all `guardian_*` tables from `server/db/schema.sql` on first use. Without it, the dashboard identifies the local fallback explicitly. PostgreSQL snapshots are throttled, retain liquid contracts, and remove intraday snapshot history older than 45 days by default to conserve storage; live decisions continue to use the complete current chain.

## Mobile Deployment

Recommended zero-cost starter deployment:

1. Push the code to GitHub without `.env` or `data/*.json`.
2. Keep PostgreSQL in Neon using its pooled `DATABASE_URL`.
3. In Render, create a Blueprint/Web Service from the repository; `render.yaml` builds and runs the app.
4. Configure all API keys, `DATABASE_URL` and a long random `APP_ACCESS_KEY` as Render secrets.
5. Open the generated HTTPS `onrender.com` URL on the phone; Valido 1M asks for the private access key.

Render free web services spin down after inactivity. This is suitable for secure remote access and testing, but it is not reliable continuous background monitoring. An always-on service is required for genuinely uninterrupted scanning and alerts.

Never commit `.env` or paste broker/database keys in issues or chat. Rotate any credential immediately if it is exposed.
The Render Blueprint enables `REQUIRE_ACCESS_KEY=true`; a public deployment without `APP_ACCESS_KEY` blocks all dashboard API data until the password is configured. It also declares the paid `starter` Background Worker `valido-1m-scanner`, because Render does not offer free background workers.

## Mobile Notifications

Notifications no longer use `new Notification(...)` from page JavaScript. The client registers `/sw.js` and all test/engine alerts go through `ServiceWorkerRegistration.showNotification()`.

1. Open the HTTPS Render URL on the phone and enter the private app access key.
2. From Dashboard tap `Estado alertas`, then tap `Probar notificacion movil`.
3. Android Chrome or Samsung Internet: accept permission and confirm the notification appears.
4. iPhone Safari: on iOS 16.4 or newer, first choose `Share > Add to Home Screen`, open the installed Valido 1M PWA, then tap the test button.
5. Incognito/private browsing may disable persistent permissions or service workers; test in a normal browser tab.

The status panel reports HTTPS, permission, registered Service Worker, readiness, last error and a recommended correction. HTTP addresses outside localhost intentionally report that HTTPS is required.

Local Service Worker notifications are initiated by a live dashboard refresh or the test button. Guardian Web Push can deliver alerts with the app cerrada when it is explicitly configured with VAPID, the device is subscribed and the backend scheduler is running.

### Web Push For Locked Phones

Options Guardian includes Web Push support; it is disabled until you configure its free VAPID keys on the backend:

```powershell
npx web-push generate-vapid-keys
```

Put the generated values only in Render/environment secrets:

```text
GUARDIAN_ENABLED=true
ENABLE_WEB_PUSH=true
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:your-email@example.com
```

Then redeploy, open `Guardian` from the installed/HTTPS app, tap `Activar alertas con movil bloqueado` and tap `Probar Web Push`. The browser subscription is stored server-side in PostgreSQL when available; it is never bundled into frontend source.

Android Chrome/Samsung Internet support Web Push through the registered service worker after permission is granted. On iPhone use iOS/iPadOS 16.4 or newer, add the website to Home Screen, open that installed PWA and grant notification permission there. Delivery is not guaranteed: Focus Mode, battery restrictions, revoked permissions and hosting availability can delay or prevent notifications.

Render free services can sleep after inactivity. When sleeping, the backend cannot run scheduled scans or initiate pushes until awakened. For continuous locked-phone alert monitoring, use an always-on backend plan or an external scheduler that wakes the protected service.

## Verification

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

The test suite asserts that page code contains no unsafe `new Notification(...)` constructor, verifies defined-risk payoff calculations, prevents fabricated manual probabilities, validates the Risk Governor and verifies that automatic scans do not call OpenAI.

## API Endpoints

- `GET /api/scan` returns the autonomous decision, market context, Top 5, rejected candidates and alerts.
- `POST /api/scan/refresh` clears short-lived cache and rescans.
- `GET|PUT /api/watchlist` persists the scan universe.
- `GET|PUT /api/profile` persists account risk mandate, holdings and kill switch.
- `GET /api/collection` reports snapshot and IV-history collection independent of trade approval.
- `GET|POST /api/journal` reads and records the audited decision journal.
- `GET /api/explainers` returns plain-language and institutional metric explanations.
- `GET /api/ai/status` reports optional AI availability, Gemini/OpenAI state and token budget without exposing keys.
- `GET /api/tradier/overview` returns safe production read-only and Sandbox bot status.
- `PUT /api/tradier/paper/settings` updates the server-side paper mandate.
- `POST /api/tradier/paper/run` runs one analysis/preview cycle; submission still requires the saved Sandbox auto-execution mandate.
- `POST /api/tradier/paper/orders/:id/cancel` cancels only an order already tracked in Tradier Sandbox.
- `POST /api/tradier/live/preview` validates only a current server-side `READY_GREEN` ticket with `preview=true`; it never submits a live order.
- `POST /api/ai/explain` requests a manual explanation; if Gemini/OpenAI are missing or rate-limited, it returns deterministic tutor guidance instead of blocking.
- `POST /api/ai/test-gemini` validates the Gemini connection without exposing `GEMINI_API_KEY`.
- `GET|PUT /api/guardian/settings`, `GET /api/guardian/status`, `GET /api/guardian/events`, `GET /api/guardian/learning` and `POST /api/guardian/run` expose Guardian through the same private access middleware.
- `POST /api/guardian/events/:id/feedback` stores review feedback for deterministic learning.
- `GET /api/push/public-key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe` and `POST /api/push/test` configure or validate protected Web Push delivery.

## Known Limits

- VAPID Web Push is implemented, but requires backend VAPID secrets, HTTPS, permission and an awake backend scheduler; FCM remains an optional disabled placeholder.
- Tape Reading is Lite until a time-and-sales/Level 2 source is connected.
- Options Flow Lite and GEX are educational chain-derived context, not confirmed institutional flow or dealer books.
- Replay accepts manual checkpoints until intraday historical replay endpoints are added.

Valido 1M is a planning, filtering and educational system; it does not transmit brokerage orders or replace brokerage confirmation or personalized financial advice.
