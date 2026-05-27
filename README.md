# Valido 1M - Institutional Options Decision Assistant

Valido 1M is a semiautonomous scanner and learning assistant for defined-risk, high-probability option income structures. It is designed for a trader who cannot monitor positions continuously: the engine filters first and displays a complete reviewable plan only after mandatory data and risk gates pass.

## Architecture

- `institutional-os.html` is the Vite entry for the React dashboard.
- `src/` contains the React/Tailwind/Recharts client.
- `server/engine/` contains regime, technical, GEX, strategy, score, and approval logic.
- `server/providers/` contains Tradier, Finnhub, Polygon, FMP, Benzinga, and OpenAI adapters.
- `server/db/` contains the PostgreSQL repository and production schema.
- `data/` is a local persistence fallback for watchlists, snapshots, journal, alerts, risk mandate, and IV observations.
- The Express scheduler continues rescanning on the configured interval while the server is running, even when the browser tab is closed.
- The default watchlist includes `SPY`, `SPX`, `QQQ`, `IWM`, `DIA`, Magnificent 7 and the focused equity `SOFI`.

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

## Safety Policy

- No sliders or manual inputs exist for VIX, IV, trend, gamma, earnings, or macro events.
- Missing essential providers produces `NO TRADE - DATA PROVIDERS REQUIRED`.
- Work mode considers defined-risk spreads, cash-secured puts only when collateral fits, and covered calls only for recorded share holdings. The `SOFI Options Desk` explains CSP, bull put spreads, covered calls and Wheel without upgrading a rejected setup into a signal.
- The scanner collects and evaluates 0DTE/1DTE index condors; 0DTE is collection-only in work mode and 1DTE requires explicit mandate approval.
- Earnings before expiry, high-impact events, extreme VIX, negative gamma proxy, poor liquidity, insufficient IV history, flow conflict, or excess max loss block a setup.
- IV Rank is based on persisted real-IV observations and stays blocked while its history window is incomplete.
- Approval requires an institutional confidence score of at least `75/100`; data collection continues under `NO TRADE`.

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

For PostgreSQL persistence, set `DATABASE_URL` in `.env`; the application creates `iv_history`, `options_snapshots`, and `trade_journal` from `server/db/schema.sql` on first use. Without it, the dashboard identifies the local fallback explicitly. PostgreSQL snapshots are throttled, retain liquid contracts, and remove intraday snapshot history older than 45 days by default to conserve storage; live decisions continue to use the complete current chain.

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

## API Endpoints

- `GET /api/scan` returns the autonomous decision, market context, Top 5, rejected candidates and alerts.
- `POST /api/scan/refresh` clears short-lived cache and rescans.
- `GET|PUT /api/watchlist` persists the scan universe.
- `GET|PUT /api/profile` persists account risk mandate, holdings and kill switch.
- `GET /api/collection` reports snapshot and IV-history collection independent of trade approval.
- `GET|POST /api/journal` reads and records the audited decision journal.
- `GET /api/explainers` returns plain-language and institutional metric explanations.

Valido 1M is a planning, filtering and educational system; it does not transmit brokerage orders or replace brokerage confirmation or personalized financial advice.
