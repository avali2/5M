# Estrategias - VALIDO 1M OS

La plataforma prioriza riesgo definido y revision manual. No ejecuta ordenes reales.

## Permitidas Para Tickets Reales

- Bull Put Spread
- Bear Call Spread
- Bull Call Debit Spread
- Bear Put Debit Spread
- Iron Condor
- Iron Butterfly definido
- Calendar/Diagonal solo si el ticket muestra supuestos y riesgo
- Covered Call si existe posicion
- Cash Secured Put si el colateral cabe en el plan

## Solo Educativo / Paper

- Naked calls
- Naked short puts sin colateral
- Short straddle/strangle sin cobertura
- Ratio spreads con riesgo indefinido
- Martingala o aumentar tamano tras perdida

## Reglas Base

Credit spreads:
- POP estimada preferida 70%+
- short delta 0.15-0.30
- credito ideal educativo 20%-35% del ancho
- take profit 40%-60% del credito
- stop 1.5x-2x credito o invalidacion tecnica

Debit spreads:
- long delta 0.45-0.65
- IV baja/moderada
- momentum alineado
- stop 40%-50% del debito
- take profit segun target/resistencia/soporte

Iron condor:
- mercado lateral o gamma positiva/proxy estable
- short strikes fuera de expected move si hay datos
- evitar macro/earnings cercanos sin plan
- riesgo definido obligatorio

## Robinhood Checklist

1. Buscar simbolo.
2. Options.
3. Elegir expiracion exacta.
4. Seleccionar legs exactas.
5. Usar limit order.
6. No usar market order.
7. Confirmar max loss que muestra el broker.
8. Confirmar credito/debito.
9. Confirmar bid/ask, OI, volumen, IV y Greeks.
10. Si el precio rompio invalidacion o el limit ya no existe, no perseguir.
