import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, getKey } from './lib/api.js';
import { money, pct, num, dateTime, ago } from './lib/format.js';
import { Icon, Card, Badge, Stat, SectionTitle, Spinner, EmptyState, Banner, KV, Disclaimer, Modal } from './components/ui.jsx';
import { Sparkline } from './components/charts.jsx';

/** Rueda (CSP + Covered Call) del dueño: se mantiene el flujo original con la nueva piel. */
export default function WheelPanel() {
  const [status, setStatus] = useState(null);
  const [scan, setScan] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [learning, setLearning] = useState(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pushState, setPushState] = useState('');
  const [detail, setDetail] = useState(null);
  const [botData, setBotData] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [nextStatus, latestScan, currentPortfolio, nextLearning] = await Promise.all([
        apiGet('/api/status'),
        apiGet('/api/scan').catch(() => null),
        apiGet('/api/portfolio').catch(() => null),
        apiGet('/api/learning').catch(() => null)
      ]);
      setStatus(nextStatus);
      setScan(latestScan);
      setPortfolio(currentPortfolio);
      setLearning(nextLearning);
    } catch (requestError) { setError(requestError.message); }
    finally { setBooting(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiGet('/api/bot').then(setBotData).catch(() => setBotData(null));
  }, [status]);

  async function requestExit(tradeId) {
    try {
      await apiPost('/api/bot/trade/' + encodeURIComponent(tradeId) + '/exit', { reason: 'UMBRAL_DE_PERDIDA' });
      setMessage('Salida solicitada. El bot la procesa en el próximo ciclo.');
      setBotData(await apiGet('/api/bot'));
    } catch (error) { setError(error.message); }
  }

  async function scanNow() {
    setLoading(true); setError(''); setMessage('Exploración en curso…');
    try {
      let job = await apiPost('/api/scan/jobs');
      const id = job.id;
      const deadline = Date.now() + 240000;
      while (job.state === 'running' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        job = await apiGet('/api/scan/jobs');
        if (job.id !== id) throw new Error('El servidor reinició la exploración.');
      }
      if (job.state !== 'done' || !job.result) throw new Error(job.error || 'La exploración no terminó.');
      setScan(job.result);
      setStatus(await apiGet('/api/status'));
      setMessage(`Listo: ${job.result.summary?.ready ?? 0} listas · ${job.result.summary?.watch ?? 0} en vigilancia`);
    } catch (requestError) { setError(requestError.message); setMessage(''); }
    finally { setLoading(false); }
  }

  async function pauseBot(paused) {
    setPauseBusy(true);
    try { const trading = await apiPost('/api/bot/pause', { paused }); setStatus((current) => ({ ...current, trading })); }
    catch (requestError) { setError(requestError.message); }
    finally { setPauseBusy(false); }
  }

  async function enablePush() {
    setPushState('Preparando…');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador no admite Web Push.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permiso no concedido.');
      const keyResponse = await apiGet('/api/notifications/public-key');
      if (!keyResponse.configured) throw new Error('Faltan VAPID keys en el servidor.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(keyResponse.publicKey) });
      await apiPost('/api/notifications/subscribe', subscription);
      setPushState('Notificaciones activas.');
    } catch (requestError) { setPushState(requestError.message); }
  }

  async function recordFeedback(signal, action) {
    try {
      await apiPost(`/api/signals/${encodeURIComponent(signal.id)}/feedback`, { instanceId: signal.instanceId, action });
      setLearning(await apiGet('/api/learning'));
      setMessage(`${signal.symbol}: resultado ${action} guardado.`);
    } catch (requestError) { setError(requestError.message); }
  }

  const ready = scan?.signals?.filter((signal) => signal.status === 'READY') || [];
  const watch = scan?.signals?.filter((signal) => signal.status !== 'READY') || [];
  const tradierOk = status?.integrations?.tradier;

  if (booting) return <Card><Spinner label="Cargando mesa de la rueda…" /></Card>;

  return (
    <div className="stack">
      <SourceBanner demo={false} errors={scan?.errors || []} />
      <section className="signal-hero" style={{ '--tone': 'var(--up)' }}>
        <div className="row between wrap">
          <div>
            <p className="eyebrow">Rueda del dueño</p>
            <h2 style={{ fontSize: 22, letterSpacing: '-.5px' }}>Cash-Secured Puts & Covered Calls</h2>
            <p className="small muted" style={{ maxWidth: '62ch', marginTop: 3 }}>Escaneo manual con Tradier + Gemini. Colateral declarado, liquidez y noticias verificadas antes de cada señal.</p>
          </div>
          <div className="row wrap">
            <button className="btn sm" onClick={load}><Icon name="refresh" size={14} />Refrescar</button>
            <button className="btn primary sm" onClick={scanNow} disabled={loading || !tradierOk}>{loading ? 'Analizando…' : 'Escanear ahora'}</button>
          </div>
        </div>
        <div className="grid-4" style={{ marginTop: 12 }}>
          <Stat label="Listas" value={ready.length} tone="up" />
          <Stat label="Vigilancia" value={watch.length} />
          <Stat label="Tradier" value={tradierOk ? 'OK' : 'FALTA'} tone={tradierOk ? 'up' : 'down'} sub={status?.integrations?.tradierMode || ''} />
          <Stat label="Último scan" value={scan ? ago(scan.generatedAt) : '—'} sub={scan?.summary ? `${scan.summary.ready} ready` : ''} />
        </div>
      </section>

      {error && <Banner tone="danger" icon="alert-circle" title="Error">{error}</Banner>}
      {message && <Banner tone="info" icon="info">{message}</Banner>}
      {!tradierOk && <Banner tone="warn" icon="key" title="Tradier no configurado">Agregá TRADIER_TOKEN en el servidor para usar la rueda real. Mientras tanto la app funciona con los módulos NiTo y spreads en modo demo.</Banner>}

      <Card title="Mesa de ejecución · Bot" icon="terminal" subtitle={botData?.cycle?.note || ''}
        actions={<Badge tone={botData?.mode === 'live' ? 'down' : botData?.mode === 'paper' ? 'warn' : 'neutral'}>{botData?.mode || status?.trading?.mode || 'off'}</Badge>}>
        <div className="grid-4">
          <Stat label="Modo" value={botData?.mode || '—'} sub={botData?.blocked ? 'BLOQUEADO' : 'operativo'} />
          <Stat label="Perfil" value={botData?.profile?.id || botData?.profile || '—'} sub={botData?.root ? 'subyacente ' + botData.root : ''} />
          <Stat label="Riesgo máx." value={money(botData?.maxRiskUsd)} sub="por operación" />
          <Stat label="Abiertas" value={botData?.journal?.active ?? 0} sub={`${botData?.journal?.pending ?? 0} órdenes pendientes`} />
        </div>
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => pauseBot(true)} disabled={pauseBusy}><Icon name="pause" size={14} />Pausar</button>
          <button className="btn sm" onClick={() => pauseBot(false)} disabled={bot || Boolean(botState)}><Icon name="play" size={14} />Reanudar</button>
          <button className="btn sm" onClick={async () => { try { setBotData(await apiGet('/api/bot')); } catch (e) { setError(e.message); } }}><Icon name="refresh" size={14} />Refrescar bot</button>
          <Badge tone={botData?.paused ? 'warn' : 'up'}>{botData?.paused ? 'pausado' : 'activo'}</Badge>
        </div>
        {(botData?.trades || []).length > 0 && (
          <div className="stack xs" style={{ marginTop: 10 }}>
            {bot.trades.slice(0, 6).map((trade) => (
              <div key={trade.createdAt + trade.strategy} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', background: 'var(--surface-2)' }}>
                <div className="row between wrap">
                  <span className="row" style={{ gap: 8 }}>
                    <strong style={{ fontFamily: 'var(--mono)' }}>{trade.root}</strong>
                    <Badge tone="neutral">{String(trade.strategy || '').replaceAll('_', ' ')}</Badge>
                    <span className="tiny muted">{trade.expiration}</span>
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="tiny mono">crédito {money(trade.entryCredit)}</span>
                    <Badge tone={trade.realizedUsd > 0 ? 'up' : trade.realizedUsd < 0 ? 'down' : 'warn'}>{trade.realizedUsd != null ? money(trade.realizedUsd) : trade.state}</Badge>
                    {trade.state === 'OPEN' && botData?.mode === 'paper' && <button className="btn sm" onClick={() => requestExit(trade.id || trade.tag)}>Pedir cierre</button>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {(botData?.orders || []).length > 0 && <p className="tiny muted" style={{ marginTop: 8 }}>Últimas órdenes: {(bot.orders || []).slice(0, 3).map((order) => `${order.action} ${order.status} ${money(order.price)}`).join(' · ')}</p>}
      </Card>

      {ready.length + watch.length === 0 && <Card title="Sin señales" icon="compass"><EmptyState icon="compass" title="Todavía no hay una exploración" action={tradierOk ? <button className="btn sm" onClick={scanNow}>Iniciar escaneo</button> : null}>Conectá Tradier y declará el colateral para que el motor pueda marcar entradas.</EmptyState></Card>}

      {[...ready, ...watch].map((signal) => (
        <Card key={signal.instanceId || signal.id} tone={signal.status === 'READY' ? 'up' : ''}
          title={`${signal.symbol} · ${signal.strategy?.replaceAll('_', ' ') || signal.type || 'señal'}`}
          subtitle={`${signal.status} · ${signal.expiration || ''} · crédito ${money(signal.credit ?? signal.shortPremium)}`}
          icon={signal.status === 'READY' ? 'check-circle' : 'clock'}
          actions={<><Badge tone={signal.status === 'READY' ? 'up' : 'warn'}>{signal.status}</Badge><button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setDetail(signal)} aria-label="Detalle"><Icon name="eye" /></button></>}>
          <div className="grid-4">
            <Stat label="Strike corto" value={money(signal.shortStrike ?? signal.strike, 0)} sub={`Δ ${num(signal.shortDelta, 2)}`} />
            <Stat label="Prima" value={money(signal.credit ?? signal.shortPremium)} sub={`POP ${pct((signal.pop ?? 0) * 100, 0)}`} />
            <Stat label="Colateral" value={money(signal.collateralRequired ?? signal.collateral)} sub="requerido" />
            <Stat label="Score" value={num(signal.score, 0)} sub={signal.grade || ''} />
          </div>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button className="btn sm" onClick={() => recordFeedback(signal, 'WIN')}><Icon name="check" size={13} />Ganó</button>
            <button className="btn sm" onClick={() => recordFeedback(signal, 'LOSS')}><Icon name="x" size={13} />Perdió</button>
            <button className="btn sm" onClick={() => recordFeedback(signal, 'SKIP')}>Descartar</button>
          </div>
        </Card>
      ))}

      <div className="grid-2">
        <Card title="Colateral" icon="wallet">
          {portfolio ? (
            <div className="stack xs">
              <KV label="Efectivo" value={money(portfolio.cash)} />
              <KV label="Acciones" value={num(portfolio.shares, 0)} />
              <KV label="Actualizado" value={portfolio.updatedAt ? dateTime(portfolio.updatedAt) : '—'} />
              {!portfolio.fresh && <Banner tone="warn" icon="alert-triangle" title="Estado viejo">Actualizá el colateral antes de operar.</Banner>}
            </div>
          ) : <p className="small muted">Sin estado de colateral guardado.</p>}
        </Card>
        <Card title="Aprendizaje" icon="book">
          {learning ? (
            <div className="stack xs">
              <KV label="Muestras validadas" value={num(learning.validated, 0)} />
              <KV label="Aciertos" value={num(learning.wins, 0)} />
              <KV label="Winrate" value={pct((learning.winRate ?? 0) * 100, 1)} />
              {learning.advisory && <p className="tiny muted">{learning.advisory}</p>}
            </div>
          ) : <p className="small muted">Sin datos de aprendizaje todavía.</p>}
        </Card>
      </div>

      <Card title="Alertas" icon="wifi">
        <p className="small muted">Recibí una notificación solo cuando una señal pase a LISTA.</p>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={enablePush}><Icon name="wifi" size={14} />Activar</button>
          <button className="btn sm" onClick={async () => { try { const result = await apiPost('/api/notifications/test'); setPushState(result.sent ? 'Prueba enviada.' : 'Sin suscripciones.'); } catch (e) { setPushState(e.message); } }}>Probar</button>
        </div>
        {pushState && <p className="tiny muted" style={{ marginTop: 6 }}>{pushState}</p>}
      </Card>

      {detail && (
        <Modal title={`${detail.symbol} · ${detail.status}`} onClose={() => setDetail(null)}>
          <pre className="tiny" style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto', background: 'var(--surface-2)', padding: 10, borderRadius: 8 }}>{JSON.stringify(detail, null, 2)}</pre>
        </Modal>
      )}
      <Disclaimer />
    </div>
  );
}

function decodeKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}