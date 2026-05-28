# VALIDO 1M Production Deployment

Recommended host: Render Web Service.

Why Render:
- This project is a full-stack Node app.
- `npm run build` creates the Vite frontend in `dist/`.
- `npm start` runs the Express backend and serves both `dist/` and `/api/*`.
- The app needs HTTPS for PWA service workers and mobile notifications.

## Required Render Settings

Use the included `render.yaml` or create a Web Service manually:

- Runtime: Node
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

## Required Environment Variables

Set these in Render secrets, never in frontend code:

```env
NODE_ENV=production
HOST=0.0.0.0
APP_ACCESS_KEY=use-a-long-private-password
REQUIRE_ACCESS_KEY=true
PUBLIC_BASE_URL=https://your-render-url.onrender.com
CLIENT_ORIGIN=https://your-render-url.onrender.com
ENABLE_YAHOO_PROVIDER=true
TRADIER_TOKEN=
TRADIER_BASE_URL=https://api.tradier.com/v1
FINNHUB_API_KEY=
DATABASE_URL=
DATABASE_SSL=true
ENABLE_AI_ASSISTANT=false
OPENAI_API_KEY=
OPENAI_MODEL=
ENABLE_WEB_PUSH=false
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:tu-email@example.com
```

Yahoo Finance uses `yahoo-finance2` and does not require an API key.

## After Deploy

Open:

- `/api/health`
- `/institutional-os.html`
- `/api/scan`

Expected:

- `ok: true`
- `app: "VALIDO 1M"`
- `providers.yahoo: "enabled"`
- `providers.openai: "manual_only"`
- `guardianStatus` available in `/api/scan`
- No `FAIL-CLOSED`
- No `HOY NO HAY VENTAJAS`

## Mobile PWA Cache Reset

After a production deploy, if Android still shows old UI:

1. Open Chrome.
2. Go to the deployed VALIDO 1M URL.
3. Tap the lock icon / site settings.
4. Clear site data.
5. Remove the old installed PWA icon from the home screen.
6. Reopen the HTTPS URL.
7. Install the PWA again from Chrome menu: Add to Home screen / Install app.
8. Open the PWA and check the footer build label `VALIDO_BUILD_VERSION`.

For iPhone Safari:

1. Delete the old Home Screen app.
2. Safari Settings > Advanced > Website Data > remove the site data if needed.
3. Reopen the HTTPS URL in Safari.
4. Share > Add to Home Screen again.

## Notes

- Do not deploy `.env`.
- Do not expose API keys in Vite `VITE_*` variables.
- OpenAI is optional and manual-only.
- The app does not execute real orders.
- The scanner uses deterministic calculations and fails closed when critical market data is missing.
