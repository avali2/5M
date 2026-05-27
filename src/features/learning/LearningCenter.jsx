import { useMemo, useState } from 'react';

const lessons = [
  {
    title: '1. Precios, quote y ejecucion',
    text: 'El quote llega del proveedor configurado. Bid es lo que ofrecen compradores; ask es lo que piden vendedores; last es la ultima ejecucion; mark o mid es (bid + ask) / 2. El mid sirve para estimar, pero no garantiza fill. En opciones iliquidas evita market orders: usa LIMIT y revalida el spread justo antes de enviar.'
  },
  {
    title: '2. Cadena de opciones',
    text: 'Una chain agrupa contratos por expiracion y strike, call o put. Cada contrato puede traer bid, ask, volumen, open interest, IV y Greeks. Valido 1M solicita la cadena al backend; si esos campos no llegan o no tienen liquidez, no fabrica una estrategia.'
  },
  {
    title: '3. Riesgo maximo',
    text: 'Credit spread: (ancho del spread - credito recibido) x 100. Debit spread: debito pagado x 100. Iron condor definido: (ala mas ancha - credito neto) x 100. Long option: prima pagada x 100. Cash secured put: (strike x 100) - prima recibida, con efectivo reservado.'
  },
  {
    title: '4. Ganancia maxima',
    text: 'Credit spread e iron condor: credito recibido x 100. Debit spread: (ancho - debito) x 100. Covered call: prima mas apreciacion hasta strike, sujeto a tener acciones. Long call puede tener beneficio teoricamente no limitado, pero su riesgo sigue siendo la prima.'
  },
  {
    title: '5. Greeks',
    text: 'Delta aproxima cambio por $1 del subyacente y direccion. Gamma mide cuanto cambia delta, especialmente peligroso cerca del vencimiento. Theta aproxima decay diario. Vega mide sensibilidad a un punto de IV. Rho mide sensibilidad a tasas y suele ser menos inmediato en estrategias cortas.'
  },
  {
    title: '6. Volatilidad',
    text: 'IV es volatilidad implicita del contrato. IV Rank compara IV actual con su minimo y maximo historico persistido: ((IV actual - min) / (max - min)) x 100. IV Percentile cuenta sesiones por debajo de la IV actual. Expected move se estima de un straddle ATM o IV. IV crush es la contraccion posterior a un evento; skew y term structure se muestran solo cuando exista fuente/calculo completo.'
  },
  {
    title: '7. Seleccion de estrategia',
    text: 'Bull Put Spread: sesgo alcista/neutral con prima adecuada y riesgo definido. Bear Call Spread: sesgo bajista/neutral. Debit Spread: direccion cuando comprar volatilidad tiene sentido. Iron Condor: rango, liquidez, gamma estable y ausencia de eventos. Calendar: comportamiento temporal/IV, requiere modelado cuidadoso. No uses ingreso por theta si hay noticia binaria, mala liquidez o riesgo que rebasa tu mandato.'
  },
  {
    title: '8. Price action y Wyckoff basico',
    text: 'Soporte y resistencia delimitan zonas de reaccion, no promesas. EMA y volumen ayudan a clasificar tendencia; VWAP intradia confirma aceptacion de precio cuando existe feed intradia. Wyckoff observa acumulacion, distribucion, oferta/demanda y esfuerzo frente a resultado. Siempre exige confirmacion antes de una entrada.'
  },
  {
    title: '9. Checklist pre-trade',
    text: 'Revisa evento macro, earnings, noticias recientes, liquidez, bid/ask, open interest, riesgo maximo, colateral, stop, take profit y orden limit. Pregunta si el trade tiene edge comprobable o nace del impulso. En 0DTE/1DTE confirma rango inicial, VWAP, volumen y gamma antes de considerar una idea.'
  },
  {
    title: '10. Gestion de riesgo',
    text: 'Define riesgo maximo por operacion, perdida diaria/semanal y colateral maximo. Conserva efectivo libre y evita concentrar posiciones correlacionadas. Si el colateral supera 80%, el sistema solo debe mostrar ideas educativas. Nunca convierte una opcion naked en recomendacion.'
  },
  {
    title: '11. Psicologia y journal',
    text: 'No operes por aburrimiento, FOMO o revenge trading. No aumentes tamano para recuperar una perdida. Registra observadas, ejecutadas, paper trades e ignoradas junto con estado mental y leccion. Una revision semanal de errores protege mas que perseguir setups.'
  }
];

export default function LearningCenter({ scan }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => lessons.filter((lesson) => `${lesson.title} ${lesson.text}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const best = scan?.opportunities?.[0] || scan?.conditionalIdeas?.find((idea) => idea.strategy);
  return (
    <section id="academy" className="panel scroll-mt-24 p-4 md:p-6">
      <p className="eyebrow text-sigma-gold">Centro de Aprendizaje</p>
      <h2 className="mt-1 text-2xl font-bold">Como el sistema llega a cada numero</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">Aprende con el mismo contexto que evalua el scanner. Las explicaciones distinguen dato obtenido, calculo programatico, supuesto y limitacion.</p>
      <input className="input mt-4 max-w-xl" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar: theta, IV Rank, riesgo, Wyckoff..." />
      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {visible.map((lesson) => (
          <details className="rounded-xl border border-sigma-line bg-sigma-soft p-4 text-sm" key={lesson.title}>
            <summary className="cursor-pointer font-semibold text-slate-100">{lesson.title}</summary>
            <p className="mt-3 text-xs leading-6 text-slate-400">{lesson.text}</p>
          </details>
        ))}
      </div>
      <details className="mt-4 rounded-xl border border-sigma-blue/30 bg-blue-500/5 p-4" open>
        <summary className="cursor-pointer font-semibold text-sigma-blue">12. Trazabilidad de la senal visible</summary>
        {best ? (
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <Trace label="Estructura" value={`${best.symbol} ${best.strategy}`} />
            <Trace label="Datos usados" value="Quote, option chain, IV, Greeks, OI, volumen, history, eventos y news disponibles." />
            <Trace label="Fuente chain" value={scan?.dataHealth?.metrics?.find((metric) => metric.name.startsWith('Option chain'))?.source || 'No disponible'} />
            <Trace label="Timestamp" value={scan?.asOf ? new Date(scan.asOf).toLocaleString('es-US') : 'No disponible'} />
            <Trace label="Formula clave" value="Max risk = ancho - credito; POP = proxy por delta corta; GEX = proxy gamma ponderada por OI." />
            <Trace label="Limitacion" value="POP no garantiza resultado; GEX no confirma posicion dealer; fill requiere orden limit en broker." />
            <Trace label="Dato faltante" value={(best.blocks || best.missingValidation || ['Ninguno en la aprobacion']).join(' | ')} />
          </div>
        ) : <p className="mt-3 text-xs text-slate-400">No hay cadena valida para trazar una estructura. Configura una API de opciones y vuelve a escanear.</p>}
      </details>
    </section>
  );
}

function Trace({ label, value }) {
  return <div className="rounded-lg border border-sigma-line bg-sigma-soft p-3"><p className="eyebrow">{label}</p><p className="mt-2 leading-5 text-slate-300">{value}</p></div>;
}
