import { useEffect, useMemo, useState } from 'react';

const KEY_STORAGE = 'five-millions-access-key';

function getKey() { return localStorage.getItem(KEY_STORAGE) || ''; }
function setKey(value) { localStorage.setItem(KEY_STORAGE, value.trim()); }

async function request(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  const key = getKey();
  if (key) headers['X-5M-Key'] = key;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function money(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(digits)}` : '—';
}

function percent(value, digits = 0) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(digits)}%` : '—';
}

function dateTime(value) {
  if (!value) return 'Sin datos';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('es-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusLabel(status) {
  return { READY: 'LISTA PARA REVISAR', WATCH: 'ESPERAR', REJECTED: 'RECHAZADA', CANDIDATE: 'CANDIDATA' }[status] || status;
}

function riskLabel(status) {
  return { CLEAR: 'DÍA LIMPIO', CAUTION: 'PRECAUCIÓN', BLOCKED: 'NO OPERAR', UNKNOWN: 'SIN VALIDAR' }[status] || 'SIN VALIDAR';
}

function riskTone(status) {
  return status === 'CLEAR' ? 'green' : status === 'BLOCKED' || status === 'UNKNOWN' ? 'red' : 'amber';
}

function copyOrder(signal, marketRisk) {
  const lines = [
    `5 MILLIONS · ${signal.symbol} · ${signal.profile?.label || 'Base'} · ${signal.strategyLabel}`,
    `Estado: ${statusLabel(signal.status)} · Noticias: ${marketRisk?.status || 'UNKNOWN'}`,
    `Expiración: ${signal.expiration} (${signal.dte} DTE)`,
    ...signal.legs.map((leg) => `${leg.action} ${leg.type} ${leg.strike} ${leg.contractSymbol || ''}`),
    `Riesgo máximo por contrato: ${money(signal.maxRiskUsd)} · cantidad: la decides tú`,
    signal.requirements?.conditional ? `Requisito: ${signal.requirements.conditional}` : null,
    `Orden LIMIT: recibir ${money(signal.credit)}; cancelar por debajo de ${money(signal.minimumCredit)}`,
    `Punto de equilibrio estimado: ${money(signal.breakEven)}`,
    `Confirmación: ${signal.executionPlan?.entryTrigger}`,
    `Take profit: pagar ${money(signal.executionPlan?.takeProfitDebit)} o menos`,
    `Stop/invalidación: pagar cerca de ${money(signal.executionPlan?.stopLossDebit)} o cerrar si alcanza el strike corto`,
    'Actividad de opciones: observacional; no identifica participantes ni predice el resultado.',
    'Verificar crédito, noticias y riesgo total otra vez justo antes de enviar.'
  ];
  navigator.clipboard?.writeText(lines.filter(Boolean).join('\n'));
}

function KeyGate({ onSave, error }) {
  const [value, setValue] = useState(getKey());
  return <div className="gate-wrap">
    <div className="gate-card">
      <div className="brand-mark">5M</div>
      <p className="eyebrow">ACCESO PRIVADO</p>
      <h1>Conecta 5 MILLIONS</h1>
      <p className="muted">Escribe el valor de <code>APP_ACCESS_KEY</code> que configuraste en el servidor.</p>
      <input autoFocus aria-label="Clave privada de acceso" className="text-input" type="password" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSave(value)} placeholder="Tu clave de acceso" />
      {error && <p className="error-text">{error}</p>}
      <button className="primary-btn full" onClick={() => onSave(value)}>Entrar</button>
      <p className="tiny">Esta clave no es la API key de Tradier ni la de Gemini.</p>
    </div>
  </div>;
}

function Pill({ children, tone = 'slate' }) { return <span className={`pill pill-${tone}`}>{children}</span>; }
function Metric({ label, value, tone = '' }) { return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }

function Connection({ label, value, note }) {
  return <div className="connection"><span className={`connection-dot ${value ? 'on' : 'off'}`} /><div><strong>{label}</strong><small>{note}</small></div></div>;
}

function MarketRiskPanel({ risk }) {
  const status = risk?.status || 'UNKNOWN';
  const tone = riskTone(status);
  return <section className={`market-risk risk-${status.toLowerCase()}`}>
    <div className="risk-header">
      <div><p className="eyebrow">CONTROL PRE-MARKET Y NOTICIAS</p><div className="risk-title"><Pill tone={tone}>{riskLabel(status)}</Pill><h2>{risk?.summary || 'Todavía no se ha validado el contexto del día.'}</h2></div></div>
      <div className="risk-score"><strong>{Number.isFinite(Number(risk?.riskScore)) ? risk.riskScore : '—'}</strong><span>riesgo / 100</span></div>
    </div>
    <p className="risk-instruction">{risk?.tradeInstruction || 'Ejecuta un escaneo y espera una lectura CLEAR con fuentes antes de abrir una operación.'}</p>
    {risk?.blockers?.length > 0 && <div className="risk-list"><strong>Bloqueos / dudas</strong><div>{risk.blockers.map((item) => <span key={item}>⚠ {item}</span>)}</div></div>}
    {risk?.events?.length > 0 && <div className="event-grid">{risk.events.slice(0, 6).map((event, index) => <article className={`event-card impact-${event.impact?.toLowerCase()}`} key={`${event.title}-${index}`}><div><strong>{event.category}</strong><span>{event.impact}</span></div><p>{event.title}</p><small>{event.timing || 'Momento no especificado'}{event.symbols?.length ? ` · ${event.symbols.join(', ')}` : ''}</small></article>)}</div>}
    <div className="risk-footer">
      <div className="coverage">{(risk?.coverage || []).map((item) => <span key={item}>✓ {item}</span>)}{(risk?.missingCoverage || []).map((item) => <span className="missing" key={item}>× {item}</span>)}</div>
      <div className="sources"><span>{risk?.sources?.length || 0} fuentes · {risk?.cached ? 'caché vigente' : dateTime(risk?.checkedAt)}</span>{risk?.sources?.slice(0, 8).map((source, index) => <a href={source.uri} target="_blank" rel="noreferrer" key={`${source.uri}-${index}`}>{source.title || `Fuente ${index + 1}`}</a>)}</div>
    </div>
  </section>;
}

function LegTable({ signal }) {
  return <div className="leg-table">
    <div className="leg-head"><span>Acción</span><span>Contrato</span><span>Strike</span><span>Bid / Ask</span><span>Delta</span></div>
    {signal.legs.map((leg, index) => <div className="leg-row" key={`${signal.id}-${index}`}>
      <span className={leg.action === 'SELL_TO_OPEN' ? 'sell' : 'buy'}>{leg.action === 'SELL_TO_OPEN' ? 'VENDER' : 'COMPRAR'}</span>
      <span>{leg.type}</span><strong>{leg.strike}</strong><span>{money(leg.bid)} / {money(leg.ask)}</span><span>{Number(leg.delta).toFixed(3)}</span>
    </div>)}
  </div>;
}

function Timeframes({ technical }) {
  return <div className="timeframes">{Object.entries(technical?.timeframes || {}).map(([key, item]) => <div className={`timeframe tf-${item.sufficient ? item.trend : 'missing'}`} key={key}><span>{item.label}</span><strong>{item.sufficient ? item.trend === 'bullish' ? 'ALCISTA' : item.trend === 'bearish' ? 'BAJISTA' : 'NEUTRAL' : 'SIN DATA'}</strong><small>RSI {item.rsi14 ?? '—'}</small></div>)}</div>;
}

function SignalCard({ signal, marketRisk, onFeedback, feedbackBusy }) {
  const ready = signal.status === 'READY';
  const review = signal.aiReview;
  const flow = signal.institutionalFlow || {};
  const isWheel = signal.profile?.id === 'WHEEL';
  const requirement = signal.requirements?.sharesRequired
    ? `${signal.requirements.sharesRequired} acciones libres`
    : signal.requirements?.collateralUsd ? money(signal.requirements.collateralUsd) : null;
  const coverageLabel = signal.strategy === 'CASH_SECURED_PUT'
    ? `Colateral declarado ${signal.requirements?.portfolioFresh ? 'vigente' : 'pendiente'} · ${money(signal.requirements?.availableCashUsd)} libres`
    : `Cobertura declarada ${signal.requirements?.portfolioFresh ? 'vigente' : 'pendiente'} · ${signal.requirements?.availableShares ?? 0} acciones libres`;
  return <article className={`signal-card ${ready ? 'ready' : ''} ${isWheel ? 'wheel' : ''}`}>
    <div className="signal-topline">
      <div className="signal-tags"><Pill tone={ready ? 'green' : signal.status === 'REJECTED' ? 'red' : 'amber'}>{statusLabel(signal.status)}</Pill><Pill tone="blue">{signal.profile?.label || 'Rueda'} · riesgo {signal.profile?.riskLevel || '—'}</Pill>{signal.isPriority && <Pill tone="blue">PRIORIDAD</Pill>}<span className="signal-source">{signal.source} · {dateTime(signal.generatedAt)}</span></div>
      <div className="signal-score"><strong>{signal.score}</strong><small>score</small></div>
    </div>
    <div className="signal-title-row"><div><h3>{signal.symbol} <span>· {signal.strategyLabel}</span></h3><p>{signal.direction} · <strong>{signal.expiration}</strong> · {signal.dte} DTE · subyacente {money(signal.underlyingPrice)}</p></div><div className="symbol-badge">{signal.symbol}</div></div>
    <div className="decision-line"><strong>{coverageLabel}</strong><span>{signal.dataQuality?.fresh ? `Subyacente ${signal.dataQuality.ageMinutes ?? '—'} min · Greeks por hora` : 'Dato vencido o incompleto'}</span></div>
    <div className="metrics-grid">
      <Metric label="Crédito LIMIT objetivo" value={money(signal.credit)} tone="green-text" />
      <Metric label="Cancelar debajo de" value={money(signal.minimumCredit)} />
      <Metric label="Punto de equilibrio" value={money(signal.breakEven)} />
      <Metric label={signal.strategy === 'COVERED_CALL' ? 'Ganancia máx. buy-write*' : 'Ganancia máx. / contrato'} value={money(signal.maxProfitUsd)} tone="green-text" />
      <Metric label={signal.strategy === 'COVERED_CALL' ? 'Caída a $0 desde precio actual*' : 'Riesgo máx. / contrato'} value={money(signal.maxRiskUsd)} tone="red-text" />
      {requirement && <Metric label={signal.requirements?.sharesRequired ? 'Acciones requeridas' : 'Efectivo para asignación'} value={requirement} />}
      <Metric label="Delta abs. · no probabilidad" value={percent(Math.abs(signal.shortDelta), 1)} />
      <Metric label="Retorno / riesgo*" value={percent(signal.returnOnRisk, 1)} />
      <Metric label="Liquidez" value={`${signal.liquidity?.score ?? '—'}/100`} />
    </div>
    <LegTable signal={signal} />
    <Timeframes technical={signal.technical} />
    <div className={`flow-panel flow-${String(flow.alignment || 'MIXED').toLowerCase()}`}><div className="flow-heading"><div><span className="plan-label">ACTIVIDAD DE OPCIONES · OBSERVACIONAL</span><strong>{flow.direction === 'BULLISH' ? 'PRESIÓN APARENTE ALCISTA' : flow.direction === 'BEARISH' ? 'PRESIÓN APARENTE BAJISTA' : 'SEÑAL MIXTA'}</strong></div><Pill tone="amber">No se usa para aprobar</Pill></div><div className="flow-metrics"><Metric label="Score direccional" value={flow.directionalScore ?? '—'} /><Metric label="Call / Put volumen" value={flow.callPutVolumeRatio ?? '—'} /><Metric label="Volumen relativo" value={flow.relativeUnderlyingVolume ? `${flow.relativeUnderlyingVolume}×` : '—'} /><Metric label="Contratos anormales" value={flow.unusualContracts?.length || 0} /></div>{flow.unusualContracts?.length > 0 && <details><summary>Ver actividad por strike</summary><div className="flow-list">{flow.unusualContracts.slice(0, 5).map((item) => <span key={item.contractSymbol}><b>{item.type} {item.strike}</b> · vol/OI {item.volumeOiRatio} · {item.tradeLocation.replaceAll('_', ' ')}</span>)}</div></details>}<p className="tiny">No identifica participantes ni demuestra su intención. Los datos de opciones también pueden tener retraso.</p></div>
    <div className="plan-grid">
      <div className="plan-box entry"><span className="plan-label">ENTRADA CLARA</span><p className="strong-line">{signal.executionPlan?.entry}</p><p>{signal.executionPlan?.entryTrigger}</p><p>Robinhood: {signal.executionPlan?.order} · elige tú la cantidad según el riesgo total.</p>{signal.requirements?.conditional && <p className="wheel-requirement"><strong>REQUISITO:</strong> {signal.requirements.conditional}</p>}</div>
      <div className="plan-box exit"><span className="plan-label">SALIDA Y PROTECCIÓN</span><p className="strong-line">{signal.executionPlan?.takeProfit}</p><p>{signal.executionPlan?.stopLoss}</p><p>{signal.executionPlan?.timeStop}</p><p>{signal.executionPlan?.assignmentRule}</p></div>
    </div>
    <div className="signal-bottom"><div className="greeks"><span>Spread:</span> Δ {signal.greeks?.delta ?? '—'} · Γ {signal.greeks?.gamma ?? '—'} · Θ {signal.greeks?.theta ?? '—'} · Vega {signal.greeks?.vega ?? '—'} · IV {signal.iv ?? '—'}</div><button className="quiet-btn" onClick={() => copyOrder(signal, marketRisk)}>Copiar orden</button></div>
    <div className="feedback-row"><div><strong>Registrar resultado</strong><span>Guarda lo que ocurrió en Robinhood.</span></div><div className="feedback-actions"><button disabled={feedbackBusy} onClick={() => onFeedback(signal, 'TAKEN')}>La tomé</button><button disabled={feedbackBusy} onClick={() => onFeedback(signal, 'SKIPPED')}>La omití</button><button className="win" disabled={feedbackBusy} onClick={() => onFeedback(signal, 'WIN')}>Ganó</button><button className="loss" disabled={feedbackBusy} onClick={() => onFeedback(signal, 'LOSS')}>Perdió</button><button disabled={feedbackBusy} onClick={() => onFeedback(signal, 'BREAKEVEN')}>Break-even</button></div></div>
    {review && <div className="ai-review"><div><span className="ai-chip">GEMINI {review.confidence}% · {review.decision}</span><strong>{review.summary}</strong></div><div className="ai-plan"><span><b>Entrada IA:</b> {review.entryTrigger}</span><span><b>Salida IA:</b> {review.takeProfit}</span><span><b>Invalidación:</b> {review.stopLoss}</span><span><b>Manejo:</b> {review.management}</span></div>{review.riskFlags?.length > 0 && <div className="risk-flags">{review.riskFlags.map((risk) => <span key={risk}>⚠ {risk}</span>)}</div>}</div>}
    {!ready && signal.readiness?.reasons?.length > 0 && <div className="blocked-note"><strong>Por qué esperar:</strong> {signal.readiness.reasons.join(' · ')}</div>}
  </article>;
}

function LearningPanel({ learning }) {
  const overall = learning?.overall || {};
  return <section className="side-card learning-card"><div className="side-title"><h3>Aprendizaje</h3><span>{overall.sampleSize || 0}</span></div><p>{learning?.message || 'Cargando historial…'}</p><div className="learning-metrics"><Metric label="Resultados cerrados" value={overall.sampleSize ?? 0} /><Metric label="Tasa ganadora" value={overall.winRate === null || overall.winRate === undefined ? '—' : percent(overall.winRate, 1)} tone="green-text" /><Metric label="P/L registrado" value={overall.totalPnlUsd === null || overall.totalPnlUsd === undefined ? '—' : money(overall.totalPnlUsd)} tone={Number(overall.totalPnlUsd) < 0 ? 'red-text' : 'green-text'} /><Metric label="Estado" value={overall.status === 'VALIDATED' ? 'VALIDADO' : overall.status === 'EARLY' ? 'MUESTRA TEMPRANA' : 'SIN DATOS'} /></div>{learning?.bySymbol?.length > 0 && <div className="learning-list"><strong>Por símbolo</strong>{learning.bySymbol.slice(0, 6).map((item) => <div key={item.key}><span>{item.key} · {item.sampleSize}</span><b>{percent(item.winRate, 0)}</b></div>)}</div>}<p className="tiny">Gemini solo recibe segmentos con al menos {learning?.minimumValidatedSamples || 20} resultados cerrados. El historial nunca puede aprobar una señal por sí solo.</p></section>;
}

function PortfolioPanel({ portfolio, onSave, saving }) {
  const [cash, setCash] = useState(String(portfolio?.cashAvailableUsd ?? 0));
  const [shares, setShares] = useState(Object.entries(portfolio?.sharesBySymbol || {}).map(([symbol, count]) => `${symbol}=${count}`).join(', '));
  const [formError, setFormError] = useState('');
  useEffect(() => {
    setCash(String(portfolio?.cashAvailableUsd ?? 0));
    setShares(Object.entries(portfolio?.sharesBySymbol || {}).map(([symbol, count]) => `${symbol}=${count}`).join(', '));
  }, [portfolio?.updatedAt]);

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    const sharesBySymbol = {};
    for (const item of shares.split(/[;,\n]/).map((part) => part.trim()).filter(Boolean)) {
      const match = item.match(/^([A-Za-z][A-Za-z0-9.-]{0,11})\s*=\s*(\d+)$/);
      if (!match) { setFormError('Usa el formato SOFI=100, AMD=200. Solo acciones enteras.'); return; }
      sharesBySymbol[match[1].toUpperCase()] = Number(match[2]);
    }
    try { await onSave({ cashAvailableUsd: Number(cash), sharesBySymbol }); }
    catch (error) { setFormError(error.message); }
  }

  return <section className="side-card portfolio-card">
    <div className="side-title"><h3>Colateral manual</h3><span>{portfolio?.fresh ? 'VIGENTE' : 'ACTUALIZAR'}</span></div>
    <p>Indica efectivo libre después de reservas y acciones sin calls abiertas. El sistema no está conectado a Robinhood.</p>
    <form onSubmit={submit} className="portfolio-form">
      <label>Efectivo libre (USD)<input className="text-input" inputMode="decimal" type="number" min="0" step="0.01" value={cash} onChange={(event) => setCash(event.target.value)} required /></label>
      <label>Acciones libres por símbolo<input className="text-input" value={shares} onChange={(event) => setShares(event.target.value)} placeholder="SOFI=100, AMD=200" /></label>
      <button className="quiet-btn full" disabled={saving}>{saving ? 'Guardando…' : 'Guardar y actualizar hora'}</button>
    </form>
    <p className="tiny">Última actualización: {dateTime(portfolio?.updatedAt)} · vence tras {portfolio?.maxAgeHours || 24} h. Varias señales no reutilizan el mismo efectivo ni acciones en la misma revisión.</p>
    {formError && <p className="error-text">{formError}</p>}
  </section>;
}

function IndexContext({ quotes = [] }) {
  return <section className="side-card"><div className="side-title"><h3>Índices de contexto</h3><span>{quotes.length}</span></div><p>SPX, NDX, RUT y VIX orientan el régimen. No se convierten automáticamente en órdenes.</p><div className="index-grid">{quotes.length ? quotes.map((quote) => <div key={quote.symbol}><strong>{quote.symbol}</strong><span>{money(quote.price)}</span><small className={Number(quote.changePct) < 0 ? 'red-text' : 'green-text'}>{quote.changePct === null || quote.changePct === undefined || !Number.isFinite(Number(quote.changePct)) ? '—' : `${Number(quote.changePct).toFixed(2)}%`}</small></div>) : <span className="tiny">Se cargarán en la próxima revisión con Tradier.</span>}</div></section>;
}

function formatError(error) { return error?.message || String(error || 'Error desconocido'); }

function App() {
  const [publicCfg, setPublicCfg] = useState(null);
  const [scan, setScan] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState('');
  const [gateError, setGateError] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [learning, setLearning] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [portfolioSaving, setPortfolioSaving] = useState(false);

  const readySignals = useMemo(() => scan?.signals?.filter((signal) => signal.status === 'READY') || [], [scan]);
  const watchSignals = useMemo(() => scan?.signals?.filter((signal) => signal.status !== 'READY') || [], [scan]);

  async function loadAll() {
    setError('');
    const [cfg, nextStatus, nextLearning, currentPortfolio, latest] = await Promise.all([request('/api/config'), request('/api/status'), request('/api/learning'), request('/api/portfolio'), request('/api/scan').catch(() => null)]);
    setPublicCfg(cfg); setStatus(nextStatus);
    setLearning(nextLearning);
    setPortfolio(currentPortfolio);
    if (latest) setScan(latest);
  }

  useEffect(() => {
    let alive = true;
    request('/api/health').then((health) => {
      if (!alive) return;
      if (health?.security?.requiresKey && !getKey()) {
        setGateError('Acceso protegido. Escribe tu APP_ACCESS_KEY para continuar.');
        return;
      }
      return loadAll();
    }).catch((healthError) => {
      if (alive) { setGateError(formatError(healthError)); setError(formatError(healthError)); }
    }).finally(() => alive && setBooting(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!publicCfg) return undefined;
    const timer = setInterval(async () => {
      try {
        const nextStatus = await request('/api/status');
        setStatus(nextStatus);
        if (nextStatus.latestScan?.id && nextStatus.latestScan.id !== scan?.id) setScan(await request('/api/scan'));
      } catch { /* the next manual refresh will surface an error */ }
    }, 60000);
    return () => clearInterval(timer);
  }, [publicCfg, scan?.id]);

  async function saveAccessKey(value) {
    setKey(value); setGateError(''); setError(''); setBooting(true);
    try { await loadAll(); } catch (loadError) { setGateError(formatError(loadError)); } finally { setBooting(false); }
  }

  async function scanNow() {
    setLoading(true); setError('');
    try { const nextScan = await request('/api/scan', { method: 'POST' }); setScan(nextScan); setStatus(await request('/api/status')); }
    catch (scanError) { setError(formatError(scanError)); }
    finally { setLoading(false); }
  }

  async function savePortfolio(value) {
    setPortfolioSaving(true);
    try { setPortfolio(await request('/api/portfolio', { method: 'POST', body: JSON.stringify(value) })); }
    finally { setPortfolioSaving(false); }
  }

  async function enablePush() {
    setPushMessage('Preparando notificaciones…');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador no admite Web Push.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permiso de notificaciones no concedido.');
      const keyResponse = await request('/api/notifications/public-key');
      if (!keyResponse.configured) throw new Error('Faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en el servidor.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(keyResponse.publicKey) });
      await request('/api/notifications/subscribe', { method: 'POST', body: JSON.stringify(subscription) });
      setPushMessage('Notificaciones activas. Puedes probarlas con el botón de prueba.');
    } catch (pushError) { setPushMessage(formatError(pushError)); }
  }

  async function testPush() {
    try { const result = await request('/api/notifications/test', { method: 'POST' }); setPushMessage(result.sent ? 'Notificación de prueba enviada.' : 'No hay suscripciones activas todavía.'); }
    catch (pushError) { setPushMessage(formatError(pushError)); }
  }

  async function recordFeedback(signal, action) {
    setFeedbackBusy(true); setFeedbackMessage('');
    try {
      let pnlUsd = null;
      if (['WIN', 'LOSS', 'BREAKEVEN'].includes(action)) {
        const entered = window.prompt('P/L real en dólares (opcional). Usa negativo para pérdida. Ejemplo: 18.50 o -22.00', '');
        if (entered !== null && entered.trim() !== '') {
          pnlUsd = Number(entered);
          if (!Number.isFinite(pnlUsd)) throw new Error('El P/L debe ser un número válido.');
          if (action === 'WIN' && pnlUsd < 0) throw new Error('Una ganadora no puede guardar un P/L negativo.');
          if (action === 'LOSS' && pnlUsd > 0) throw new Error('Una perdedora no puede guardar un P/L positivo.');
        }
      }
      const result = await request(`/api/signals/${encodeURIComponent(signal.id)}/feedback`, { method: 'POST', body: JSON.stringify({ instanceId: signal.instanceId, action, pnlUsd }) });
      setLearning(result.learning);
      setFeedbackMessage(`${signal.symbol}: resultado ${action} guardado.`);
      setStatus(await request('/api/status'));
    } catch (feedbackError) { setFeedbackMessage(formatError(feedbackError)); }
    finally { setFeedbackBusy(false); }
  }

  if (booting) return <div className="loading-screen"><div className="brand-mark">5M</div><p>Iniciando 5 MILLIONS…</p></div>;
  if (!publicCfg && gateError && (gateError.includes('Acceso protegido') || getKey())) return <KeyGate onSave={saveAccessKey} error={gateError} />;

  const tradierMode = publicCfg?.integrations?.tradierMode;
  const tradierNote = !publicCfg?.integrations?.tradier ? 'Token no configurado'
    : tradierMode === 'sandbox' ? 'Sandbox · no usar para operar'
      : tradierMode === 'real-time-configured-unverified' ? 'Entitlement configurado · validar timestamp'
        : 'Entitlement no confirmado · READY bloqueado';
  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><div className="brand"><div className="brand-mark">5M</div><div><p className="eyebrow">OPTIONS SIGNAL ENGINE</p><h1>5 MILLIONS</h1></div></div><div className="top-actions"><Pill tone={scan?.market?.marketOpen ? 'green' : 'slate'}>{scan?.market?.marketOpen ? 'MERCADO ABIERTO' : 'MERCADO CERRADO'}</Pill><button className="primary-btn" onClick={scanNow} disabled={loading}>{loading ? 'Analizando…' : 'Revisar mercado'}</button></div></div></header>
    <main className="main-content">
      <section className="hero"><div><p className="eyebrow blue">CASH-SECURED PUTS · COVERED CALLS</p><h2>Una señal clara o ninguna operación.</h2><p className="hero-copy">Compara candidatos de la rueda con cotizaciones recientes, liquidez, temporalidades, noticias y colateral declarado. Delta y puntuación ordenan ideas; no predicen resultados.</p></div><div className="hero-note"><strong>Robinhood manual</strong><span>Solo Cash-Secured Puts y Covered Calls · sin órdenes automáticas</span></div></section>
      <section className="connections"><Connection label="Tradier" value={publicCfg?.integrations?.tradier} note={tradierNote} /><Connection label="Gemini" value={publicCfg?.integrations?.gemini} note={publicCfg?.integrations?.gemini ? 'Decisión estructurada activa' : 'Señales bloqueadas'} /><Connection label="Noticias" value={scan?.marketRisk?.coverageComplete} note={scan?.marketRisk ? `${scan.ai?.groundedSources || 0} fuentes · ${riskLabel(scan.marketRisk.status)}` : 'Sin lectura actual'} /><Connection label="Base de datos" value={status?.store?.provider === 'sqlite'} note={status?.store?.provider === 'sqlite' ? `${status.store.signalsStored || 0} señales · ${status.store.feedbackEvents || 0} feedback` : 'No disponible'} /><Connection label="Segundo plano" value={status?.scanner?.enabled} note={status?.scanner?.enabled ? `Cada ${status.scanner.intervalMinutes} min` : 'Desactivado'} /></section>
      {error && <div className="error-banner">⚠ {error}</div>}
      {pushMessage && <div className="info-banner" role="status">{pushMessage}</div>}
      {feedbackMessage && <div className="info-banner" role="status">{feedbackMessage}</div>}
      <MarketRiskPanel risk={scan?.marketRisk} />
      <section className="summary-grid"><Metric label="Señales listas" value={readySignals.length} tone="green-text" /><Metric label="Esperar / rechazar" value={watchSignals.length} /><Metric label="Candidatos Gemini" value={scan?.ai?.reviewedCandidates ?? '—'} /><Metric label="Última lectura" value={scan ? dateTime(scan.generatedAt) : '—'} /></section>
      <section className="workspace-grid"><div className="signal-column"><div className="section-heading"><div><p className="eyebrow blue">DECISIONES DEL MOTOR</p><h2>{readySignals.length ? `${readySignals.length} señal${readySignals.length > 1 ? 'es' : ''} para revisión final` : 'No hay una entrada verde'}</h2></div><span className="muted small">{scan?.data?.historicalTimeframes?.join(' · ') || 'Esperando Tradier'}</span></div>{!scan && <EmptyState onScan={scanNow} loading={loading} />}{scan && readySignals.length === 0 && <div className="no-signal"><strong>Hoy esperar también es una decisión.</strong><p>Una señal lista exige contexto de noticias CLEAR, mercado abierto, datos frescos, cobertura vigente, liquidez y revisión de Gemini. Confirma la cadena y el colateral en Robinhood.</p><button className="quiet-btn" onClick={scanNow}>Volver a revisar</button></div>}{readySignals.map((signal) => <SignalCard key={signal.instanceId || signal.id} signal={signal} marketRisk={scan.marketRisk} onFeedback={recordFeedback} feedbackBusy={feedbackBusy} />)}{scan && watchSignals.length > 0 && <><div className="subheading"><h3>En vigilancia · no ejecutar todavía</h3><span>{watchSignals.length}</span></div>{watchSignals.slice(0, 12).map((signal) => <SignalCard key={signal.instanceId || signal.id} signal={signal} marketRisk={scan.marketRisk} onFeedback={recordFeedback} feedbackBusy={feedbackBusy} />)}</>}</div><aside className="side-column"><PortfolioPanel portfolio={portfolio} onSave={savePortfolio} saving={portfolioSaving} /><LearningPanel learning={learning} /><IndexContext quotes={scan?.market?.contextIndices} /><section className="side-card"><div className="side-title"><h3>Notificaciones</h3><span>●</span></div><p>Recibe una alerta únicamente cuando una señal cambie a <strong>LISTA</strong>. Abre la app y revalida antes de operar.</p><button className="primary-btn full" onClick={enablePush}>Activar alertas</button><button className="quiet-btn full" onClick={testPush}>Enviar prueba</button>{pushMessage && <p className="tiny">{pushMessage}</p>}</section><section className="side-card"><div className="side-title"><h3>Universo rotativo</h3><span>{publicCfg?.watchlist?.core?.length || 0}</span></div><p>Siempre: AMD, MSFT y los ETF principales. El resto rota para no saturar Tradier ni reducir la calidad.</p><div className="universe priority-universe">{(publicCfg?.watchlist?.priority || []).map((symbol) => <span key={symbol}>{symbol}</span>)}</div><p className="tiny">Escaneo actual</p><div className="universe">{(scan?.universe || publicCfg?.watchlist?.indexProxies || []).map((symbol) => <span key={symbol}>{symbol}</span>)}</div><details><summary>Ver categorías completas</summary><p className="tiny">7 Magníficas</p><div className="universe">{(publicCfg?.watchlist?.magnificentSeven || []).map((symbol) => <span key={symbol}>{symbol}</span>)}</div><p className="tiny">Líderes de opciones</p><div className="universe">{(publicCfg?.watchlist?.optionsLeaders || []).map((symbol) => <span key={symbol}>{symbol}</span>)}</div><p className="tiny">ETF sectoriales y macro</p><div className="universe">{(publicCfg?.watchlist?.sectorAndMacroEtfs || []).map((symbol) => <span key={symbol}>{symbol}</span>)}</div></details></section><section className="side-card"><div className="side-title"><h3>Reglas de selección</h3><span>PUT / CALL</span></div><ul className="rules"><li>Cash-Secured Put: efectivo libre igual a strike × 100.</li><li>Covered Call: 100 acciones libres por contrato.</li><li>{publicCfg?.policy?.minDte}–{publicCfg?.policy?.maxDte} DTE; 0DTE bloqueado.</li><li>Delta objetivo {publicCfg?.policy?.profiles?.wheel?.shortDeltaMin}–{publicCfg?.policy?.profiles?.wheel?.shortDeltaMax}; no es probabilidad.</li><li>Volumen mínimo {publicCfg?.policy?.minOptionVolume}; OI mínimo {publicCfg?.policy?.minOpenInterest}; spread máx. {Math.round((publicCfg?.policy?.maxOptionSpreadPct || 0) * 100)}%.</li><li>Greeks de Tradier pueden actualizarse por hora.</li><li>Sin spreads, calls descubiertas ni ejecución automática.</li></ul></section></aside></section>
      {scan?.ai?.marketNote && <section className="ai-market-note"><span className="ai-chip">GEMINI · DECISIÓN</span><p>{scan.ai.marketNote}</p></section>}
      {scan?.errors?.length > 0 && <section className="warning-panel"><strong>Datos parciales</strong>{scan.errors.slice(0, 18).map((item, index) => <span key={`${item.symbol}-${item.stage}-${index}`}>{item.symbol} · {item.stage}: {item.error}</span>)}</section>}
      <section className="disclaimer"><strong>Una señal no garantiza ganancias ni sustituye la revisión manual.</strong> Una Cash-Secured Put puede asignarte 100 acciones y perder gran parte del colateral si el subyacente cae. Una Covered Call puede vender tus 100 acciones al strike; si el subyacente cae, la pérdida de las acciones puede superar la prima. Delta no es probabilidad; revisa cotización, Greeks, noticias y colateral actuales en Robinhood antes de decidir.</section>
      <footer className="footer">5 MILLIONS · {status?.latestScan ? `scan ${status.latestScan.id}` : 'sin scan'} · Tradier + Gemini con Google Search · Solo señales manuales</footer>
    </main>
  </div>;
}

function EmptyState({ onScan, loading }) { return <div className="empty-state"><div className="empty-icon">◌</div><h3>La mesa está vacía</h3><p>Ejecuta una revisión para consultar noticias, cotizaciones, históricos, expiraciones, cadenas y Greeks.</p><button className="primary-btn" onClick={onScan} disabled={loading}>{loading ? 'Consultando…' : 'Iniciar primera revisión'}</button></div>; }

function decodeKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export default App;
