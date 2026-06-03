import React, { useMemo, useState } from 'react';
import InfoTooltip from './InfoTooltip';
import { loadWatchedPositions, saveWatchedPositions } from '../services/tradeStorage.js';

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

function estimatePosition(position) {
  const entry = Number(position.entryMark);
  const mark = Number(position.currentMark);
  const contracts = Math.max(1, Number(position.quantity) || 1);
  const maxRisk = Number(position.maxRiskUsd);
  const isCredit = /credit|condor|butterfly|covered call|cash secured/i.test(String(position.strategy));
  const pnl = Number.isFinite(entry) && Number.isFinite(mark) ? (isCredit ? entry - mark : mark - entry) * contracts * 100 : null;
  const health = pnl !== null && Number.isFinite(maxRisk) && pnl < -Math.abs(maxRisk) * 0.5 ? 'ROJO'
    : pnl !== null && pnl < 0 ? 'AMARILLO'
      : 'VERDE';
  return { pnl, maxRisk, health };
}

export function BrokerPositionsDesk() {
  const [positions, setPositions] = useState(loadWatchedPositions);
  const [form, setForm] = useState(EMPTY);
  const [reviews, setReviews] = useState({});
  const [loadingId, setLoadingId] = useState('');
  const openCount = useMemo(() => positions.length, [positions]);

  React.useEffect(() => {
    function reload() { setPositions(loadWatchedPositions()); }
    window.addEventListener('positions-updated', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('positions-updated', reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

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
  async function analyze(position) {
    setLoadingId(position.id);
    try {
      const response = await fetch('/api/positions/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo analizar la posicion.');
      setReviews((current) => ({ ...current, [position.id]: data }));
    } catch (error) {
      setReviews((current) => ({ ...current, [position.id]: { error: error.message } }));
    } finally {
      setLoadingId('');
    }
  }

  return (
    <section className="risk-card p-4 space-y-3">
      <div>
        <h2 className="text-xl font-black text-slate-900">Posiciones vigiladas / broker adapter</h2>
        <p className="text-sm text-slate-700">Broker no conectado: usando LocalJournalAdapter. Tradier queda preparado para futuro; no hay Robinhood ni Plaid.</p>
      </div>
      <form onSubmit={addPosition} className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-slate-800">Simbolo <Help text="Ticker del activo, por ejemplo SOFI, SPY o AAPL." /><input className="input mt-1" placeholder="SOFI" value={form.symbol} onChange={(e) => update('symbol', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Estrategia <Help text="Selecciona la estructura exacta. Gemini revisa todas sin ejecutar ordenes." /><select className="input mt-1" value={form.strategy} onChange={(e) => update('strategy', e.target.value)}>{STRATEGIES.map((strategy) => <option key={strategy}>{strategy}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-800">Vencimiento <Help text="Fecha de expiracion de las opciones." /><input className="input mt-1" type="date" value={form.expiration} onChange={(e) => update('expiration', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Contratos <Help text="Cada contrato normalmente representa 100 acciones." /><input className="input mt-1" type="number" min="1" value={form.quantity} onChange={(e) => update('quantity', Number(e.target.value))} /></label>
        <label className="text-xs font-bold text-slate-800">Mark entrada <Help text="Precio neto por spread o contrato cuando entraste." /><input className="input mt-1" inputMode="decimal" placeholder="0.45" value={form.entryMark} onChange={(e) => update('entryMark', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Mark actual <Help text="Mark neto actual visible en tu broker. Se usa para estimar P/L." /><input className="input mt-1" inputMode="decimal" placeholder="0.22" value={form.currentMark} onChange={(e) => update('currentMark', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Strikes <Help text="Ejemplo: Sell 515P / Buy 510P." /><input className="input mt-1" placeholder="Sell 515P / Buy 510P" value={form.strikes} onChange={(e) => update('strikes', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Objetivo / stop <Help text="Plan definido antes de actuar: take profit, stop y roll trigger." /><input className="input mt-1" placeholder="TP 50% / stop 2x credito" value={form.notes} onChange={(e) => update('notes', e.target.value)} /></label>
        <button className="primary-button col-span-2" type="submit">Añadir posicion</button>
      </form>
      <p className="text-xs font-bold text-slate-700">{openCount} posicion(es) vigiladas desde Journal, señal tomada o entrada manual.</p>
      {positions.map((position) => {
        const review = reviews[position.id];
        const estimate = estimatePosition(position);
        return (
          <article className="rounded-2xl border border-slate-200 bg-slate-100 p-3 space-y-2 text-slate-900" key={position.id}>
            <div className="flex justify-between gap-2">
              <div>
                <strong>{position.symbol} · {position.strategy}</strong>
                <p className="text-xs text-slate-700">{position.expiration || 'Sin vencimiento'} · {position.strikes || 'Sin strikes'} · {position.notes || 'Sin plan'}</p>
              </div>
              <button type="button" className="text-xs text-red-700 font-bold" onClick={() => removePosition(position.id)}>Quitar</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <RiskMetric label="Salud" value={estimate.health} />
              <RiskMetric label="Entrada / mark" value={`${position.entryMark || 'N/D'} / ${position.currentMark || 'N/D'}`} />
              <RiskMetric label="P/L estimado" value={estimate.pnl === null ? 'SIN DATOS' : `$${estimate.pnl.toFixed(0)}`} />
              <RiskMetric label="Max risk" value={money(estimate.maxRisk)} />
            </div>
            <p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
              Gemini debe revisar: DTE, distancia al short strike, P/L, IV, noticias, earnings, liquidez, delta y si conviene mantener, cerrar, roll defensivo o convertir.
            </p>
            <button className="secondary-button w-full" disabled={loadingId === position.id} onClick={() => analyze(position)}>
              {loadingId === position.id ? 'Revisando...' : 'Gemini: mantener, cerrar, roll o convertir'}
            </button>
            {review?.error && <p className="text-sm text-red-700">{review.error}</p>}
            {review?.advice && (
              <div className="rounded-xl bg-white border border-slate-300 p-3 text-sm space-y-1">
                <strong>{review.advice.status} · {review.advice.recommendation}</strong>
                <p>{review.advice.explanation}</p>
                <p className={`font-black ${review.pnlEstimate?.pnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>P/L estimado: {review.pnlEstimate ? `$${review.pnlEstimate.pnl}` : 'ingresa ambos marks'}</p>
                <p className="text-xs text-slate-700">Subyacente: {review.underlyingPrice == null ? 'N/D' : `$${review.underlyingPrice}`} · Fuente: {review.advice.source}</p>
                {(review.advice.actions || []).map((action) => <p className="text-xs" key={action}>- {action}</p>)}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function RiskMetric({ label, value }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-2"><p className="text-[11px] font-bold text-slate-600">{label}</p><strong className="mt-1 block">{value}</strong></div>;
}
