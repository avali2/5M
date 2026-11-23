import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { Icon, Card, Badge, Stat, EmptyState, Banner } from './components/ui.jsx';
import LiveChart from './components/LiveChart.jsx';
import { money } from './lib/format.js';

const fmtPrice = (value) => { if (!Number.isFinite(Number(value))) return '—'; const abs = Math.abs(Number(value)); return abs >= 100 ? Number(value).toFixed(2) : abs >= 1 ? Number(value).toFixed(4) : abs >= 0.01 ? Number(value).toFixed(6) : Number(value).toFixed(9); };

const FIELDS = [
  ['riskUsd', 'Riesgo por trade (USD)'],
  ['maxNotional', 'Notional máximo (USD)'],
  ['atrStopMult', 'Stop (x ATR)'],
  ['targetR', 'Objetivo (R)'],
  ['maxHoldHours', 'Salida por tiempo (h)'],
  ['minRsi', 'RSI mínimo'],
  ['maxRsi', 'RSI máximo']
];

export default function CryptoPanel() {
  const [tick, setTick] = useState(0);
  const [book, setBook] = useState('pepe');
  const [live, setLive] = useState(0);
  useEffect(() => { const id = setInterval(() => setLive((value) => value + 1), 15000); return () => clearInterval(id); }, []);
  const [message, setMessage] = useState('');
  const api = useApi(() => apiGet('/api/crypto/paper?book=' + book), [tick, book]);
  const chart = useApi(() => apiGet('/api/crypto/chart?book=' + book), [book, live]);
  const [draft, setDraft] = useState(null);
  const data = api.data;
  const config = draft || data?.config || {};
  const position = data?.position;

  async function act(path) {
    setMessage('Ejecutando…');
    try {
      const result = await apiPost('/api/crypto/paper/' + path + '?book=' + book, {});
      setMessage(result.cycle?.note || 'Listo.');
      setTick((value) => value + 1);
    } catch (error) { setMessage(error.message); }
  }

  async function save() {
    setMessage('Guardando…');
    try {
      const result = await apiPut('/api/crypto/paper/config?book=' + book, config);
      setMessage(result.ok ? 'Configuración guardada.' : (result.errors || []).join(' · '));
      setDraft(null);
      setTick((value) => value + 1);
    } catch (error) { setMessage(error.message); }
  }

  return (
    <div className="stack">
      <Card title="Crypto SOL · paper" icon="flame" tone="warn"
        subtitle={data ? (data.source + ' · ' + data.settings.symbol + (data.stats ? ' · ' + data.stats.trades + ' trades' : '')) : ''}
        actions={<Badge tone={data?.armed ? 'up' : 'neutral'}>{data?.armed ? 'ARMADO' : 'INACTIVO'}</Badge>}>
        {api.loading && !data && <p className="tiny muted">Cargando…</p>}
        {api.error && <Banner tone="danger" icon="alert-circle">{api.error}</Banner>}
        {data && (
          <div className="stack xs">
            <div className="grid-4">
              <Stat label="Precio" value={data.lastRound ? fmtPrice(data.lastRound.price) : '—'} sub={data.lastRound ? 'RSI ' + data.lastRound.rsi14 : ''} />
              <Stat label="Tendencia" value={data.lastRound ? (data.lastRound.price > data.lastRound.ema200 ? 'ALCISTA' : 'BAJISTA') : '—'} sub={data.lastRound ? 'EMA200 ' + fmtPrice(data.lastRound.ema200) : ''} />
              <Stat label="ATR" value={data.lastRound ? fmtPrice(data.lastRound.atr14) : '—'} sub="volatilidad 1h" />
              <Stat label="P/L paper" value={money(data.stats?.totalPnlUsd || 0)} tone={(data.stats?.totalPnlUsd || 0) >= 0 ? 'up' : 'down'} sub={(data.stats?.winRate ?? 0) + '% win'} />
            </div>
            {position ? (
              <div className="card-tight">
                <div className="row between wrap">
                  <Badge tone="brand">{position.side} ABIERTO</Badge>
                  <span className="tiny mono">entrada {fmtPrice(position.entry)} · stop {fmtPrice(position.stop)} · objetivo {fmtPrice(position.target)}</span>
                </div>
                <p className="tiny muted">Unidades {position.units} · riesgo {money(position.riskUsd)} · P/L {money(position.pnlUsd || 0)}</p>
              </div>
            ) : <p className="tiny muted">{data.cycle?.note || 'Sin posición.'}</p>}
            <div className="chip-row" style={{ marginBottom: 6 }}>
              {[['pepe', 'PEPE'], ['near', 'NEAR'], ['inj', 'INJ']].map(([key, label]) => (
                <button key={key} type="button" className="chip" aria-pressed={book === key} onClick={() => { setBook(key); setDraft(null); }}>{label}</button>
              ))}
            </div>
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

      <Card title={'Precio en vivo · ' + (data?.settings?.symbol || '')} icon="line-chart" actions={<Badge tone="up">EN VIVO</Badge>}>
        {chart.data ? <LiveChart bars={chart.data.bars} ema50={chart.data.ema50} ema200={chart.data.ema200} position={chart.data.position} price={chart.data.price} symbol={chart.data.symbol} /> : <p className="tiny muted">Cargando gráfico…</p>}
      </Card>

      <Card title="Configuración turbo" icon="settings" subtitle="Solo paper: long y short, stop 1 ATR, objetivo 3R">
        <div className="grid-3">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="field"><span>{label}</span>
              <input className="input" type="number" step="0.1" value={config[key] ?? ''} onChange={(event) => setDraft({ ...config, [key]: Number(event.target.value) })} />
            </label>
          ))}
          <label className="field"><span>Símbolo</span>
            <select className="select" value={config.symbol || 'SOLUSDT'} onChange={(event) => setDraft({ ...config, symbol: event.target.value })}>
              <option value="SOLUSDT">SOL/USDT</option>
              <option value="SOLUSD">SOL/USD</option>
              <option value="SOLUSDC">SOL/USDC</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}><button className="btn primary sm" onClick={save}><Icon name="check" size={13} />Guardar</button></div>
      </Card>

      <Card title="Últimas operaciones paper" icon="bar-chart">
        {(data?.history || []).length === 0 ? <EmptyState icon="bar-chart" title="Sin trades todavía">El módulo opera solo cuando la tendencia y el RSI acompañan.</EmptyState> : (
          <div className="stack xs">
            {data.history.slice().reverse().map((trade) => (
              <div key={trade.openedAt} className="row between wrap" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                <span className="tiny mono">{trade.side} {money(trade.entry)} → {money(trade.exit)}</span>
                <span className="tiny" style={{ color: trade.realizedUsd >= 0 ? 'var(--up)' : 'var(--down)' }}>{money(trade.realizedUsd)} · {trade.closeReason}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Registro crypto" icon="terminal">
        {(data?.log || []).length === 0 ? <p className="tiny muted">Sin registros.</p> : data.log.slice().reverse().slice(0, 12).map((entry, index) => (
          <p key={(entry.at || '') + index} className="tiny" style={{ margin: '4px 0', color: 'var(--text-2)' }}>
            <Badge tone={entry.type === 'ENTRY' ? 'up' : entry.type === 'EXIT' ? 'brand' : 'neutral'}>{entry.type}</Badge>{' '}
            {entry.note || (entry.side ? entry.side + ' ' + money(entry.price) : '')} {entry.pnlUsd !== undefined ? '· ' + money(entry.pnlUsd) : ''}
          </p>
        ))}
      </Card>
    </div>
  );
}