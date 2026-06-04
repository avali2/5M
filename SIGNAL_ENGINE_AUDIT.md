# SIGNAL_ENGINE_AUDIT.md

## Donde se calcula score

Motor principal:

- `server/engine/scoring.js`
  - `scoreSetup(...)` calcula `confidenceScore`/`score` con pesos: tendencia 30%, liquidez 25%, volatilidad 20%, macro/news/earnings 15%, riesgo/tamano 10%.
  - Ajusta por gamma positiva/negativa, flow alineado y regimen de mercado.
- `server/engine/scanner.js`
  - Llama `scoreSetup(...)`, luego agrega `tradeQualityScore`, `confidenceScore`, `scoreFactors`, `scoreWeights`.
  - Aplica `evaluateRiskGovernor(...)` y decide `opportunities`, `rejected`, `conditionalIdeas`.
- `server/guardian/edge-tickets.js`
  - Calcula `edgeScore` adicional para tickets Guardian con POP, EV, max profit, datos, tecnico y eventos.

Motores alternativos/legacy:

- `server/strategy-suite.js`: calcula `scoreBasis` y clasifica `READY`, `AGGRESSIVE`, `CANDIDATE`, `NO_TRADE`.
- `server/engine/ticket-creator.js`: calcula `institutionalScore` y clasifica `ENTRAR_AHORA`, `ESPERAR_CONFIRMACION`, `WATCHLIST`, `NO_TRADE`.
- `server/institutional-engine.mjs`: usa el motor legacy via `server/index.mjs`.

## Donde se decide READY / GREEN / CANDIDATE / BLOCKED

No hay un unico estado `GREEN` canonico. En la UI, "verde" parece equivaler a senales aprobadas/operables:

- `server/engine/scanner.js`
  - `opportunities`: senales reales aprobadas por gates deterministas.
  - `decision.status = 'eligible'`: hay planes aprobados.
  - `decision.status = 'no_trade'`: no hay trade real.
  - `decision.status = 'conditional_edge'`: hay candidato accionable/condicional, no trade real.
- `server/ai/gemini-guardian-gate.js`
  - Si `SIGNAL_REQUIRE_AI_CONFIRMATION=true`, solo quedan en `opportunities` los setups con revision Gemini que permita entrada.
  - Si no hay aprobacion, setea `NO TRADE REAL - REQUIERE REVISION GEMINI`.
- `server/guardian/edge-tickets.js`
  - `EDGE_READY`: pop suficiente, edgeScore suficiente y `riskGovernor.allowedReal`.
  - `AGGRESSIVE_EDGE`: pop y score suficientes, pero menos estricto.
  - `TRADE_CANDIDATE`: candidato por score.
  - `WAIT_TRIGGER`, `CAPITAL_HEAVY`, `HIGH_POP_BAD_PAYOUT`, `NO_READY`, `NO_TRADE_REAL`: no son verde real.
- `server/strategy-suite.js`
  - `READY`, `AGGRESSIVE`, `CANDIDATE`, `NO_TRADE` en motor alternativo.
- `server/engine/ticket-creator.js`
  - `ENTRAR_AHORA` es el equivalente legacy de verde.

## Filtros que pueden bloquear todas las senales

Globales en `server/engine/scanner.js`:

- VIX no disponible.
- VIX mayor o igual a `policy.maxVix`.
- `SIGNAL_REQUIRE_MACRO_CLEARANCE=true` sin `providers.calendar` y `ALLOW_UNVERIFIED_MACRO_WHEN_FEEDS_MISSING=false`.
- `SIGNAL_REQUIRE_NEWS_CLEARANCE=true` sin news provider y `ALLOW_UNVERIFIED_NEWS_WHEN_FEEDS_MISSING=false`.
- Evento macro critico en blackout.
- Noticias sensibles/geopoliticas bloqueantes.
- `profile.tradingPaused`.
- Perdida diaria/semanal maxima alcanzada.
- Colateral utilizado sobre 80%.

Por setup en `individualBlocks(...)`:

- IV Rank sin suficientes observaciones persistidas.
- Vender prima exige proxy gamma OI positivo.
- Estructura de expansion exige proxy gamma negativo.
- Earnings antes de expiracion.
- `liquidityScore < 7`.
- POP de venta de prima menor a 65.
- Iron Condor con credito menor al 20% del ancho.
- `maxRisk` mayor al presupuesto por operacion.
- Colateral mayor al limite de cuenta.
- Flujo inusual opuesto.
- Limite de exposicion correlacionada.
- Maximo de operaciones abiertas.
- Kill switch diario/semanal.
- 0DTE observado pero no aprobado.
- 1DTE sin permiso.
- Debit Spread incompatible con `workMode`.

Risk Governor (`server/engine/risk-governor.js`):

- Data Health incompleto.
- Contexto bloqueante global.
- Riesgo maximo no definido o invalido.
- Falta take profit o stop loss.
- Strikes invalidos o no definidos.
- Naked calls/puts o riesgo indefinido.
- Max open trades/cooling off/perdidas.

Guardian tickets (`server/guardian/edge-tickets.js`):

- Sin legs, bid/ask/strike incompleto, OI bajo, volumen bajo.
- POP no disponible.
- Break-even no disponible.
- Max risk/max profit no disponible.
- Max profit menor al minimo configurado.
- Expiracion no disponible.
- Global blocks o data issues.

## Que pasa si Gemini falla con 429

- `server/ai/provider-router.js` detecta rate limit por `ProviderError` status 429 o texto `HTTP 429|rate limit|quota`.
- En `reviewSignal(...)`, si Gemini falla con 429 se pausa el presupuesto (`budgetManager.pause`) por `AI_COOLDOWN_AFTER_429_MINUTES` o 120 minutos.
- La respuesta se normaliza como no disponible/manual review, no como aprobacion.
- Si `SIGNAL_REQUIRE_AI_CONFIRMATION=true`, `server/ai/gemini-guardian-gate.js` mueve oportunidades no aprobadas a `rejected` y deja `scan.opportunities=[]`.
- Resultado practico: un 429 puede bloquear toda senal verde si la confirmacion IA es obligatoria.

## Que pasa si Polygon devuelve 404

- `server/lib/http.js` lanza `ProviderError(provider, 'HTTP 404', 404)` para cualquier `response.ok === false`.
- `server/providers/polygon.js` usa `requestJson(...)` en quotes/history/expirations/chain; no transforma 404 en dato opcional localmente.
- `server/engine/scanner.js` captura errores dentro de `scanSymbol(...)` y devuelve `{ symbol, error }` para ese simbolo.
- Si Polygon es proveedor principal de market/options y falla en endpoints clave, puede reducir quotes/chains disponibles y aparecer en `scanErrors`/`dataHealth`.
- Si hay fallback activo a Tradier/Yahoo depende de `server/providers/index.js`; Polygon por si solo no parece ser obligatorio, pero puede degradar si fue elegido como proveedor activo.

## Que pasa si faltan Greeks, IV, chain, bid/ask u open interest

- Sin quote valida: `scanSymbol(...)` devuelve `No verified quote`.
- Sin expiracion/chain en ventana DTE: devuelve `No option chain in configured DTE windows`.
- Sin chain/legs: Guardian marca `No hay legs suficientes para construir ticket` o `POP no disponible`.
- Sin IV/DTE/Greeks/legs: `server/engine/probability-edge.js` marca edge no disponible y lista faltantes (`precio subyacente`, `IV`, `DTE`, `Greeks/delta`, `cadena/legs`).
- Bid/ask incompleto o invalido reduce calidad de opciones en `server/engine/ticket-creator.js` y genera warning/bloqueo en Guardian.
- Open interest/volumen bajo penaliza liquidez; puede bloquear si `liquidityScore < 7` o impedir `EDGE_READY`.
- Yahoo intenta aproximar Greeks si tiene spot, strike, IV y DTE; si tampoco hay IV o DTE, quedan `null`.

## Datos obligatorios vs opcionales

Obligatorios para senal real:

- Quote verificada del subyacente.
- Expiracion dentro de `MIN_DTE`/`MAX_DTE` o ventana corta permitida.
- Option chain con legs suficientes.
- Strikes, bid/ask, max risk, max profit.
- DTE, IV suficiente para POP/expected move.
- Delta/Greeks o aproximacion util para POP/riesgo.
- Liquidez minima: OI/volumen/spread razonables.
- Plan de take profit y stop loss.
- Risk governor permitido.
- Si configurado: macro/news clearance.
- Si configurado: aprobacion Gemini estructurada.

Deberian ser opcionales o degradables para no bloquear todo:

- Polygon tape/time & sales.
- Benzinga unusual options/block trades.
- Insider transactions.
- AI narrative/tutor.
- Gemini cuando hay 429, si se acepta fallback deterministico o revision manual.
- News/macro premium si Yahoo/FMP/Finnhub no estan configurados, siempre que el modo de riesgo lo permita.
- IV Rank historico al inicio del sistema; puede requerir modo bootstrap con advertencia.

## Por que puede no salir nunca una senal verde

Combinacion probable:

- `SIGNAL_MIN_SCORE` default 82 y `riskGovernor.allowedReal` estricto.
- `SIGNAL_REQUIRE_AI_CONFIRMATION=true` default en `config.signals`, mientras `AI_AUTO_SIGNAL_DECISION` puede estar apagado por defecto. Esto crea una puerta donde la IA es requerida pero no necesariamente revisa/aprueba automaticamente.
- `IV_RANK_MIN_OBSERVATIONS=30`: al inicio muchos setups quedan bloqueados por "IV Rank aun necesita mas observaciones reales persistidas".
- `SIGNAL_REQUIRE_MACRO_CLEARANCE=true` y `SIGNAL_REQUIRE_NEWS_CLEARANCE=true`: si Finnhub/FMP/news no estan disponibles y no se permite unverified, hay `globalBlocks`, y `eligible=[]`.
- Cuenta default pequena (`ACCOUNT_SIZE=2000`, `RISK_PER_TRADE_PCT=1`) implica presupuesto por trade de aproximadamente $20; muchas estructuras tienen `maxRisk` mayor.
- `workMode=true` bloquea debit spreads en el scanner principal.
- Venta de prima exige gamma OI positivo; si el proxy gamma no esta disponible o no cumple, bloquea.
- Faltantes de chain, bid/ask, OI, volumen, Greeks o IV bajan liquidez/data health y bloquean.
- Earnings antes de expiracion bloquea setups.
- Edge tickets pueden ser `TRADE_CANDIDATE` o `AGGRESSIVE_EDGE`, pero el motor principal mantiene `opportunities=[]`; la UI puede no mostrarlos como verde real.
