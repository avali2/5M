#!/usr/bin/env bash
# 5 MILLIONS — instalador para Oracle Cloud Always Free (Ubuntu 22.04/24.04)
# Se ejecuta UNA VEZ dentro de la VM. Sin coste recurrente: la instancia
# ARM Ampere A1 y un boot volume de hasta 200 GB entran en Always Free.
#
# Uso (dentro de la VM, como usuario con sudo):
#   bash setup.sh
#
# Requisitos previos en Oracle Cloud:
#   1. Crea una instancia "Ampere A1" (Ubuntu) con 2-4 OCPU y 8-24 GB RAM.
#   2. Asigna una IP pública.
#   3. Abre en la Security List los puertos 80 y 443.
#   4. (Recomendado) Apunta un dominio A/AAAA a la IP pública.
#
# Después termina la configuración copiando los secretos a /etc/5m.env.

set -euo pipefail

APP_DIR="/opt/5m"
ENV_FILE="/etc/5m.env"
APP_USER="5m"
DOMAIN="${DOMAIN:-}"   # ejemplo: export DOMAIN=tu-dominio.com (opcional, para HTTPS)

echo "==> Instalando dependencias del sistema"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg git ufw

echo "==> Instalando Node.js 24 (NodeSource)"
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version

echo "==> Creando usuario de servicio"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  sudo useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

echo "==> Clonando el repositorio"
if [ ! -d "$APP_DIR" ]; then
  sudo git clone https://github.com/avali2/5M.git "$APP_DIR"
  sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

echo "==> Instalando dependencias y compilando"
cd "$APP_DIR"
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run build

echo "==> Creando plantilla de entorno"
if [ ! -f "$ENV_FILE" ]; then
  sudo tee "$ENV_FILE" >/dev/null <<'EOF'
NODE_ENV=production
HOST=0.0.0.0
PORT=8787
DATA_DIR=/opt/5m/data

REQUIRE_ACCESS_KEY=true
APP_ACCESS_KEY=__CAMBIAME__
CLIENT_ORIGIN=https://tu-dominio
PUBLIC_BASE_URL=https://tu-dominio

TRADIER_TOKEN=__CAMBIAME__
TRADIER_BASE_URL=https://api.tradier.com/v1
TRADIER_SANDBOX=false
TRADIER_REALTIME_ENTITLED=false

GEMINI_API_KEY=__CAMBIAME__
GEMINI_MODEL=gemini-2.5-flash
GEMINI_REQUIRED=true
NEWS_CACHE_MINUTES=15
NEWS_MIN_SOURCES=3
NEWS_MAX_CLEAR_RISK=35

PUSH_ENABLED=true
VAPID_PUBLIC_KEY=__CAMBIAME__
VAPID_PRIVATE_KEY=__CAMBIAME__
VAPID_SUBJECT=mailto:tu-email@example.com
EOF
  sudo chmod 600 "$ENV_FILE"
fi

echo "==> Preparando directorio de datos persistente"
sudo mkdir -p /opt/5m/data
sudo chown -R "$APP_USER:$APP_USER" /opt/5m/data

echo "==> Creando servicio systemd (arranque automático)"
sudo tee /etc/systemd/system/5m.service >/dev/null <<EOF
[Unit]
Description=5 MILLIONS options signal engine
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $APP_DIR/server/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable 5m

echo "==> Configurando firewall"
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo ""
echo "==> PASOS RESTANTES (manuales)"
echo "1) Edita $ENV_FILE y completa APP_ACCESS_KEY, TRADIER_TOKEN, GEMINI_API_KEY y VAPID_*."
echo "   Genera las claves VAPID con:  npx web-push generate-vapid-keys"
echo "2) HTTPS (necesario para Web Push). Si tienes dominio, ejecuta:"
echo "   sudo apt-get install -y caddy"
echo "   echo '<TU_DOMINIO> { reverse_proxy 127.0.0.1:8787 }' | sudo tee /etc/caddy/Caddyfile"
echo "   sudo systemctl enable --now caddy"
echo "   Luego pon CLIENT_ORIGIN y PUBLIC_BASE_URL con https://<TU_DOMINIO>."
echo "3) Inicia el servicio:"
echo "   sudo systemctl start 5m && sudo systemctl status 5m"
echo "4) Verifica: curl http://127.0.0.1:8787/api/health"
EOF