# Guía operativa de señales 5M

Esta guía resume criterios operativos derivados del material del proyecto sobre ciclo de la rueda, opciones, colateral, análisis técnico, premercado y psicología. Es una síntesis de trabajo, no una reproducción de los libros ni una afirmación de rentabilidad.

## Alcance

- Solo Cash-Secured Puts y Covered Calls cubiertas por acciones disponibles.
- El ciclo de rueda es una secuencia posible, no una obligación: vender puts solo si se aceptaría la asignación y vender calls solo si se aceptarían las acciones vendidas al strike.
- Cierre o roll requieren comparar el débito/crédito total, el nuevo punto de equilibrio, el tiempo adicional expuesto, los eventos y el colateral después del ajuste.
- Sin spreads, posiciones descubiertas, 0DTE o tamaños mayores al colateral libre.

## Orden de revisión

1. **Régimen y calendario:** revisar SPY, índices de contexto, volatilidad, calendario macro, noticias y eventos específicos del ticker. Si falta cobertura o hay contradicciones, el resultado es esperar.
2. **Estructura:** valorar tendencia en varios marcos, niveles cercanos, máximos/mínimos y reacción del precio con volumen. Wyckoff y los patrones gráficos sirven como hipótesis de contexto; no son señales automáticas ni predicen por sí solos el siguiente movimiento.
3. **Contrato:** verificar vencimiento, strike, bid/ask, volumen, interés abierto, delta y timestamp. No asumir que el punto medio será ejecutable. Greeks y delta pueden estar retrasados y delta no equivale a una probabilidad calibrada.
4. **Colateral:** reconciliar efectivo no comprometido para CSP y acciones libres por ticker para CC con Robinhood justo antes de enviar. Una captura manual puede quedar obsoleta tras una orden, asignación o movimiento de efectivo.
5. **Plan:** definir crédito mínimo, punto de equilibrio, pérdida bajo escenarios de gap, objetivo de recompra y condición de invalidación. El stop de una opción puede ejecutarse con slippage o no ejecutarse al precio esperado.
6. **Decisión:** si no se puede explicar por qué aceptarías la asignación y qué harías después, no abrir. Esperar es un resultado válido.

## Lectura de una señal

- `READY` significa que los filtros del sistema están satisfechos y que puede comenzar la revisión manual. No significa recomendación personalizada, orden aprobada por Robinhood ni probabilidad de ganancia.
- El score ordena candidatos con criterios internos; no es una tasa de éxito. La actividad inusual de opciones es observacional y no identifica quién operó ni su intención.
- El filtro de noticias reduce omisiones, pero depende de resultados de búsqueda y puede fallar. Confirma manualmente earnings y eventos corporativos antes de abrir.
- La prima cobrada no limita la pérdida de una CSP al crédito: si la acción cae, la exposición económica puede ser grande. En una CC, la prima tampoco protege completamente las acciones ante una caída.
- La asignación puede ocurrir antes del vencimiento. Después de una asignación, actualiza el efectivo y las acciones libres antes de evaluar el siguiente tramo de la rueda.

## Lista pre-ejecución

- Estoy en condiciones de seguir el plan sin operar por impulso.
- Revisé mercado, volatilidad, noticias, earnings y eventos del ticker.
- Confirmé en Robinhood la cadena vigente, bid/ask, strike, expiración y cantidad.
- Verifiqué efectivo o acciones libres, incluyendo órdenes abiertas y otras reservas.
- Aceptaría el resultado de asignación y puedo cubrir el riesgo bajo una caída fuerte.
- Dejé definidos objetivo, invalidación, tiempo de reevaluación y criterio de cierre o roll.

Si falta una confirmación, mantén la operación en espera. No aumentes el tamaño para recuperar pérdidas ni rolar únicamente para aplazarlas.

## Material consultado

Síntesis del material del proyecto: *El ciclo de la rueda*, *Control de colateral*, *Checklist pre-market IV*, *El mapa de las opciones*, *El método Wyckoff*, *Análisis técnico de los mercados financieros*, *Market Wizards*, *Trading en la zona* y *Trading para vivir*. El material de patrones gráficos y las historias de traders se tratan como contexto educativo, no como evidencia estadística del desempeño de este motor.
