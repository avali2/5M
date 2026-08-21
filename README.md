# 5 MILLIONS

Aplicación privada de señales de opciones para spreads de crédito con datos reales de Tradier y revisión estructurada de Gemini. Está diseñada para leer la señal y ejecutarla manualmente en Robinhood; no envía órdenes.

## Qué hace

- Escanea las 7 magníficas: AAPL, MSFT, NVDA, AMZN, META, GOOGL y TSLA.
- Añade SPY, QQQ, IWM y DIA como índices/ETFs líquidos.
- Busca bull put credit spreads y bear call credit spreads con riesgo definido.
- Obtiene cotizaciones, histórico diario, expiraciones, cadena de opciones, volumen, open interest, IV y Greeks desde Tradier.
- Calcula crédito conservador, crédito ideal, riesgo máximo, ganancia máxima, POP aproximada, tamaño de posición y plan de salida.
- Envía los candidatos principales a Gemini en un JSON estructurado para aprobar, vigilar o rechazar.
- Notifica por Web Push únicamente una señal `READY` que haya pasado los filtros cuantitativos y la revisión de Gemini.
- Incluye protección por `APP_ACCESS_KEY` y mantiene las claves privadas solo en el servidor.

## Decisión de diseño importante

Gemini no calcula ni inventa strikes, crédito, riesgo o probabilidades. El código los construye con la respuesta de Tradier y Gemini solamente audita el candidato. Si Gemini no está disponible, el candidato queda en vigilancia y no se alerta como `READY`.

La POP mostrada es una aproximación de `1 - |delta|` de la pierna corta. No es una probabilidad garantizada ni sustituye el análisis de volatilidad implícita, eventos, liquidez, gaps o asignación.

Tradier no entrega un calendario de earnings en este flujo. La aplicación obliga a confirmar earnings y eventos macro manualmente antes de abrir la operación.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run dev
```

Para generar claves VAPID de Web Push:

```bash
npx web-push generate-vapid-keys
```

Después coloca `publicKey`, `privateKey` y un `VAPID_SUBJECT` en `.env`.

## Variables esenciales

```text
TRADIER_TOKEN=...
GEMINI_API_KEY=...
APP_ACCESS_KEY=una-clave-larga
REQUIRE_ACCESS_KEY=true
CLIENT_ORIGIN=https://tu-servicio.onrender.com
PUBLIC_BASE_URL=https://tu-servicio.onrender.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tu-email@example.com
```

Nunca uses `VITE_TRADIER_TOKEN` ni `VITE_GEMINI_API_KEY`: todo secreto debe permanecer en variables del servidor.

## Render

El `render.yaml` declara un Web Service que compila el frontend y sirve el backend. En Render configura los valores marcados como secretos (`sync: false`), especialmente:

- `APP_ACCESS_KEY`
- `TRADIER_TOKEN`
- `GEMINI_API_KEY`
- `CLIENT_ORIGIN`
- `PUBLIC_BASE_URL`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

El escáner corre dentro del Web Service. Un plan gratuito puede suspender un servicio sin tráfico; para alertas continuas durante la sesión de mercado se necesita mantener el servicio activo o mover el escáner a un Background Worker. El almacenamiento local de suscripciones también es efímero sin disco persistente; para uso serio hay que añadir disco persistente o una base de datos.

## Comandos

```bash
npm run build
npm test
npm start
```

## Fuentes técnicas

- [Tradier: Quotes](https://docs.tradier.com/reference/brokerage-api-markets-get-quotes)
- [Tradier: Options Chains](https://docs.tradier.com/reference/brokerage-api-markets-get-options-chains)
- [Tradier: Options Expirations](https://docs.tradier.com/reference/brokerage-api-markets-get-options-expirations)
- [Google Gemini: Generate content](https://ai.google.dev/api/generate-content)
- [Google Gemini: Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Render: Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render: Environment variables and secrets](https://render.com/docs/configure-environment-variables)
- [MDN: Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
