# Despliegue en Render

`render.yaml` define el servicio web `five-millions-5m-free`, Node 24 y plan Free. El plan no tiene costo mensual, pero puede dormir tras 15 minutos sin tráfico y borra su sistema de archivos al dormir, reiniciar o desplegar. Por eso la base SQLite, el historial y el colateral guardado pueden desaparecer.

## Configuración inicial

1. Conecta el repositorio privado `avali2/5M`, rama `main`, a Render como Blueprint.
2. Configura los valores secretos marcados `sync: false`: `APP_ACCESS_KEY`, `TRADIER_TOKEN`, `GEMINI_API_KEY`, `CLIENT_ORIGIN` (si existe otro cliente), `PUBLIC_BASE_URL` y las claves `VAPID_*`.
3. Conserva `SITE_ORIGIN=https://five-millions-signals.jobvalido.chatgpt.site`. Si Sites muestra otro origen final, actualízalo en Render y en `render.yaml`.
4. Deja `TRADIER_REALTIME_ENTITLED=false` hasta confirmar el entitlement para el token de producción. Activarlo por configuración no sustituye la comprobación de timestamps recientes.
5. Espera a que termine el build y confirma `/api/health`. La pantalla de Sites usa la URL del servicio 5M y pide la `APP_ACCESS_KEY`.

## Verificación operativa

- `/api/health` responde `ok: true`; los campos `configured` indican qué claves están configuradas, no prueban su exactitud ni el entitlement de mercado.
- La interfaz muestra la edad de cotización y bloquea datos vencidos, futuros o sin contexto intradía suficiente.
- El endpoint privado `/api/portfolio` guarda efectivo libre y acciones libres declaradas manualmente. La actualización vence después de `PORTFOLIO_FRESH_HOURS`.
- La API permite el origen del dashboard mediante `SITE_ORIGIN`; todas las rutas privadas siguen requiriendo `X-5M-Key`.
- En el plan Free SQLite es temporal y puede reiniciarse vacía. Al volver a entrar, confirma el estado y vuelve a declarar efectivo y acciones libres antes de considerar señales.
- El escáner de la rueda presenta ideas para revisión manual. Las órdenes del bot se transmiten a Tradier según el modo configurado.

## Variables importantes

`APP_ACCESS_KEY`, `TRADIER_TOKEN` y `GEMINI_API_KEY` son obligatorias para el flujo completo. `SITE_ORIGIN` debe ser un origen HTTPS exacto, sin una ruta. `MAX_DATA_AGE_MINUTES` está limitado a 10 minutos por el código y el valor recomendado es 5. News cache se limita a 5 minutos; se exigen al menos tres fuentes de dominios independientes.

Para desactivar los escaneos programados, configura `SCANNER_ENABLED=false`. Para modificar el tamaño de la muestra del universo usa `MAX_SYMBOLS_PER_SCAN`; el universo siempre rota con prioridad para AMD, MSFT y SPY.

## Motor de órdenes de Tradier

El servicio Free publicado usa `BOT_MODE=shadow` por defecto. El perfil predeterminado `BOT_PROFILE=aggressive` revisa el estado cada 30 segundos y consulta candidatos aproximadamente cada 90 segundos durante la sesión regular. `BOT_PROFILE=standard` conserva revisiones de 60 segundos y búsquedas de 180 segundos. Cuando Render Free se suspende, el proceso se detiene hasta la próxima activación.

### Sandbox

Configura `BOT_MODE=paper`, `BOT_SANDBOX_ACCOUNT_ID` y `TRADIER_SANDBOX_TOKEN` para usar la cuenta de simulación. Si configuras un volumen persistente para `DATA_DIR`, el historial simulado se conserva tras los reinicios. Usa `REQUIRE_ACCESS_KEY=true` y la clave privada del panel.

### Real

1. Prepara un proceso continuo con un disco persistente. En Render, monta el disco en una instancia de pago y configura `BOT_PERSISTENT_MOUNT` con ese punto de montaje. Usa `DATA_DIR` absoluto dentro del disco y `BOT_DURABLE_STORAGE=true`.
2. Configura `TRADIER_TOKEN` y `BOT_ACCOUNT_ID` de la cuenta de producción con permiso de spreads. Configura `TRADIER_REALTIME_ENTITLED=true` tras verificar la suscripción de datos y usa la URL de producción. Confirma que Tradier devuelve cotizaciones frescas de XSP, cadenas de opciones con Greeks y que las previsualizaciones admiten el spread multileg en esa cuenta.
3. Define `BOT_MAX_RISK_USD` en dólares y comprueba que Gemini Search devuelve cobertura reciente. Mantén configuradas la clave y la autenticación del panel. Configura `BOT_MODE=live` para iniciar el motor real.
4. Verifica el estado privado `GET /api/status` en `trading`. El panel muestra el modo, la hora del último ciclo, candidatos y órdenes recientes. `GET /api/health` indica la versión del motor e integraciones configuradas. Los valores de las claves y el número de cuenta se mantienen en el servidor.

Para suspender entradas sin parar la vigilancia, usa **Pausar entradas** en el panel de Render. Una orden aceptada justo antes de la pausa puede ejecutarse antes de que el bot pueda cancelarla. Las órdenes pendientes se reconcilian mediante su etiqueta y orden de Tradier. Si aparece **Revisión**, compara el ticket, las órdenes y las posiciones en Tradier. Preserva el archivo `bot-*.sqlite` y sus archivos asociados al migrar el servicio.

## Perfil de ejecución

| Regla | Agresivo (predeterminado) | Estándar |
| --- | --- | --- |
| Días al vencimiento | 14–35, objetivo 21 | 21–45, objetivo 30 |
| Delta corta absoluta, datos de producción | 0.22–0.38 | 0.15–0.32 |
| Crédito / ancho mínimo | 20% | 17% |
| Objetivo de prima capturada | 50% | 50% |
| Débito que dispara cierre por pérdida | 1.8 × crédito inicial | 2 × crédito inicial |
| Cierre por tiempo | 7 DTE o menos | 7 DTE o menos |
| Cierre por strike corto alcanzado | Sí, con subyacente reciente | No |
| Revisión / búsqueda de entradas | 30 / 90 segundos | 60 / 180 segundos |

No se amplían el límite del 1% del patrimonio, el presupuesto en dólares, el ancho máximo de cinco puntos ni el máximo de una posición y una entrada por sesión. El perfil agresivo acepta strikes con mayor delta y vencimientos más próximos; su rentabilidad no está validada. Los valores son reglas iniciales para evaluar, no una recomendación personalizada de tamaño o una promesa de ingresos.

Las operaciones guardan la política vigente al abrirse. Al reiniciar, las operaciones antiguas sin política guardada conservan las salidas anteriores: 50% de prima, 2× crédito y 7 DTE. Las nuevas columnas SQLite se migran automáticamente preservando el historial. Las salidas de riesgo persistidas aparecen en el panel; pausar entradas no las anula.

Verifica que no haya procesos con distintas versiones del motor escribiendo en el mismo volumen durante una actualización. Conserva una copia consistente de SQLite al migrar almacenamiento.
