import { useMemo, useState } from 'react';
import { apiGet, apiPost } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { money, num, pct, ago, dateTime, scoreTone } from './lib/format.js';
import { Icon, Card, Badge, Stat, Gauge, CopyButton, SourceBanner, Banner, EmptyState, Spinner, LegsTable, Disclaimer } from './components/ui.jsx';
import { Sparkline } from './components/charts.jsx';

const URGENCY_TONE = { AHORA: 'up', HOY: 'warn', VIGILAR: 'neutral' };

export default function QuickPanel({ symbols = [], symbol, setSymbol, accountUsd }) {
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [pushState, setPushState] = useState('');
  const alerts = useApi(() => apiGet('/api/alerts/status'), [tick]);
  const credit = useApi(() => apiGet('/api/credit-bot'), [tick]);
  const [botBusy, setBotBusy] = useState(false);
  const [botMsg, setBotMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function enableAlerts() {
    setBusy(true);
    setPushState('Preparando alertas…');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador no admite notificaciones push.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permiso de notificaciones no concedido.');
      const keyResponse = await apiGet('/api/notifications/public-key');
      if (!keyResponse.configured) throw new Error('Faltan las claves VAPID en el servidor.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(keyResponse.publicKey) });
      await apiPost('/api/notifications/subscribe', subscription);
      setPushState('Alertas activas: te aviso cuando haya algo bueno.');
      alerts.reload();
    } catch (error) { setPushState(error.message); }
    finally { setBusy(false); }
  }

  async function botAction(path, body) {
    setBotBusy(true);
    setBotMsg('');
    try {
      const result = await apiPost(path, body);
      setBotMsg(result.ok ? 'Listo.' : (result.error || 'No se pudo.'));
      credit.reload();
    } catch (error) { setBotMsg(error.message); }
    finally { setBotBusy(false); }
  }

  async function testAlerts() {
    setBusy(true);
    try { const result = await apiPost('/api/notifications/test'); setPushState(result.sent ? 'Prueba enviada.' : 'No hay suscripciones activas.'); }
    catch (error) { setPushState(error.message); }
    finally { setBusy(false); }
  }

  const scan = useApi(() => apiGet(`/api/quick-scan?symbols=${symbols.join(',')}&limit=6&account=${accountUsd}`), [symbols.join(','), accountUsd, tick]);
  const positions = useApi(() => apiGet('/api/positions'), [tick]);
  const data = scan.data || null;
  const top = data?.opportunities || [];
  const pos = positions.data || null;

  const headline = useMemo(() => {
    if (!data) return '';
    return data.summary;
  }, [data]);

  return (
    <div className="stack">
      <SourceBanner demo={data?.demo} marketOpen={data?.marketOpen} asOf={data?.generatedAt} errors={data?.errors || []} />

      <section className="signal-hero" style={{ '--tone': 'var(--brand)' }}>
        <div className="row between wrap">
          <div>
            <p className="eyebrow">Modo rápido · 10 segundos</p>
            <h2 style={{ fontSize: 23, letterSpacing: '-.6px' }}>
              {data ? (data.marketOpen ? 'Mercado abierto' : 'Mercado cerrado') : 'Cargando…'}
            </h2>
            <p className="small muted" style={{ marginTop: 3, maxWidth: '58ch' }}>
              Tus mejores posiciones ya calculadas: entrada, stop y objetivo. Copiá la orden y seguí con tu día.
            </p>
          </div>
          <button className="btn primary" onClick={() => setTick((value) => value + 1)} disabled={scan.loading || positions.loading}>
            <Icon name="refresh" size={16} />{scan.loading ? 'Buscando…' : 'Actualizar'}
          </button>
        </div>
        <div className="grid-4" style={{ marginTop: 12 }}>
          <Stat label="Oportunidades" value={data?.counts?.total ?? '—'} sub={`CALL ${data?.counts?.calls ?? 0} · PUT ${data?.counts?.puts ?? 0} · SPREAD ${data?.counts?.spreads ?? 0}`} />
          <Stat label="Mercado" value={data?.marketOpen ? 'ABIERTO' : 'CERRADO'} tone={data?.marketOpen ? 'up' : 'muted'} sub={data?.simulated ? 'SIMULADO' : data ? 'datos reales' : ''} />
          <Stat label="Abiertas" value={pos?.summary?.open ?? 0} sub={pos?.mode ? `bot ${pos.mode}` : 'bot shadow'} />
          <Stat label="P/L abierto" value={money(pos?.summary?.totalPnlUsd)} tone={(pos?.summary?.totalPnlUsd ?? 0) >= 0 ? 'up' : 'down'} sub={`alertas ${pos?.summary?.alerts ?? 0}`} />
        </div>
        {headline && <p className="small" style={{ marginTop: 10, padding: '9px 11px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>{headline}</p>}
      </section>

      {(data?.alerts || []).map((alert) => <Banner key={alert.text} tone={alert.tone || 'info'} icon={alert.tone === 'warn' ? 'alert-triangle' : 'info'}>{alert.text}</Banner>)}
      {scan.error && <Banner tone="danger" icon="alert-circle" title="No se pudo escanear">{scan.error}</Banner>}

      {scan.loading && !top.length && <Card><div className="stack"><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 120 }} /></div></Card>}
      {!scan.loading && data?.empty && <Card title="Sin posición clara ahora" icon="shield"><EmptyState icon="crosshair" title="Nada supera el filtro">Ningún setup tiene dirección, liquidez y riesgo a favor. Revisá el radar NiTo para ver el motivo de cada símbolo, o esperá la próxima lectura.</EmptyState></Card>}

      {top.map((item, index) => (
        <section key={item.id} className={`signal-hero ${item.kind === 'CALL' ? 'call' : item.kind === 'PUT' ? 'put' : ''}`} style={item.kind === 'SPREAD' ? { '--tone': 'var(--warn)' } : undefined}>
          <div className="row between wrap" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 9, minWidth: 0 }}>
              <span className="brand-logo" style={{ width: 36, height: 36, borderRadius: 11, background: item.kind === 'CALL' ? 'linear-gradient(140deg,var(--up),var(--up-2))' : item.kind === 'PUT' ? 'linear-gradient(140deg,var(--down),var(--down-2))' : 'linear-gradient(140deg,var(--warn),#f59e0b)' }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>{index + 1}</span>
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="signal-topline">
                  <span className="signal-symbol">{item.symbol}</span>
                  <Badge tone={item.kind === 'CALL' ? 'up' : item.kind === 'PUT' ? 'down' : 'warn'}>{item.kind === 'SPREAD' ? item.strategy?.replaceAll('_', ' ') : item.kind}</Badge>
                  <Badge tone={URGENCY_TONE[item.urgency] || 'neutral'}>{item.urgency}</Badge>
                  {item.meta?.operable ? <Badge tone="brand" icon="check">operable</Badge> : <Badge tone="neutral" icon="lock">solo plan</Badge>}
                </div>
                <div className="contract-line" style={{ marginTop: 6 }}>
                  <Icon name={item.kind === 'CALL' ? 'trending-up' : item.kind === 'PUT' ? 'trending-down' : 'layers'} size={13} />
                  <span>
                    {item.kind === 'SPREAD'
                      ? `${item.action} · ${item.dte}d · crédito ${money(item.credit)}`
                      : `${item.action} ${item.symbol} ${item.expiry} ${item.kind === 'CALL' ? 'C' : 'P'} ${money(item.contract?.strike, 0)} · ${item.dte}d`}
                  </span>
                </div>
              </div>
            </div>
            <Gauge value={item.score} grade={item.grade} size={82} />
          </div>

          <div className="grid-4" style={{ marginTop: 12 }}>
            <Stat label="Entrada" value={item.kind === 'SPREAD' ? money(item.credit) : money(item.entry)} sub={item.kind === 'SPREAD' ? `ancho ${money(item.width)}` : `máx ${money(item.maxEntry)}`} />
            <Stat label="Stop" value={item.kind === 'SPREAD' ? money(item.maxLossUsd) : money(item.stop)} tone="down" sub={item.kind === 'SPREAD' ? 'pérdida máx.' : 'salir acá'} />
            <Stat label="Objetivo" value={item.kind === 'SPREAD' ? money(item.maxProfitUsd) : money(item.target1)} tone="up" sub={item.kind === 'SPREAD' ? 'ganancia máx.' : `subyacente ${money(item.targetUnderlying)}`} />
            <Stat label="POP" value={pct((item.pop ?? 0) * 100)} sub={item.kind === 'SPREAD' ? 'modelo' : `riesgo ${money(item.riskUsd)}`} />
          </div>

          <p className="small" style={{ marginTop: 10, color: 'var(--text-2)' }}>{item.thesis}</p>
          <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
            <CopyButton text={item.copy} label="Copiar orden" />
            {item.kind === 'SPREAD' && <button className="btn sm" onClick={() => setExpanded(expanded === item.id ? null : item.id)}><Icon name="eye" size={14} />{expanded === item.id ? 'Ocultar patas' : 'Ver patas'}</button>}
            <button className="btn sm" onClick={() => setSymbol(item.symbol)}><Icon name="crosshair" size={14} />Analizar {item.symbol}</button>
            <span className="tiny muted" style={{ marginLeft: 'auto' }}>{item.tags?.join(' · ')}</span>
          </div>
          {expanded === item.id && item.legs?.length > 0 && <div style={{ marginTop: 10 }}><LegsTable legs={item.legs} /></div>}
        </section>
      ))}

      <Card title="Tus posiciones abiertas" icon="wallet" subtitle={pos ? `bot ${pos.mode || 'shadow'} · ${pos.cycle?.state || ''}` : ''}
        actions={<button className="btn sm" onClick={() => positions.reload()} disabled={positions.loading}><Icon name="refresh" size={13} />Refrescar</button>}>
        {positions.loading && !pos && <Spinner label="Leyendo posiciones…" />}
        {positions.error && <Banner tone="warn" icon="alert-circle">{positions.error}</Banner>}
        {pos && pos.positions.length === 0 && <EmptyState icon="wallet" title="Sin posiciones abiertas">{pos.mode === 'shadow' ? 'El bot está en modo shadow: solo calcula, no abre posiciones.' : 'El bot no tiene operaciones abiertas ahora.'} {pos.cycle?.note || ''}</EmptyState>}
        {pos && pos.positions.length > 0 && (
          <div className="stack xs">
            {pos.positions.map((position) => (
              <div key={position.id} style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${position.priority === 'ALTA' ? 'var(--down)' : position.priority === 'MEDIA' ? 'var(--warn)' : 'var(--up)'}`, borderRadius: 10, padding: '9px 11px', background: 'var(--surface-2)' }}>
                <div className="row between wrap">
                  <div className="row" style={{ gap: 8 }}>
                    <strong style={{ fontFamily: 'var(--mono)' }}>{position.symbol}</strong>
                    <Badge tone="neutral">{position.strategy}</Badge>
                    <Badge tone={position.pnlUsd >= 0 ? 'up' : 'down'}>{money(position.pnlUsd)}</Badge>
                    {position.dte != null && <span className="tiny muted">{position.dte}d</span>}
                  </div>
                  <span className="tiny" style={{ color: position.priority === 'ALTA' ? 'var(--down)' : position.priority === 'MEDIA' ? 'var(--warn)' : 'var(--text-2)', fontWeight: 700 }}>{position.action}</span>
                </div>
                <div className="row wrap tiny muted" style={{ gap: 12, marginTop: 4 }}>
                  <span>crédito {money(position.credit)}</span>
                  <span>máx. pérdida {money(position.maxLossUsd)}</span>
                  <span>strike corto {position.shortStrike ?? '—'} {position.shortType || ''}</span>
                  <span>distancia {position.distanceToShortPct != null ? num(position.distanceToShortPct, 1) + '%' : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Radar exprés" icon="compass" subtitle="Estado de cada símbolo del radar">
        <div className="stack xs">
          {(data?.bySymbol || []).map((row) => (
            <button key={row.symbol} type="button" onClick={() => setSymbol(row.symbol)} className="row between" style={{ width: '100%', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
              <span className="row" style={{ gap: 8 }}>
                <strong style={{ fontFamily: 'var(--mono)' }}>{row.symbol}</strong>
                <Badge tone={row.gate === 'OPEN' ? 'up' : row.gate === 'DEMO' ? 'warn' : 'neutral'}>{row.gate}</Badge>
                <span className="tiny muted">{row.reasons?.[0]?.slice(0, 42) || ''}</span>
              </span>
              <span className="row" style={{ gap: 8 }}>
                {row.bias != null && <span className="tiny mono" style={{ color: row.bias >= 0 ? 'var(--up)' : 'var(--down)' }}>{row.bias > 0 ? '+' : ''}{num(row.bias, 0)}</span>}
                <Icon name="chevron-right" size={14} />
              </span>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Bot de crédito · Bull Put SPY" icon="cpu" tone="warn"
        subtitle={credit.data ? `${credit.data.mode} · ${credit.data.armed ? 'armado' : 'desarmado'} · cada ${credit.data.settings ? '' : ''}${credit.data.mode === 'live' ? 'DINERO REAL' : 'sandbox'}` : ''}
        actions={credit.data ? <Badge tone={credit.data.gates?.ok ? 'up' : 'warn'}>{credit.data.gates?.ok ? 'puede operar' : 'faltan requisitos'}</Badge> : null}>
        {credit.loading && !credit.data && <Spinner label="Leyendo el bot…" />}
        {credit.error && <Banner tone="warn" icon="alert-circle">{credit.error}</Banner>}
        {credit.data && (
          <div className="stack xs">
            <div className="grid-4">
              <Stat label="Modo" value={credit.data.mode === 'live' ? 'LIVE' : 'PAPER'} tone={credit.data.mode === 'live' ? 'down' : 'warn'} sub={credit.data.paused ? 'pausado' : credit.data.armed ? 'activo' : 'sin armar'} />
              <Stat label="Estrategia" value="Bull put" sub={`delta ${credit.data.settings?.delta?.[0]}–${credit.data.settings?.delta?.[1]} · ${credit.data.settings?.dte?.[0]}-${credit.data.settings?.dte?.[1]}d`} />
              <Stat label="Salidas" value={`${credit.data.settings?.profitTargetPct}% / ${credit.data.settings?.stopMultiple}x`} sub={`tiempo ${credit.data.settings?.timeExitDte}d`} />
              <Stat label="Estado" value={credit.data.cycle?.state || '—'} sub={credit.data.cycle?.note || ''} />
            </div>
            <div className="checklist">
              {(credit.data.gates?.checks || []).map((check) => (
                <Check key={check.name} status={check.ok ? 'pos' : 'neg'}><b>{check.name}</b>{check.detail ? <small>{check.detail}</small> : null}</Check>
              ))}
            </div>
            {credit.data.lastDecision?.plan && (
              <div className="banner info"><Icon name="target" /><div><b>Plan listo</b> Vender PUT {credit.data.lastDecision.plan.legs?.[0]?.strike} / comprar {credit.data.lastDecision.plan.legs?.[1]?.strike} · crédito {money(credit.data.lastDecision.plan.credit)} × {credit.data.lastDecision.plan.contracts} · riesgo {money(credit.data.lastDecision.plan.riskUsd)} · vence {credit.data.lastDecision.plan.expiration}</div></div>
            )}
            {!credit.data.lastDecision?.plan && credit.data.lastDecision?.notes?.length > 0 && (
              <p className="tiny muted">Última evaluación: {credit.data.lastDecision.notes.slice(0, 2).join(' · ')}</p>
            )}
            {credit.data.position && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', background: 'var(--surface-2)' }}>
                <div className="row between wrap">
                  <span className="row" style={{ gap: 8 }}><b className="mono">{credit.data.position.symbol}</b><Badge tone="warn">{credit.data.position.strategy}</Badge><span className="tiny muted">{credit.data.position.expiration}</span></span>
                  <Badge tone={(credit.data.position.pnlUsd ?? 0) >= 0 ? 'up' : 'down'}>{money(credit.data.position.pnlUsd)}</Badge>
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>crédito {money(credit.data.position.credit)} · {credit.data.position.contracts} contrato(s) · {credit.data.position.dte ?? '—'}d · valor actual {money(credit.data.position.currentCredit)}</div>
              </div>
            )}
            <div className="row wrap" style={{ gap: 8 }}>
              {!credit.data.armed && <button className="btn primary sm" onClick={() => botAction('/api/credit-bot/arm', { mode: credit.data.mode })} disabled={botBusy || !credit.data.gates?.ok}><Icon name="play" size={14} />Armar {credit.data.mode}</button>}
              {credit.data.armed && <button className="btn sm" onClick={() => botAction('/api/credit-bot/pause', { paused: !credit.data.paused })} disabled={botBusy}><Icon name={credit.data.paused ? 'play' : 'pause'} size={14} />{credit.data.paused ? 'Reanudar' : 'Pausar'}</button>}
              <button className="btn sm" onClick={() => botAction('/api/credit-bot/run', {})} disabled={botBusy}><Icon name="refresh" size={14} />Evaluar ahora</button>
              {credit.data.position && <button className="btn sm" onClick={() => botAction('/api/credit-bot/close', {})} disabled={botBusy}><Icon name="x" size={14} />Cerrar posición</button>}
              {credit.data.armed && <button className="btn ghost sm" onClick={() => botAction('/api/credit-bot/disarm', {})} disabled={botBusy}>Desarmar</button>}
            </div>
            {botMsg && <p className="tiny" style={{ color: 'var(--text-2)' }}>{botMsg}</p>}
            <p className="tiny muted">Para dinero real: token de producción de Tradier, cuenta live, disco persistente y <span className="mono">LIVE_CONFIRM=I_ACCEPT_REAL_MONEY</span>. El bot nunca garantiza ganancias; corta en 2,5x el crédito.</p>
          </div>
        )}
      </Card>

      <Card title="Alertas mientras trabajás" icon="wifi" tone="ai"
        subtitle={alerts.data ? `cada ${alerts.data.intervalMinutes} min · score ≥ ${alerts.data.minScore}` : ''}>
        <div className="stack xs">
          <div className="row wrap" style={{ gap: 8 }}>
            <Badge tone={alerts.data?.pushConfigured ? 'up' : 'warn'} icon="wifi">{alerts.data?.pushConfigured ? 'servidor con push' : 'push sin configurar'}</Badge>
            <Badge tone={alerts.data?.lastRun?.sent ? 'brand' : 'neutral'}>{alerts.data?.lastRun ? `último envío: ${alerts.data.lastRun.sent ?? 0}` : 'sin envíos aún'}</Badge>
          </div>
          <p className="small muted">Te aviso solo cuando una oportunidad supera el score mínimo o una posición abierta pide cierre. No repite el mismo aviso durante {alerts.data?.cooldownMinutes ?? 120} minutos.</p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn primary sm" onClick={enableAlerts} disabled={busy}><Icon name="wifi" size={14} />{busy ? 'Activando…' : 'Activar alertas'}</button>
            <button className="btn sm" onClick={testAlerts} disabled={busy}>Probar</button>
          </div>
          {pushState && <p className="tiny" style={{ color: 'var(--text-2)' }}>{pushState}</p>}
          {(alerts.data?.lastRun?.titles || []).length > 0 && (
            <div className="tiny muted">Últimas: {(alerts.data.lastRun.titles || []).slice(0, 3).join(' · ')}</div>
          )}
        </div>
      </Card>
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