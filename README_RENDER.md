# Deploy en Render - VALIDO 1M OS

Usa Render como **Node Web Service** porque esta app necesita backend Express para `/api/scan`, `/api/health`, Guardian, Web Push y proxy seguro de proveedores.

## Variables De Entorno

Configura estas variables en Render Dashboard > Service > Environment. No pongas valores reales en GitHub.

```env
NODE_ENV=production
APP_ENV=production
HOST=0.0.0.0
PORT=10000
APP_ACCESS_KEY=
REQUIRE_ACCESS_KEY=true
SESSION_SECRET=

DATABASE_URL=
DATABASE_SSL=true

TRADIER_ACCESS_TOKEN=
TRADIER_TOKEN=
TRADIER_BASE_URL=https://api.tradier.com/v1
TRADIER_ACCOUNT_ID=
TRADIER_SANDBOX=false

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
AI_PRIMARY_PROVIDER=gemini
AI_AUTO_TUTOR=true
AI_AUTO_SIGNAL_DECISION=false
AI_AUTO_NARRATIVE=false
AI_MANUAL_EXPLAIN=true
AI_DAILY_TOKEN_BUDGET=30000
AI_DAILY_REQUEST_BUDGET=8
AI_MAX_INPUT_TOKENS_PER_CALL=2200
AI_MAX_OUTPUT_TOKENS_PER_CALL=650
AI_MIN_AUTOMATIC_CALL_INTERVAL_MINUTES=60
AI_COOLDOWN_AFTER_429_MINUTES=120
AI_DISABLE_AUTO_AT_USAGE_PERCENT=75
AI_DISABLE_ALL_AT_USAGE_PERCENT=95

ENABLE_OPENAI=false
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_MANUAL_ONLY=true

ALPHA_VANTAGE_API_KEY=
FINNHUB_API_KEY=
FMP_API_KEY=
POLYGON_API_KEY=
BENZINGA_API_KEY=
ENABLE_YAHOO_PROVIDER=true

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:TU_EMAIL_AQUI
PUSH_ENABLED=true
ENABLE_WEB_PUSH=true
PUSH_MAX_DAILY_SIGNALS=5
PUSH_SYMBOL_COOLDOWN_MINUTES=30

SCANNER_ENABLED=true
SCANNER_CORE_INTERVAL_MINUTES=5
SCANNER_STOCK_INTERVAL_MINUTES=10
SCANNER_AFTER_HOURS_INTERVAL_MINUTES=45

DEFAULT_RISK_MODE=MODERATE_AGGRESSIVE
MIN_POP_CREDIT_SPREAD=0.70
MAX_DAILY_SIGNALS=5
MAX_RISK_PER_TRADE_PCT=0.02
MAX_PORTFOLIO_RISK_PCT=0.06

PUBLIC_BASE_URL=https://TU_APP_RENDER.onrender.com
CLIENT_ORIGIN=https://TU_APP_RENDER.onrender.com
APP_BASE_URL=https://TU_APP_RENDER.onrender.com
```

## Pasos

1. Sube el repo privado a GitHub.
2. En Render crea un **Blueprint** desde `render.yaml` o un **Web Service** manual.
3. Build command: `npm install && npm run build`.
4. Start command: `npm start`.
5. Health check path: `/api/health`.
6. Pega las variables.
7. Manual Deploy > **Clear build cache & deploy**.
8. Abre `/api/health` y confirma `ok: true`, `providers.yahoo: "enabled"`, `providers.gemini` y `providers.openai: "manual_only"`.

## Seguridad

- Nunca subas `.env`.
- No uses variables `VITE_*` para tokens privados.
- `TRADIER_ACCESS_TOKEN`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL` y VAPID private key viven solo en Render.
- La app no ejecuta ordenes reales.
- AI explica; no calcula trades.
