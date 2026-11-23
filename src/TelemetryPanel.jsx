import { useState } from 'react';
import { apiGet } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { Icon, Card, Badge, Stat, EmptyState, SectionTitle, Spinner } from './components/ui.jsx';
import { money, dateTime } from './lib/format.js';

const MODULES = [
  ['', 'Todo'], ['bot:paper', 'Bot Paper'], ['bot:live', 'Bot Real'],
  ['crypto', 'Crypto SOL'], ['orchestrator', 'Orquestador'], ['system', 'Sistema']
];

export default function TelemetryPanel() {
  const [module, setModule] = useState('');
  const [tick, setTick] = useState(0);
  const stats = useApi(() => apiGet('/api/telemetry/stats'), [tick]);
  const events = useApi(() => apiGet('/api/telemetry?limit=80' + (module ? '&module=' + encodeURIComponent(module) : '')), [module, tick]);
  const data = stats.data || {};
  const telemetry = data.telemetry || {};
  const bots = data.bots || {};

  return (
    <div className="stack">
      <SectionTitle eyebrow="Telemetría" title="Todo lo que hacen los bots" note="Eventos, decisiones, errores y estadísticas guardadas en el disco persistente." />

      {stats.loading && !stats.data && <Spinner />}
      {stats.data && (
        <>
          <div className="grid-4">
            <Stat label="Eventos 24h" value={telemetry.last24 ?? 0} sub={telemetry.total + ' en total'} />
            <Stat label="Errores 24h" value={telemetry.errors24 ?? 0} tone={(telemetry.errors24 || 0) > 0 ? 'down' : 'up'} sub="nivel error" />
            <Stat label="Trades opciones" value={(bots.paper?.trades || 0) + (bots.live?.trades || 0)} sub={'P/L ' + money((bots.paper?.totalPnlUsd || 0) + (bots.live?.totalPnlUsd || 0))} />
            <Stat label="Crypto trades" value={data.crypto?.trades || 0} sub={'P/L ' + money(data.crypto?.totalPnlUsd || 0)} />
          </div>

          <div className="grid-2">
            <Card title="Bots" icon="cpu">
              <div className="stack xs">
                {['paper', 'live'].map((mode) => (
                  <div key={mode} className="row between wrap" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                    <span className="row" style={{ gap: 6 }}>
                      <Badge tone={bots[mode]?.armed ? 'up' : 'neutral'}>{mode === 'live' ? 'REAL' : 'PAPER'}</Badge>
                      <span className="tiny">{bots[mode]?.cycle?.state || '—'}</span>
                    </span>
                    <span className="tiny mono">
                      {bots[mode]?.trades || 0} trades · win {(bots[mode]?.winRate ?? 0)}% · P/L {money(bots[mode]?.totalPnlUsd || 0)}
                    </span>
                  </div>
                ))}
                <div className="row between wrap">
                  <span className="row" style={{ gap: 6 }}><Badge tone={data.crypto?.armed ? 'up' : 'neutral'}>CRYPTO</Badge><span className="tiny">{data.crypto?.cycle?.state || '—'}</span></span>
                  <span className="tiny mono">{data.crypto?.trades || 0} trades · win {(data.crypto?.winRate ?? 0)}% · P/L {money(data.crypto?.totalPnlUsd || 0)}</span>
                </div>
                <div className="row between wrap">
                  <span className="tiny muted">Esperanza paper</span>
                  <span className="tiny mono">{money(bots.paper?.expectancyUsd)} / trade</span>
                </div>
                <div className="row between wrap">
                  <span className="tiny muted">Captura prom. · MAE prom.</span>
                  <span className="tiny mono">{(bots.paper?.avgCapturePct ?? 0)}% · {(bots.paper?.avgMaePct ?? 0)}%</span>
                </div>
              </div>
            </Card>

            <Card title="Datos y orquestador" icon="database">
              <div className="stack xs">
                <div className="row between"><span className="tiny muted">Velas crypto</span><span className="tiny mono">{data.data?.crypto?.total ?? 0}</span></div>
                <div className="row between"><span className="tiny muted">Barras acciones</span><span className="tiny mono">{data.data?.stocks?.total ?? 0}</span></div>
                <div className="row between"><span className="tiny muted">Orquestador</span><span className="tiny mono">{data.orchestrator?.runs ?? 0} corridas</span></div>
                <div className="row between"><span className="tiny muted">Última auditoría</span><span className="tiny mono">{data.orchestrator?.lastRun ? dateTime(data.orchestrator.lastRun) : '—'}</span></div>
                {(data.orchestrator?.alerts || []).slice(0, 3).map((alert) => (
                  <p key={alert.at} className="tiny muted">· {alert.message}</p>
                ))}
                {(telemetry.byModule || []).map((row) => (
                  <div key={row.module} className="row between">
                    <span className="tiny muted">{row.module}</span><span className="tiny mono">{row.n}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Registro de eventos" icon="terminal"
            actions={<button className="btn sm" onClick={() => setTick((value) => value + 1)}><Icon name="refresh" size={13} />Actualizar</button>}>
            <div className="chip-row" style={{ marginBottom: 8 }}>
              {MODULES.map(([value, label]) => (
                <button key={value} type="button" className="chip" aria-pressed={module === value} onClick={() => setModule(value)}>{label}</button>
              ))}
            </div>
            {events.loading && !events.data && <Spinner />}
            {(events.data?.events || []).length === 0 ? <EmptyState icon="terminal" title="Sin eventos">Todavía no hay actividad registrada.</EmptyState> : (
              <div className="stack xs">
                {events.data.events.map((event) => (
                  <div key={event.id} style={{ borderBottom: '1px solid var(--border)', padding: '5px 0' }}>
                    <div className="row between wrap" style={{ gap: 4 }}>
                      <span className="row" style={{ gap: 5 }}>
                        <Badge tone={event.level === 'error' ? 'down' : event.level === 'warn' ? 'warn' : event.type === 'exit' ? 'brand' : event.type === 'entry' ? 'up' : 'neutral'}>{event.type}</Badge>
                        <span className="tiny mono">{event.module}</span>
                      </span>
                      <span className="tiny muted">{event.at ? new Date(event.at).toLocaleTimeString('es-US', { timeZone: 'America/New_York' }) : ''} ET</span>
                    </div>
                    <p className="tiny" style={{ marginTop: 2, color: 'var(--text-2)' }}>{event.message}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
