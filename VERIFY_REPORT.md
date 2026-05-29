# VALIDO 1M / Institutional Options OS - Production Verification

Generated: 2026-05-28

## Executive Status

READY_FOR_RENDER=true

The app builds, lint passes, tests pass, and the local production server responds on the required diagnostic routes. No secrets are printed in this report.

## Modules

| Module | Status | Notes |
| --- | --- | --- |
| Build | PASS | `npm run build` completed successfully. |
| Lint | PASS | `npm run lint` completed successfully. |
| Tests | PASS | `npm test` completed successfully, 46 tests passing. |
| Notifications | PASS | Tests assert no unsafe page `new Notification()` constructor; Service Worker uses `showNotification`. |
| Chart hover/tooltip | PASS | Recharts tooltip/cursor theme now uses controlled CSS variables and soft overlay. |
| Gemini/Sigma Guardian | PASS | Gatekeeper requires structured JSON, `APPROVE`, `entry_ok`, no macro/news warning, no manual review, and hallucination check `PASSED`. |
| Scanner cadence | PASS | `AUTO_REFRESH_SECONDS=300`; local `/api/health` returned `refreshSeconds: 300`. |
| Macro/Fed guard | PASS | `/api/macro/guard` returned guard state without secrets. |
| News/Geopolitical guard | PASS | `/api/news/guard` returned guard state without secrets. |
| Web Push | PASS | `/api/push/test` supports dry-run without sending notification. |
| Advanced strategies | PASS | Broken Wing Iron Condor is no longer generated as a main scanner opportunity. It remains available only in advanced/simulator/education code. |
| Risk mandate | PASS | Code and docs default to 1% risk per trade, 2% max daily loss, 5% max weekly loss. |

## Commands Executed

```bash
npm install
npm run lint
npm test
npm run build
node --check server/index.js
node --check server/ai/provider-router.js
node --check server/ai/gemini-guardian-gate.js
node --check server/engine/scoring.js
node --check server/engine/scanner.js
```

## Local Production Endpoint Smoke Test

Local production server was started temporarily on `127.0.0.1:8790` and then stopped.

Results:

```json
{
  "health": {
    "ok": true,
    "agent": "Gemini Guardian",
    "aiMode": "gemini_guardian_gatekeeper",
    "refreshSeconds": 300,
    "webPushConfigured": true,
    "dbConfigured": true,
    "dbSsl": true
  },
  "agent": {
    "state": "ACTIVE",
    "decision": "CAUTION",
    "mode": "gemini_guardian_gatekeeper",
    "autoDecision": true
  },
  "macro": {
    "status": "clear",
    "fed": "clear",
    "highImpact": 0,
    "soft": 0
  },
  "news": {
    "status": "clear",
    "geo": "clear",
    "risks": 0
  },
  "verify": {
    "ok": true,
    "dryRun": true,
    "aiCalled": false,
    "agent": "SIGMA_GUARDIAN",
    "decision": "NO_TRADE"
  },
  "push": {
    "ok": true,
    "dryRun": true,
    "sent": false
  }
}
```

## Routes Verified

- `GET /api/health`
- `GET /api/agent/status`
- `GET /api/macro/guard`
- `GET /api/news/guard`
- `POST /api/agent/verify-signal` with `dryRun=true`
- `POST /api/push/test` with `dryRun=true`
- `GET /api/scan`
- `POST /api/scan`

## Render Variables

No real values are included here. Required/important variables remain documented in `.env.example` and `README_RENDER.md`.

Key production flags:

- `AUTO_REFRESH_SECONDS=300`
- `AGENT_ENABLED=true`
- `AGENT_MODE=gatekeeper`
- `AGENT_AUTO_VERIFY_SIGNALS=true`
- `AGENT_REQUIRE_STRUCTURED_JSON=true`
- `AI_AUTO_SIGNAL_DECISION=true`
- `REAL_SIGNALS_ONLY=true`
- `SIGNAL_MIN_SCORE=82`
- `SIGNAL_MIN_POP=0.70`
- `SIGNAL_REQUIRE_AI_CONFIRMATION=true`
- `HIDE_PREMIUM_FEEDS_IF_UNCONFIGURED=true`
- `RISK_PER_TRADE_PCT=1`
- `MAX_DAILY_LOSS_PCT=2`
- `MAX_WEEKLY_LOSS_PCT=5`

## Manual QA Still Recommended

1. Open the deployed PWA on Android Chrome and confirm the first screen shows Gemini/Sigma Guardian, top decision, and real signals/no-trade explanation.
2. Hover charts on desktop: sector rotation, GEX, IV heatmap, simulator payoff. The chart should not turn black.
3. Tap “Escanear ahora” and confirm loading state, no duplicate alerts, and refresh countdown resets.
4. Test “Probar notificación” from the UI after allowing notification permissions.
5. Confirm a real broker chain before any paper or real decision; never trust stale bid/ask.
6. Confirm Render environment values visually, especially if the dashboard still contains older variables.

## Known Limitations

- Gemini approval consumes provider budget only when a candidate reaches the configured verification threshold.
- If Gemini is unavailable, 429, or returns invalid JSON, candidates remain manual review / no real push.
- Local browser visual QA was blocked by private access state in the in-app browser, but the CSS and route smoke tests passed. Re-test the deployed UI after Render deploy.
- This system does not execute trades and does not guarantee profitability.
