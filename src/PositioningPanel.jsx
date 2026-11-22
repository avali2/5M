import { useState } from 'react';
import { apiGet, apiPost } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { money, num, pct, dateTime, ago } from './lib/format.js';
import { Icon, Card, Badge, Stat, SectionTitle, CopyButton, SourceBanner, Banner, EmptyState, Spinner, KV, Disclaimer, Segmented } from './components/ui.jsx';
import { BarProfile, PriceChart } from './components/charts.jsx';

export default function PositioningPanel({ symbols = [], symbol, setSymbol }) {
  const [expiration, setExpiration] = useState('');
  const positioning = useApi(() => apiGet(`/api/positioning?symbol=${encodeURIComponent(symbol)}${expiration ? `&expiration=${expiration}` : ''}`), [symbol, expiration]);
  const market = useApi(() => apiGet(`/api/market/${encodeURIComponent(symbol)}`), [symbol, expiration]);
  const [ai, setAi] = useState({ loading: false, text: '', error: '', provider: '' });

  const payload = positioning.data?.positioning || null;
  const snapshot = market.data?.snapshot || null;
  const rows = payload?.byStrike || [];
  const walls = payload?.walls || {};
  const iv = payload?.iv || null;

  async function explain() {
    setAi({ loading: true, text: '', error: '', provider: '' });
    try {
      const result = await apiPost('/api/ai/analyze', { task: 'positioning', payload: { positioning: payload, symbol }, provider: 'auto' });
      setAi({ loading: false, text: result.text || '', error: '', provider: result.provider || '' });
    } catch (error) { setAi({ loading: false, text: '', error: error.message, provider: '' }); }
  }

  return (
    <div className="stack">
      <SourceBanner demo={positioning.data?.demo} errors={[]} />
      <section className="signal-hero" style={{ '--tone': 'var(--brand-2)' }}>
        <div className="row between wrap">
          <div>
            <p className="eyebrow">Posicionamiento institucional</p>
            <h2 style={{ fontSize: 22, letterSpacing: '-.5px' }}>Dónde está la posición del dinero</h2>
            <p className="small muted" style={{ maxWidth: '64ch', marginTop: 3 }}>
              GEX, delta exposure, muros de interés abierto, max pain y volatilidad. Lectura inferida de la cadena de opciones:
              no identifica instituciones, muestra dónde se concentra el riesgo.
            </p>
          </div>
          <button className="btn sm" onClick={() => positioning.reload()} disabled={positioning.loading}><Icon name="refresh" size={14} />Actualizar</button>
        </div>
        <div className="chip-row" style={{ marginTop: 10 }}>
          {(positioning.data?.expirations || snapshot?.expirations || []).map((date) => (
            <button key={date} type="button" className="chip" aria-pressed={expiration === date || (!expiration && date === positioning.data?.expirations?.[0])} onClick={() => setExpiration(date)}>{date}</button>
          ))}
        </div>
      </section>

      {positioning.loading && !payload && <Card><div className="skeleton" style={{ height: 240 }} /></Card>}
      {positioning.error && <Banner tone="danger" icon="alert-circle" title="Sin cadena de opciones">{positioning.error}</Banner>}

      {payload && (
        <>
          <div className="grid-4">
            <Stat label="Spot" value={money(payload.spot)} sub={`venc. ${payload.expiration || '—'} · ${payload.dte ?? '—'}d`} />
            <Stat label="GEX total" value={money(payload.totals?.gexUsdPerPct)} sub="por 1% de movimiento" tone={(payload.totals?.gexUsdPerPct ?? 0) >= 0 ? 'up' : 'down'} />
            <Stat label="Max pain" value={money(walls.maxPain?.strike ?? walls.maxPain, 0)} sub="imán de vencimiento" />
            <Stat label="P/C OI" value={num(payload.totals?.pcOi, 2)} sub={`vol ${num(payload.totals?.pcVol, 2)}`} />
          </div>

          <Card title={`GEX por strike · ${symbol}`} subtitle="Barras verdes: calls (soporte de gamma). Rojas: puts (presión). Los muros son imanes/paredes." icon="bar-chart"
            actions={<Badge tone={payload.regime?.behavior === 'PINNED' ? 'info' : payload.regime?.behavior === 'VOLATILE' ? 'down' : 'up'}>{payload.regime?.behavior || '—'}</Badge>}>
            <BarProfile rows={rows} spot={payload.spot} walls={{ callWall: walls.callWall, putWall: walls.putWall }} maxPain={walls.maxPain?.strike ?? walls.maxPain} valueKey="gex" label="GEX" />
            <div className="grid-3" style={{ marginTop: 10 }}>
              <KV label="Muro de calls" value={money(walls.callWall, 0)} />
              <KV label="Muro de puts" value={money(walls.putWall, 0)} />
              <KV label="Gamma flip" value={money(walls.gammaFlip, 0)} />
              <KV label="Régimen dealer" value={payload.regime?.dealerGamma || '—'} />
              <KV label="Mov. esperado" value={`±${money(payload.expectedMove?.sigmaUsd)} (${num(payload.expectedMove?.pct, 1)}%)`} />
              <KV label="Skew 25d" value={iv?.skew25d?.value != null ? `${num(iv.skew25d.value, 1)} pts` : '—'} />
            </div>
          </Card>

          <div className="grid-2">
            <Card title="Volatilidad implícita" icon="gauge">
              <div className="stack xs">
                <KV label="IV ATM" value={pct((iv?.atm ?? 0) * 100, 1)} />
                <KV label="IV vs realizada" value={iv?.rvRatio != null ? `${num(iv.rvRatio, 2)}x` : '—'} />
                <KV label="Veredicto" value={iv?.verdict || '—'} />
                <KV label="Skew" value={iv?.skew25d?.label || '—'} />
                <div className="tiny muted">Sin historial de IV guardado no mostramos percentile histórico; usamos IV ATM contra volatilidad realizada 20d.</div>
                <div className="stack xs">
                  {(iv?.term || []).map((row) => (
                    <div key={row.expiration} className="row between tiny">
                      <span className="mono">{row.expiration} · {row.dte}d</span>
                      <span className="mono" style={{ color: 'var(--brand)', fontWeight: 700 }}>{pct(row.iv * 100, 1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <Card title="Lectura rápida" icon="eye">
              {payload.narrative?.length ? (
                <div className="stack xs">{payload.narrative.map((line) => <div key={line} className="check pos"><span className="dot"><Icon name="chevron-right" /></span><div>{line}</div></div>)}</div>
              ) : <p className="small muted">Sin narrativa: faltan Greeks u open interest en la cadena.</p>}
              <div className="row wrap" style={{ marginTop: 10 }}>
                <button className="btn sm" onClick={explain} disabled={ai.loading}><Icon name="sparkles" size={14} />{ai.loading ? 'Analizando…' : 'Que la IA lo explique'}</button>
                <CopyButton text={JSON.stringify({ symbol, walls, regime: payload.regime, iv }, null, 2)} label="Copiar datos" />
              </div>
              {ai.error && <Banner tone="danger" icon="alert-circle" title="IA no disponible">{ai.error}</Banner>}
              {ai.text && <div className="banner ai" style={{ marginTop: 8 }}><Icon name="sparkles" /><div><b>Lectura IA</b><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{ai.text}</p></div></div>}
            </Card>
          </div>

          {snapshot && <Card title={`${symbol} · precio y niveles`} icon="line-chart" subtitle={`${dateTime(snapshot.asOf)} ET · ${ago(snapshot.asOf)}`}>
            <PriceChart bars={snapshot.history} levels={[
              { price: walls.callWall, label: 'MURO CALL', color: 'var(--up)' },
              { price: walls.putWall, label: 'MURO PUT', color: 'var(--down)' },
              { price: walls.maxPain?.strike ?? walls.maxPain, label: 'MAX PAIN', color: 'var(--warn)' }
            ]} expectedMove={payload.expectedMove ? { up: payload.expectedMove.up, down: payload.expectedMove.down } : null} />
          </Card>}
          {payload.warnings?.length > 0 && <Banner tone="warn" icon="alert-triangle" title="Limitaciones">{payload.warnings.join(' · ')}</Banner>}
        </>
      )}
      <Disclaimer />
    </div>
  );
}