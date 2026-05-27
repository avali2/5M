const rows = [
  ['Precio, bid, ask, OHLC', 'Tradier', '/markets/quotes, /markets/history', 'Plan broker', 'Entrada, mark y tendencias', 'Live/delayed depende de suscripcion'],
  ['Cadena, IV, Greeks, OI', 'Tradier', '/markets/options/chains?greeks=true', 'Plan broker', 'Strikes, riesgo, edge', 'Greeks pueden faltar por contrato'],
  ['Snapshots avanzados', 'Polygon', '/v3/snapshot/options', 'Opcional/pago', 'Fallback y snapshots', 'No necesario con Tradier funcional'],
  ['News / earnings / insiders', 'Finnhub', '/news, /calendar, /stock/insider-transactions', 'API', 'Gap/event risk', 'Cobertura segun plan'],
  ['Macro calendar', 'Finnhub / FMP', '/calendar/economic, /economic-calendar', 'API', 'FOMC/CPI/NFP', 'Requiere revisar severidad'],
  ['Unusual flow / blocks', 'Benzinga', 'Feed licenciado', 'Pago opcional', 'Confirmacion secundaria', 'No confirma posicion dealer'],
  ['IV Rank y journal', 'PostgreSQL', 'iv_history/options_snapshots/trade_journal', 'Tu base', 'Historia propia auditable', 'Necesita acumular sesiones'],
  ['GEX aproximado', 'Chain + formula local', 'gamma * OI * spot', 'Calculado', 'Contexto gamma', 'No es dealer positioning confirmado'],
  ['Level 2 / OPRA tape', 'Proveedor especializado', 'No configurado', 'Pago/manual', 'Tape completo', 'No disponible actualmente']
];

export default function ProDataMap({ scan }) {
  return (
    <section id="data-map" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Fuentes Pro / Data Map</p>
      <h2 className="mt-1 text-xl font-bold">Dato - Fuente - Uso - Limitacion</h2>
      <p className="mt-2 text-xs text-slate-400">Modo reportado: <strong>{scan?.marketDataMode || 'No disponible'}</strong>. Las llaves viven en el servidor, nunca en esta pagina.</p>
      <div className="mt-4 hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-400"><tr>{['Dato', 'Fuente', 'API / Endpoint', 'Acceso', 'Uso opciones', 'Limitacion'].map((header) => <th className="border-b border-sigma-line p-2" key={header}>{header}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td className="border-b border-sigma-line/50 p-2 align-top" key={cell}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="mt-4 space-y-2 lg:hidden">
        {rows.map((row) => (
          <details className="rounded-lg bg-sigma-soft p-3 text-xs" key={row[0]}>
            <summary className="font-semibold">{row[0]} - {row[1]}</summary>
            <p className="mt-2 text-slate-300">Endpoint: {row[2]} | Acceso: {row[3]}</p>
            <p className="mt-1 text-slate-400">Uso: {row[4]}. Limitacion: {row[5]}.</p>
          </details>
        ))}
      </div>
    </section>
  );
}
