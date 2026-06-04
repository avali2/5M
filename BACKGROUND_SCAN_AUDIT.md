# BACKGROUND_SCAN_AUDIT.md

## Dependencia del navegador/front-end

Hay dependencia mixta.

Backend real:

- `server/services/scheduler.js` usa `setInterval` en Node para refrescar el scanner cada `settings.refreshSeconds`.
- `server/autonomousSignalWorker.js` usa `setInterval` cada 60s y decide ciclos de scan/noticias/posiciones segun sesion de mercado.
- `server/guardianScheduler.js` usa `setTimeout` para reprogramar scans Guardian.
- `server/scheduler/autonomousWorker.js` usa `setInterval` cada 3 minutos en el servidor legacy `server/index.mjs`.

Frontend/browser:

- `src/AppPro.jsx` llama `load()` al montar y luego `setInterval(load, 60000)` contra `/api/scan`.
- `src/components/SystemStatus.jsx` y `src/components/MarketSentiment.jsx` tambien hacen polling cada 60s.
- `src/features/options-guardian-agent/agentScheduler.js` usa `window.setTimeout`, por lo que depende de la pestana/navegador.
- `src/features/options-guardian-agent/GuardianPanel.jsx` puede entregar notificaciones locales si el usuario esta en la UI.
- `src/components/NotificationManager.jsx` registra service worker y permite pruebas locales.

Conclusion: el scanner principal no depende exclusivamente del navegador, pero la percepcion de frescura, algunas notificaciones locales y parte del Guardian frontend si dependen de que la app este abierta y no throttled por el navegador.

## Uso de setInterval, useEffect y estado frontend

- `server/services/scheduler.js`: `setInterval(() => this.run(true), refreshSeconds * 1000)`.
- `server/autonomousSignalWorker.js`: `setInterval(..., 60_000)` y `setTimeout(..., 5000)` inicial.
- `server/guardianScheduler.js`: `setTimeout` recursivo; no es cron externo.
- `src/AppPro.jsx`: `useEffect` + `setInterval(load, 60000)`.
- `src/components/SystemStatus.jsx`: `useEffect` + `setInterval(load, 60000)`.
- `src/components/MarketSentiment.jsx`: `useEffect` + `setInterval(fetchSentiment, 60000)`.
- `src/features/options-guardian-agent/agentScheduler.js`: `window.setTimeout`.

Riesgo: navegadores reducen timers en segundo plano y moviles pueden suspender la PWA. Si una funcion critica vive en frontend, puede volverse "mareada" o atrasada.

## Existe cron/server-side scan?

Existe server-side scan, pero no cron formal.

- `ScanScheduler` corre dentro del proceso Express.
- `AutonomousSignalWorker` corre dentro del proceso Express cuando `createApp(..., { startBackground: true })`.
- `GuardianScheduler` corre dentro del proceso Express.
- `server/index.mjs` tiene otro worker legacy controlable por `/api/scheduler/start|stop`, pero `package.json` arranca `server/index.js`.

No se encontro:

- Cron externo en `render.yaml` para scans.
- BullMQ/Agenda/Temporal/Celery u otra cola persistente.
- Lock distribuido o job idempotente para multiples replicas.
- Worker separado dedicado con proceso propio en package scripts.

## Existen jobs persistentes?

Persistencia parcial:

- `server/db/repository.js` persiste journal, settings Guardian, events, feedback, push subscriptions, snapshots e IV history.
- `GuardianScheduler` registra `guardian_scan_runs`.
- `server/lib/store.js` persiste alertas en `data/` por defecto.

No persistente:

- Timers activos (`setInterval`/`setTimeout`) no sobreviven reinicio.
- Estado de `latest` en `ScanScheduler` vive en memoria.
- Estado de `lastGeneralScan`, `lastNewsScan`, `lastGeminiBrief`, `lastOpenPositionsAlert` vive en memoria.
- No hay lock/cadencia persistida para evitar duplicados si hay mas de una instancia.

## Notificaciones: servidor o frontend

Servidor:

- `server/push.js` envia Web Push con VAPID a suscripciones guardadas.
- `server/autonomousSignalWorker.js` envia push para oportunidades, riesgo critico, noticias y posiciones.
- `server/guardianScheduler.js` envia `sendGuardianEvent`.
- `server/guardianRoutes.js` expone `/api/push/*`.

Frontend:

- `public/sw.js` recibe push server-side y muestra notificacion.
- `src/services/notifications.js` y `src/features/options-guardian-agent/webPushClient.js` registran service worker, piden permiso y suscriben.
- `src/features/options-guardian-agent/agentNotifications.js` y `GuardianPanel.jsx` pueden mostrar notificaciones locales desde el navegador.

Conclusion: las alertas importantes tienen soporte server-side Web Push, pero la suscripcion, pruebas y algunas notificaciones Guardian locales dependen del frontend. En segundo plano, las notificaciones locales del navegador no son equivalentes a Web Push server-side.

## Recomendacion tecnica

Mover el escaneo critico a un worker backend separado y persistente:

1. Crear un proceso `npm run worker:scanner` separado del servidor web.
2. Usar una cola/job runner persistente: BullMQ + Redis, PgBoss/Postgres, Agenda, o cron externo de Render que llame un endpoint interno protegido.
3. Persistir cada scan con `scan_run_id`, estado, started/completed/error, simbolos, proveedor activo, warnings y resumen de bloqueos.
4. Implementar lock distribuido por scan para evitar multiples workers corriendo el mismo ciclo.
5. Separar tres cadencias: market pulse, full scan, macro/news; cada una con backoff ante errores de proveedor.
6. Convertir frontend en consumidor de snapshots (`GET /api/scan/latest`) en vez de disparador implicito.
7. Mantener Web Push exclusivamente server-side para senales reales; dejar frontend solo para permiso/suscripcion y pruebas.
8. Cuando Gemini devuelva 429, degradar a `AI_PENDING_MANUAL_REVIEW` sin bloquear candidatos deterministas, salvo que el modo estricto lo exija explicitamente.
9. Tratar proveedores premium como degradables: Polygon/Benzinga no deberian bloquear si Tradier/Yahoo entregan chain suficiente.
10. Agregar auditoria por candidato: motivo exacto de no verde, umbral requerido, valor observado y proveedor/fuente.

## Diagnostico probable de "mareado en segundo plano"

- El panel frontend refresca con timers que el navegador puede pausar.
- El backend tambien corre timers, pero solo mientras el proceso Node este vivo y sin reinicios.
- Si el usuario espera que la pestana mantenga ciclos o notificaciones locales, el navegador puede throttlearlas.
- Si Render duerme/reinicia o corre varias instancias, los timers en memoria pueden perder estado o duplicarse.
- Las senales pueden alternar entre `no_trade`, `conditional_edge`, `EDGE_*` y `opportunities=[]`, dando apariencia inestable aunque el motor este aplicando gates estrictos.
