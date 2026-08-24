# Implementación de 5 MILLIONS

La rama de producción es `main` en el repositorio privado `avali2/5M`.

Requisito clave de esta app: el escaneo es un temporizador que debe correr **24/7** y la base SQLite debe ser **persistente**. El plan gratuito de Render se duerme por inactividad, por eso **no** sirve para alertas continuas. Estas son las opciones recomendadas.

## Opción gratuita recomendada: Oracle Cloud Always Free

Da una VM para siempre (0 USD, sin tarjeta que se vaya a cobrar) con disco persistente. Es la única opción puramente gratis y 24/7.

1. En Oracle Cloud crea una instancia **Ampere A1** (ARM) con Ubuntu 22.04/24.04, 2–4 OCPU y 8–24 GB de RAM (todo dentro del allowance Always Free).
2. Asígnale una IP pública y abre los puertos **80 y 443** en la Security List.
3. (Recomendado) Apunta un dominio A/AAAA a la IP pública, para HTTPS y Web Push.
4. Entra por SSH y ejecuta el instalador incluido:
   ```bash
   bash deploy/oracle-vm/setup.sh
   ```
   El script instala Node 24, clona el repo, compila, crea el usuario `5m`, monta el directorio de datos `/opt/5m/data`, configura `systemd` (arranque automático + reinicio) y el firewall.
5. Edita `/etc/5m.env` y completa `APP_ACCESS_KEY`, `TRADIER_TOKEN`, `GEMINI_API_KEY` y las claves `VAPID_*`.
   - Genera VAPID con: `npx web-push generate-vapid-keys`
   - Confirma el tiempo real con Tradier antes de poner `TRADIER_REALTIME_ENTITLED=true`.
6. HTTPS con Caddy (necesario para Web Push):
   ```bash
   sudo apt-get install -y caddy
   echo 'tu-dominio.com { reverse_proxy 127.0.0.1:8787 }' | sudo tee /etc/caddy/Caddyfile
   sudo systemctl enable --now caddy
   ```
   Pon `CLIENT_ORIGIN` y `PUBLIC_BASE_URL` con `https://tu-dominio.com`.
7. Inicia el servicio:
   ```bash
   sudo systemctl start 5m && sudo systemctl status 5m
   curl http://127.0.0.1:8787/api/health
   ```

## Alternativa casi gratuita y muy simple: Fly.io

Fly.io pide tarjeta una sola vez, pero tiene un plan de **$0** con allowance. Ideal si no quieres administrar una VM. Archivo `fly.toml` ya incluido.

```bash
# Instala flyctl y haz login: https://fly.io/docs/flyctl/install/
fly launch
fly volumes create five_millions_data --size 1 --region iad
fly secrets set TRADIER_TOKEN=... GEMINI_API_KEY=... APP_ACCESS_KEY=... \
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu-email@example.com
fly deploy
```

Nota: el `fly.toml` del repo fija `auto_stop_machines = "off"` y `min_machines_running = 1` para que el temporizador nunca se detenga. El dominio HTTPS lo genera Fly automáticamente; colócalo en `CLIENT_ORIGIN` y `PUBLIC_BASE_URL`.

## Render (de pago)

`render.yaml` (Blueprint) crea el Web Service con un disco persistente de 1 GB. Usa plan **starter** (no `free`), porque `free` se suspende y pierde el temporizador.

1. **New → Blueprint** y conecta `avali2/5M` (rama `main`).
2. Render crea el servicio `five-millions` + disco `five-millions-data` montado en `/var/data` (`DATA_DIR=/var/data`).
3. En **Environment**, configura `APP_ACCESS_KEY`, `TRADIER_TOKEN`, `GEMINI_API_KEY`, `CLIENT_ORIGIN`, `PUBLIC_BASE_URL` y `VAPID_*`.
4. Confirma el tiempo real de Tradier antes de `TRADIER_REALTIME_ENTITLED=true`.
5. Despliega y verifica `https://tu-dominio/api/health`.

## Railway

Railway construye el `Dockerfile` y permite volúmenes, pero ya no tiene plan gratuito persistente fiable. Usa el volumen en `/app/data` y el dominio generado en `PUBLIC_BASE_URL` y `CLIENT_ORIGIN`.

## Otras opciones

- **Google Cloud Run**: el almacenamiento local no es durable y el temporizador necesita CPU fuera de peticiones. No es un despliegue directo de esta versión SQLite.
- **Fly.io con auto_stop** u otros servicios "serverless" que se duermen: **no sirven** para el temporizador.
- **Vercel / GitHub Pages**: no pueden ejecutar el escáner ni guardar secretos de forma segura. No usar.

## Lista de verificación antes de operar

1. `/api/health` muestra Tradier, Gemini y Push configurados.
2. La interfaz dice **Tiempo real confirmado**; si no, no habrá señales verdes.
3. `REQUIRE_AFFORDABLE_SIGNAL=false`; la app muestra riesgo por contrato y no filtra por balance.
4. El semáforo de noticias está `CLEAR`, con las ocho coberturas y al menos tres fuentes.
5. Tú eliges la cantidad; calcula el riesgo total multiplicando el riesgo máximo por contrato.
6. En Robinhood coinciden símbolo, expiración, tipo, strike corto, strike largo y crédito LIMIT.
7. El crédito real sigue por encima del mínimo; si cambió, cancela y vuelve a escanear.
8. Aceptas perder como máximo el riesgo mostrado antes de enviar.
9. Después de cerrar, marcas el resultado y P/L real para que el aprendizaje use datos verdaderos.

Repositorio privado y `APP_ACCESS_KEY` protegen partes distintas. Ninguno convierte una estrategia en rentable ni elimina el riesgo de mercado.