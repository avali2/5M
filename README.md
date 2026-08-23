# 5 MILLIONS

Aplicación privada de señales de opciones para ejecución manual en Robinhood. Prioriza **AMD, MSFT y SPY**, especialmente Put Credit Spreads, usando datos de Tradier, análisis cuantitativo multitemporal y dos revisiones de Gemini.

## Flujo de decisión

1. Gemini usa Google Search para revisar Fed/FOMC, macro, Treasury, política y aranceles, Trump/administración, guerras, geopolítica, mercado, semiconductores, AMD, MSFT, SPY y earnings.
2. La respuesta solo puede habilitar operaciones si queda `CLEAR`, cubre las ocho categorías exigidas y devuelve suficientes fuentes.
3. Tradier aporta reloj de mercado, cotizaciones, histórico diario, Time & Sales de 5 minutos, vencimientos, cadenas, liquidez y Greeks.
4. El código deriva 5m, 15m, 1h, 1D y 1W, construye spreads verticales de crédito y calcula crédito, punto de equilibrio, riesgo máximo, ganancia máxima, POP aproximada y tamaño.
5. Gemini audita los candidatos sin poder cambiar strikes, precios ni riesgo.
6. Solo una operación que supera todos los bloqueos puede quedar `READY` y generar Web Push.
7. SQLite conserva exploraciones, señales, notificaciones y feedback; Gemini recibe únicamente estadísticas con muestra mínima validada.

La aplicación nunca envía órdenes. Si faltan noticias, fuentes, datos frescos, entitlement de tiempo real, capacidad de riesgo o aprobación de Gemini, la señal queda `WATCH`.

## Perfiles

- **Base:** 21–45 DTE, objetivo 30 DTE, delta corta 0.12–0.30 y take profit de 50% del crédito.
- **Agresivo:** solo AMD/MSFT/SPY, 7–20 DTE, objetivo 14 DTE, delta corta 0.24–0.40, liquidez superior, máximo un contrato y 50% del presupuesto de riesgo base.
- 0DTE y opciones desnudas están bloqueados.

El perfil agresivo aumenta sensibilidad y riesgo de pérdida; no aumenta la certeza. Ningún perfil garantiza rentabilidad.

## Universo

- **Prioridad:** AMD, MSFT y SPY.
- **ETF de índices siempre presentes:** SPY, QQQ, IWM y DIA.
- **Índices de contexto:** SPX, NDX, RUT y VIX; no generan órdenes automáticas.
- **7 Magníficas:** AAPL, MSFT, NVDA, AMZN, META, GOOGL y TSLA.
- **Líderes líquidos adicionales:** AMD, AVGO, PLTR, NFLX, HOOD, MU, ORCL, TSM, BABA, BAC y COIN.
- **ETF sectoriales/macro:** SMH, XLK, XLF, XLE, TLT e IBIT.

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
ACCOUNT_SIZE=tu-capital-real
RISK_PER_TRADE_PCT=1
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
- Configura `ACCOUNT_SIZE` y `RISK_PER_TRADE_PCT` con valores reales. Si no cabe un contrato, la decisión correcta del sistema es cero contratos.

## Documentación oficial

- [Tradier: Market Data](https://docs.tradier.com/docs/market-data)
- [Tradier: Time & Sales](https://docs.tradier.com/reference/brokerage-api-markets-get-timesales)
- [Tradier: Historical Pricing](https://docs.tradier.com/reference/brokerage-api-markets-get-history)
- [Tradier: Options Chains](https://docs.tradier.com/reference/brokerage-api-markets-get-options-chains)
- [Tradier: Option roots, incluidos SPXW/RUTW](https://docs.tradier.com/reference/brokerage-api-markets-get-lookup-options-symbols)
- [Cboe: Most Active options](https://www.cboe.com/en/markets/us/options/market-statistics/most-active/)
- [Robinhood: Index options](https://robinhood.com/us/en/support/articles/index-options/)
- [Node.js: SQLite](https://nodejs.org/api/sqlite.html)
- [Gemini: Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search)
- [Gemini: Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
