# Mejora integral 5M · rama `mejora-dsh`

Cambios hechos sobre la base existente (React 19 + Vite + Express 5, sin dependencias nuevas).
La mesa de la rueda (CSP/CC + motor autónomo + broker) se conserva intacta en su lógica y tests.

## 1. Motor matemático nuevo

`server/lib/optionsMath.js` — Black-Scholes-Merton con dividendos, Greeks analíticos (Δ, Γ, Θ/día,
ν por punto de vol, ρ), volatilidad implícita (Newton + bisección), probabilidades lognormales
(ITM, `P(S_T > K)`, POP de estructuras), movimiento esperado 1σ, valor teórico de estructuras,
breakevens, stress de precios e IV, GEX/DEX, max pain, IV rank/percentile y skew 25Δ.

Sin números inventados: toda función devuelve `null` cuando el dato no alcanza.

## 2. NiTo direccional (CALL / PUT)

`server/lib/nitoDirectional.js` + `/api/nito/directional` + pestaña **NiTo**.

- Sesgo direccional explicable (−100…100) con tendencias 5m/15m/1D/1S, EMAs, RSI, pendiente, ATR
  y flujo institucional inferido.
- Setups: `TREND`, `BREAKOUT`, `PULLBACK`, `REVERSAL`, `SQUEEZE`.
- Selección de contrato por delta objetivo, liquidez, OI, volumen y spread máximo.
- Cada señal trae: contrato OCC, prima mid/bid/ask, breakeven, delta/gamma/theta/vega/IV,
  probabilidad de modelo, escenarios T+0 y al vencimiento, objetivos 1/2, stop, cierre por tiempo,
  tamaño sugerido por % de riesgo, checklist *por qué*, riesgos, catalizadores, texto para copiar
  y narrativa en español.
- **Gate honesto**: `OPEN`, `CLOSED`, `STALE`, `PRE_EVENT`, `DEMO`, `NO_DATA`. Fuera de horario o
  con datos simulados se planifica igual, pero `operable: false`.
- Filtro de calidad: descarta ideas con R:R < 1, spread excesivo o liquidez insuficiente.

## 3. Spreads agresivos

`server/lib/aggressiveSpreads.js` + `/api/spreads` + pestaña **Spreads**.

`BULL_PUT_CREDIT`, `BEAR_CALL_CREDIT`, `IRON_CONDOR`, `IRON_FLY`, `JADE_LIZARD`,
`BROKEN_WING_PUT`, `CALL_DEBIT`, `PUT_DEBIT` con perfiles `standard` / `aggressive` / `max`
(bandas de DTE, delta vendido, crédito/ancho mínimo, ancho máximo, OI y spread).

Máx ganancia/pérdida y breakevens se calculan **numéricamente sobre la curva de payoff**, POP con
lognormal, EV, stress a ±2/5/10% al vencimiento, P&L con IV −20% y plan de salida (50% del crédito,
stop 2x, cierre por tiempo, ajustes de condor).

## 4. Posicionamiento institucional

`server/lib/positioning.js` + `/api/positioning` + pestaña **Institucional**.

GEX/DEX por strike, muros de calls/puts, gamma flip, max pain y curva, exposición total, P/C de OI y
volumen, movimiento esperado, IV ATM contra volatilidad realizada 20d, término y skew 25Δ, régimen
del dealer y narrativa de qué significa cada nivel. Todo etiquetado como **inferencia**, no identidad
de instituciones.

## 5. IA: DeepSeek + Gemini

`server/lib/deepseek.js` (cliente REST con streaming SSE, timeouts, reintentos, errores 401/402/429)
y `server/lib/aiAnalyst.js` (router `auto`/`deepseek`/`gemini`, 6 tareas, guardrails, cache, fallback).

Tareas: `signal`, `spread`, `positioning`, `briefing`, `risk`, `chat` (streaming SSE).
Endpoints: `/api/ai/status`, `/api/ai/analyze`, `/api/ai/chat`. Si no hay claves, la app sigue
funcionando y la UI explica qué falta. Las claves nunca salen del servidor.

## 6. Rediseño de interfaz

- Tema claro por defecto + oscuro, tokens de color, bordes de 1px, radios y sombras suaves.
- Set de iconos SVG propio (sin librerías), tarjetas, badges, gauges, chips, modales y toasts.
- Gráficos SVG propios: precio con EMA y niveles, payoff al vencimiento + T+0, perfil de GEX por
  strike con muros, sparkline y barras de escenarios.
- Navegación inferior de 6 pestañas, selector de símbolo, banner de datos simulados/datos vencidos.
- Botones "Copiar señal" con formato listo para Telegram/WhatsApp.

## 7. Mercado simulado (modo demo)

`server/lib/demoMarket.js` + `server/lib/marketData.js`: snapshot determinista con tendencia por día,
historia de 260 días, intradía de 5m alineado a la grilla (para el análisis multitemporal), cadena con
Greeks y IV por strike/vencimiento, y eventos macro. Se activa solo si falta `TRADIER_TOKEN` y todo
queda marcado `simulated: true` + banner `NO OPERAR`.

## 8. Correcciones y mejoras de fiabilidad

- `/nito` ya no redirige a un host externo: sirve el panel local.
- Nuevas rutas con caché, deduplicación de snapshot y errores 503 claros.
- `marketData` calcula métricas derivadas una sola vez por snapshot (45 s de cache) y reutiliza
  `indicators.js` e `institutionalFlow.js` existentes.
- La rueda mantiene sus 51 tests y guardas de seguridad (datos frescos, noticias, colateral).
- Panel de sistema con estado real de integraciones y referencia de variables.

## 9. Pruebas

`npm test` → **77 tests** (51 originales + 26 nuevos):
motor NiTo (señales CALL y PUT, gate, determinismo, sin NaN), spreads (patas/crédito/riesgo/POP,
perfiles, filtros), posicionamiento (muros, max pain, término, narrativa), DeepSeek (éxito, 401,
sin clave, SSE, timeout) y Gemini (request, streaming, 429).

`npm run smoke:engines` imprime un resumen de señales, spreads y posicionamiento para 5 símbolos.

## 10. Pendientes y límites conocidos

- No se pudieron probar las llamadas reales a DeepSeek/Gemini ni a Tradier desde este entorno
  (sin claves). La lógica está cubierta con `fetch` mockeado y el modo demo.
- El repositorio `2M` (NiTo Market Pulse) seguía privado: este NiTo se reconstruyó sobre 5M con
  el contrato nuevo; cuando esté disponible se puede portar su UI/ideas.
- No hay push automático a GitHub desde esta sesión: los cambios están en la rama local
  `mejora-dsh` y en el ZIP de entrega.
