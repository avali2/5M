# Pasar el Bot Real a dinero real

Verificado: en Render hoy solo existe el token **sandbox** (`TRADIER_SANDBOX_TOKEN`, cuenta VA2198539).
El endpoint de producción responde 401 con ese token, por eso el Bot Real queda bloqueado.

## Requisitos (los 5 gates)
| Gate | Qué tenés que hacer |
| --- | --- |
| Datos producción | Crear un token de API en tu cuenta **Tradier Brokerage** (dashboard.tradier.com → API access) y guardarlo como `TRADIER_TOKEN`. |
| Tiempo real confirmado | `TRADIER_REALTIME_ENTITLED=true` (tu cuenta debe tener el entitlement de datos en tiempo real). |
| Cuenta live | `BOT_ACCOUNT_ID` = número de la cuenta de producción (empieza con `VA`). |
| Confirmación explícita | `LIVE_CONFIRM=I_ACCEPT_REAL_MONEY`. |
| Disco persistente | Plan de Render pago con disco (mount `/var/data`) y `DATA_DIR=/var/data`, `BOT_DURABLE_STORAGE=true`. Alternativa: correr el bot en tu PC/VPS con `deploy/oracle-vm` (disco propio, sin costo de Render). |

## Pasos
1. Render → Environment: cargar los 5 valores y redeploy.
2. En la app: **Bot Real** → “Verificar token producción” (debe decir OK y listar tu cuenta).
3. Si todo queda en verde: “Armar bot”. DeepSeek sigue aprobando cada plan (modo `required`).
4. Empezar con `CREDIT_BOT_MAX_RISK_USD` chico (ej. 250) y revisar el journal los primeros días.

## Aviso
Operar con dinero real tiene riesgo de pérdida total o parcial. El bot limita a una posición y corta en 2,5x el crédito, pero no garantiza ganancias.
