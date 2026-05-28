# Data Sources - VALIDO 1M OS

La app sigue la cadena:

`Dato -> Fuente -> Calculo -> Interpretacion -> Estrategia -> Riesgo -> Simulacion -> Paper Trade -> Journal`

## Fuentes

| Dato | Fuente | Key | Uso | Limitacion |
| --- | --- | --- | --- | --- |
| Quotes | Tradier / Yahoo fallback | `TRADIER_ACCESS_TOKEN` | Precio, bid/ask, volumen | Yahoo puede ser delayed |
| Option chain | Tradier / Yahoo fallback | `TRADIER_ACCESS_TOKEN` | Strikes, expiraciones, bid/ask, Greeks si disponibles | Si faltan IV/Greeks, no se inventan |
| Noticias | Alpha Vantage / Finnhub / FMP / Yahoo | keys opcionales | Links, titulares, sentimiento si disponible | No se inventan noticias |
| Macro | Finnhub / FMP / reglas internas | keys opcionales | CPI, FOMC, NFP, PCE, Fed speakers | 24-48h es overlay, no bloqueo duro |
| Volatilidad | Chain + VIX quote | provider market/options | IV, expected move, vol risk | IV Rank requiere historial |
| GEX | Chain gamma + OI proxy | options chain | Aproximacion educativa | No es dealer positioning confirmado |
| POP/EV | Motor deterministico | no key | Estimaciones | No garantizan resultado |
| AI tutor | Gemini / OpenAI / fallback | keys opcionales | Explicacion educativa | No calcula trades |

## Regla De Transparencia

Cada numero importante debe indicar:

- fuente;
- endpoint o motor;
- timestamp;
- formula;
- confianza;
- si es live, delayed, manual, snapshot o mock;
- limitacion.

Si falta un dato, la UI debe mostrar `No disponible` o `Datos insuficientes`, nunca rellenarlo con un valor favorable.
