# 5 MILLIONS

Motor privado de señales de opciones para análisis y ejecución manual en Robinhood. Genera únicamente **Cash-Secured Puts** y **Covered Calls** respaldadas por acciones. No abre órdenes ni se conecta a posiciones de Robinhood.

## Qué hace una señal

1. Lee cotizaciones, históricos, Time & Sales, expiraciones y cadenas de opciones desde Tradier.
2. Calcula contexto de 5m, 15m, 1h, 1D y 1W y filtra vencimiento, delta, crédito, volumen, interés abierto y spread bid/ask.
3. Gemini con Google Search revisa noticias, calendario y eventos. Las ocho categorías exigidas deben tener cobertura y al menos tres dominios de fuente independientes; ante falta de datos, la señal queda bloqueada.
4. Gemini revisa los candidatos que pasan las reglas. El código conserva precios, strikes, DTE y riesgo.
5. La señal solo puede quedar `READY` con mercado abierto, noticias `CLEAR` recientes, Tradier configurado para tiempo real y timestamp del subyacente dentro del límite, revisión aprobada y colateral declarado vigente.
6. El colateral se captura manualmente: efectivo libre para puts y acciones libres por ticker para calls. Varias señales del mismo escaneo no pueden reservar dos veces el mismo efectivo o las mismas acciones.

`READY` significa **lista para una revisión manual final**, no que la orden sea segura ni que deba enviarse. Actualiza el colateral después de cada operación y vuelve a verificar la cadena actual en Robinhood.

## Reglas de riesgo

- **Cash-Secured Put:** efectivo requerido = strike × 100 por contrato. La asignación puede ocurrir antes del vencimiento; la acción puede caer por debajo del strike y generar una pérdida grande.
- **Covered Call:** requiere 100 acciones libres por contrato. Si asignan, las acciones se venden al strike; si el subyacente cae, la pérdida de las acciones puede superar la prima cobrada.
- Perfil de rueda: 14–45 DTE, objetivo 30 DTE y delta absoluta 0.15–0.30. 0DTE, spreads y posiciones descubiertas no forman parte del motor.
- Volumen mínimo de opción 10, interés abierto mínimo 100 y spread bid/ask máximo 25% del punto medio por defecto. Estos filtros reducen candidatos poco líquidos, pero no garantizan un fill.
- Las cotizaciones de subyacente deben tener timestamp reciente (5 minutos por defecto) y contexto intradía suficiente. Una bandera de configuración no verifica por sí sola el entitlement de Tradier.
- Tradier puede entregar Greeks en snapshots horarios sin timestamp por contrato. Revisa delta y precio actuales en Robinhood antes de operar.
- `score` ordena candidatos. `delta` no es una probabilidad calibrada; el sistema no muestra una POP como certeza.
- Actividad de opciones y aprendizaje son observacionales. No revelan identidad/intención del participante ni pueden aprobar por sí solos una señal.
- No se usa IV Rank histórico porque el proveedor no aporta una serie histórica completa de volatilidad implícita en esta aplicación.

## Dashboard de señales en Sites

El panel independiente `five-millions-signals` es privado y de solo lectura. Permite conectar el backend de Render con su URL y `APP_ACCESS_KEY`, filtrar por ticker/estrategia/estado, actualizar señales y consultar el estado del mercado y noticias. La clave se guarda en el almacenamiento local del navegador. Render debe incluir el origen exacto del Site en `SITE_ORIGIN` para permitir CORS; el backend sigue exigiendo `X-5M-Key`.

## Universo y almacenamiento

- Prioridad: AMD, MSFT y SPY; índices de contexto: SPX, NDX, RUT y VIX.
- Universo rotativo configurable para repartir solicitudes a Tradier.
- Rueda fijada en SOFI y MARA como símbolos destacados; también se pueden analizar otras acciones del universo.
- SQLite persiste exploraciones, feedback y colateral declarado en `DATA_DIR`. En Render el disco está montado en `/var/data`.
- El aprendizaje necesita una muestra mínima antes de dar contexto a Gemini. No modifica strikes, contratos ni decisiones automáticas.

## Ejecutar localmente

```bash
npm install
cp .env.example .env
npm run dev
```

Comprobaciones:

```bash
npm test
npm run build
```

Configura `TRADIER_TOKEN`, `GEMINI_API_KEY` y, para uso protegido, `APP_ACCESS_KEY`. No uses variables `VITE_*` para secretos. Marca `TRADIER_REALTIME_ENTITLED=true` únicamente cuando hayas confirmado ese entitlement con Tradier; la frescura del timestamp se valida por separado.

## Despliegue

La rama `main` despliega en Render mediante `render.yaml` con auto-deploy y disco persistente. En Render hay que configurar los secretos indicados como `sync: false`, confirmar el origen del Site y comprobar `/api/health` después del despliegue. La configuración del plan y las variables privadas no se escriben en el repositorio.

El workflow de GitHub Actions ejecuta `npm test` y `npm run build` en cada pull request y en `main`.

## Límites

Los datos pueden retrasarse, faltar o cambiar entre el escaneo y la orden. Gemini puede omitir noticias; un filtro `CLEAR` no elimina el riesgo. Las primas, asignación temprana, slippage, gaps y movimientos del subyacente pueden cambiar el resultado. Las señales son herramientas de revisión y no asesoramiento financiero personalizado.
