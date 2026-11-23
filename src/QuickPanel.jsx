import { useMemo, useState } from 'react';
import { apiGet, apiPost } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { money, num, pct, ago, dateTime, scoreTone } from './lib/format.js';
import { Icon, Card, Badge, Stat, Gauge, CopyButton, SourceBanner, Banner, EmptyState, Spinner, LegsTable, Disclaimer, Check } from './components/ui.jsx';
import { Sparkline } from './components/charts.jsx';

const URGENCY_TONE = { AHORA: 'up', HOY: 'warn', VIGILAR: 'neutral' };

function fmtPrice(value) { if (!Number.isFinite(Number(value))) return '—'; const abs = Math.abs(Number(value)); return abs >= 100 ? Number(value).toFixed(2) : abs >= 1 ? Number(value).toFixed(2) : Number(value).toFixed(4); }

function SignalContext({ symbol }) {
  const api = useApi(() => apiGet('/api/positioning?symbol=' + symbol), [symbol]);
  const d = api.data || {};
  const quote = d.quote || {}; const tech = d.technical || {}; const pos = d.positioning || {}; const flow = d.flow || {};
  const trend = tech.trend === 'bullish' ? 'ALCISTA' : tech.trend === 'bearish' ? 'BAJISTA' : 'LATERAL';
  const regime = pos.regime?.dealerGamma === 'SHORT' ? 'dealers venden caídas / compran subidas' : pos.regime?.dealerGamma === 'LONG' ? 'dealers compran caídas / venden subidas' : 'posicionamiento mixto';
  const open = Number(quote.open) > 0 ? quote.open : null;
  return (
    <div className="stack xs" style={{ marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
      <p className="tiny" style={{ fontWeight: 700 }}>Contexto del día</p>
      <div className="row wrap tiny muted" style={{ gap: 12 }}>
        <span>Apertura {fmtPrice(open)}</span>
        <span>Actual {fmtPrice(quote.price)}</span>
        <span>Tendencia {trend}</span>
        <span>EMA50 {fmtPrice(tech.ema50)}</span>
        <span>Soporte {fmtPrice(tech.support)}</span>
        <span>Resistencia {fmtPrice(tech.resistance)}</span>
        <span>Instituciones: {flow.direction || '—'} · {regime}</span>
      </div>
      {flow.methodology && <p className="tiny muted">{String(flow.methodology).slice(0, 150)}</p>}
    </div>
  );
}

export default function QuickPanel({ symbols = [], symbol, setSymbol, accountUsd }) {
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [pushState, setPushState] = useState(() => {
    try { return typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'Notificaciones bloqueadas en el navegador. Tocá el candado 🔒 al lado de la URL → Notificaciones → Permitir, y recargá la página.' : ''; }
    catch { return ''; }
  });
  const alerts = useApi(() => apiGet('/api/alerts/status'), [tick]);
  const news = useApi(() => apiGet('/api/news'), [tick]);
  const [botBusy, setBotBusy] = useState(false);
  const [botMsg, setBotMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function enableAlerts() {
    setBusy(true);
    setPushState('Preparando alertas…');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador no admite notificaciones push.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permiso denegado. Tocá el candado 🔒 de la barra de direcciones → Notificaciones → Permitir, y volvé a intentar.');
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
            <p className="eyebrow">Alertas agresivas · lectura de 10 segundos</p>
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

      <Card title="Noticias" icon="globe" tone="info" actions={<Badge tone={news.data?.green ? 'up' : 'warn'}>{news.data?.green ? 'EN VERDE' : news.data?.status || '—'}</Badge>}>
        {news.loading && !news.data && <Spinner label="Leyendo mercados…" />}
        {news.data && (
          <div className="stack xs">
            <p className="tiny muted">{news.data.note}</p>
            {(news.data.headlines || []).slice(0, 5).map((row) => (
              <a key={row.title} href={row.link} target="_blank" rel="noopener noreferrer" className="small" style={{ color: 'var(--text-2)', lineHeight: 1.4 }}>
                {row.title} <span className="tiny muted">· {row.source}</span>
              </a>
            ))}
            <div className="row wrap" style={{ gap: 6 }}>
              {(news.data.sources || []).map((source) => <Badge key={source.name} tone={source.ok ? 'up' : 'neutral'}>{source.name}</Badge>)}
            </div>
          </div>
        )}
      </Card>


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

          <div className="row between wrap" style={{ marginTop: 8, gap: 8 }}>
            <span className="tiny muted">Entrada {item.kind === 'SPREAD' ? money(item.credit) : money(item.entry)} · POP {pct((item.pop ?? 0) * 100)} · score {item.score}</span>
            <button className="btn sm" onClick={() => setExpanded(expanded === item.id ? null : item.id)}><Icon name="eye" size={14} />{expanded === item.id ? 'Ocultar detalle' : 'Ver detalle'}</button>
          </div>
          {expanded === item.id && (
            <>
              <div className="grid-4" style={{ marginTop: 10 }}>
                <Stat label="Entrada" value={item.kind === 'SPREAD' ? money(item.credit) : money(item.entry)} sub={item.kind === 'SPREAD' ? `ancho ${money(item.width)}` : `máx ${money(item.maxEntry)}`} />
                <Stat label="Stop" value={item.kind === 'SPREAD' ? money(item.maxLossUsd) : money(item.stop)} tone="down" sub={item.kind === 'SPREAD' ? 'pérdida máx.' : 'salir acá'} />
                <Stat label="Objetivo" value={item.kind === 'SPREAD' ? money(item.maxProfitUsd) : money(item.target1)} tone="up" sub={item.kind === 'SPREAD' ? 'ganancia máx.' : `subyacente ${money(item.targetUnderlying)}`} />
                <Stat label="POP" value={pct((item.pop ?? 0) * 100)} sub={item.kind === 'SPREAD' ? 'modelo' : `riesgo ${money(item.riskUsd)}`} />
              </div>
              <p className="small" style={{ marginTop: 10, color: 'var(--text-2)' }}>{item.thesis}</p>
              <SignalContext symbol={item.symbol} />
              {item.legs?.length > 0 && <div style={{ marginTop: 10 }}><LegsTable legs={item.legs} /></div>}
            </>
          )}
          <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
            <CopyButton text={item.copy} label="Copiar orden" />
            <button className="btn sm" onClick={() => setSymbol(item.symbol)}><Icon name="crosshair" size={14} />Analizar {item.symbol}</button>
            <span className="tiny muted" style={{ marginLeft: 'auto' }}>{item.tags?.join(' · ')}</span>
          </div>
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