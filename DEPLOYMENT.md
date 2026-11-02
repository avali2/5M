# Despliegue en Render

`render.yaml` define el servicio web `five-millions-5m-free`, Node 24 y plan Free. El plan no tiene costo mensual, pero puede dormir tras 15 minutos sin tráfico y borra su sistema de archivos al dormir, reiniciar o desplegar. Por eso la base SQLite, el historial y el colateral guardado pueden desaparecer.

## Configuración inicial

1. Conecta el repositorio privado `avali2/5M`, rama `main`, a Render como Blueprint.
2. Configura los valores secretos marcados `sync: false`: `APP_ACCESS_KEY`, `TRADIER_TOKEN`, `GEMINI_API_KEY`, `CLIENT_ORIGIN` (si existe otro cliente), `PUBLIC_BASE_URL` y las claves `VAPID_*`.
3. Conserva `SITE_ORIGIN=https://five-millions-signals.jobvalido.chatgpt.site`. Si Sites muestra otro origen final, actualízalo en Render y en `render.yaml`.
4. Deja `TRADIER_REALTIME_ENTITLED=false` hasta confirmar el entitlement para el token de producción. Activarlo por configuración no sustituye la comprobación de timestamps recientes.
5. Espera a que termine el build y confirma `/api/health`. La pantalla de señales de Sites necesita `APP_ACCESS_KEY` y la URL HTTPS del servicio Render.

## Verificación operativa

- `/api/health` responde `ok: true`; los campos `configured` indican qué claves están configuradas, no prueban su exactitud ni el entitlement de mercado.
- La interfaz muestra la edad de cotización y bloquea datos vencidos, futuros o sin contexto intradía suficiente.
- El endpoint privado `/api/portfolio` guarda efectivo libre y acciones libres declaradas manualmente. La actualización vence después de `PORTFOLIO_FRESH_HOURS`.
- La API permite el origen del dashboard mediante `SITE_ORIGIN`; todas las rutas privadas siguen requiriendo `X-5M-Key`.
- En el plan Free SQLite es temporal y puede reiniciarse vacía. Al volver a entrar, confirma el estado y vuelve a declarar efectivo y acciones libres antes de considerar señales.
- El servicio nunca transmite órdenes a Robinhood. Confirma colateral, contrato, crédito, noticias y Greeks actuales antes de operar.

## Variables importantes

`APP_ACCESS_KEY`, `TRADIER_TOKEN` y `GEMINI_API_KEY` son obligatorias para el flujo completo. `SITE_ORIGIN` debe ser un origen HTTPS exacto, sin una ruta. `MAX_DATA_AGE_MINUTES` está limitado a 10 minutos por el código y el valor recomendado es 5. News cache se limita a 5 minutos; se exigen al menos tres fuentes de dominios independientes.

Para desactivar los escaneos programados, configura `SCANNER_ENABLED=false`. Para modificar el tamaño de la muestra del universo usa `MAX_SYMBOLS_PER_SCAN`; el universo siempre rota con prioridad para AMD, MSFT y SPY.
