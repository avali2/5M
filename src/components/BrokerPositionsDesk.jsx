import React, { useMemo, useState } from 'react';
import InfoTooltip from './InfoTooltip';
import { loadManualBrokerPositions, pruneSignalGeneratedPositions, saveWatchedPositions } from '../services/tradeStorage.js';

const AUTO_REVIEW_MS = 120000;
const STRATEGIES = [
  'Long Call', 'Long Put', 'Bull Call Debit Spread', 'Bear Put Debit Spread',
  'Bull Put Credit Spread', 'Bear Call Credit Spread', 'Iron Condor', 'Iron Butterfly',
  'Broken Wing Iron Condor', 'Broken Wing Butterfly', 'Calendar Spread', 'Diagonal Spread',
  'PMCC', 'Covered Call', 'Protective Put', 'Cash Secured Put', 'Collar'
];
const EMPTY = { symbol: '', strategy: STRATEGIES[0], expiration: '', quantity: 1, entryMark: '', currentMark: '', strikes: '', targetMark: '', stopMark: '', notes: '' };

function Help({ text }) { return <InfoTooltip explanation={text} position="bottom" />; }
function persist(positions) { return saveWatchedPositions(positions); }
function money(value) { return Number.isFinite(Number(value)) ? `$${Number(value).toFixed(0)}` : 'SIN DATOS'; }
function pct(value) { return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : 'SIN DATOS'; }
function daysToExpiration(expiration) {
  if (!expiration) return null;
  const expiry = new Date(`${expiration}T16:00:00`).getTime();
  if (!Number.isFinite(expiry)) return null;
  return Math.ceil((expiry - Date.now()) / 86400000);
}

function estimatePosition(position) {
  const entry = Number(position.entryMark);
  const mark = Number(position.currentMark);
  const contracts = Math.max(1, Number(position.quantity) || 1);
  const maxRisk = Number(position.maxRiskUsd);
  const isCredit = /credit|condor|butterfly|covered call|cash secured/i.test(String(position.strategy));
  const pnl = Number.isFinite(entry) && Number.isFinite(mark) ? (isCredit ? entry - mark : mark - entry) * contracts * 100 : null;
  const pnlPct = pnl !== null && Number.isFinite(maxRisk) && maxRisk > 0 ? pnl / maxRisk : null;
  const dte = daysToExpiration(position.expiration);
  const health = dte !== null && dte <= 3 ? 'ROJO'
    : pnl !== null && Number.isFinite(maxRisk) && pnl < -Math.abs(maxRisk) * 0.5 ? 'ROJO'
      : pnl !== null && pnl < 0 ? 'AMARILLO'
        : 'VERDE';
  return { pnl, pnlPct, maxRisk, health, dte };
}

function healthStyle(health) {
  if (health === 'ROJO') return 'border-red-200 bg-red-50 text-red-800';
  if (health === 'AMARILLO') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

async function requestPositionReview(position) {
  const response = await fetch('/api/positions/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo analizar la posicion.');
  return data;
}

export function BrokerPositionsDesk() {
  const [positions, setPositions] = useState(() => pruneSignalGeneratedPositions());
  const [form, setForm] = useState(EMPTY);
  const [reviews, setReviews] = useState({});
  const [loadingId, setLoadingId] = useState('');
  const [autoReviewing, setAutoReviewing] = useState(false);
  const [lastAutoReview, setLastAutoReview] = useState('');
  const openCount = useMemo(() => positions.length, [positions]);
  const positionsKey = useMemo(() => positions.map((position) => `${position.id}:${position.updatedAt || position.currentMark || ''}`).join('|'), [positions]);

  React.useEffect(() => {
    function reload() { setPositions(loadManualBrokerPositions()); }
    window.addEventListener('positions-updated', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('positions-updated', reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  async function analyze(position, { silent = false } = {}) {
    if (!silent) setLoadingId(position.id);
    try {
      const data = await requestPositionReview(position);
      setReviews((current) => ({ ...current, [position.id]: data }));
      return data;
    } catch (error) {
      const data = { error: error.message };
      setReviews((current) => ({ ...current, [position.id]: data }));
      return data;
    } finally {
      if (!silent) setLoadingId('');
    }
  }

  async function reviewAll(silent = false) {
    if (!positions.length || autoReviewing) return;
    setAutoReviewing(true);
    try {
      await Promise.all(positions.map((position) => analyze(position, { silent: true })));
      setLastAutoReview(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } finally {
      setAutoReviewing(false);
      if (!silent) setLoadingId('');
    }
  }

  React.useEffect(() => {
    if (!positions.length) return undefined;
    reviewAll(true);
    const interval = window.setInterval(() => reviewAll(true), AUTO_REVIEW_MS);
    return () => window.clearInterval(interval);
  }, [positionsKey]);

  function update(key, value) { setForm({ ...form, [key]: value }); }
  function addPosition(event) {
    event.preventDefault();
    if (!form.symbol.trim()) return;
    const position = {
      ...form,
      id: crypto.randomUUID(),
      source: 'manual',
      status: 'WATCHING',
      symbol: form.symbol.trim().toUpperCase(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setPositions(persist([position, ...positions]));
    setForm(EMPTY);
    window.dispatchEvent(new Event('positions-updated'));
  }
  function removePosition(id) {
    setPositions(persist(positions.filter((position) => position.id !== id)));
    window.dispatchEvent(new Event('positions-updated'));
  }

  return (
    <section className="risk-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Broker manual</p>
          <h2 className="text-xl font-black text-slate-900">Posiciones abiertas reales</h2>
          <p className="text-sm text-slate-700">Aqui solo entra lo que tu agregas manualmente porque ya lo abriste en el broker. Las senales tomadas no aparecen en Riesgo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{openCount} activas</span>
          <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
            Gemini auto {lastAutoReview || 'pendiente'}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3 text-xs text-violet-900">
        Gemini revisa todas las posiciones manuales al abrir Riesgo y cada 2 minutos. Usa precio del subyacente en vivo cuando esta disponible y tus marks manuales para estimar P/L.
      </div>

      <form onSubmit={addPosition} className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <label className="text-xs font-bold text-slate-800">Simbolo <Help text="Ticker del activo, por ejemplo SOFI, SPY o AAPL." /><input className="input mt-1" placeholder="SOFI" value={form.symbol} onChange={(e) => update('symbol', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Estrategia <Help text="Selecciona la estructura exacta. Gemini revisa todas sin ejecutar ordenes." /><select className="input mt-1" value={form.strategy} onChange={(e) => update('strategy', e.target.value)}>{STRATEGIES.map((strategy) => <option key={strategy}>{strategy}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-800">Vencimiento <Help text="Fecha de expiracion de las opciones." /><input className="input mt-1" type="date" value={form.expiration} onChange={(e) => update('expiration', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Contratos <Help text="Cada contrato normalmente representa 100 acciones." /><input className="input mt-1" type="number" min="1" value={form.quantity} onChange={(e) => update('quantity', Number(e.target.value))} /></label>
        <label className="text-xs font-bold text-slate-800">Mark entrada <Help text="Precio neto por spread o contrato cuando entraste." /><input className="input mt-1" inputMode="decimal" placeholder="0.45" value={form.entryMark} onChange={(e) => update('entryMark', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Mark actual <Help text="Mark neto actual visible en tu broker. Se usa para estimar P/L." /><input className="input mt-1" inputMode="decimal" placeholder="0.22" value={form.currentMark} onChange={(e) => update('currentMark', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Strikes <Help text="Ejemplo: Sell 515P / Buy 510P." /><input className="input mt-1" placeholder="Sell 515P / Buy 510P" value={form.strikes} onChange={(e) => update('strikes', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Objetivo / stop <Help text="Plan definido antes de actuar: take profit, stop y roll trigger." /><input className="input mt-1" placeholder="TP 50% / stop 2x credito" value={form.notes} onChange={(e) => update('notes', e.target.value)} /></label>
        <button className="primary-button col-span-2" type="submit">Anadir posicion manual</button>
      </form>

      <button className="secondary-button small-action" type="button" disabled={!positions.length || autoReviewing} onClick={() => reviewAll(false)}>
        {autoReviewing ? 'Revisando...' : 'Revisar todas con Gemini'}
      </button>

      {positions.length ? positions.map((position) => {
        const review = reviews[position.id];
        const estimate = estimatePosition(position);
        return (
          <article className="position-card rounded-2xl border border-slate-200 bg-white p-3 space-y-3 text-slate-900 shadow-sm" key={position.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Manual broker</p>
                <h3 className="mt-1 text-lg font-black">{position.symbol} · {position.strategy}</h3>
                <p className="text-xs text-slate-700">{position.expiration || 'Sin vencimiento'} · {position.strikes || 'Sin strikes'} · {position.notes || 'Sin plan'}</p>
              </div>
              <div className="flex items-start gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${healthStyle(estimate.health)}`}>{estimate.health}</span>
                <button type="button" className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-black text-red-700" onClick={() => removePosition(position.id)}>Quitar</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-6">
              <RiskMetric label="DTE" value={estimate.dte ?? 'N/D'} />
              <RiskMetric label="Entrada / mark" value={`${position.entryMark || 'N/D'} / ${position.currentMark || 'N/D'}`} />
              <RiskMetric label="P/L $" value={estimate.pnl === null ? 'SIN DATOS' : `$${estimate.pnl.toFixed(0)}`} />
              <RiskMetric label="P/L %" value={estimate.pnlPct === null ? 'SIN DATOS' : `${Math.round(estimate.pnlPct * 100)}%`} />
              <RiskMetric label="Max risk" value={money(estimate.maxRisk)} />
              <RiskMetric label="Max profit" value={money(position.maxProfitUsd)} />
              <RiskMetric label="POP" value={pct(position.pop)} />
              <RiskMetric label="Score" value={position.score || 'N/D'} />
            </div>
            <button className="primary-button small-action" disabled={loadingId === position.id} onClick={() => analyze(position)}>
              {loadingId === position.id ? 'Revisando...' : 'Gemini'}
            </button>
            {review?.error && <p className="text-sm text-red-700">{review.error}</p>}
            {review?.advice && (
              <div className="rounded-xl bg-white border border-violet-100 p-3 text-sm space-y-1 shadow-sm">
                <strong>{review.advice.status} · {review.advice.recommendation}</strong>
                <p>{review.advice.explanation}</p>
                <p className={`font-black ${review.pnlEstimate?.pnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>P/L estimado: {review.pnlEstimate ? `$${review.pnlEstimate.pnl}` : 'ingresa ambos marks'}</p>
                <p className="text-xs text-slate-700">Subyacente: {review.underlyingPrice == null ? 'N/D' : `$${review.underlyingPrice}`} · Fuente: {review.advice.source}</p>
                {(review.advice.actions || []).map((action) => <p className="text-xs" key={action}>- {action}</p>)}
              </div>
            )}
          </article>
        );
      }) : (
        <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">No hay posiciones manuales. Agrega aqui solo operaciones que ya abriste en el broker.</p>
      )}
    </section>
  );
}

function RiskMetric({ label, value }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-2"><p className="text-[11px] font-bold text-slate-600">{label}</p><strong className="mt-1 block text-slate-950">{value}</strong></div>;
}
