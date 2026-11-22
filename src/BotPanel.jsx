import React, { useState } from 'react';
import { apiGet, apiPost } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { money, num, pct, ago, dateTime } from './lib/format.js';
import { Icon, Card, Badge, Stat, Gauge, SourceBanner, Banner, EmptyState, Spinner, KV, Check, Disclaimer, CopyButton } from './components/ui.jsx';

export default function BotPanel({ mode = 'paper', accountUsd }) {
  const live = mode === 'live';
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [configDraft, setConfigDraft] = useState({});
  React.useEffect(() => { if (bot.data?.config) setConfigDraft(bot.data.config); }, [bot.data?.config]);
  async function saveConfig() {
    setBusy(true); setMessage('');
    try {
      const result = await apiPost('/api/bots/' + mode + '/config', configDraft);
      setMessage(result.ok ? 'Configuración guardada.' : (result.errors || []).join(' · '));
      bot.reload();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  const [tick, setTick] = useState(0);
  const bot = useApi(() => apiGet('/api/bots/' + mode), [mode, tick]);
  const news = useApi(() => apiGet('/api/news'), [tick]);
  const data = bot.data || {};
  const gates = data.gates || { ok: false, checks: [] };
  const missing = (gates.checks || []).filter((check) => !check.ok);

  async function verifyToken() {
    setBusy(true); setMessage('');
    try { const result = await apiPost('/api/bots/live/verify', {}); setMessage(result.verify?.ok ? 'Token válido: ' + (result.verify.name || '') + ' · cuenta ' + ((result.verify.accounts || [])[0]?.id || '—') + ' · nivel opciones ' + (result.verify.optionLevel ?? '—') : (result.verify?.error || 'Token inválido.')); bot.reload(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function action(path, body = {}) {
    setBusy(true); setMessage('');
    try {
      const result = await apiPost('/api/bots/' + mode + '/' + path, body);
      setMessage(result.ok ? 'Listo.' : (result.error || 'No se pudo.'));
      bot.reload();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <section className="signal-hero" style={{ '--tone': live ? 'var(--down)' : 'var(--warn)' }}>
        <div className="row between wrap">
          <div>
            <p className="eyebrow" style={{ color: live ? 'var(--down)' : 'var(--warn)' }}>{live ? 'Dinero real' : 'Sandbox · paper trading'}</p>
            <h2 style={{ fontSize: 23, letterSpacing: '-.6px' }}>{live ? 'Bot de trading real' : 'Bot de paper'}</h2>
            <p className="small muted" style={{ maxWidth: '62ch', marginTop: 3 }}>
              {live
                ? 'Opera con tu cuenta de Tradier de producción. Sólo se arma si TODOS los requisitos están en verde y DeepSeek aprueba cada plan.'
                : 'Mismo motor de crédito que el bot real, con dinero ficticio. Sirve para validar la estrategia antes de arriesgar capital.'}
            </p>
          </div>
          <div className="row wrap">
            <button className="btn sm" onClick={() => setTick((value) => value + 1)} disabled={bot.loading}><Icon name="refresh" size={14} />{bot.loading ? 'Leyendo…' : 'Refrescar'}</button>
            {data.armed
              ? <button className="btn sm" onClick={() => action('pause', { paused: !data.paused })} disabled={busy}><Icon name={data.paused ? 'play' : 'pause'} size={14} />{data.paused ? 'Reanudar' : 'Pausar'}</button>
              : <button className="btn primary sm" onClick={() => action('arm', { mode })} disabled={busy || !gates.ok}><Icon name="play" size={14} />Armar bot</button>}
            {data.armed && <button className="btn ghost sm" onClick={() => action('disarm')} disabled={busy}>Desarmar</button>}
          </div>
        </div>
        <div className="grid-4" style={{ marginTop: 12 }}>
          <Stat label="Modo" value={live ? 'LIVE' : 'PAPER'} tone={live ? 'down' : 'warn'} sub={data.armed ? (data.paused ? 'pausado' : 'armado') : 'desarmado'} />
          <Stat label="Ciclo" value={data.cycle?.state || '—'} sub={data.cycle?.note || ''} />
          <Stat label="Posición" value={data.position ? data.position.symbol : 'sin abrir'} sub={data.position ? `${data.position.contracts} contrato(s) · ${data.position.dte ?? '—'}d` : 'máx. 1 a la vez'} />
          <Stat label="DeepSeek" value={data.aiReview === 'required' ? 'OBLIGATORIO' : (data.aiReview || '—')} tone={data.aiReview === 'required' ? 'aic' : ''} sub={data.aiLast ? `último: ${data.aiLast.decision}` : 'sin revisión todavía'} />
        </div>
      </section>

      {live && missing.length > 0 && (
        <Banner tone="danger" icon="lock" title={'Todavía no puede operar con dinero real (' + missing.length + ' requisitos)'}>
          <ul style={{ margin: '4px 0 0 18px' }}>{missing.map((check) => <li key={check.name}><b>{check.name}:</b> {check.detail || 'falta configurar'}</li>)}</ul>
        </Banner>
      )}
      {live && missing.length === 0 && <Banner tone="warn" icon="alert-triangle" title="Modo live habilitado">Cada orden usará dinero real. El riesgo máximo por operación está limitado y DeepSeek debe aprobar el plan.</Banner>}
      {!live && <Banner tone="info" icon="info" title="Sandbox">Opera contra la cuenta de prueba de Tradier. Nada de esto mueve dinero real.</Banner>}

      <Card title="Requisitos y estado" icon="shield-check" actions={<Badge tone={gates.ok ? 'up' : 'warn'}>{gates.ok ? 'todo en verde' : 'faltan requisitos'}</Badge>}>
        <div className="checklist">
          {(gates.checks || []).map((check) => (
            <Check key={check.name} status={check.ok ? 'pos' : 'neg'}><b>{check.name}</b>{check.detail ? <small>{check.detail}</small> : null}</Check>
          ))}
        </div>
        <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
          <button className="btn sm" onClick={() => action('run')} disabled={busy}><Icon name="refresh" size={14} />Evaluar ahora</button>
          <button className="btn sm" onClick={() => action('briefing')} disabled={busy}><Icon name="sparkles" size={14} />Briefing DeepSeek</button>
          {live && <button className="btn sm" onClick={verifyToken} disabled={busy}><Icon name="key" size={14} />Verificar token producción</button>}
          {data.position && <button className="btn sm" onClick={() => action('close')} disabled={busy}><Icon name="x" size={14} />Cerrar posición</button>}
          <CopyButton text={JSON.stringify({ mode, cycle: data.cycle, gates: gates.checks, aiLast: data.aiLast }, null, 2)} label="Copiar estado" />
        </div>
        {message && <p className="tiny" style={{ marginTop: 6, color: 'var(--text-2)' }}>{message}</p>}
        {data.lastVerify && <p className="tiny" style={{ marginTop: 4, color: data.lastVerify.ok ? 'var(--up)' : 'var(--down)' }}>Última verificación: {data.lastVerify.ok ? 'token OK · ' + (data.lastVerify.name || '') + ' · cuentas ' + (data.lastVerify.accounts || []).map((account) => account.id).join(', ') : data.lastVerify.error}</p>}
        {bot.error && <Banner tone="danger" icon="alert-circle" title="Sin respuesta del bot">{bot.error}</Banner>}
      </Card>

      {data.lastDecision?.plan && (
        <Card title="Plan evaluado" icon="target" actions={<Badge tone={data.aiLast?.decision === 'APPROVE' ? 'up' : data.aiLast?.decision === 'REJECT' ? 'down' : 'warn'}>{data.aiLast?.decision || 'sin IA'}</Badge>}>
          <div className="grid-4">
            <Stat label="Estrategia" value={data.lastDecision.plan.strategy?.replaceAll('_', ' ')} sub={data.lastDecision.plan.direction} />
            <Stat label="Strikes" value={`${data.lastDecision.plan.legs?.[0]?.strike} / ${data.lastDecision.plan.legs?.[1]?.strike}`} sub={`${data.lastDecision.plan.dte}d · vence ${data.lastDecision.plan.expiration}`} />
            <Stat label="Crédito" value={money(data.lastDecision.plan.credit)} sub={`${num((data.lastDecision.plan.creditWidth ?? 0) * 100, 0)}% del ancho`} />
            <Stat label="Riesgo" value={money(data.lastDecision.plan.riskUsd)} tone="down" sub={`${data.lastDecision.plan.contracts} contrato(s)`} />
          </div>
          {data.lastDecision.notes?.length > 0 && <p className="tiny muted" style={{ marginTop: 8 }}>Reglas del motor: {data.lastDecision.notes.slice(0, 3).join(' · ')}</p>}
          {data.aiLast?.reasons?.length > 0 && <div className="stack xs" style={{ marginTop: 8 }}>{data.aiLast.reasons.map((reason) => <Check key={reason} status={data.aiLast.decision === 'APPROVE' ? 'pos' : 'warn'}>{reason}</Check>)}</div>}
          {data.aiLast?.risks?.length > 0 && <p className="tiny" style={{ marginTop: 6, color: 'var(--down)' }}>Riesgos IA: {data.aiLast.risks.join(' · ')}</p>}
        </Card>
      )}

      {data.position && (
        <Card title="Posición abierta" icon="layers" tone={live ? 'down' : 'warn'}>
          <div className="grid-4">
            <Stat label="Contrato" value={data.position.strategy?.replaceAll('_', ' ')} sub={data.position.expiration} />
            <Stat label="Crédito entrada" value={money(data.position.credit)} sub={`${data.position.contracts} contrato(s)`} />
            <Stat label="Valor actual" value={money(data.position.currentCredit)} sub={`P/L ${money(data.position.pnlUsd)}`} tone={(data.position.pnlUsd ?? 0) >= 0 ? 'up' : 'down'} />
            <Stat label="Días" value={data.position.dte ?? '—'} sub={`cierre por tiempo ${data.settings?.timeExitDte ?? 21}d`} />
          </div>
        </Card>
      )}

      <Card title="Historial" icon="book" subtitle={`${(data.history || []).length} operación(es) cerradas`}>
        {(data.history || []).length === 0 && <EmptyState icon="book" title="Sin operaciones cerradas">El bot todavía no completó ninguna operación en este modo.</EmptyState>}
        {(data.history || []).slice().reverse().map((trade) => (
          <div key={trade.closedAt || trade.openedAt} className="row between" style={{ borderBottom: '1px solid var(--border)', padding: '8px 0', flexWrap: 'wrap', gap: 6 }}>
            <span className="row" style={{ gap: 8 }}>
              <strong className="mono">{trade.symbol}</strong>
              <Badge tone="neutral">{String(trade.strategy || '').replaceAll('_', ' ')}</Badge>
              <span className="tiny muted">{trade.expiration} · {trade.closeReason}</span>
            </span>
            <Badge tone={(trade.realizedUsd ?? 0) >= 0 ? 'up' : 'down'}>{money(trade.realizedUsd)}</Badge>
          </div>
        ))}
      </Card>

      <Card title="Configuración del bot" icon="settings" subtitle="Se guarda en el servidor y aplica en el próximo ciclo">
        {data.config && (
          <div className="stack xs">
            <div className="grid-2">
              <label className="field"><span>Perfil</span>
                <select className="select" value={configDraft.profile} onChange={(event) => setConfigDraft({ ...configDraft, profile: event.target.value })}>
                  <option value="prudent">Prudente</option>
                  <option value="aggressive">Agresivo</option>
                </select>
              </label>
              <label className="field"><span>Stop</span>
                <select className="select" value={configDraft.stopMode} onChange={(event) => setConfigDraft({ ...configDraft, stopMode: event.target.value })}>
                  <option value="hybrid">Híbrido (prima 2x + subyacente)</option>
                  <option value="premium">Solo prima 2x</option>
                  <option value="underlying">Subyacente + 3x</option>
                </select>
              </label>
            </div>
            <div className="row wrap" style={{ gap: 12 }}>
              {[['bullPut', 'Bull put'], ['bearCall', 'Bear call'], ['ironCondor', 'Iron condor']].map(([key, label]) => (
                <label key={key} className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={Boolean(configDraft.strategies?.[key])} onChange={(event) => setConfigDraft({ ...configDraft, strategies: { ...configDraft.strategies, [key]: event.target.checked } })} />
                  <span className="small">{label}</span>
                </label>
              ))}
            </div>
            <div className="grid-3">
              {[['minCreditWidth', 'Crédito/ancho mín.'], ['minIvRatio', 'IV vs RV mín.'], ['hardStopMultiple', 'Stop duro (x)'], ['profitTargetPct', 'Objetivo %'], ['timeExitDte', 'Cierre por tiempo (d)'], ['minAtrTrend', 'Distancia EMA (ATR)'], ['stopMultiple', 'Stop prima (x)'], ['ivrFloor', 'IV Rank mínimo']].map(([key, label]) => (
                <label key={key} className="field"><span>{label}</span>
                  <input className="input" type="number" step="0.01" value={configDraft[key] ?? ''} onChange={(event) => setConfigDraft({ ...configDraft, [key]: Number(event.target.value) })} />
                </label>
              ))}
            </div>
            <div className="row wrap" style={{ gap: 12 }}>
              <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={Boolean(configDraft.autoStrategy)} onChange={(event) => setConfigDraft({ ...configDraft, autoStrategy: event.target.checked })} /><span className="small">Elegir mejor estrategia según régimen</span></label>
              <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={Boolean(configDraft.adaptiveLearning)} onChange={(event) => setConfigDraft({ ...configDraft, adaptiveLearning: event.target.checked })} /><span className="small">Aprendizaje adaptativo (baja riesgo tras rachas)</span></label>
              <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={Boolean(configDraft.requireContango)} onChange={(event) => setConfigDraft({ ...configDraft, requireContango: event.target.checked })} /><span className="small">Exigir contango de IV</span></label>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn primary sm" onClick={saveConfig} disabled={busy}><Icon name="check" size={14} />Guardar configuración</button>
              <button className="btn sm" onClick={() => action('review')} disabled={busy}><Icon name="sparkles" size={14} />Analizar último cierre con IA</button>
              {message && <span className="tiny" style={{ color: 'var(--text-2)' }}>{message}</span>}
            </div>
          </div>
        )}
      </Card>

      <Card title="Estadísticas" icon="bar-chart" subtitle={data.stats ? (data.stats.summary.trades + ' cerradas · riesgo x' + data.stats.riskMultiplier + (data.vixRegime ? ' · VIX ' + data.vixRegime.ratio + ' ' + data.vixRegime.state : '') + (data.ivr && data.ivr.value !== null ? ' · IVR ' + data.ivr.value : '')) : ''}>
        {data.stats && (
          <div className="stack xs">
            <div className="grid-4">
              <Stat label="Trades" value={data.stats.summary.trades} sub={(data.stats.summary.winRate ?? 0) + '% win'} />
              <Stat label="P/L total" value={money(data.stats.summary.totalPnlUsd)} tone={(data.stats.summary.totalPnlUsd ?? 0) >= 0 ? 'up' : 'down'} />
              <Stat label="Expectativa" value={money(data.stats.summary.expectancyUsd)} sub="por operación" />
              <Stat label="Captura prom." value={(data.stats.summary.avgCapturePct ?? 0) + '%'} sub={'MAE ' + (data.stats.summary.avgMaePct ?? 0) + '%'} />
            </div>
            {(data.stats.byStrategy || []).length > 0 && (
              <div className="table-wrap"><table className="legs"><thead><tr><th>Estrategia</th><th>Trades</th><th>Win %</th><th>P/L</th></tr></thead>
                <tbody>{data.stats.byStrategy.map((row) => <tr key={row.strategy}><td>{String(row.strategy).replaceAll('_', ' ')}</td><td className="num">{row.trades}</td><td className="num">{row.winRate ?? 0}</td><td className="num">{money(row.pnl)}</td></tr>)}</tbody>
              </table></div>
            )}
            {(data.stats.byExitReason || []).length > 0 && <p className="tiny muted">Salidas: {data.stats.byExitReason.map((row) => row.reason + ' ' + row.trades + ' (' + money(row.pnl) + ')').join(' · ')}</p>}
            {(data.stats.lessons || []).length > 0 && (
              <div>
                <p className="tiny" style={{ fontWeight: 700 }}>Lecciones de DeepSeek</p>
                {data.stats.lessons.slice(-3).map((lesson) => <p key={lesson.at} className="tiny muted" style={{ marginTop: 4 }}>· {lesson.text}</p>)}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Registro de decisiones" icon="terminal" subtitle="Por qué entró, saltó o cerró" actions={<button className="btn sm" onClick={() => bot.reload()}><Icon name="refresh" size={13} />Refrescar</button>}>
        {(data.log || []).length === 0 && <EmptyState icon="terminal" title="Sin registros todavía">El bot guardará cada evaluación, entrada y salida.</EmptyState>}
        <div className="stack xs">
          {(data.log || []).slice().reverse().slice(0, 18).map((entry, index) => (
            <div key={(entry.at || '') + index} style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
              <div className="row between wrap" style={{ gap: 6 }}>
                <span className="row" style={{ gap: 6 }}>
                  <Badge tone={entry.type === 'ENTRY' ? 'up' : entry.type === 'EXIT' ? 'brand' : entry.type === 'AI_LESSON' ? 'ai' : entry.type === 'AI' ? 'ai' : 'neutral'}>{entry.type}</Badge>
                  {entry.strategy && <span className="tiny mono">{String(entry.strategy).replaceAll('_', ' ')}</span>}
                </span>
                <span className="tiny muted">{entry.at ? new Date(entry.at).toLocaleTimeString('es-US', { timeZone: 'America/New_York' }) : ''} ET</span>
              </div>
              <p className="tiny" style={{ marginTop: 2, color: 'var(--text-2)' }}>
                {entry.note || entry.text || (entry.plan ? ((entry.plan.strategy || '') + ' · crédito ' + money(entry.plan.credit) + ' · riesgo ' + money(entry.plan.riskUsd)) : '')}
                {entry.decision ? (' · IA ' + entry.decision) : ''}
                {entry.pnlUsd !== undefined ? (' · P/L ' + money(entry.pnlUsd)) : ''}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Noticias" icon="info" actions={<Badge tone={news.data?.green ? 'up' : 'warn'}>{news.data?.green ? 'verde' : news.data?.status || '—'}</Badge>}>
        {news.loading && !news.data && <Spinner label="Leyendo feeds…" />}
        {news.data && (
          <div className="stack xs">
            <p className="tiny muted">{news.data.note} · {(news.data.sources || []).filter((source) => source.ok).length}/{(news.data.sources || []).length} fuentes</p>
            {(news.data.headlines || []).slice(0, 5).map((row) => (
              <a key={row.title} href={row.link} target="_blank" rel="noopener noreferrer" className="small" style={{ color: 'var(--text-2)' }}>{row.title} <span className="tiny muted">· {row.source}</span></a>
            ))}
          </div>
        )}
      </Card>
      <Disclaimer />
    </div>
  );
}