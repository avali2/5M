import { useMemo, useState } from 'react';
import { apiGet } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { money, num, pct, ago, dateTime, scoreTone } from './lib/format.js';
import { Icon, Card, Badge, Stat, Gauge, CopyButton, SourceBanner, Banner, EmptyState, Spinner, LegsTable, Disclaimer } from './components/ui.jsx';
import { Sparkline } from './components/charts.jsx';

const URGENCY_TONE = { AHORA: 'up', HOY: 'warn', VIGILAR: 'neutral' };

export default function QuickPanel({ symbols = [], symbol, setSymbol, accountUsd }) {
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(null);
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
      <Disclaimer />
    </div>
  );
}
