# Puente MT5 -> 5M

El servidor 5M corre en Linux; MT5 es Windows. El EA 5M-Bridge.mq5 hace polling al servidor y reporta cuenta, posiciones y quotes.

## 1. Token
En Render -> Environment defini MT5_BRIDGE_TOKEN (o usa CRON_TOKEN). Copia el valor.

## 2. Instalar MT5
En una PC Windows o VPS (recomendado 24/5): instala MetaTrader 5 y abre una cuenta demo.

## 3. Permitir la URL
MT5 -> Herramientas -> Opciones -> Expert Advisors:
- activar "Permitir WebRequest para las URL listadas"
- agregar: https://five-millions-5m-free.onrender.com

## 4. Cargar el EA
Compila deploy/mt5/5M-Bridge.mq5 en MetaEditor y adjuntalo a un grafico. Configura:
- BridgeUrl: https://five-millions-5m-free.onrender.com
- BridgeToken: el token del paso 1
- Symbols: EURUSD,GBPUSD,XAUUSD,USDJPY,USDCAD
- Algo Trading: activado

## 5. Verificar
- GET /api/mt5/status (con X-5M-Key) debe mostrar connected: true, cuenta y posiciones.
- Prueba manual: POST /api/mt5/command con {"action":"NOOP"}.
- Prueba demo: POST /api/mt5/command con {"action":"BUY","symbol":"EURUSD","volume":0.01}.

## Notas
- El EA solo ejecuta comandos autenticados del servidor; no abre el puerto local.
- Si el terminal se desconecta, el estado queda connected:false a los 30 s.
- Para real: misma arquitectura, cuenta real y limites de riesgo.