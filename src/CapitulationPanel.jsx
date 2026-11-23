import { useState } from 'react';
import { apiGet, apiPost } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { Icon, Card, Badge, Stat, EmptyState, SectionTitle, CopyButton, Disclaimer } from './components/ui.jsx';
import { money } from './lib/format.js';

export default function CapitulationPanel() {
  const [tick, setTick] = useState(0);
  const api = useApi(() => apiGet('/api/capitulation'), [tick], { auto: true });
  const paper = useApi(() => apiGet('/api/capitulation/paper'), [tick]);
  async function syncPaper() { try { await apiPost('/api/capitulation/paper/sync', {}); setTick((value) => value + 1); } catch { /* sin red */ } }
  const data = api.data || {};
  const candidates = data.candidates || [];
  return (
    <div className="stack">
      <SectionTitle eyebrow="Capitulación" title="Caídas fuertes, rebote con prima" note="Espera pánico, vende put spreads definidos. Solo alertas: no ejecuta. Riesgo máximo por idea ≤ $300." />
      <Card title="Escaneo de capitulación" icon="flame" subtitle={data.scannedAt ? new Date(data.scannedAt).toLocaleTimeString('es-US', { timeZone: 'America/New_York' }) + ' ET' : ''} actions={<button className="btn sm" onClick={() => setTick((value) => value + 1)} disabled={api.loading}><Icon name="refresh" size={13} />{api.loading ? 'Escaneando…' : 'Escanear'}</button>}>
        {api.loading && <p className="tiny muted">Buscando caídas fuertes en {data.universe ? data.universe.length : 8} símbolos…</p>}
        {!api.loading && candidates.length === 0 && <EmptyState icon="flame" title="Sin capitulaciones claras">No hay caídas >3.5% con RSI bajo y prima suficiente.</EmptyState>}
        <div className="stack xs">
          {candidates.map((candidate) => (
            <div key={candidate.symbol} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <div className="row between wrap">
                <span className="row" style={{ gap: 6 }}><Badge tone="warn">{candidate.symbol}</Badge><span className="tiny muted">{candidate.expiration} · {candidate.dte}d</span></span>
                <span className="tiny" style={{ color: 'var(--down)' }}>{candidate.dayDrop}% día · {candidate.twoDayDrop}% 2d</span>
              </div>
              <div className="grid-4" style={{ marginTop: 6 }}>
                <Stat label="Crédito" value={money(candidate.credit)} sub={'ancho ' + candidate.creditWidth * 100 + '%'} />
                <Stat label="Riesgo" value={money(candidate.maxLoss)} sub={'TP ' + money(candidate.exits?.profitTargetUsd)} />
                <Stat label="RSI" value={candidate.rsi14} sub={'IV/RV ' + (candidate.ivRatio ?? '—')} />
                <Stat label="Strikes" value={candidate.shortStrike + ' / ' + candidate.longStrike} sub={'delta ' + candidate.shortDelta} />
              </div>
              <p className="tiny muted" style={{ marginTop: 4 }}>Vender put {candidate.shortStrike} · comprar put {candidate.longStrike} · 1 contrato · {candidate.reasons?.join(' · ')}</p>
              <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
                <CopyButton text={candidate.legs.map((leg) => leg.action + ' ' + leg.type + ' ' + leg.strike + ' @ ' + leg.price).join('\n')} label="Copiar orden" />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Seguimiento paper" icon="bar-chart" subtitle={paper.data?.lastUpdate ? 'actualizado ' + new Date(paper.data.lastUpdate).toLocaleTimeString('es-US', { timeZone: 'America/New_York' }) + ' ET' : 'sin marcar aún'} actions={<button className="btn sm" onClick={syncPaper}><Icon name="refresh" size={13} />Marcar</button>}>
        <div className="grid-4">
          <Stat label="Cerradas" value={paper.data?.stats?.trades ?? 0} sub={'win ' + (paper.data?.stats?.winRate ?? 0) + '%'} />
          <Stat label="P/L paper" value={money(paper.data?.stats?.totalPnlUsd || 0)} tone={(paper.data?.stats?.totalPnlUsd || 0) >= 0 ? 'up' : 'down'} />
          <Stat label="Abiertas" value={paper.data?.stats?.openCount ?? 0} sub="1 contrato c/u" />
          <Stat label="Riesgo abierto" value={money((paper.data?.open || []).reduce((sum, trade) => sum + (trade.maxLoss || 0), 0))} sub="suma máx." />
        </div>
        {(paper.data?.open || []).length > 0 && (
          <div className="stack xs" style={{ marginTop: 8 }}>
            {(paper.data.open).map((trade) => (
              <div key={trade.key} className="row between wrap" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                <span className="tiny mono">{trade.symbol} {trade.shortStrike}/{trade.longStrike} · {trade.expiration}</span>
                <span className="tiny" style={{ color: (trade.pnlUsd || 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{money(trade.pnlUsd || 0)} · mark {money(trade.lastMark ?? trade.entryMark)}</span>
              </div>
            ))}
          </div>
        )}
        {(paper.data?.closed || []).length > 0 && <p className="tiny muted" style={{ marginTop: 6 }}>Últimas cerradas: {(paper.data.closed).slice(-3).map((trade) => trade.symbol + ' ' + money(trade.realizedUsd) + ' (' + trade.closeReason + ')').join(' · ')}</p>}
      </Card>

      {(data.skipped || []).length > 0 && <Card title="Por qué no hay más ideas" icon="info"><div className="stack xs">{(data.skipped || []).map((row) => <p key={row.symbol} className="tiny muted">· {row.symbol}: {row.reason}</p>)}</div></Card>}
      <Disclaimer />
    </div>
  );
}