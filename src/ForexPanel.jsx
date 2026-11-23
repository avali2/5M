import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { Icon, Card, Badge, Stat, EmptyState, SectionTitle } from './components/ui.jsx';
import LiveChart from './components/LiveChart.jsx';
import { money } from './lib/format.js';

const FIELDS = [
  ['riskUsd', 'Riesgo por trade (USD)'],
  ['atrStopMult', 'Stop (x ATR)'],
  ['targetR', 'Objetivo (R)'],
  ['maxHoldHours', 'Salida por tiempo (h)']
];

export default function ForexPanel() {
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(0);
  useEffect(() => { const id = setInterval(() => setLive((value) => value + 1), 15000); return () => clearInterval(id); }, []);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(null);
  const api = useApi(() => apiGet('/api/forex/paper'), [tick]);
  const chart = useApi(() => apiGet('/api/forex/chart?symbol=' + encodeURIComponent((draft || draft)?.symbol || api.data?.config?.symbol || 'EURUSD')), [live, api.data?.config?.symbol]);
  const data = api.data;
  const config = draft || data?.config || {};
  const position = data?.position;
  const round = data?.lastRound;

  async function act(path) {
    setMessage('Ejecutando…');
    try { const result = await apiPost('/api/forex/paper/' + path, {}); setMessage(result.cycle?.note || 'Listo.'); setTick((value) => value + 1); }
    catch (error) { setMessage(error.message); }
  }
  async function save() {
    setMessage('Guardando…');
    try { const result = await apiPut('/api/forex/paper/config', config); setMessage(result.ok ? 'Guardado.' : (result.errors || []).join(' · ')); setDraft(null); setTick((value) => value + 1); }
    catch (error) { setMessage(error.message); }
  }

  return (
    <div className="stack">
      <SectionTitle eyebrow="Forex" title="Bot forex paper" note="EUR/USD, GBP/USD, AUD/USD, XAU/USD (oro vía GC=F), USD/JPY y USD/CAD. Spread simulado y ampliado fuera de Londres/NY, blackout de noticias y riesgo fijo. Sin dinero real." />
      <Card title="Forex paper" icon="line-chart" subtitle={data ? (data.symbol + ' · ' + (round ? round.source : '—')) : ''}
        actions={<Badge tone={data?.armed ? 'up' : 'neutral'}>{data?.armed ? 'ARMADO' : 'INACTIVO'}</Badge>}>
        {api.loading && !data && <p className="tiny muted">Cargando…</p>}
        {data && (
          <div className="stack xs">
            <div className="grid-4">
              <Stat label="Precio" value={round ? round.price : '—'} sub={round ? 'spread ' + round.spreadPips + ' pips' : ''} />
              <Stat label="Tendencia" value={round ? (round.price > round.ema50 ? 'ALCISTA' : 'BAJISTA') : '—'} sub={round ? 'EMA50 ' + round.ema50 : ''} />
              <Stat label="RSI" value={round ? round.rsi14 : '—'} sub="14 velas" />
              <Stat label="P/L paper" value={money(data.stats?.totalPnlUsd || 0)} tone={(data.stats?.totalPnlUsd || 0) >= 0 ? 'up' : 'down'} sub={(data.stats?.winRate ?? 0) + '% win · ' + (data.stats?.totalPips ?? 0) + ' pips'} />
            </div>
            {position ? (
              <div className="card-tight">
                <div className="row between wrap">
                  <Badge tone="brand">{position.side} ABIERTO</Badge>
                  <span className="tiny mono">entrada {position.entry} · stop {position.stop} · objetivo {position.target}</span>
                </div>
                <p className="tiny muted">Unidades {position.units} · riesgo {money(position.riskUsd)} · P/L {money(position.pnlUsd || 0)}</p>
              </div>
            ) : <p className="tiny muted">{data.cycle?.note || 'Sin posición.'}</p>}
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn primary sm" onClick={() => act('arm')} disabled={data.armed}><Icon name="play" size={13} />Armar</button>
              <button className="btn sm" onClick={() => act('pause')} disabled={!data.armed || data.paused}><Icon name="pause" size={13} />Pausar</button>
              <button className="btn sm" onClick={() => act('disarm')}><Icon name="square" size={13} />Desarmar</button>
              <button className="btn sm" onClick={() => act('tick')}><Icon name="refresh" size={13} />Revisar ahora</button>
              {message && <span className="tiny muted">{message}</span>}
            </div>
          </div>
        )}
      </Card>

      <Card title={'Precio en vivo · ' + (data?.config?.symbol || '')} icon="line-chart" actions={<Badge tone="up">EN VIVO</Badge>}>
        {chart.data ? <LiveChart bars={chart.data.bars} ema50={chart.data.ema50} ema200={chart.data.ema200} position={chart.data.position} price={chart.data.price} symbol={chart.data.symbol} /> : <p className="tiny muted">Cargando gráfico…</p>}
      </Card>

      <Card title="Configuración" icon="settings">
        <div className="grid-3">
          <label className="field"><span>Par</span>
            <select className="select" value={config.symbol || 'EURUSD'} onChange={(event) => setDraft({ ...config, symbol: event.target.value })}>
              <option value="EURUSD">EUR/USD</option>
              <option value="GBPUSD">GBP/USD</option>
              <option value="AUDUSD">AUD/USD</option>
              <option value="XAUUSD">XAU/USD (oro)</option>
              <option value="USDJPY">USD/JPY</option>
              <option value="USDCAD">USD/CAD</option>
            </select>
          </label>
          {FIELDS.map(([key, label]) => (
            <label key={key} className="field"><span>{label}</span>
              <input className="input" type="number" step="0.1" value={config[key] ?? ''} onChange={(event) => setDraft({ ...config, [key]: Number(event.target.value) })} />
            </label>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={Boolean(config.allowShort)} onChange={(event) => setDraft({ ...config, allowShort: event.target.checked })} /><span className="small">Permitir shorts</span></label>
          <button className="btn primary sm" onClick={save}><Icon name="check" size={13} />Guardar</button>
        </div>
      </Card>

      <Card title="Últimas operaciones" icon="bar-chart">
        {(data?.history || []).length === 0 ? <EmptyState icon="bar-chart" title="Sin trades todavía">El módulo opera cuando hay tendencia y el mercado está abierto.</EmptyState> : (
          <div className="stack xs">
            {data.history.slice().reverse().map((trade) => (
              <div key={trade.openedAt} className="row between wrap" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                <span className="tiny mono">{trade.side} {trade.entry} → {trade.exit}</span>
                <span className="tiny" style={{ color: trade.realizedUsd >= 0 ? 'var(--up)' : 'var(--down)' }}>{money(trade.realizedUsd)} · {trade.pips} pips · {trade.closeReason}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Registro forex" icon="terminal">
        {(data?.log || []).length === 0 ? <p className="tiny muted">Sin registros.</p> : data.log.slice().reverse().slice(0, 10).map((entry, index) => (
          <p key={(entry.at || '') + index} className="tiny" style={{ margin: '4px 0', color: 'var(--text-2)' }}>
            <Badge tone={entry.type === 'ENTRY' ? 'up' : entry.type === 'EXIT' ? 'brand' : 'neutral'}>{entry.type}</Badge>{' '}
            {entry.note || (entry.side ? entry.side + ' ' + entry.entry : '')} {entry.pnlUsd !== undefined ? '· ' + money(entry.pnlUsd) : ''}
          </p>
        ))}
      </Card>
    </div>
  );
}