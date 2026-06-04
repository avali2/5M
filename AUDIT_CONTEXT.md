# AUDIT_CONTEXT.md

## Proyecto

Repositorio: `valido-1m-options-assistant` / VALIDO 1M.

Objetivo de esta exportacion: preparar una auditoria externa sin modificar funcionalidad para investigar ausencia de senales verdes, inestabilidad del scanner en segundo plano, dependencia de alertas del frontend, fallos de Gemini/Polygon/API y calibracion restrictiva.

## Stack usado

- Frontend: React 19, Vite 7, Tailwind CSS, Recharts, Motion.
- Backend: Node.js ESM, Express 5, Helmet, CORS.
- Datos/estado: repositorio local en `data/` por defecto, PostgreSQL opcional via `DATABASE_URL`.
- Jobs/scan: timers Node.js (`setInterval`/`setTimeout`) dentro del proceso Express; no se encontro cron externo dedicado.
- Notificaciones: Web Push/VAPID con `web-push`, service worker en `public/sw.js`, cliente PWA en React.
- Tests: `node --test tests/*.test.js`.

Nota estructural: no hay `app/`, `components/` ni `lib/` en raiz estilo Next.js. La app vive principalmente en `src/`, con backend en `server/`.

## Rutas API existentes

Servidor principal: `server/index.js`.

- `GET /api/health`
- `GET /api/agent/status`
- `GET /api/macro/guard`
- `GET /api/news/guard`
- `POST /api/agent/scan`
- `POST /api/agent/verify-signal`
- `GET /api/signals`
- `POST /api/signals/:id/explain`
- `GET /api/scan`
- `POST /api/scan`
- `POST /api/scan/refresh`
- `GET /api/watchlist`
- `PUT /api/watchlist`
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/explainers`
- `GET /api/ai/status`
- `POST /api/ai/explain`
- `POST /api/ai/test-gemini`
- `GET /api/collection`
- `GET /api/journal`
- `POST /api/journal`
- `GET /api/status`
- `GET /api/doctor`
- `GET /api/debug/env`
- `GET /api/ping`
- `GET /api/market/sentiment`
- `GET /api/market-sentiment`
- `GET /api/sentiment`
- `GET /api/debug/providers`
- `GET /api/debug/polygon`
- `POST /api/refresh`

Routers montados:

- `server/guardianRoutes.js` en `/api/guardian`: `GET /status`, `GET /events`, `GET /settings`, `PUT /settings`, `GET /learning`, `POST /run`, `GET /yahoo`, `GET /scan`, `POST /events/:id/feedback`.
- `server/guardianRoutes.js` en `/api/push`: `GET /public-key`, `POST /subscribe`, `POST /unsubscribe`, `POST /test`, `POST /guardian-alert`.
- `server/routes/positionsRoutes.js` en `/api/positions`: `POST /analyze`, `GET /`, `POST /`, `PUT /:id`, `GET /:id/analysis`.
- `server/geminiAssistant.js` en `/api/gemini`: `GET /daily-summary`, `GET /quota-status`, `GET /daily-lesson`.

Servidor legacy/paralelo: `server/index.mjs`.

- Expone otro set de rutas (`/api/guardian/scan`, `/api/scheduler/start`, etc.) y usa `server/institutional-engine.mjs`.
- `package.json` usa `server/index.js`, por lo que `index.mjs` parece legacy o alternativa no activa.

## Archivos responsables del scanner

- `server/engine/scanner.js`: scanner autonomo principal (`runAutonomousScan`), seleccion de simbolos, gates globales, creacion de oportunidades/rechazados/ideas condicionales.
- `server/services/scheduler.js`: `ScanScheduler`, cache de ultimo scan, timer backend por `settings.refreshSeconds`.
- `server/autonomousSignalWorker.js`: worker backend adicional con ciclo cada 60s, decide cuando correr scan, revisar noticias y enviar push.
- `server/guardianScheduler.js`: scheduler Guardian con `setTimeout` persistente mientras vive el proceso Node.
- `server/scheduler/autonomousWorker.js`: scheduler legacy de `server/index.mjs`, intervalo de 3 minutos.
- `src/AppPro.jsx`: polling frontend cada 60s contra `/api/scan`; puede dar sensacion de scanner dependiente del navegador aunque existe backend.
- `src/features/options-guardian-agent/agentScheduler.js`: scheduler del Guardian en frontend con `window.setTimeout`.

## Archivos responsables de estrategia/senales

- `server/engine/scanner.js`: decide `opportunities`, `rejected`, `conditionalIdeas`.
- `server/engine/scoring.js`: calcula `scoreSetup` y `classifySignal`.
- `server/engine/strategies.js`: genera estructuras definidas, CSP, covered calls y debit spreads.
- `server/engine/risk-governor.js`: bloqueos de riesgo real y clasificacion de riesgo.
- `server/engine/probability-edge.js`: POP/edge y faltantes de datos.
- `server/guardian/edge-tickets.js`: clasificaciones `EDGE_READY`, `AGGRESSIVE_EDGE`, `TRADE_CANDIDATE`, `WAIT_TRIGGER`, etc.
- `server/strategy-suite.js`, `server/engine/ticket-creator.js`, `server/institutional-engine.mjs`: motor legacy/institucional alternativo con estados `READY`, `AGGRESSIVE`, `CANDIDATE`, `ENTRAR_AHORA`, etc.
- `src/utils/signalFilters.ts`, `src/utils/proSignalAdapter.js`, `src/components/SignalCard.*`, `src/features/pro-signals/ProSignals.jsx`: adaptacion y visualizacion frontend.

## Archivos responsables de Gemini Guardian

- `server/ai/gemini-guardian-gate.js`: gate automatico de senales por IA; si `SIGNAL_REQUIRE_AI_CONFIRMATION=true`, mueve oportunidades a rechazadas si no hay aprobacion estructurada.
- `server/ai/provider-router.js`: router Gemini/OpenAI/deterministico, presupuesto, cooldown, fallback.
- `server/providers/gemini.js`: cliente Gemini.
- `server/lib/geminiJson.js`: helper Gemini JSON usado por rutas puntuales.
- `server/geminiAssistant.js`: endpoints de resumen/leccion/cuota.
- `src/services/geminiGuardian.ts`, `src/services/geminiService.js`, `src/services/geminiSignalCoach.ts`, `src/components/GeminiGuardianCommandCenter.jsx`, `src/components/GeminiAssistant.jsx`: componentes/servicios frontend.

## Archivos responsables de notificaciones/service worker

- `server/push.js`: `GuardianPushService`, envia Web Push con VAPID.
- `server/pushStore.js`: persistencia de suscripciones.
- `server/guardianRoutes.js`: rutas `/api/push/*`.
- `server/autonomousSignalWorker.js`: envia push server-side cuando hay oportunidad o riesgo critico.
- `server/guardianScheduler.js`: envia eventos Guardian via `pushService.sendGuardianEvent`.
- `public/sw.js`: recibe `push`, muestra notificacion y maneja clicks.
- `src/services/notifications.js`, `src/services/pushNotificationService.js`, `src/features/options-guardian-agent/webPushClient.js`, `src/components/NotificationManager.jsx`, `src/features/notifications/NotificationCenter.jsx`: registro, permiso, suscripcion y pruebas desde frontend.
- `src/features/options-guardian-agent/agentNotifications.js`: notificaciones locales frontend.

## Archivos responsables de proveedores de datos

- `server/providers/index.js`: selecciona proveedores activos.
- `server/providers/tradier.js`: quotes, history, expirations, option chain, greeks.
- `server/providers/polygon.js`: quotes, history, expirations, option chain snapshots, greeks/OI.
- `server/providers/yahoo.js`: fallback de quotes, history, option chain y noticias; aproxima Greeks cuando Yahoo no entrega.
- `server/providers/finnhub.js`: calendario economico, earnings, noticias, insider transactions.
- `server/providers/fmp.js`: calendario economico y earnings fallback.
- `server/providers/benzinga.js`: unusual options/block trades.
- `server/providers/alphaVantage.js`: news/macro fallback.
- `server/engine/tradier-api.js`, `server/engine/tape-polygon.js`: clientes legacy/directos.
- `server/engine/market-intelligence.js`, `server/engine/data-health.js`: consolidacion de mercado, macro, data health.

## Variables de entorno necesarias

Solo nombres, sin valores:

- `PORT`, `HOST`, `NODE_ENV`, `RENDER`, `RENDER_SERVICE_ID`, `PUBLIC_BASE_URL`, `CLIENT_ORIGIN`
- `APP_ACCESS_KEY`, `REQUIRE_ACCESS_KEY`
- `TRADIER_TOKEN`, `TRADIER_ACCESS_TOKEN`, `TRADIER_BASE_URL`, `TRADIER_ACCOUNT_ID`, `TRADIER_SANDBOX`
- `POLYGON_API_KEY`
- `ENABLE_YAHOO_PROVIDER`
- `FINNHUB_API_KEY`, `FMP_API_KEY`, `BENZINGA_API_KEY`, `ALPHA_VANTAGE_API_KEY`
- `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_MODEL`, `ENABLE_GEMINI`
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `ENABLE_OPENAI`, `ENABLE_AI_ASSISTANT`, `OPENAI_MANUAL_ONLY`
- `AI_PRIMARY_PROVIDER`, `AI_AUTO_TUTOR`, `AI_AUTO_SIGNAL_DECISION`, `AI_AUTO_NARRATIVE`, `AI_MANUAL_EXPLAIN`, `AI_FALLBACK_TO_DETERMINISTIC`
- `AI_DAILY_CALL_LIMIT`, `AI_DAILY_REQUEST_BUDGET`, `AI_DAILY_TOKEN_BUDGET`, `AI_MAX_INPUT_TOKENS_PER_CALL`, `AI_MAX_OUTPUT_TOKENS_PER_CALL`, `AI_MAX_TOTAL_TOKENS_PER_CALL`, `AI_MIN_AUTOMATIC_CALL_INTERVAL_MINUTES`, `AI_COOLDOWN_AFTER_429_MINUTES`, `AI_DISABLE_AUTO_AT_USAGE_PERCENT`, `AI_DISABLE_ALL_AT_USAGE_PERCENT`
- `GUARDIAN_ENABLED`, `AGENT_ENABLED`, `AGENT_NAME`, `AGENT_MODE`, `AGENT_REFRESH_INTERVAL_MINUTES`, `AGENT_MANUAL_SCAN_ENABLED`, `AGENT_AUTO_VERIFY_SIGNALS`, `AGENT_VERIFY_MIN_SCORE`, `AGENT_CREDIT_REVIEW_MIN_SCORE`, `AGENT_REVIEW_TOP_N`, `AGENT_CACHE_TTL_MINUTES`, `AGENT_MAX_AI_VERIFICATIONS_PER_DAY`, `AGENT_MINUTES_BETWEEN_AI_CALLS`, `AGENT_DISABLE_AI_AT_USAGE_PERCENT`, `AGENT_FAILSAFE_DETERMINISTIC`, `AGENT_REQUIRE_STRUCTURED_JSON`
- `REAL_SIGNALS_ONLY`, `SIGNAL_MIN_SCORE`, `MIN_SCORE`, `SIGNAL_MIN_POP`, `MIN_PROBABILITY`, `SIGNAL_REQUIRE_RISK_APPROVAL`, `SIGNAL_REQUIRE_MACRO_CLEARANCE`, `SIGNAL_REQUIRE_NEWS_CLEARANCE`, `SIGNAL_REQUIRE_AI_CONFIRMATION`, `SIGNAL_MAX_PER_DAY`
- `SIGNAL_MIN_TARGET_PROFIT`, `MIN_POP_TO_NOTIFY`, `MIN_EDGE_SCORE`, `MIN_AGGRESSIVE_SCORE`, `MIN_CANDIDATE_SCORE`, `ALLOW_CAPITAL_HEAVY_ALERTS`, `ALLOW_VERY_AGGRESSIVE`, `ALLOW_0DTE`, `ALLOW_1DTE_APPROVAL`, `ALLOW_EARNINGS`, `ALLOW_MARGIN`
- `MACRO_GUARD_ENABLED`, `NEWS_GUARD_ENABLED`, `GEOPOLITICAL_GUARD_ENABLED`, `FED_GUARD_ENABLED`, `EARNINGS_GUARD_ENABLED`, `HIGH_IMPACT_EVENT_BLACKOUT_HOURS`, `MEDIUM_IMPACT_EVENT_CAUTION_HOURS`, `NEWS_LOOKBACK_HOURS`, `NEWS_CAUTION_SCORE`, `NEWS_BLOCK_SCORE`, `FED_EVENT_CAUTION_HOURS`, `WAR_NEWS_BLOCK_ENABLED`, `ALLOW_UNVERIFIED_MACRO_WHEN_FEEDS_MISSING`, `ALLOW_UNVERIFIED_NEWS_WHEN_FEEDS_MISSING`
- `PUSH_ENABLED`, `ENABLE_WEB_PUSH`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ENABLE_FCM`, `FCM_SERVER_KEY`, `PUSH_MAX_DAILY_SIGNALS`, `PUSH_SYMBOL_COOLDOWN_MINUTES`, `PUSH_REAL_SIGNALS_ONLY`, `PUSH_BLOCK_ON_MACRO_CAUTION`, `PUSH_BLOCK_ON_NEWS_CAUTION`, `PUSH_INCLUDE_REASON_SUMMARY`, `PUSH_MAX_ALERTS_PER_HOUR`
- `DATABASE_URL`, `DATABASE_SSL`, `SIGMA_DATA_DIR`, `SNAPSHOT_INTERVAL_MINUTES`, `MAX_SNAPSHOT_CONTRACTS`, `SNAPSHOT_RETENTION_DAYS`
- `ACCOUNT_SIZE`, `RISK_PER_TRADE_PCT`, `MAX_RISK_PCT`, `MAX_COLLATERAL_PCT`, `MAX_DAILY_LOSS_PCT`, `MAX_WEEKLY_LOSS_PCT`, `MAX_OPEN_TRADES`, `MIN_DTE`, `MAX_DTE`, `IV_RANK_MIN_OBSERVATIONS`, `DEFAULT_RISK_MODE`, `MIN_POP_CREDIT_SPREAD`, `MAX_PORTFOLIO_RISK_PCT`
- `WATCHLIST_CORE`, `MARKET_DATA_MODE`, `SCANNER_ENABLED`, `SCANNER_CORE_INTERVAL_MINUTES`, `SCANNER_STOCK_INTERVAL_MINUTES`, `SCANNER_AFTER_HOURS_INTERVAL_MINUTES`, `AUTO_REFRESH_SECONDS`, `SCHEDULER_ENABLED`
- `SHOW_MANUAL_REFRESH_BUTTON`, `SHOW_AGENT_PANEL`, `SHOW_UNAVAILABLE_FEEDS_AS_OPTIONAL`, `HIDE_PREMIUM_FEEDS_IF_UNCONFIGURED`, `HIDE_REJECTED_SIGNALS_BY_DEFAULT`, `DEFAULT_HOME_VIEW`, `FRIENDLY_LIGHT_THEME`, `OPTIONAL_PREMIUM_FEEDS`, `REQUIRED_FEEDS`, `IMPORTANT_FEEDS`
- `VAL on build/version vars`: `VALIDO_BUILD_VERSION`, `VITE_VALIDO_BUILD_VERSION`, `VALIDO_BUILD_TIMESTAMP`, `VITE_VALIDO_BUILD_TIMESTAMP`, `RENDER_GIT_COMMIT`, `RENDER_DEPLOY_CREATED_AT`

## Comandos

- Instalar: `npm install`
- Desarrollo full stack: `npm run dev`
- Solo API: `npm run dev:api`
- Build frontend: `npm run build`
- Produccion/API + frontend compilado: `npm start`
- Tests: `npm test`
- Lint: `npm run lint`
- Guardian Yahoo scan: `npm run guardian:scan:yahoo`
- Backtest Guardian: `npm run guardian:backtest`

## Problemas visibles encontrados sin cambiar codigo

- Existen dos stacks de backend/scanner (`server/index.js` y `server/index.mjs`) con estados y rutas parecidas; esto puede confundir despliegue, auditoria y expectativas.
- El repo no es Next.js; no existen `app/`, `components/`, `lib/` en raiz. La estructura real es `src/`, `server/`, `public/`.
- El scanner principal puede quedar sin senales reales por combinacion de gates globales, `SIGNAL_REQUIRE_AI_CONFIRMATION=true`, score minimo alto, POP minima, riesgo por cuenta pequeno, IV Rank insuficiente y dependencia de macro/news feeds.
- Hay jobs backend por timers en memoria; si el proceso duerme, reinicia o escala a varias instancias, no hay persistencia/lock robusto de job.
- El frontend tambien hace polling cada 60s y tiene scheduler/notificaciones locales, por lo que parte de la experiencia puede variar si la app esta en segundo plano.
- Polygon opcional puede lanzar errores HTTP via `requestJson`; el scanner suele capturar errores por simbolo, pero un proveedor seleccionado como principal puede degradar disponibilidad de quotes/chains.
- Gemini 429 activa cooldown/fallback deterministico; si la config exige confirmacion IA, ese fallback no equivale a aprobacion operable.
- `package.json` no incluye `next.config.mjs`; el ZIP no puede incluirlo porque no existe.
