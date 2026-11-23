import { useState } from 'react';
import { apiGet } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { Icon, Card, Badge, Stat, EmptyState, SectionTitle, CopyButton, Disclaimer } from './components/ui.jsx';
import { money } from './lib/format.js';

export default function CapitulationPanel() {
  const [tick, setTick] = useState(0);
  const api = useApi(() => apiGet('/api/capitulation'), [tick], { auto: true });
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
      {(data.skipped || []).length > 0 && <Card title="Por qué no hay más ideas" icon="info"><div className="stack xs">{(data.skipped || []).map((row) => <p key={row.symbol} className="tiny muted">· {row.symbol}: {row.reason}</p>)}</div></Card>}
      <Disclaimer />
    </div>
  );
}