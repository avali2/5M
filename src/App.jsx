import { useEffect, useMemo, useState } from 'react';

const KEY_STORAGE = 'five-millions-access-key';
const THEME = { green: '#0f766e', blue: '#2563eb', amber: '#b45309', red: '#be123c' };

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
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(digits)}` : '—';
}

function percent(value, digits = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(digits)}%` : '—';
}

function dateTime(value) {
  if (!value) return 'Sin datos';
  return new Date(value).toLocaleString('es-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusLabel(status) {
  return { READY: 'LISTA PARA REVISIÓN', WATCH: 'EN VIGILANCIA', REJECTED: 'RECHAZADA', CANDIDATE: 'CANDIDATA' }[status] || status;
}

function copyOrder(signal) {
  const lines = [
    `${signal.symbol} · ${signal.strategyLabel}`,
    `Expiración: ${signal.expiration} (${signal.dte} DTE)`,
    ...signal.legs.map((leg) => `${leg.action} ${leg.type} ${leg.strike} ${leg.contractSymbol || ''}`),
    `Orden LIMIT: recibir crédito ${money(signal.credit)}; mínimo ${money(signal.minimumCredit)}`,
    `Take profit: pagar ${money(signal.executionPlan?.takeProfitDebit)} o menos`,
    `Stop: pagar aproximadamente ${money(signal.executionPlan?.stopLossDebit)}`
  ];
  navigator.clipboard?.writeText(lines.join('\n'));
}

function KeyGate({ onSave, error }) {
  const [value, setValue] = useState(getKey());
  return <div className="gate-wrap">
    <div className="gate-card">
      <div className="brand-mark">5M</div>
      <p className="eyebrow">ACCESO PRIVADO</p>
      <h1>Conecta 5 MILLIONS</h1>
      <p className="muted">La app está protegida. Escribe el valor de <code>APP_ACCESS_KEY</code> que configuraste en Render.</p>
      <input autoFocus className="text-input" type="password" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSave(value)} placeholder="Tu clave de acceso" />
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

function LegTable({ signal }) {
  return <div className="leg-table">
    <div className="leg-head"><span>Acción</span><span>Contrato</span><span>Strike</span><span>Bid / Ask</span><span>Delta</span></div>
    {signal.legs.map((leg, index) => <div className="leg-row" key={`${signal.id}-${index}`}>
      <span className={leg.action === 'SELL_TO_OPEN' ? 'sell' : 'buy'}>{leg.action === 'SELL_TO_OPEN' ? 'VENDER' : 'COMPRAR'}</span>
      <span>{leg.type}</span><strong>{leg.strike}</strong><span>{money(leg.bid)} / {money(leg.ask)}</span><span>{Number(leg.delta).toFixed(3)}</span>
    </div>)}
  </div>;
}

function SignalCard({ signal, onCopy }) {
  const ready = signal.status === 'READY';
  const review = signal.aiReview;
  return <article className={`signal-card ${ready ? 'ready' : ''}`}>
    <div className="signal-topline">
      <div><Pill tone={ready ? 'green' : signal.status === 'REJECTED' ? 'red' : 'amber'}>{statusLabel(signal.status)}</Pill><span className="signal-source">{signal.source} · {signal.generatedAt ? dateTime(signal.generatedAt) : ''}</span></div>
      <div className="signal-score"><strong>{signal.score}</strong><small>score</small></div>
    </div>
    <div className="signal-title-row"><div><h3>{signal.symbol} <span>· {signal.strategyLabel}</span></h3><p>{signal.direction} · vencimiento <strong>{signal.expiration}</strong> · {signal.dte} DTE · precio {money(signal.underlyingPrice)}</p></div><div className="symbol-badge">{signal.symbol}</div></div>
    <div className="metrics-grid">
      <Metric label="Crédito ideal" value={money(signal.credit)} tone="green-text" />
      <Metric label="No aceptar menos" value={money(signal.minimumCredit)} />
      <Metric label="Ganancia máx. / contrato" value={money(signal.maxProfitUsd)} tone="green-text" />
      <Metric label="Riesgo máx. / contrato" value={money(signal.maxRiskUsd)} tone="red-text" />
      <Metric label="POP estimada*" value={percent(signal.popEstimate, 1)} />
      <Metric label="Contratos por presupuesto" value={signal.sizing?.contractsAtWorstRisk || 0} />
    </div>
    <LegTable signal={signal} />
    <div className="plan-grid">
      <div className="plan-box entry"><span className="plan-label">ENTRADA EXACTA</span><p>{signal.executionPlan?.entry}</p><p className="strong-line">Robinhood: vertical spread · LIMIT · crédito</p></div>
      <div className="plan-box exit"><span className="plan-label">SALIDA</span><p>{signal.executionPlan?.takeProfit}</p><p>{signal.executionPlan?.stopLoss}</p><p>{signal.executionPlan?.timeStop}</p></div>
    </div>
    <div className="signal-bottom">
      <div className="greeks"><span>Greeks:</span> Δ {signal.greeks?.delta ?? '—'} · Γ {signal.greeks?.gamma ?? '—'} · Θ {signal.greeks?.theta ?? '—'} · Vega {signal.greeks?.vega ?? '—'} · IV {signal.iv ?? '—'}</div>
      <button className="quiet-btn" onClick={() => onCopy(signal)}>Copiar orden</button>
    </div>
    {review && <div className="ai-review"><div><span className="ai-chip">GEMINI {review.confidence}%</span><strong>{review.summary}</strong></div>{review.riskFlags?.length > 0 && <div className="risk-flags">{review.riskFlags.map((risk) => <span key={risk}>⚠ {risk}</span>)}</div>}</div>}
    {!ready && signal.readiness?.reasons?.length > 0 && <div className="blocked-note">{signal.readiness.reasons.join(' · ')}</div>}
  </article>;
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

  const readySignals = useMemo(() => scan?.signals?.filter((signal) => signal.status === 'READY') || [], [scan]);
  const watchSignals = useMemo(() => scan?.signals?.filter((signal) => signal.status !== 'READY') || [], [scan]);

  async function loadAll() {
    setError('');
    const [cfg, nextStatus] = await Promise.all([request('/api/config'), request('/api/status')]);
    setPublicCfg(cfg); setStatus(nextStatus);
    const latest = await request('/api/scan').catch(() => null);
    if (latest) setScan(latest);
  }

  useEffect(() => {
    let alive = true;
    request('/api/health').then((health) => {
      if (!alive) return;
      if (health?.security?.requiresKey) return;
      return loadAll();
    }).catch((healthError) => {
      if (alive) { setGateError(formatError(healthError)); setError(formatError(healthError)); }
    }).finally(() => alive && setBooting(false));
    return () => { alive = false; };
  }, []);

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

  async function enablePush() {
    setPushMessage('Preparando notificaciones…');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador no admite Web Push.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permiso de notificaciones no concedido.');
      const keyResponse = await request('/api/notifications/public-key');
      if (!keyResponse.configured) throw new Error('Faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Render.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(keyResponse.publicKey) });
      await request('/api/notifications/subscribe', { method: 'POST', body: JSON.stringify(subscription) });
      setPushMessage('Notificaciones activas. Puedes probarlas con el botón de prueba.');
    } catch (pushError) { setPushMessage(formatError(pushError)); }
  }

  async function testPush() {
    try { const result = await request('/api/notifications/test', { method: 'POST' }); setPushMessage(result.sent ? 'Notificación de prueba enviada.' : 'No hay suscripciones activas todavía.'); }
    catch (pushError) { setPushMessage(formatError(pushError)); }
  }

  if (booting) return <div className="loading-screen"><div className="brand-mark">5M</div><p>Iniciando 5 MILLIONS…</p></div>;
  if (!publicCfg && gateError && (gateError.includes('401') || gateError.includes('Acceso protegido') || getKey())) return <KeyGate onSave={saveAccessKey} error={gateError} />;

  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><div className="brand"><div className="brand-mark">5M</div><div><p className="eyebrow">OPTIONS SIGNAL ENGINE</p><h1>5 MILLIONS</h1></div></div><div className="top-actions"><Pill tone={scan?.market?.marketOpen ? 'green' : 'slate'}>{scan?.market?.marketOpen ? 'MERCADO ABIERTO' : 'MERCADO CERRADO'}</Pill><button className="primary-btn" onClick={scanNow} disabled={loading}>{loading ? 'Escaneando…' : 'Escanear ahora'}</button></div></div></header>
    <main className="main-content">
      <section className="hero"><div><p className="eyebrow blue">SEÑALES DE RIESGO DEFINIDO</p><h2>Solo entradas que puedas explicar.</h2><p className="hero-copy">Escanea las 7 magníficas y los índices líquidos. El código construye el spread con precios reales de Tradier; Gemini lo audita y puede bloquearlo.</p></div><div className="hero-note"><strong>Robinhood ready</strong><span>Lectura manual · sin ejecución automática</span></div></section>
      <section className="connections"><Connection label="Tradier" value={publicCfg?.integrations?.tradier} note={publicCfg?.integrations?.tradierMode === 'live-read-only' ? 'Datos live · solo lectura' : 'No configurado'} /><Connection label="Gemini" value={publicCfg?.integrations?.gemini} note={publicCfg?.integrations?.gemini ? 'Revisión estructurada activa' : 'Señales bloqueadas'} /><Connection label="Alertas" value={publicCfg?.integrations?.push} note={publicCfg?.integrations?.push ? 'Web Push disponible' : 'Configura VAPID'} /><Connection label="Filtro" value={Boolean(scan)} note={scan ? `${scan.summary?.symbolsWithData || 0} símbolos con datos` : 'Sin exploración'} /></section>
      {error && <div className="error-banner">⚠ {error}</div>}
      {pushMessage && <div className="info-banner">{pushMessage}</div>}
      <section className="summary-grid"><Metric label="Señales listas" value={readySignals.length} tone="green-text" /><Metric label="En vigilancia" value={watchSignals.length} /><Metric label="Candidatos revisados" value={scan?.ai?.reviewedCandidates ?? '—'} /><Metric label="Última lectura" value={scan ? dateTime(scan.generatedAt) : '—'} /></section>
      <section className="workspace-grid"><div className="signal-column"><div className="section-heading"><div><p className="eyebrow blue">DECISIONES DEL MOTOR</p><h2>{readySignals.length ? `${readySignals.length} señal${readySignals.length > 1 ? 'es' : ''} lista${readySignals.length > 1 ? 's' : ''}` : 'No hay una entrada verde todavía'}</h2></div><span className="muted small">{scan?.source || 'Esperando Tradier'}</span></div>{!scan && <EmptyState onScan={scanNow} loading={loading} />}{scan && readySignals.length === 0 && <div className="no-signal"><strong>Preservar capital es una señal.</strong><p>El motor no encontró un spread que supere simultáneamente los filtros cuantitativos, el horario de mercado y la revisión de Gemini.</p><button className="quiet-btn" onClick={scanNow}>Volver a revisar</button></div>}{readySignals.map((signal) => <SignalCard key={signal.id} signal={signal} onCopy={copyOrder} />)}{scan && watchSignals.length > 0 && <><div className="subheading"><h3>En vigilancia / no ejecutar todavía</h3><span>{watchSignals.length}</span></div>{watchSignals.slice(0, 8).map((signal) => <SignalCard key={signal.id} signal={signal} onCopy={copyOrder} />)}</>}</div><aside className="side-column"><section className="side-card"><div className="side-title"><h3>Notificaciones</h3><span>●</span></div><p>Recibe una alerta cuando aparezca una señal <strong>LISTA</strong>. La alerta nunca sustituye la revisión en Robinhood.</p><button className="primary-btn full" onClick={enablePush}>Activar alertas</button><button className="quiet-btn full" onClick={testPush}>Enviar prueba</button></section><section className="side-card"><div className="side-title"><h3>Universo prioritario</h3><span>11</span></div><p className="muted">Magnificent 7 + ETFs líquidos. El sistema puede ampliarlo después sin cambiar el núcleo.</p><div className="universe">{(publicCfg?.watchlist?.core || []).map((symbol) => <span key={symbol}>{symbol}</span>)}</div></section><section className="side-card"><div className="side-title"><h3>Reglas de riesgo</h3><span>LIVE</span></div><ul className="rules"><li>Verticales de crédito definidos</li><li>{publicCfg?.policy?.minDte}–{publicCfg?.policy?.maxDte} DTE</li><li>POP mínima {percent(publicCfg?.policy?.minPop)}</li><li>Riesgo referencia {publicCfg?.policy?.riskPerTradePct}% de {money(publicCfg?.policy?.accountSize, 0)}</li><li>Máximo {publicCfg?.policy?.maxDailySignals} alertas por exploración</li><li>Sin órdenes automáticas</li></ul></section></aside></section>
      {scan?.ai?.marketNote && <section className="ai-market-note"><span className="ai-chip">GEMINI · CONTEXTO</span><p>{scan.ai.marketNote}</p></section>}
      {scan?.errors?.length > 0 && <section className="warning-panel"><strong>Fuentes incompletas</strong>{scan.errors.map((item) => <span key={`${item.symbol}-${item.error}`}>{item.symbol}: {item.error}</span>)}</section>}
      <section className="disclaimer"><strong>* POP no es una probabilidad garantizada.</strong> Es una aproximación de 1 − |delta| de la pierna corta y puede fallar por gaps, volatilidad, liquidez, asignación y eventos. Verifica el contrato, el crédito real, earnings y el riesgo antes de operar. Esta herramienta es educativa y no envía órdenes.</section>
      <footer className="footer">5 MILLIONS · {status?.latestScan ? `scan ${status.latestScan.id}` : 'sin scan'} · Datos de opciones de Tradier · Evaluación de Gemini</footer>
    </main>
  </div>;
}

function EmptyState({ onScan, loading }) { return <div className="empty-state"><div className="empty-icon">◌</div><h3>La mesa está vacía</h3><p>Ejecuta un escaneo para consultar cotizaciones, expiraciones, cadenas y Greeks de Tradier.</p><button className="primary-btn" onClick={onScan} disabled={loading}>{loading ? 'Consultando…' : 'Iniciar primer escaneo'}</button></div>; }

function decodeKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export default App;
