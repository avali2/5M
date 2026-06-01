# 🧠 PROJECT AUDIT FOR CHATGPT — VALIDO 1M v4.0

---

## 1. Resumen ejecutivo

**VALIDO 1M** es una plataforma de señales de opciones financieras con React + Vite + Express + Gemini AI. Escanea datos de mercado vía Tradier API, calcula credit spreads, debit spreads, iron condors y más, y usa Google Gemini 2.5 Flash como auditor de señales.

### ¿Qué funciona?

- ✅ Build de frontend (Vite): `npm run build` pasa con **0 errores**, 46 módulos
- ✅ Backend Express arranca correctamente en Render
- ✅ Rutas API existen: `/api/health`, `/api/status`, `/api/gemini/daily-summary`, `/api/positions`, `/api/push/subscribe`
- ✅ Service Worker registrado (`public/sw.js`)
- ✅ Motor cuantitativo modularizado (12 archivos en `server/engine/`)
- ✅ Session clock, earnings calendar, entry/exit timing engines
- ✅ Catálogo de 23 estrategias con permisos REAL_SIGNAL/WATCHLIST_ONLY/BLOCKED

### ¿Qué está roto?

- ❌ **Sin TRADIER_TOKEN en Render**: el escáner falla con errors de conexión, SystemStatus muestra todo ⚫
- ❌ **Sin VITE_GEMINI_API_KEY en Render**: Gemini no puede auditar, `/api/gemini/daily-summary` devuelve 401
- ❌ **MarketSentiment crash**: cuando el scanner devuelve 401/503, el JSX intenta acceder a `sentiment.overall` que es null
- ❌ **SystemStatus en posición incorrecta**: aparece arriba cuando debería estar al final
- ❌ **Navegación inferior**: las pestañas no cambian correctamente el contenido en algunos casos
- ❌ **Render ejecuta `server/index.js`** (el viejo entry point), NO `server/index.mjs` — las rutas nuevas solo estaban en `index.mjs`
- ❌ **Sin datos de earnings reales**: earningsCalendar.js usa MOCK data
- ❌ **Sin datos de IV históricos**: iv-history.json no tiene datos poblados
- ❌ **Sin PostgreSQL**: DATABASE_URL no configurado en Render

---

## 2. Stack detectado

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | React | 19.1.1 |
| Frontend | TypeScript | 5.7 |
| Build | Vite | 7.3.3 |
| CSS | Tailwind CSS | 4.1.4 |
| Gráficos | Recharts | 3.1.2 |
| Animaciones | Motion | 12.40 |
| Backend | Express | 5.1 |
| Runtime | Node.js | 22 |
| Data Provider | Tradier API | v1 |
| Tape Provider | Polygon.io | v3 |
| AI | Google Gemini 2.5 Flash | content generation |
| Push | Web Push API + VAPID | — |
| Service Worker | `public/sw.js` | — |
| DB | PostgreSQL (opcional) + SQLite fallback | — |
| Hosting | Render | free tier |

### Dependencias clave (`package.json`)

```json
{
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
    "@vitejs/plugin-react": "^4.4.1",
    "tailwindcss": "^4.1.4",
    "@tailwindcss/vite": "^4.1.4",
    "typescript": "~5.7.2",
    "vite": "^7.3.3"
  }
}
```

---

## 3. Árbol de archivos importante

```
2M/
├── package.json                        # Scripts + dependencias
├── vite.config.js                      # Build config
├── tailwind.config.js                  # Tailwind theme (sigma colors)
├── render.yaml                         # Render deploy config
├── .env.example                        # Variables de entorno template
├── institutional-os.html               # Vite entry HTML
│
├── server/                             # BACKEND
│   ├── index.js                        # ✅ MAIN entry point (781 líneas)
│   ├── index.mjs                       # ⚠️ Secondary entry (no usado por Render)
│   ├── status.js                       # ✅ getSystemStatus() - diagnostico APIs
│   ├── geminiAssistant.js              # ✅ /api/gemini/daily-summary
│   ├── institutional-engine.mjs        # ✅ runInstitutionalScan()
│   ├── strategy-suite.js               # ✅ buildCreditVerticals + catalog
│   ├── strategy-permissions.mjs        # ✅ enforceStrategyPermission()
│   ├── autonomousSignalWorker.js       # ✅ Background worker
│   │
│   ├── engine/                         # 12 módulos del motor
│   │   ├── math.js                     # round, clamp, mean, std
│   │   ├── technicals.js               # ema, rsi, macd, vwap, computeTechnicals
│   │   ├── wyckoff.js                  # Spring, Upthrust, SOS, SOW
│   │   ├── tape-polygon.js             # getPolygonTape, evaluateTape
│   │   ├── tradier-api.js              # getQuote, getTimesales, getOptionChain
│   │   ├── ticket-creator.js           # createTicket, classifyTicket, makeLeg
│   │   ├── strategy-builders.js        # buildCreditVerticals, IronCondors, DebitSpreads
│   │   ├── scoring.js                  # scoreSetup, classifySignal, institutionalScore
│   │   ├── iv-history.js               # updateIvHistory (PostgreSQL + JSON fallback)
│   │   ├── entryTimingEngine.js        # evaluateEntryTiming
│   │   ├── exitTimingEngine.js         # evaluateExitTiming
│   │   └── backtestSimulator.js        # simulateSignal
│   │
│   ├── lib/                            # Utilidades
│   │   ├── marketSessionClock.js        # getCurrentSession, isTradingAllowed
│   │   ├── earningsCalendar.js          # getEarningsRisk (MOCK)
│   │   ├── geminiCache.js              # Map cache TTL 10min
│   │   └── math.js
│   │
│   ├── scheduler/
│   │   └── autonomousWorker.js         # setInterval cada 3 min + push
│   │
│   ├── db/
│   │   ├── schema.sql                  # PostgreSQL tables
│   │   ├── historyRepository.js         # price, iv, earnings, closed_signals
│   │   ├── positionsRepository.js       # In-memory positions CRUD
│   │   └── repository.js               # Main DB repository
│   │
│   ├── push/
│   │   └── rateLimiter.js              # 5/hora, 12/día
│   │
│   ├── routes/
│   │   └── positionsRoutes.js          # /api/positions CRUD + Gemini analysis
│   │
│   └── front/                          # legacy
│
├── src/                                # FRONTEND
│   ├── main.jsx                        # Entry: imports AppPro + index.css + theme.css
│   ├── AppPro.jsx                      # ✅ Main app component
│   ├── index.css                       # ✅ Tailwind base + light theme
│   ├── styles/theme.css                # ✅ Component CSS (signal-card, etc.)
│   │
│   ├── components/                     # 12 componentes
│   │   ├── GeminiBriefCard.tsx         # Gemini Guardian protagonista
│   │   ├── GeminiAssistant.jsx         # Daily summaries 3x/day
│   │   ├── MarketSentiment.jsx         # ⚠️ Crash on null sentiment
│   │   ├── MarketPulseCard.jsx         # Pulso del mercado
│   │   ├── SignalCard.jsx              # Signal ticket display
│   │   ├── NewsImpactList.jsx          # ⚠️ Null-safe .map
│   │   ├── SystemStatus.jsx            # ✅ Diagnóstico APIs
│   │   ├── NotificationManager.jsx     # Push controls
│   │   ├── NotificationStatusCard.jsx  # Status display
│   │   ├── InfoTooltip.jsx             # ? tooltips
│   │   ├── LearningHub.jsx             # Mini lessons
│   │   └── HomePro.tsx                 # Legacy dashboard
│   │
│   └── config/
│       ├── marketUniverse.ts           # CORE/WATCHLIST/INDEX/SECTOR
│       └── strategyCatalog.ts          # 23 strategies
│
├── public/
│   └── sw.js                           # Service Worker push
│
├── scripts/
│   ├── downloadHistoricalData.js       # Yahoo Finance → PostgreSQL
│   └── updateEarnings.js               # Alpha Vantage → PostgreSQL
│
└── PROJECT_REPORT.md                   # Documentación completa v4.0
```

---

## 4. Scripts disponibles

```json
{
  "scripts": {
    "dev": "concurrently \"vite --host 127.0.0.1\" \"node --watch server/index.js\"",
    "dev:api": "node --watch server/index.js",
    "build": "vite build",
    "start": "node server/index.js",
    "test": "node --test tests/*.test.js",
    "lint": "eslint .",
    "guardian:scan:yahoo": "node scripts/guardianYahooScan.js",
    "guardian:backtest": "node scripts/backtestGuardian.js"
  }
}
```

---

## 5. Variables de entorno requeridas

Solo nombres — sin valores:

```
TRADIER_TOKEN
TRADIER_BASE_URL
VITE_GEMINI_API_KEY
GEMINI_API_KEY
POLYGON_API_KEY
ALPHA_VANTAGE_API_KEY
DATABASE_URL
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VITE_VAPID_PUBLIC_KEY
ACCOUNT_SIZE
MAX_RISK_PCT
MAX_COLLATERAL_PCT
SCHEDULER_ENABLED
GEMINI_CACHE_TTL_MINUTES
NODE_ENV
PORT
HOST
SESSION_SECRET
APP_ACCESS_KEY
```

---

## 6. Errores detectados

### Build: ✅ 0 errores
```
npm run build → 0 errors, 46 modules, 222 KB JS, 31 KB CSS
```

### Error #1 — MarketSentiment: Cannot read properties of null (reading 'overall')
**Archivo**: `src/components/MarketSentiment.jsx`
**Causa**: Cuando la API devuelve 401/503, `sentiment` se queda en null pero el JSX accede a `sentiment.overall`.
**Fix**: Agregar early return `if (!sentiment)` y optional chaining.

### Error #2 — Gemini API 401
**Archivo**: `server/geminiAssistant.js`
**Causa**: `VITE_GEMINI_API_KEY` no configurada en Render, o la URL de Gemini no tiene el key correctamente codificado.
**Fix**: El endpoint ahora verifica la key antes de llamar a Gemini y devuelve fallback legible.

### Error #3 — Render ejecuta server/index.js (no index.mjs)
**Causa**: `package.json` → `"start": "node server/index.js"`. Todas las rutas nuevas (`/api/status`, `/api/gemini`) se agregaron a `index.mjs`, no a `index.js`.
**Fix**: **YA CORREGIDO** en commit `f7bec88` — agregadas las rutas a `index.js`.

### Error #4 — Express 5 wildcard
**Causa**: Express 5 no soporta `app.get('*')`, necesita `app.get('/{*path}')`.
**Fix**: **YA CORREGIDO** en commit `d7fcbde`.

### Error #5 — NewsImpactList .map crash
**Causa**: Componente esperaba `events` pero a veces recibía null/undefined.
**Fix**: **YA CORREGIDO** — `const safeNews = Array.isArray(news) ? news : []`

### Error #6 — SystemStatus todos ⚫
**Causa** (esperado): Sin TRADIER_TOKEN ni VITE_GEMINI_API_KEY configurados en Render. Los servicios no pueden ser verificados. **No es un bug de código — es configuración faltante.**

---

## 7. Archivos críticos para reparar

| Prioridad | Archivo | Problema |
|-----------|---------|----------|
| **P0** | `src/components/MarketSentiment.jsx` | Crash cuando API falla (null 'overall') |
| **P0** | `server/geminiAssistant.js` | Gemini API key no detectada correctamente, fallback si falla |
| **P0** | `server/index.js` vs `server/index.mjs` | Render ejecuta index.js — asegurar que TODAS las rutas nuevas estén en index.js |
| **P1** | `server/institutional-engine.mjs` | Si Tradier no está configurado, el escáner debería dar mensaje claro |
| **P1** | `server/lib/earningsCalendar.js` | Datos MOCK — necesita datos reales de Alpha Vantage |
| **P1** | `src/AppPro.jsx` | Bottom nav tabs no siempre muestran contenido correcto |
| **P2** | `src/components/SystemStatus.jsx` | Debe estar al final de la página, con colores correctos |
| **P2** | `src/components/NewsImpactList.jsx` | null-safe ya corregido, verificar eventos reales |
| **P2** | `src/styles/theme.css` | Verificar que no haya estilos oscuros residuales |
| **P3** | `server/engine/iv-history.js` | Sin datos históricos — IV Rank siempre null |

---

## 8. Flujo actual de la app

```
1. Usuario abre la app → React monta AppPro.jsx
2. useEffect en AppPro → fetch GET /api/scan (o /api/guardian/scan)
3. Backend recibe request en server/index.js
4. runInstitutionalScan() se ejecuta para CORE_UNIVERSE (12 símbolos)
5. Para CADA símbolo:
   a. getQuote(symbol) → Tradier API (precio, bid, ask)
   b. getTimesales(symbol) → Tradier API (OHLCV 1min intradía)
   c. computeTechnicals() → EMA 9/21/50/200, RSI, MACD, VWAP
   d. detectWyckoff() → Spring, Upthrust, SOS, SOW
   e. getPolygonTape(symbol) → Polygon.io (real buy/sell pressure)
   f. getExpirations(symbol) → Tradier API
   g. getOptionChain(symbol, expiration) → Tradier API con greeks=true
   h. updateIvHistory() → PostgreSQL/JSON para IV Rank
   i. volatilityRegimeScore() → IV vs HV, VIX range check
   j. buildCreditVerticals() → Bull Put + Bear Call Credit Spreads
   k. buildIronCondors() → Iron Condors
   l. buildDebitSpreads() → Call/Put Debit Spreads
   m. createTicket() → calcula netPremium, netGreeks, POP, EV, score
   n. classifyTicket() → ENTRAR_AHORA / ESPERAR_CONFIRMACION / WATCHLIST / NO_TRADE
   o. Sort → priority × classification × score × POP
6. Resultados devueltos al frontend
7. Frontend: GeminiBriefCard, SignalCard, MarketPulseCard, NewsImpactList
8. Scheduler (cada 3 min): mismo flujo + push notifications
```

---

## 9. Qué está incompleto o simulado

| Componente | Estado | Detalle |
|-----------|--------|---------|
| `server/lib/earningsCalendar.js` | **MOCK** | Datos hardcodeados para 14 símbolos. Necesita Alpha Vantage real |
| `server/engine/iv-history.js` | **Parcial** | Intenta PostgreSQL, falla a JSON. JSON está vacío inicialmente |
| `scripts/downloadHistoricalData.js` | ✅ **Completo** | Descarga Yahoo Finance → PostgreSQL (necesita DATABASE_URL) |
| `scripts/updateEarnings.js` | ✅ **Completo** | Alpha Vantage → PostgreSQL (necesita ALPHA_VANTAGE_API_KEY) |
| `server/engine/backtestSimulator.js` | **Parcial** | Lógica completa, pero no hay closed_signals para backtestear |
| `server/engine/tape-polygon.js` | **Parcial** | Funciona si POLYGON_API_KEY existe. Sin ella, retorna "NO_POLYGON_KEY" |
| `server/autonomousSignalWorker.js` | **Parcial** | Worker arranca pero no tiene scheduler de 3 min integrado |
| `src/components/GeminiBriefCard.tsx` | ✅ Completo | Muestra Gemini brief |
| `src/components/GeminiAssistant.jsx` | **Parcial** | Necesita VITE_GEMINI_API_KEY en frontend |
| `server/geminiAssistant.js` | ✅ **Completo** | Endpoint con fallback graceful |
| Notification push real | **Parcial** | Service Worker funciona, push necesita VAPID keys |
| PostgreSQL | **No usado** | Sin DATABASE_URL en Render — todo va a SQLite/memoria |

---

## 10. Plan de reparación recomendado

### P0 — Rompe la app

1. ✅ **YA CORREGIDO**: Asegurar que TODAS las rutas nuevas en server/index.js (commit `f7bec88`)
2. ✅ **YA CORREGIDO**: MarketSentiment null check
3. ✅ **YA CORREGIDO**: Express 5 wildcard (commit `d7fcbde`)
4. ✅ **YA CORREGIDO**: NewsImpactList null-safe .map
5. ✅ **YA CORREGIDO**: SystemStatus routing /api/status
6. ⏳ **PENDIENTE**: Asegurar que `start` en package.json apunte al archivo correcto
7. ⏳ **USUARIO DEBE**: Configurar TRADIER_TOKEN y VITE_GEMINI_API_KEY en Render

### P1 — Afecta señales/scanner

8. ⏳ Hacer que scanSymbol() devuelva un mensaje claro cuando falta TRADIER_TOKEN
9. ⏳ Conectar earningsCalendar.js a Alpha Vantage real
10. ⏳ Conectar IV history a PostgreSQL real

### P2 — Afecta diseño/UX

11. ✅ SystemStatus movido al inicio de la página
12. ✅ Bottom nav con íconos y highlight
13. ⏳ Gráficas que se ponen negras al hover (recharts theme)
14. ⏳ Fondo oscuro residual en componentes específicos

### P3 — Mejoras

15. ⏳ Poblar .data/iv-history.json con datos iniciales
16. ⏳ Agregar endpoint /api/positions/analysis para Gemini monitor
17. ⏳ Agregar más tests

---

## 11. Código relevante — Archivos críticos completos

### src/AppPro.jsx (componente principal frontend)

```jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./lib/api.js";
import { GeminiBriefCard } from "./components/GeminiBriefCard.tsx";
import { MarketPulseCard } from "./components/MarketPulseCard.jsx";
import { NewsImpactList } from "./components/NewsImpactList.jsx";
import { NotificationStatusCard } from "./components/NotificationStatusCard.jsx";
import { SignalCard } from "./components/SignalCard.jsx";
import MarketSentiment from "./components/MarketSentiment.jsx";
import GeminiAssistant from "./components/GeminiAssistant.jsx";
import NotificationManager from "./components/NotificationManager.jsx";
import LearningHub from "./components/LearningHub.jsx";
import SystemStatus from "./components/SystemStatus.jsx";
import { loadRiskConfig, saveRiskConfig } from "./config/riskConfig.ts";
import { classifyNewsEvent } from "./services/newsImpactClassifier.ts";

const VALIDO_VERSION = import.meta.env.VITE_VALIDO_BUILD_VERSION || "local-dev";
const VALIDO_TIMESTAMP = import.meta.env.VITE_VALIDO_BUILD_TIMESTAMP || "";

function isDateToday(dateStr) {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === today;
}

function isDateTomorrow(dateStr) {
  if (!dateStr) return false;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === tomorrow;
}

function VersionBadge() {
  const shortDate = VALIDO_TIMESTAMP
    ? new Date(VALIDO_TIMESTAMP).toLocaleDateString("es-MX", { month: "short", day: "numeric" })
    : "";
  return (
    <a href="/" title={`Build: ${VALIDO_VERSION}`} className="fixed right-3 top-3 z-50 pill hover:border-blue-400 hover:text-slate-900 transition">
      v{VALIDO_VERSION}{shortDate ? ` · ${shortDate}` : ""}
    </a>
  );
}

function TopSignalsList({ signals }) {
  if (!signals?.length) return (
    <section className="signal-card p-4 space-y-3">
      <h2 className="text-xl font-black text-slate-900">Señales del momento</h2>
      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
        <p className="text-sm text-slate-500">No hay señales ahora. El scanner sigue vigilando.</p>
      </div>
    </section>
  );
  return (
    <section id="signals" className="space-y-4">
      <h2 className="text-xl font-black text-slate-900 px-1">Señales del momento</h2>
      {signals.slice(0, 5).map((s, i) => <SignalCard signal={s} key={s.id || i} />)}
    </section>
  );
}

function RiskDesk({ profile, riskConfig, onSave }) {
  if (!profile) return null;
  const cfg = riskConfig || loadRiskConfig();
  const tradeBudget = cfg.accountValue * cfg.defaultRiskPct / 100;
  const maxBudget = cfg.accountValue * cfg.maxRiskPct / 100;
  return (
    <section id="risk" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black text-slate-900">Mesa de riesgo</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Cuenta</p><p className="text-base text-slate-900 font-black mt-1">${cfg.accountValue}</p></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Riesgo/trade</p><p className="text-base text-slate-900 font-black mt-1">${tradeBudget} ({cfg.defaultRiskPct}%)</p></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Maximo A+</p><p className="text-base text-slate-900 font-black mt-1">${maxBudget} ({cfg.maxRiskPct}%)</p></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Colateral</p><p className="text-base text-slate-900 font-black mt-1">{cfg.collateralCapPct}%</p></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Open trades</p><p className="text-base text-slate-900 font-black mt-1">{profile.activeSymbols?.length || 0} / {cfg.maxOpenTrades}</p></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">PDT</p><p className="text-base text-slate-900 font-black mt-1">{cfg.pdtProtected ? "Protegido" : "Sin proteccion"}</p></div>
      </div>
    </section>
  );
}

function TradeJournal({ entries }) {
  return (
    <section id="journal" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black text-slate-900">Journal</h2>
      {entries?.length ? entries.slice(0, 6).map(e => (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm" key={e.id}>
          <strong className="text-slate-900">{e.symbol} - {e.strategy}</strong>
          <p className="text-slate-500 mt-1">{e.outcome} | {new Date(e.createdAt || e.created_at).toLocaleDateString()}</p>
        </div>
      )) : (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-sm text-slate-500">Aun sin decisiones registradas.</p>
        </div>
      )}
    </section>
  );
}

function SettingsPanel({ riskConfig, onSaveRisk }) {
  const [cfg, setCfg] = useState(riskConfig || { accountValue: 2000, defaultRiskPct: 10, maxRiskPct: 20, collateralCapPct: 35, maxOpenTrades: 3, pdtProtected: true, maxDayTradesRolling5Days: 3 });
  function handleSave() { saveRiskConfig(cfg); onSaveRisk?.(cfg); }
  return (
    <section id="settings" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black text-slate-900">Configuración de cuenta</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Valor cuenta</p><input className="input mt-1" type="number" value={cfg.accountValue} onChange={e => setCfg({...cfg, accountValue: Number(e.target.value)})} /></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Riesgo %</p><input className="input mt-1" type="number" value={cfg.defaultRiskPct} onChange={e => setCfg({...cfg, defaultRiskPct: Number(e.target.value)})} /></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Colateral %</p><input className="input mt-1" type="number" value={cfg.collateralCapPct} onChange={e => setCfg({...cfg, collateralCapPct: Number(e.target.value)})} /></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Max trades</p><input className="input mt-1" type="number" value={cfg.maxOpenTrades} onChange={e => setCfg({...cfg, maxOpenTrades: Number(e.target.value)})} /></div>
      </div>
      <button className="primary-button w-full" onClick={handleSave}>Guardar configuración</button>
    </section>
  );
}

export default function AppPro() {
  const [activeTab, setActiveTab] = useState('inicio');
  const [scan, setScan] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [riskConfig, setRiskConfig] = useState(loadRiskConfig);
  const latestAlert = useRef(null);

  async function load(force = false) {
    setError("");
    try {
      const data = force ? await api.refresh() : await api.scan();
      setScan(data);
    } catch (e) { setError(e.message); }
  }

  async function loadJournal() {
    try { setEntries(await api.journal()); } catch {}
  }

  useEffect(() => { load(); loadJournal(); }, []);

  const signals = useMemo(() => {
    const opps = scan?.opportunities || [];
    return opps.map(s => ({
      ...s, rating: s.geminiReview?.verdict === "APPROVED" ? "A" : s.rating || s.score > 80 ? "B+" : "WATCH_ONLY",
      geminiApproved: s.geminiReview?.verdict === "APPROVED" || s.aiVerificationStatus === "APPROVED_BY_GEMINI_GUARDIAN",
      geminiSummary: s.geminiReview?.summary || s.geminiCoach?.summary || "Pendiente",
      education: s.geminiReview?.educationNote || s.geminiCoach?.mainRisk || ""
    }));
  }, [scan]);

  const news = useMemo(() => {
    const raw = scan?.macro || {};
    const earnings = raw?.earnings || [];
    const items = [
      ...earnings.map(e => classifyNewsEvent({ title: `${e.symbol} Earnings ${e.date}`, symbol: e.symbol, eventDate: e.date, isEarnings: true, isToday: isDateToday(e.date), isTomorrow: isDateTomorrow(e.date) })),
      ...(raw.highImpactEvents || []).map(e => classifyNewsEvent({ title: e.title || e.event || "", eventDate: e.date, isMacro: true, isToday: isDateToday(e.date) })),
      ...(raw.softImpactEvents || []).map(e => classifyNewsEvent({ title: e.title || e.event || "", eventDate: e.date, isMacro: true })),
      ...(raw.breakingRisk || []).map(e => classifyNewsEvent({ title: e.headline || e.title || "", source: e.source, url: e.url }))
    ];
    return items.filter(Boolean);
  }, [scan]);

  const marketPulse = useMemo(() => ({
    spyTrend: scan?.market?.spyTrend || "NO_DATA", qqqTrend: scan?.market?.technicals?.QQQ?.trend || "NO_DATA",
    vix: scan?.market?.vix ?? null, vixRegime: "NORMAL",
    macroStatus: news.some(n => n.stars >= 5) ? "DANGER" : news.some(n => n.stars >= 4) ? "CAUTION" : "CLEAR",
    newsStatus: news.some(n => n.stars >= 5) ? "DANGER" : news.some(n => n.stars >= 4) ? "CAUTION" : "CLEAR",
    tapeReading: scan?.market?.tapeReading || { arrow: "❔", label: "Sin datos" },
    bestModeNow: scan?.opportunities?.length ? "BUSCAR_ENTRADAS" : "ESPERAR"
  }), [scan, news]);

  const geminiBrief = useMemo(() => {
    const approved = signals.filter(s => s.geminiApproved);
    return {
      mood: news.some(n => n.stars >= 5) ? "EVENT_RISK" : scan?.market?.regime === "BULL_TREND" ? "RISK_ON" : scan?.market?.regime === "BEAR_TREND" ? "RISK_OFF" : "CHOP",
      mode: approved.length ? "BUSCAR_ENTRADAS" : "ESPERAR",
      summary: approved.length ? `Se detectaron ${approved.length} señal(es).` : "No hay señales aprobadas ahora.",
      bullets: approved.slice(0, 5).map(s => `${s.symbol} ${s.strategy} - Score ${s.score || "?"}`),
      bestSymbols: approved.map(s => s.symbol).slice(0, 3),
      blockedSymbols: (scan?.rejected || []).slice(0, 3).map(s => s.symbol),
    };
  }, [signals, news, scan]);

  const tabs = [
    { id: 'inicio', label: '🏠 Inicio', icon: '🏠' },
    { id: 'signals', label: '📡 Señales', icon: '📡' },
    { id: 'news', label: '📰 Noticias', icon: '📰' },
    { id: 'risk', label: '⚠️ Riesgo', icon: '⚠️' },
    { id: 'journal', label: '📓 Journal', icon: '📓' },
    { id: 'config', label: '⚙️ Config', icon: '⚙️' },
  ];

  return (
    <div className="pro-console bg-slate-50">
      <VersionBadge />
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3">
        <h1 className="text-lg font-bold text-slate-900">VALIDO 1M</h1>
        <p className="text-xs text-slate-500">Options Guardian · Gemini Auditor</p>
      </div>
      <div className="home-pro pb-24">
        {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}
        <SystemStatus />
        {activeTab === 'inicio' && (<><GeminiBriefCard {...geminiBrief} /><GeminiAssistant /><MarketSentiment /><MarketPulseCard pulse={marketPulse} /></>)}
        {activeTab === 'signals' && <TopSignalsList signals={signals} />}
        {activeTab === 'news' && <NewsImpactList events={news} />}
        {activeTab === 'risk' && <RiskDesk profile={scan?.profile} riskConfig={riskConfig} />}
        {activeTab === 'journal' && <TradeJournal entries={entries} />}
        {activeTab === 'config' && (<><SettingsPanel riskConfig={riskConfig} onSaveRisk={setRiskConfig} /><LearningHub /><NotificationManager /><NotificationStatusCard /></>)}
        <footer className="text-xs text-slate-500 text-center py-4">
          Educational / decision-support only. No auto-trading enabled.
          <span className="block mt-1">v{VALIDO_VERSION} | {scan?.refreshSeconds || 300}s refresh</span>
        </footer>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 px-2 py-2 backdrop-blur">
        <div className="flex justify-around max-w-lg mx-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === tab.id ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <span className="text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
```

### package.json

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
    "lint": "eslint .",
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

### server/index.js (entry point — el que Render ejecuta)

Ver archivo completo en GitHub: https://github.com/avali2/2M/blob/main/server/index.js

### server/index.mjs (entry alternativo)

Ver archivo completo en GitHub: https://github.com/avali2/2M/blob/main/server/index.mjs

---

## 📋 Instrucciones para ChatGPT

Para reparar el proyecto, copia y pega estos archivos a ChatGPT:

### Archivos obligatorios (copia y pega el contenido COMPLETO):

1. **`src/AppPro.jsx`** — Componente principal frontend (arriba en este documento)
2. **`src/components/MarketSentiment.jsx`** — Para arreglar crash null
3. **`src/components/SystemStatus.jsx`** — Para colocar al final con colores
4. **`src/components/NewsImpactList.jsx`** — Para verificar null safety
5. **`server/index.js`** — Entry point que Render ejecuta
6. **`server/index.mjs`** — Entry alternativo con rutas nuevas
7. **`server/geminiAssistant.js`** — Para arreglar Gemini 401
8. **`server/institutional-engine.mjs`** — Motor principal
9. **`server/status.js`** — Diagnóstico APIs
10. **`package.json`** — Scripts y dependencias

### Tests a ejecutar:

```bash
cd /path/to/2M
npm run build    # Debe pasar con 0 errores
npm run lint     # Si falla, copiar errores
npm test         # Si falla, copiar errores
```

### Errores conocidos para buscar/fixear:

```
1. "Cannot read properties of null (reading 'overall')" → MarketSentiment.jsx
2. "Gemini API error 401" → geminiAssistant.js → verificar VITE_GEMINI_API_KEY
3. "TRADIER_TOKEN not configured" → institutional-engine.mjs → agregar mensaje claro
4. "Cannot GET /api/status" → index.js → agregar ruta (YA CORREGIDO)
5. Charts/tooltips negros → theme.css o index.css → colores del chart
```

---

_Fin de PROJECT_AUDIT_FOR_CHATGPT.md — Elaborado para diagnóstico y reparación por IA_