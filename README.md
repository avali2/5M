# 5 MILLIONS

Aplicación privada de señales de opciones para ejecución manual en Robinhood. Prioriza **AMD, MSFT y SPY** para spreads, y **SOFI/MARA** para Covered Calls y la rueda, usando datos de Tradier, análisis cuantitativo multitemporal y dos revisiones de Gemini.

## Flujo de decisión

1. Gemini usa Google Search para revisar Fed/FOMC, macro, Treasury, política y aranceles, Trump/administración, guerras, geopolítica, mercado, semiconductores, AMD, MSFT, SPY y earnings.
2. La respuesta solo puede habilitar operaciones si queda `CLEAR`, cubre las ocho categorías exigidas y devuelve suficientes fuentes.
3. Tradier aporta reloj de mercado, cotizaciones, histórico diario, Time & Sales de 5 minutos, vencimientos, cadenas, liquidez y Greeks.
4. El código deriva 5m, 15m, 1h, 1D y 1W, construye spreads verticales de crédito y calcula crédito, punto de equilibrio, riesgo máximo, ganancia máxima y POP aproximada.
5. Un módulo de flujo infiere presión profesional con volumen/OI, prima nocional, ubicación del último precio respecto a bid/ask, volumen relativo y tendencia. No identifica instituciones.
6. Gemini audita los candidatos sin poder cambiar strikes, precios ni riesgo.
7. Solo una operación que supera todos los bloqueos puede quedar `READY` y generar Web Push.
8. SQLite conserva exploraciones, señales, notificaciones y feedback; Gemini recibe únicamente estadísticas con muestra mínima validada.

La aplicación nunca envía órdenes. Si faltan noticias, fuentes, datos frescos, flujo exigido o aprobación de Gemini, la señal queda `WATCH`. El balance no bloquea señales.

## Perfiles

- **Base:** 21–45 DTE, objetivo 30 DTE, delta corta 0.12–0.30 y take profit de 50% del crédito.
- **Agresivo:** todo el universo, 7–20 DTE, objetivo 14 DTE, delta corta 0.24–0.40, liquidez superior y flujo inferido alineado con confianza mínima.
- **Rueda SOFI/MARA:** 14–45 DTE, objetivo 30 DTE y delta 0.15–0.35. Genera por separado Cash-Secured Put y Covered Call.
- La Cash-Secured Put muestra el efectivo necesario para una posible asignación de 100 acciones.
- La Covered Call exige que ya poseas 100 acciones libres por contrato; nunca se presenta como una call desnuda.
- Sin filtro por precio del subyacente, balance o cantidad de contratos. Se muestra riesgo por contrato y el usuario decide el tamaño.
- Anchos de spread de hasta $25 por defecto, configurables con `MAXIMUM_SPREAD_WIDTH`.
- 0DTE y opciones desnudas están bloqueados.

El perfil agresivo aumenta sensibilidad y riesgo de pérdida; no aumenta la certeza. Ningún perfil garantiza rentabilidad.

## Universo

- **Prioridad:** AMD, MSFT y SPY.
- **ETF de índices siempre presentes:** SPY, QQQ, IWM y DIA.
- **Índices de contexto:** SPX, NDX, RUT y VIX; no generan órdenes automáticas.
- **7 Magníficas:** AAPL, MSFT, NVDA, AMZN, META, GOOGL y TSLA.
- **Líderes líquidos adicionales:** AMD, AVGO, PLTR, NFLX, HOOD, MU, ORCL, TSM, BABA, BAC y COIN.
- **ETF sectoriales/macro:** SMH, XLK, XLF, XLE, TLT e IBIT.
- **Rueda fijada en cada rotación:** SOFI y MARA.

El escáner mantiene prioridad e índices ETF y rota el resto dentro de `MAX_SYMBOLS_PER_SCAN`. Esto evita pedir decenas de históricos y cadenas simultáneamente y reduce riesgo de rate limit. Cboe identifica una fuerte concentración del volumen en SPX, SPY, NVDA, TSLA y AAPL, y su lista ampliada de clases líquidas incluye AMD, MSFT, AVGO y PLTR.

## Base de datos y aprendizaje

La app usa SQLite en `DATA_DIR/five-millions.sqlite` y migra automáticamente el antiguo `store.json`. Guarda resúmenes de scans, cada instancia de señal, suscripciones Web Push, alertas enviadas y feedback manual.

En cada tarjeta puedes marcar `La tomé`, `La omití`, `Ganó`, `Perdió` o `Break-even`, además de P/L opcional. El panel calcula muestra, tasa ganadora y P/L por símbolo, perfil y estrategia. Una muestra necesita al menos `LEARNING_MIN_VALIDATED_SAMPLES` resultados cerrados antes de entregarse a Gemini. El aprendizaje es observacional y nunca puede convertir por sí solo una señal en `READY` ni modificar strikes, crédito o tamaño.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run dev
```

Comprobaciones:

```bash
npm test
npm run build
npm run smoke:live
```

`smoke:live` requiere credenciales reales en el entorno y solo comprueba conectividad/estructura; no envía órdenes.

Para generar Web Push:

```bash
npx web-push generate-vapid-keys
```

## Variables imprescindibles

```text
TRADIER_TOKEN=...
TRADIER_REALTIME_ENTITLED=true
GEMINI_API_KEY=...
APP_ACCESS_KEY=una-clave-larga-y-unica
REQUIRE_ACCESS_KEY=true
REQUIRE_AFFORDABLE_SIGNAL=false
AGGRESSIVE_PRIORITY_ONLY=false
INSTITUTIONAL_FLOW_ENABLED=true
PUBLIC_BASE_URL=https://tu-dominio
CLIENT_ORIGIN=https://tu-dominio
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tu-email@example.com
```

Activa `TRADIER_REALTIME_ENTITLED=true` únicamente si el token de producción tiene datos de mercado en tiempo real. Tradier indica que el tiempo real depende del entitlement de una cuenta de brokerage; de lo contrario puede entregar datos retrasados. Mientras no se confirme, 5 MILLIONS bloquea `READY`.

Nunca uses variables `VITE_` para Tradier o Gemini: el navegador no debe recibir secretos.

## Segundo plano y persistencia

El proceso web ejecuta un escaneo no superpuesto cada `SCAN_INTERVAL_MINUTES`. Cuando `MARKET_OPEN_ONLY=true`, el ciclo automático consulta el reloj de Tradier y omite el análisis completo con el mercado cerrado. SQLite guarda el último scan, historial, señales, resultados y suscripciones Push en `DATA_DIR`.

Para alertas confiables, usa un servicio que permanezca activo y monta almacenamiento persistente en `/app/data` al desplegar el `Dockerfile`. Un servicio que duerme o escala a cero no puede mantener este temporizador.

Consulta [DEPLOYMENT.md](./DEPLOYMENT.md) para Railway, Render, Fly.io, Cloud Run y las limitaciones de Vercel/GitHub Pages.

## Límites financieros

- POP se aproxima como `1 - |delta|` de la pierna corta; no es una probabilidad garantizada.
- El riesgo máximo presupone el crédito conservador de la cadena, pero el fill real, slippage y asignación pueden cambiar el resultado.
- Gemini y Google Search pueden omitir o interpretar mal noticias. La app exige cobertura y fuentes, pero no sustituye la verificación humana.
- La app no decide cuántos contratos comprar. Multiplica siempre `riesgo máximo por contrato × contratos` antes de enviar una orden.
- En la rueda, la prima no elimina la exposición bajista del subyacente. Una Covered Call puede perder mucho si las acciones caen y limita parte de la subida si son asignadas.
- “Flujo profesional” es una inferencia, no una prueba de que un banco o fondo haya comprado o vendido. Tradier no entrega esa identidad ni confirma apertura/cierre.

## Integración continua y despliegue

El repositorio privado es `avali2/5M` y la rama de producción es `main`. Cada cambio a `main` dispara GitHub Actions (`npm test` y `npm run build`) para validar el código antes de desplegar.

El escaneo es un temporizador 24/7 y la base es SQLite persistente, por lo que el plan gratuito de Render **no** es apto. Opciones listas en el repo:

- **Oracle Cloud Always Free** (0 USD reales): instalador incluido en [`deploy/oracle-vm/setup.sh`](./deploy/oracle-vm/setup.sh).
- **Fly.io** (plan $0 con allowance): [`fly.toml`](./fly.toml) listo con volumen y máquina siempre activa.
- **Render/Railway** (de pago): `render.yaml` y el `Dockerfile` quedan preparados.

El paso a paso completo está en [DEPLOYMENT.md](./DEPLOYMENT.md).

## Documentación oficial

- [Tradier: Market Data](https://docs.tradier.com/docs/market-data)
- [Tradier: Time & Sales](https://docs.tradier.com/reference/brokerage-api-markets-get-timesales)
- [Tradier: Historical Pricing](https://docs.tradier.com/reference/brokerage-api-markets-get-history)
- [Tradier: Options Chains](https://docs.tradier.com/reference/brokerage-api-markets-get-options-chains)
- [SEC: Form 13F y retraso de hasta 45 días](https://www.sec.gov/answers/form13f.htm)
- [Tradier: Option roots, incluidos SPXW/RUTW](https://docs.tradier.com/reference/brokerage-api-markets-get-lookup-options-symbols)
- [Cboe: Most Active options](https://www.cboe.com/en/markets/us/options/market-statistics/most-active/)
- [Robinhood: Index options](https://robinhood.com/us/en/support/articles/index-options/)
- [Node.js: SQLite](https://nodejs.org/api/sqlite.html)
- [Gemini: Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search)
- [Gemini: Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
