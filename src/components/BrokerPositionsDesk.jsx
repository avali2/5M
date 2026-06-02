import React, { useMemo, useState } from 'react';
import InfoTooltip from './InfoTooltip';

const STORAGE_KEY = 'valido-broker-positions-v2';
const STRATEGIES = [
  'Bull Put Credit Spread', 'Bear Call Credit Spread', 'Iron Condor', 'Iron Butterfly',
  'Bull Call Debit Spread', 'Bear Put Debit Spread', 'Calendar Spread', 'Diagonal Spread',
  'Covered Call', 'Cash Secured Put', 'PMCC', 'Collar', 'Protective Put',
  'Long Call', 'Long Put', 'Butterfly', 'Broken Wing Butterfly'
];
const EMPTY = { symbol: '', strategy: STRATEGIES[0], expiration: '', quantity: 1, entryMark: '', currentMark: '', strikes: '', targetMark: '', stopMark: '', notes: '' };

function loadPositions() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function persist(positions) { localStorage.setItem(STORAGE_KEY, JSON.stringify(positions)); return positions; }
function Help({ text }) { return <InfoTooltip explanation={text} position="bottom" />; }

export function BrokerPositionsDesk() {
  const [positions, setPositions] = useState(loadPositions);
  const [form, setForm] = useState(EMPTY);
  const [reviews, setReviews] = useState({});
  const [loadingId, setLoadingId] = useState('');
  const openCount = useMemo(() => positions.length, [positions]);
  function update(key, value) { setForm({ ...form, [key]: value }); }
  function addPosition(event) {
    event.preventDefault();
    if (!form.symbol.trim()) return;
    setPositions(persist([{ ...form, id: crypto.randomUUID(), symbol: form.symbol.trim().toUpperCase(), createdAt: new Date().toISOString() }, ...positions]));
    setForm(EMPTY);
  }
  function removePosition(id) { setPositions(persist(positions.filter((position) => position.id !== id))); }
  async function analyze(position) {
    setLoadingId(position.id);
    try {
      const response = await fetch('/api/positions/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo analizar la posición.');
      setReviews((current) => ({ ...current, [position.id]: data }));
    } catch (error) { setReviews((current) => ({ ...current, [position.id]: { error: error.message } })); }
    finally { setLoadingId(''); }
  }
  return (
    <section className="risk-card p-4 space-y-3">
      <div><h2 className="text-xl font-black text-slate-900">🧭 Posiciones de mi broker</h2><p className="text-sm text-slate-700">Se guardan en este dispositivo. Gemini recibe una posición solo cuando pulsas Revisar.</p></div>
      <form onSubmit={addPosition} className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-slate-800">Símbolo <Help text="Ticker del activo, por ejemplo SOFI, SPY o AAPL." /><input className="input mt-1" placeholder="SOFI" value={form.symbol} onChange={(e) => update('symbol', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Estrategia <Help text="Selecciona la estructura exacta. Las de crédito reciben énfasis, pero Gemini revisa todas." /><select className="input mt-1" value={form.strategy} onChange={(e) => update('strategy', e.target.value)}>{STRATEGIES.map((strategy) => <option key={strategy}>{strategy}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-800">Vencimiento <Help text="Fecha de expiración de las opciones." /><input className="input mt-1" type="date" value={form.expiration} onChange={(e) => update('expiration', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Contratos <Help text="Cada contrato normalmente representa 100 acciones." /><input className="input mt-1" type="number" min="1" value={form.quantity} onChange={(e) => update('quantity', Number(e.target.value))} /></label>
        <label className="text-xs font-bold text-slate-800">Mark entrada <Help text="Precio neto por spread o contrato cuando entraste." /><input className="input mt-1" inputMode="decimal" placeholder="0.45" value={form.entryMark} onChange={(e) => update('entryMark', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Mark actual <Help text="Mark neto actual visible en tu broker. Se usa para estimar P&L." /><input className="input mt-1" inputMode="decimal" placeholder="0.22" value={form.currentMark} onChange={(e) => update('currentMark', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Strikes <Help text="Ejemplo: vender 18P / comprar 17P." /><input className="input mt-1" placeholder="18P / 17P" value={form.strikes} onChange={(e) => update('strikes', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-800">Objetivo / stop <Help text="Marks objetivo y stop definidos antes de actuar." /><input className="input mt-1" placeholder="TP 0.20 / stop 0.90" value={form.notes} onChange={(e) => update('notes', e.target.value)} /></label>
        <button className="primary-button col-span-2" type="submit">＋ Añadir posición</button>
      </form>
      <p className="text-xs font-bold text-slate-700">{openCount} posición(es) registradas en este Android o navegador.</p>
      {positions.map((position) => {
        const review = reviews[position.id];
        return <article className="rounded-2xl border border-slate-200 bg-slate-100 p-3 space-y-2 text-slate-900" key={position.id}>
          <div className="flex justify-between gap-2"><div><strong>{position.symbol} · {position.strategy}</strong><p className="text-xs text-slate-700">{position.expiration || 'Sin vencimiento'} · {position.strikes || 'Sin strikes'} · {position.notes || 'Sin plan'}</p></div><button className="text-xs text-red-700 font-bold" onClick={() => removePosition(position.id)}>Quitar</button></div>
          <button className="secondary-button w-full" disabled={loadingId === position.id} onClick={() => analyze(position)}>{loadingId === position.id ? 'Revisando…' : '✨ Revisar: mantener, cerrar o ajustar'}</button>
          {review?.error && <p className="text-sm text-red-700">{review.error}</p>}
          {review?.advice && <div className="rounded-xl bg-white border border-slate-300 p-3 text-sm space-y-1">
            <strong>{review.advice.status} · {review.advice.recommendation}</strong>
            <p>{review.advice.explanation}</p>
            <p className={`font-black ${review.pnlEstimate?.pnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>P&L estimado: {review.pnlEstimate ? `$${review.pnlEstimate.pnl}` : 'ingresa ambos marks'}</p>
            <p className="text-xs text-slate-700">Subyacente: {review.underlyingPrice == null ? 'N/D' : `$${review.underlyingPrice}`} · Fuente: {review.advice.source}</p>
            {(review.advice.actions || []).map((action) => <p className="text-xs" key={action}>• {action}</p>)}
          </div>}
        </article>;
      })}
    </section>
  );
}
