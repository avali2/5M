const LABELS = {
  BULL_PUT: 'Bull put credit spread', BEAR_CALL: 'Bear call credit spread', IRON_CONDOR: 'Iron condor'
};
const MODES = { shadow: 'Observación', paper: 'Tradier Sandbox', live: 'Tradier Real', off: 'Desactivado' };
const STATES = {
  ENTRY_PENDING: 'Entrada pendiente', OPEN: 'Abierta', EXIT_PENDING: 'Cierre pendiente',
  CLOSED: 'Cerrada', ABANDONED: 'Sin ejecución', REVIEW: 'Revisión'
};
const ORDER_STATES = {
  intent: 'Envío por confirmar', sent: 'Recibida por Tradier', filled: 'Ejecutada',
  canceled: 'Cancelada', expired: 'Vencida', error: 'Error', rejected: 'Rechazada'
};
const EXIT_REASONS = {
  VENCIMIENTO_CERCANO: 'Vencimiento cercano', UMBRAL_DE_PERDIDA: 'Límite de pérdida',
  STRIKE_CORTO_ALCANZADO: 'Strike vendido alcanzado'
};
const CURRENCY = new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' });
const NY = new Intl.DateTimeFormat('es-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
});
const usd = number => Number.isFinite(number) ? CURRENCY.format(number) : '—';
const date = stamp => stamp && Number.isFinite(Date.parse(stamp)) ? NY.format(new Date(stamp)) + ' ET' : 'Sin datos';
const greek = number => Number.isFinite(number) ? number.toFixed(3) : '—';

function Stat({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function PositionLedger({ trades, orders }) {
  return <div className="bot-ledger">
    <section>
      <h3>Posiciones del bot</h3>
      {trades.length === 0 ? <p>Sin posiciones registradas en este modo.</p> : <ul>
        {trades.map(trade => <li key={trade.createdAt}><b>{trade.root} · {LABELS[trade.strategy]}</b>
          <span>{STATES[trade.state]} · vence {trade.expiration} · riesgo {usd(trade.maxRiskUsd)}</span>
          {trade.exitReason && trade.state !== 'CLOSED' && <small>Salida en curso: {EXIT_REASONS[trade.exitReason] || trade.exitReason}</small>}
          <small>{trade.realizedUsd === null ? trade.note : `Resultado neto estimado ${usd(trade.realizedUsd)}`}</small>
        </li>)}
      </ul>}
    </section>
    <section>
      <h3>Órdenes en Tradier</h3>
      {orders.length === 0 ? <p>Sin órdenes registradas en este modo.</p> : <ul>
        {orders.map(order => <li key={order.created_at}><b>{order.action === 'OPEN' ? 'Entrada' : 'Cierre'} · {usd(order.price)}</b>
          <span>{ORDER_STATES[order.status] || order.status} · {date(order.created_at)}</span>
          {order.broker_id && <small>Orden {order.broker_id}</small>}
        </li>)}
      </ul>}
    </section>
  </div>;
}

export default function TradingPanel({ status, onPause, pending }) {
  const candidate = status?.candidate;
  const mode = MODES[status?.mode] || 'Sin conexión';
  const alert = ['REVISIÓN', 'BLOQUEADO', 'SERVICIO_NO_CONFIRMADO'].includes(status?.state);
  return <section className="bot-console" aria-labelledby="bot-heading">
    <header className="bot-heading">
      <div><p className="bot-broker">TRADIER · OPCIONES</p><h2 id="bot-heading">Mesa de spreads</h2></div>
      <div className="bot-mode" data-mode={status?.mode}>{mode}</div>
    </header>
    <div className="bot-state" data-alert={alert}>
      <div aria-live="polite">
        <strong>{status?.paused ? 'Entradas en pausa' : status?.state?.replaceAll('_', ' ') || 'Estado pendiente'}</strong>
        <span>{status?.note || 'Conecta para consultar el último ciclo del motor.'}</span>
      </div>
      {typeof status?.paused === 'boolean' && <button className="secondary-btn" disabled={pending} onClick={() => onPause(!status.paused)}>
        {status.paused ? 'Reanudar entradas' : 'Pausar entradas'}
      </button>}
    </div>
    <dl className="bot-stats">
      <Stat label="Perfil" value={status?.profile?.label || '—'} />
      <Stat label="Subyacente" value={status?.root || '—'} />
      <Stat label="Último ciclo" value={date(status?.lastCycleAt)} />
      <Stat label="Límite configurado" value={usd(status?.maxRiskUsd)} />
      <Stat label="Iron condor" value={status?.condorEnabled ? 'Activo' : 'Desactivado'} />
    </dl>
    {status?.profile && <p className="bot-foot">
      Vencimientos {status.profile.minDte}–{status.profile.maxDte} días · delta corta absoluta {status.profile.deltaMin}–{status.profile.deltaMax}
      {' · '}revisión cada {status.profile.intervalMs / 1000} s mientras el servidor esté activo.
      {' '}En real: un contrato por pata, una posición y como máximo una entrada por sesión; riesgo total hasta el menor entre tu límite y el 1% del patrimonio.
    </p>}
    {candidate && <div className="bot-candidate">
      <div className="bot-candidate-head"><div><h3>{candidate.root} · {LABELS[candidate.strategy]}</h3>
        <p>{candidate.expiration} · {candidate.trend.bias.toLowerCase()} · cotizado {date(candidate.evaluatedAt)}
          {candidate.quoteDelayMinutes ? ` · demora ${candidate.quoteDelayMinutes} min` : ''}</p></div>
        <span className="bot-mode">Candidato</span>
      </div>
      <dl className="bot-stats">
        <Stat label="Crédito límite" value={usd(candidate.credit)} />
        <Stat label="Ganancia máx. bruta" value={usd(candidate.maxProfitUsd)} />
        <Stat label="Pérdida máx. teórica" value={usd(candidate.maxRiskUsd)} />
        <Stat label="Equilibrio" value={candidate.breakEvens.map(usd).join(' / ')} />
      </dl>
      <div className="bot-legs">
        {candidate.legs.map(leg => <div key={leg.symbol}><b>{leg.direction === -1 ? 'Vender' : 'Comprar'} {leg.type} {usd(leg.strike)}</b>
          <small>Bid {usd(leg.bid)} · ask {usd(leg.ask)}</small></div>)}
      </div>
      {candidate.exitPolicy && <p>Salida prevista: capturar {candidate.exitPolicy.takeProfitFraction * 100}% de la prima,
        cerrar si el débito alcanza {candidate.exitPolicy.stopMultiple} veces el crédito o quedan {candidate.exitPolicy.timeStopDte} días.
        {candidate.exitPolicy.shortStrikeExit ? ' También se solicita cierre si el subyacente alcanza un strike vendido.' : ''}
        {' '}Son disparadores de órdenes limitadas, no precios de ejecución garantizados.</p>}
      <p>Probabilidad de beneficio: sin estimación validada. La delta no equivale a esa probabilidad.</p>
      <p>Greeks netos por unidad. Δ {greek(candidate.greeks.delta)} · Γ {greek(candidate.greeks.gamma)} · Θ {greek(candidate.greeks.theta)} · Vega {greek(candidate.greeks.vega)}.</p>
    </div>}
    <PositionLedger trades={status?.trades || []} orders={status?.orders || []} />
    {status?.mode === 'shadow' && <p className="bot-foot">El motor evalúa candidatos y muestra su riesgo teórico. Las órdenes y posiciones pertenecen a los modos Sandbox o Real.</p>}
    {typeof status?.paused === 'boolean' && <p className="bot-foot">Pausar bloquea nuevas entradas. El motor sigue vigilando las posiciones que ya abrió.</p>}
  </section>;
}
