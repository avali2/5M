# Implementación de 5 MILLIONS

La rama de producción de esta app es `five-millions`. No despliegues `main`, porque pertenece a la aplicación anterior.

## Opción recomendada: Railway

Railway puede construir el `Dockerfile` desde un repositorio privado y mantener un volumen entre despliegues.

1. En Railway crea **New Project → Deploy from GitHub repo**.
2. Selecciona el repositorio privado `avali2/2M` y la rama `five-millions`.
3. Railway detectará el `Dockerfile` del root.
4. Añade las variables de `.env.example`. No copies las claves a GitHub.
5. Confirma con Tradier que tu token de producción tiene tiempo real y solo entonces fija `TRADIER_REALTIME_ENTITLED=true`.
6. En **Settings → Volumes**, crea un volumen y móntalo en `/app/data`. Ahí vive `five-millions.sqlite`; sin volumen se pierde el aprendizaje al reemplazar la instancia.
7. En **Networking**, genera el dominio público.
8. Coloca ese dominio, con `https://`, en `PUBLIC_BASE_URL` y `CLIENT_ORIGIN`, y vuelve a desplegar.
9. Abre `https://tu-dominio/api/health`; debe responder `ok: true` sin mostrar secretos.
10. Abre la web, escribe `APP_ACCESS_KEY`, pulsa **Revisar mercado** y activa Web Push.
11. Marca una señal de prueba como omitida y comprueba en el panel **Aprendizaje** que aumentó el contador de feedback.

Documentación: [Railway Express](https://docs.railway.com/guides/express) y [Railway Volumes](https://docs.railway.com/guides/docker-compose#5-attach-volumes).

## Render

`render.yaml` permite crear un Web Service. Selecciona explícitamente la rama `five-millions`, configura los secretos y añade un disco persistente montado en el mismo `DATA_DIR` usado por SQLite.

El plan gratuito puede suspender el proceso por inactividad y su filesystem es efímero. Es válido para probar la interfaz, pero no para depender de alertas continuas. Para segundo plano usa un servicio de pago siempre activo o un Background Worker con almacenamiento compartido.

Documentación: [Render free instances](https://render.com/docs/free) y [Render Blueprints](https://render.com/docs/blueprint-spec).

## Fly.io

El `Dockerfile` también es desplegable en Fly.io.

```bash
fly launch --no-deploy
fly volumes create five_millions_data --size 1
fly secrets set TRADIER_TOKEN=... GEMINI_API_KEY=... APP_ACCESS_KEY=...
fly deploy
```

En el `fly.toml` generado configura el puerto interno `8787`, monta el volumen en `/app/data`, desactiva autostop y conserva una Machine activa. El nombre de la aplicación se genera en tu cuenta y por eso no se incluye un `fly.toml` fijo en el repositorio.

Documentación: [Fly deploy](https://fly.io/docs/launch/deploy/), [Fly volumes](https://fly.io/docs/volumes/overview/) y [autostop/autostart](https://fly.io/docs/launch/autostop-autostart/).

## Google Cloud Run

Cloud Run puede construir el mismo contenedor. Para ejecutar el temporizador en segundo plano configura al menos una instancia mínima y CPU disponible fuera de solicitudes. El almacenamiento local no es durable en Cloud Run, por lo que esta versión SQLite no debe usarse allí sin reemplazar el almacén por una base externa.

Documentación: [minimum instances](https://cloud.google.com/run/docs/configuring/min-instances) y [background processing/autoscaling](https://cloud.google.com/run/docs/about-instance-autoscaling).

## Vercel y GitHub Pages

- **Vercel:** no ejecuta indefinidamente el `setTimeout` de este servidor. Requeriría convertir el escáner en Cron Jobs y mover estado/suscripciones a una base de datos externa. No es un despliegue directo de esta versión.
- **GitHub Pages:** solo sirve archivos estáticos. No puede guardar de forma segura `TRADIER_TOKEN` ni `GEMINI_API_KEY`, ni ejecutar el escáner. No debe usarse para esta app.

## Lista de verificación antes de operar

1. `/api/health` muestra Tradier, Gemini y Push configurados.
2. La interfaz dice **Tiempo real confirmado**; si no, no habrá señales verdes.
3. `REQUIRE_AFFORDABLE_SIGNAL=false`; la app muestra riesgo por contrato y no filtra por balance.
4. El semáforo de noticias está `CLEAR`, con las ocho coberturas y al menos tres fuentes.
5. Tú eliges la cantidad; calcula el riesgo total multiplicando el riesgo máximo por contrato.
6. En Robinhood coinciden símbolo, expiración, tipo, strike corto, strike largo y crédito LIMIT.
7. El crédito real sigue por encima del mínimo; si cambió, cancela y vuelve a escanear.
8. Aceptas perder como máximo el riesgo mostrado antes de enviar.
9. Después de cerrar, marcas el resultado y P/L real para que el aprendizaje use datos verdaderos, no fills imaginarios.

Repositorio privado y `APP_ACCESS_KEY` protegen partes distintas: el primero protege el código; la segunda protege la web publicada. Ninguno convierte una estrategia en rentable ni elimina el riesgo de mercado.
