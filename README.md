# Valido 1M - Institutional Options Decision Assistant

Valido 1M is a semiautonomous scanner and learning assistant for defined-risk, high-probability option income structures. It is designed for a trader who cannot monitor positions continuously: the engine filters first and displays a complete reviewable plan only after mandatory data and risk gates pass.

## Architecture

- `institutional-os.html` is the Vite entry for the React dashboard.
- `src/` contains the React/Tailwind/Recharts client.
- `server/engine/` contains regime, technical, GEX, strategy, score, and approval logic.
- `server/providers/` contains Tradier, Finnhub, Polygon, FMP, Benzinga, and OpenAI adapters.
- `server/db/` contains the PostgreSQL repository and production schema.
- `src/features/options-simulator/` contains pure payoff/Greek/scenario calculations and the embedded Options Strategy Lab.
- `src/services/notifications.js` and `public/sw.js` implement mobile-safe PWA notifications.
- `data/` is a local development fallback for watchlists, snapshots, journal, alerts, risk mandate, and IV observations.
- The Express scheduler continues rescanning on the configured interval while the server is running, even when the browser tab is closed.
- The default watchlist includes `SPY`, `SPX`, `QQQ`, `IWM`, `DIA`, Magnificent 7 and the focused equity `SOFI`.
- `XSP` and `NDX` can be added to the watchlist when the selected broker/data plan supports their chains.

## Live Provider Coverage

| Need | Provider Adapter | Required for executable shortlist |
| --- | --- | --- |
| Quotes, history, option chains, Greeks, IV, OI | Tradier or Polygon | Yes |
| Macro calendar and earnings | Finnhub or FMP | Yes |
| Breaking market news | Finnhub | Yes |
| Unusual options activity and block trades | Benzinga | Optional; adds flow confidence |
| Contextual narrative | OpenAI | Optional; never creates prices or trades |
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
- Approval requires an institutional confidence score of at least `75/100`; data collection continues under `NO TRADE`.
- Under `NO TRADE`, the dashboard may show bullish, bearish and neutral `PAPER / CONDICIONAL` structures from a valid real chain with explicit activation gates; these are not approved trades.
- Collateral used at or above 80%, daily loss stop or weekly loss stop switches new recommendations to educational/paper review.

## Options Strategy Lab

The same dashboard includes a modular simulator for manual structures and scanner-loaded strategies. It computes expiration payoff, estimated max risk/profit, break-even, net Greeks, delta-based estimated probability and basic ATR/IV/theta scenarios. Lines labeled `estimated` use constant-Greek assumptions, while payoff at expiration is contractual from the entered legs and premiums.

Naked calls and unprotected short puts are blocked by validation unless the put is explicitly a cash-secured structure. Calendar, diagonal and PMCC structures remain educational simulations because exact pre-expiration valuation needs per-leg expiration surfaces and a volatility model.

## Setup

```powershell
Copy-Item .env.example .env
# Add server-side provider credentials and optionally DATABASE_URL to .env.
# For a public deployment also add a long APP_ACCESS_KEY.
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

For PostgreSQL persistence, set `DATABASE_URL` in `.env`; the application creates `iv_history`, `options_snapshots`, `trade_journal`, and `app_settings` (watchlist/risk mandate) from `server/db/schema.sql` on first use. Without it, the dashboard identifies the local fallback explicitly. PostgreSQL snapshots are throttled, retain liquid contracts, and remove intraday snapshot history older than 45 days by default to conserve storage; live decisions continue to use the complete current chain.

## Mobile Deployment

Recommended zero-cost starter deployment:

1. Push the code to GitHub without `.env` or `data/*.json`.
2. Keep PostgreSQL in Neon using its pooled `DATABASE_URL`.
3. In Render, create a Blueprint/Web Service from the repository; `render.yaml` builds and runs the app.
4. Configure all API keys, `DATABASE_URL` and a long random `APP_ACCESS_KEY` as Render secrets.
5. Open the generated HTTPS `onrender.com` URL on the phone; Valido 1M asks for the private access key.

Render free web services spin down after inactivity. This is suitable for secure remote access and testing, but it is not reliable continuous background monitoring. An always-on service is required for genuinely uninterrupted scanning and alerts.

Never commit `.env` or paste broker/database keys in issues or chat. Rotate any credential immediately if it is exposed.
The Render Blueprint enables `REQUIRE_ACCESS_KEY=true`; a public deployment without `APP_ACCESS_KEY` blocks all dashboard API data until the password is configured.

## Mobile Notifications

Notifications no longer use `new Notification(...)` from page JavaScript. The client registers `/sw.js` and all test/engine alerts go through `ServiceWorkerRegistration.showNotification()`.

1. Open the HTTPS Render URL on the phone and enter the private app access key.
2. Go to `Config` in the mobile bottom navigation and tap `Probar notificacion movil`.
3. Android Chrome or Samsung Internet: accept permission and confirm the notification appears.
4. iPhone Safari: on iOS 16.4 or newer, first choose `Share > Add to Home Screen`, open the installed Valido 1M PWA, then tap the test button.
5. Incognito/private browsing may disable persistent permissions or service workers; test in a normal browser tab.

The status panel reports HTTPS, permission, registered Service Worker, readiness, last error and a recommended correction. HTTP addresses outside localhost intentionally report that HTTPS is required.

Current notifications are local Service Worker notifications initiated by a live dashboard refresh or the test button. Receiving alerts while the app is completely closed is a separate Web Push feature and requires server-side subscriptions and VAPID secrets; it is intentionally not presented as active yet.

## Verification

```powershell
npm.cmd test
npm.cmd run build
```

The test suite asserts that page code contains no unsafe `new Notification(...)` constructor and verifies defined-risk payoff calculations for the simulator.

## API Endpoints

- `GET /api/scan` returns the autonomous decision, market context, Top 5, rejected candidates and alerts.
- `POST /api/scan/refresh` clears short-lived cache and rescans.
- `GET|PUT /api/watchlist` persists the scan universe.
- `GET|PUT /api/profile` persists account risk mandate, holdings and kill switch.
- `GET /api/collection` reports snapshot and IV-history collection independent of trade approval.
- `GET|POST /api/journal` reads and records the audited decision journal.
- `GET /api/explainers` returns plain-language and institutional metric explanations.

Valido 1M is a planning, filtering and educational system; it does not transmit brokerage orders or replace brokerage confirmation or personalized financial advice.
