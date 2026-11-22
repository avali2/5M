# 5 MILLIONS

> **Mejora integral (rama `mejora-dsh`)**: mesa direccional **NiTo CALL/PUT**, **spreads agresivos**, **posicionamiento institucional** (GEX/DEX/muros/max pain), **analista IA DeepSeek + Gemini** y rediseño completo con tema claro/oscuro, iconos y gráficos propios. Ver [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md).

## Arranque rápido

```bash
npm install
npm run dev          # Vite + API en 127.0.0.1:8787 (proxy /api)
npm test             # 77 tests
npm run smoke:engines  # señales, spreads y posicionamiento contra el mercado demo
```

Sin `TRADIER_TOKEN` la app arranca en **modo demo** (mercado simulado, marcado como "NO OPERAR").
Con `TRADIER_TOKEN` usa datos reales. Para IA: `GEMINI_API_KEY` y/o `DEEPSEEK_API_KEY`.

### Pantallas

| Pestaña | Qué hace |
| --- | --- |
| **NiTo** | Señales de compra de CALL y PUT con contrato, entrada, breakeven, objetivos, stop, POP de modelo, escenarios, tamaño por riesgo y texto para copiar. Radar por símbolo y motivos de descarte. |
| **Spreads** | Bull put, bear call, iron condor, iron fly, jade lizard, broken wing y débito direccional con perfiles estándar/agresivo/máximo, patas con precio real, POP, EV, stress y plan de ajustes. |
| **Institucional** | GEX/DEX por strike, muros de calls/puts, gamma flip, max pain, movimiento esperado, IV por vencimiento, skew 25Δ y lectura en español. |
| **IA** | Chat en streaming y tareas: explicar señal, explicar spread, leer posicionamiento, briefing y auditoría de riesgo. Router DeepSeek/Gemini con fallback. |
| **Rueda** | Mesa original de Cash-Secured Puts y Covered Calls (Tradier + Gemini), con la nueva estética. |
| **Sistema** | Estado de integraciones, claves (solo servidor), capital para dimensionar, tema y referencia de variables de entorno. |

### API nueva

`GET /api/market/:symbol` · `GET /api/nito/directional?symbols=SPY,QQQ&side=both&account=10000` · `GET /api/spreads?profile=aggressive` · `GET /api/positioning?symbol=SPY` · `GET /api/ai/status` · `POST /api/ai/analyze` · `POST /api/ai/chat` (SSE).

### Seguridad y límites

- Las claves de IA y Tradier viven **solo en el servidor**; el navegador nunca las recibe.
- Las probabilidades son de modelo (Black-Scholes + lognormal neutral al riesgo): comparan escenarios, **no garantizan** resultados.
- En modo demo todas las señales quedan marcadas `operable: false` y la UI muestra el banner de datos simulados.
- La rueda conserva sus guardas: `READY` exige datos frescos, noticias verificadas y colateral declarado.


## Mesa original del dueño (rueda)

Mesa privada de spreads y señales de opciones. El motor autónomo usa Tradier para spreads de crédito y el escáner de la rueda genera ideas de Cash-Secured Put y Covered Call para revisión manual.

## Motor autónomo de Tradier

| Modo | Subyacente | Comportamiento |
| --- | --- | --- |
| `shadow` | XSP con datos de producción o SPY con Sandbox | Calcula candidatos y publica el estado. Es el modo predeterminado en Render Free. |
| `paper` | SPY | Gestiona órdenes y posiciones de una cuenta Tradier Sandbox con cotizaciones retrasadas. Usa moneyness cuando Sandbox no ofrece Greeks. |
| `live` | XSP | Previsualiza y envía órdenes multileg cuando la cuenta, cotizaciones, noticias, poder de compra y volumen persistente pasan sus comprobaciones. |
| `off` | — | Desactiva el motor. |

- Un bull put spread con tendencia alcista, un bear call spread con tendencia bajista o un iron condor simétrico en mercado lateral. El condor está disponible de forma predeterminada en observación y Sandbox. El modo real requiere habilitarlo.
- El régimen combina EMA20, retorno de cinco sesiones y volatilidad realizada anualizada de SPY. Usa cierres de sesiones completas y descarta volatilidad realizada superior al 35%. El perfil agresivo selecciona 14–35 DTE y prioriza 21 DTE; el perfil estándar conserva 21–45 DTE con objetivo de 30 días.
- La entrada exige contratos estándar, liquidez en las patas, crédito natural de al menos el 20% del ancho máximo en el perfil agresivo (17% en estándar), cotizaciones recientes y, en real, delta absoluta de la pata corta entre 0.22 y 0.38 en agresivo (0.15–0.32 en estándar). El panel muestra Greeks netos por unidad. Tradier actualiza estos Greeks aproximadamente cada hora.
- Pérdida teórica antes de comisiones = (ancho máximo menos crédito) × 100. Ganancia bruta máxima = crédito × 100. El motor estima comisión y tasas antes de la entrada. La probabilidad de ganancia queda sin estimar hasta contar con una muestra histórica verificable.
- Un contrato por pata, una posición del bot a la vez y una entrada registrada como máximo por sesión. En real, el presupuesto queda limitado al menor de `BOT_MAX_RISK_USD`, 1% del patrimonio de la cuenta y el poder de compra en opciones. Las pérdidas netas de la sesión reducen el presupuesto disponible.
- Objetivo de recompra al 50% del crédito de entrada, umbral de pérdida al débito de 1.8× el crédito en agresivo (2× en estándar) y salida por tiempo desde 7 DTE. El perfil agresivo solicita cierre también si el subyacente alcanza un strike vendido con cotización reciente. Son disparadores de órdenes limitadas. La ejecución depende de la liquidez y no está garantizada.
- Ante respuestas ambiguas, concilia la orden mediante su etiqueta y el estado de cada pata. Una discrepancia de posiciones bloquea nuevas entradas. La pausa bloquea entradas y solicita cancelar entradas pendientes, con gestión de cierres todavía activa.
- XSP liquida en efectivo y es de ejercicio europeo. La rentabilidad de estas reglas está por validar. El modo Sandbox con SPY sirve para validar el flujo de órdenes y tiene una mecánica de asignación distinta.

El perfil predeterminado es `BOT_PROFILE=aggressive`. Cambiar el perfil solo cambia nuevas entradas: cada operación conserva su política de salida. En agresivo se comprueba el estado cada 30 segundos y se buscan entradas cada 90 segundos; en estándar, cada 60 y 180 segundos. Estos intervalos dependen de que el servidor permanezca activo y de la latencia de las APIs.

Las salidas por pérdida, vencimiento o strike se guardan antes de solicitar la previsualización. Se reintentan con cotizaciones válidas después de un reinicio, rechazo o cancelación confirmada, aunque el precio vuelva a mejorar. Una orden de resultado desconocido se reconcilia antes de intentar otra. Las tomas de beneficio solo se reintentan si el objetivo sigue cumpliéndose. Una pérdida completamente ejecutada se contabiliza incluso si el broker comunica un estado terminal de cancelación.

Las claves del broker se configuran en el servidor. El panel de Render tiene el control de pausa y el panel privado de Sites permite consultar candidatos, órdenes y posiciones. La [guía de despliegue](DEPLOYMENT.md) describe las variables y los estados de revisión.

## Qué hace una señal de la rueda

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
- Perfil de rueda: 14–45 DTE, objetivo 30 DTE y delta absoluta 0.15–0.30. 0DTE y posiciones descubiertas no forman parte del motor; los spreads pertenecen a la mesa autónoma de Tradier descrita arriba.
- Volumen mínimo de opción 10, interés abierto mínimo 100 y spread bid/ask máximo 25% del punto medio por defecto. Estos filtros reducen candidatos poco líquidos, pero no garantizan un fill.
- Las cotizaciones de subyacente deben tener timestamp reciente (5 minutos por defecto) y contexto intradía suficiente. Una bandera de configuración no verifica por sí sola el entitlement de Tradier.
- Tradier puede entregar Greeks en snapshots horarios sin timestamp por contrato. Revisa delta y precio actuales en Robinhood antes de operar.
- `score` ordena candidatos. `delta` no es una probabilidad calibrada; el sistema no muestra una POP como certeza.
- Actividad de opciones y aprendizaje son observacionales. No revelan identidad/intención del participante ni pueden aprobar por sí solos una señal.
- No se usa IV Rank histórico porque el proveedor no aporta una serie histórica completa de volatilidad implícita en esta aplicación.

La [guía operativa](OPERATIONAL_PLAYBOOK.md) reúne el orden de revisión, el uso prudente de análisis técnico y una lista manual antes de enviar la orden. Cada tarjeta también ofrece esa lista; marcarla no cambia el estado algorítmico ni confirma la ejecución.

## Dashboard de señales en Sites

El panel privado `five-millions-signals` conecta al servicio Render de 5M con `APP_ACCESS_KEY`. Muestra la actividad del bot y permite filtrar las señales de la rueda por ticker, estrategia y estado. La clave se guarda en el navegador y se envía a la URL de Render del proyecto. `SITE_ORIGIN` permite ese Site por CORS y la API autentica con `X-5M-Key`.

## Universo y almacenamiento

- Prioridad: AMD, MSFT y SPY; índices de contexto: SPX, NDX, RUT y VIX.
- Universo rotativo configurable para repartir solicitudes a Tradier.
- Rueda fijada en SOFI y MARA como símbolos destacados; también se pueden analizar otras acciones del universo.
- SQLite guarda exploraciones, feedback y colateral declarado en `DATA_DIR`. En Render Free la carpeta es temporal: Render puede borrar esos datos al dormir, reiniciar o desplegar el servicio. Revisa el colateral en Robinhood antes de cada escaneo; al reiniciar tendrás que volver a registrarlo.
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

La rama `main` despliega en Render Free mediante `render.yaml` con auto-deploy. El servicio puede dormir tras inactividad y su sistema de archivos es temporal; para conservar historial y colateral se necesita almacenamiento externo o un plan con disco. En Render hay que configurar los secretos indicados como `sync: false`, confirmar el origen del Site y comprobar `/api/health` después del despliegue.

El workflow de GitHub Actions ejecuta `npm test` y `npm run build` en cada pull request y en `main`.

## Límites

Los datos pueden retrasarse, faltar o cambiar entre el escaneo y la orden. Gemini puede omitir noticias; un filtro `CLEAR` no elimina el riesgo. Las primas, asignación temprana, slippage, gaps y movimientos del subyacente pueden cambiar el resultado. Las señales son herramientas de revisión y no asesoramiento financiero personalizado.


## Integridad operativa del escáner y NiTo

- El panel general inicia una exploración manual con `POST /api/scan/jobs` y consulta su progreso con `GET /api/scan/jobs`. La ruta original permanece disponible para clientes existentes.
- Las revisiones READY se degradan a WATCH si caducan cotizaciones, velas, noticias o colateral, o durante una exploración pendiente o fallida. Se revalida la vigencia antes de publicar el resultado y al consultar la API; los estados históricos no autorizan una orden.
- `/api/health` distingue la disponibilidad HTTP de la configuración de Tradier/Gemini. Una aplicación publicada no equivale a una integración operativa.
- NiTo (`/nito`) es una herramienta privada de investigación M5/M15/D1. No envía órdenes. El propietario accede mediante su clave habitual. Para invitados se necesita autorización de distribución del proveedor y una clave privada distinta; `NITO_SHARE_AUTHORIZED` no debe habilitarse sin dicha autorización.
- Render Free puede suspender la instancia cuando está inactiva; no se garantiza la ejecución continua ni la persistencia de trabajos en curso. Nunca traslades un token de negociación a otro servicio sin revisar su alcance.

### Verificación de producción

En Render comprueba `/api/health`, `configured.tradier`, `configured.gemini` y `security.requiresKey`. El escáner exige mercado abierto para READY; los fines de semana no puede validarse una señal intradía en vivo. Verifica las credenciales de forma segura en el panel de entorno, sin registrarlas en GitHub, mensajes ni logs. Las pruebas automáticas no certifican rentabilidad, calidad de fills ni una estrategia de trading.


### NiTo Market Pulse

La ruta `/nito` es pública y no pide inicio de sesión. Ofrece saludo diario y laboratorio de escenarios M5 con niveles ingresados por el visitante. La API anónima no consulta Tradier ni devuelve contratos activos. La API de datos de uso personal conserva sus requisitos de autorización. Ninguna página pública accede a órdenes, credenciales, posiciones o balances. Para habilitar cotizaciones públicas se necesita una fuente con derechos de distribución adecuados.


### Gráficos y diagnóstico de integración

El gráfico externo es un widget oficial de TradingView con su atribución, selector de activo/intervalo y enlace directo de respaldo. Está aislado en un iframe sin acceso de mismo origen al panel administrativo y no es un feed ni un requisito de ejecución del bot. Algunos mercados se muestran con retraso y algunos navegadores bloquean contenido externo. El gráfico no solicita las claves de la app.

En Render, añade por separado `TRADIER_TOKEN` y `GEMINI_API_KEY` en el servicio correcto. `APP_ACCESS_KEY` solo protege el acceso web. Si la API falta, la interfaz indica desconexión; no inventa señales ni presume que el scheduler se ejecuta. La mesa educativa NiTo se ofrece en https://valido-1m.onrender.com/nito; no compartas tu clave administrativa ni tokens privados. No se cambia BOT_MODE ni se activa ejecución de órdenes con esta actualización.