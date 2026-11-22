# 5M · Contrato técnico de la mejora (v2)

Documento de referencia para todos los módulos. No cambiar firmas sin avisar al Lead.

## 1. Capas

```
Tradier (o demoMarket si no hay token)
   → server/lib/marketData.js   (facade + cache + frescura)
   → server/lib/positioning.js  (GEX, DEX, walls, max pain, IV analytics)
   → server/lib/nitoDirectional.js (señales CALL / PUT con plan)
   → server/lib/aggressiveSpreads.js (spreads agresivos)
   → server/index.js (rutas /api/*)
   → src/*.jsx (paneles React)
```

## 2. Snapshot de mercado (marketData.getSnapshot)

```js
{
  symbol: 'AMD', asOf: ISO, source: 'tradier'|'demo', simulated: false,
  marketOpen: true|false|null, dataAgeMinutes: 0,
  quote: { price, bid, ask, changePct, change, open, high, low, prevClose, volume, tradeDate },
  history: [{ date:'YYYY-MM-DD', open, high, low, close, volume }],   // ≥120 días
  intraday: [{ time, timestamp, open, high, low, close, volume }],      // 5m, última sesión
  expirations: ['YYYY-MM-DD', ...],
  chains: { 'YYYY-MM-DD': [ option ] },                                 // 4 venc. más cercanos válidos
  technical: {
    price, trend:'bullish'|'bearish'|'neutral',
    ema20, ema50, sma200, rsi14, atr14,
    support, resistance, support20, resistance20, atr,
    timeframes: { m5:{trend,asOf,sufficient}, m15:{...}, d1:{...} }
  },
  flow: analyzeInstitutionalFlow(...)   // existente
  warnings: [string]
  events: [{ date, type:'FOMC'|'CPI'|'NFP'|'OPEX'|'EARNINGS'|'DIVIDEND', label, impact:'high'|'medium'|'low' }]
}
option = { symbol, underlying, expiration, strike, type:'call'|'put', bid, ask, mid, last,
           volume, openInterest, iv, delta, gamma, theta, vega, rho }
```

## 3. Señal direccional NiTo (nitoDirectional.buildDirectionalSignals)

```js
buildDirectionalSignals({ snapshot, settings, account }) -> { gate, signals }
```

`gate`: `{ tradeable:boolean, status:'OPEN'|'CLOSED'|'STALE'|'PRE_EVENT'|'DEMO'|'NO_DATA',
            reasons:[string], warnings:[string], asOf }`
(nunca bloquea el análisis: si no es operable, las señales se devuelven con `meta.operable=false` para planificar)

signal = {
  id, symbol, side:'CALL'|'PUT', setup:'TREND'|'BREAKOUT'|'PULLBACK'|'REVERSAL'|'SQUEEZE',
  score: 0-100, grade:'A+'|'A'|'B'|'C', confidence: 0-100,
  contract: { occ, expiration, dte, strike, type, bid, ask, mid, entry, spreadPct,
              delta, gamma, theta, vega, iv, ivPct, intrinsic, extrinsic,
              oi, volume, volOiRatio, breakeven, breakevenPct, moneyness:'ITM'|'ATM'|'OTM' },
  levels: { trigger, invalidate, target1, target2, stopOption, support, resistance, atr, em1sd },
  probabilities: { pop, probTouch, probTarget2, probStop, basis:'lognormal' },
  scenario: { now:[{movePct, pnlUsd, pnlPct}], expiry:[{movePct, pnlUsd, pnlPct}] },
  plan: { entryLimit, maxEntry, stopPrice, targets:[{label, price, exitPct, underlying}],
          timeStopDays, contracts, maxLossUsd, riskPct, sizingNote, management:[string] },
  why: [{ key, label, value, status:'pos'|'neg'|'neutral', detail }],
  risks: [string], catalysts: [{ date, label, impact }],
  ivContext: { atmIv, ivPct, rank:0-100, percentile:0-100, term:[{dte, expiration, iv}],
               skew25d, verdict:'FAVORABLE'|'NEUTRO'|'CARO', note },
  copy: string,            // bloque de texto listo para Telegram/WhatsApp
  narrative: { thesis, entry, risk, management },
  meta: { method, warnings:[], stale, simulated, asOf, dataAgeMinutes, operable }
}

Reglas duras:
- IV ≤ 0 u opciones sin bid/ask → descartar el contrato (nunca inventar prima).
- score debe ser determinista y explicable: cada componente suma a `why`.
- probTouch usa aproximación lognormal documentada, jamás se presenta como garantía.
- si `simulated` → `meta.operable = false` y warning "DATOS SIMULADOS".
- máximo 3 señales devueltas (ordenadas por score) + siempre el gate.

## 4. Spread agresivo (aggressiveSpreads.buildSpreadIdeas)

```js
buildSpreadIdeas({ snapshot, profile:'aggressive'|'standard'|'max', strategies?, settings }) -> { ideas, meta }
idea = {
  id, symbol, strategy:'BULL_PUT_CREDIT'|'BEAR_CALL_CREDIT'|'IRON_CONDOR'|'IRON_FLY'|
                      'JADE_LIZARD'|'BROKEN_WING_PUT'|'CALL_DEBIT'|'PUT_DEBIT',
  label, direction:'BULLISH'|'BEARISH'|'NEUTRAL', aggression:'AGRESIVO'|'MAXIMO'|'ESTANDAR',
  score, grade, expiration, dte,
  legs: [{ action:'SELL'|'BUY', type:'call'|'put', strike, price, delta, iv, oi, volume }],
  pricing: { credit, width, creditWidthPct, maxProfitUsd, maxLossUsd, evUsd, evPerRisk, marginUsd, commissionEst },
  risk: { beLow, beHigh, pop, probTouchShort, stress:[{label, movePct, pnlUsd}], ivCrushPnlUsd, stopCreditMultiple },
  plan: { entryCredit, minCredit, exits:[{label, when, price}], timeStopDte, management:[string] },
  why:[{label,value,status}], warnings:[string], copy, meta:{ method, simulated, asOf }
}
```

## 5. Posicionamiento (positioning.buildPositioning)

```js
buildPositioning({ snapshot, expiration }) -> {
  symbol, asOf, simulated, spot, expiration, dte,
  totals: { gexUsdPerPct, dexShares, callOi, putOi, pcOi, callVol, putVol, pcVol },
  walls: { callWall, putWall, gammaFlip, maxPain, secondCallWall, secondPutWall },
  regime: { dealerGamma:'LONG'|'SHORT'|'NEUTRAL', behavior:'PINNED'|'VOLATILE'|'TREND', note },
  byStrike: [{ strike, gex, dex, callOi, putOi, callVol, putVol }],
  maxPainCurve: [{ strike, pain }],
  expectedMove: { up, down, pct, sigmaUsd },
  iv: { atm, rank, percentile, term:[{dte, expiration, iv}], skew25d, skewLabel, verdict },
  narrative: [string], warnings: [string]
}
```

## 6. API HTTP

| Método | Ruta | Respuesta |
|---|---|---|
| GET | /api/market/:symbol | snapshot público + positioning |
| GET | /api/nito/directional?symbols=AMD,SPY&side=both | `{ gate, signals, meta }` |
| GET | /api/spreads?symbols=AMD&profile=aggressive | `{ ideas, meta }` |
| GET | /api/positioning?symbol=SPY | payload sección 5 |
| GET | /api/ai/status | `{ gemini:{configured,model}, deepseek:{configured,model}, preferred }` |
| POST | /api/ai/analyze | `{ provider, model, text, latencyMs, fallbackUsed }` |
| POST | /api/ai/chat | SSE: `data: {"delta":"..."}` … `data: {"done":true,...}` |
| GET | /api/health | + `integrations.deepseek`, `demo` |

Todas exigen `X-5M-Key` cuando `REQUIRE_ACCESS_KEY=true` (excepto /api/health).

## 7. IA

- Gemini: `@google/generative-ai` no se usa; el cliente existente usa REST v1beta. Mantener estilo.
- DeepSeek: REST `POST https://api.deepseek.com/chat/completions`, modelos `deepseek-chat`, `deepseek-reasoner`.
- Proveedor `auto`: DeepSeek si hay DEEPSEEK_API_KEY, si no Gemini.
- Salidas en español, sin promesas de rentabilidad, con disclaimer corto.
- Sin claves → `configured:false` y respuesta 503 con mensaje claro; nunca inventar análisis.

## 8. Frontend

- Tema claro por defecto (`data-theme="light"`), oscuro opcional. Tokens en `src/styles.css`.
- Componentes propios en `src/components/`: `Icon`, `Card`, `Badge`, `Pill`, `Gauge`, `Stat`,
  `Segmented`, `PriceChart`, `PayoffChart`, `BarProfile`, `Sparkline`, `Modal`, `CopyButton`,
  `SourceBanner`, `Spinner`, `EmptyState`.
- Pantallas: `NitoPanel` (C/P), `SpreadsPanel`, `PositioningPanel`, `AiPanel`, `SystemPanel`;
  `App.jsx` = shell con navegación + sección Rueda existente.
- Nunca mostrar datos simulados sin el banner `SIMULADO · no operar`.
- Datos vía `src/lib/api.js` (`apiGet`, `apiPost`, `readSse`).
