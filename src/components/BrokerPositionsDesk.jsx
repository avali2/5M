import React, { useMemo, useState } from 'react';

const STORAGE_KEY = 'valido-broker-positions-v1';
const EMPTY = { symbol: '', strategy: 'Credit spread', expiration: '', quantity: 1, entryMark: '', notes: '' };

function loadPositions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function persist(positions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  return positions;
}

export function BrokerPositionsDesk() {
  const [positions, setPositions] = useState(loadPositions);
  const [form, setForm] = useState(EMPTY);
  const [reviews, setReviews] = useState({});
  const [loadingId, setLoadingId] = useState('');
  const openCount = useMemo(() => positions.length, [positions]);

  function addPosition(event) {
    event.preventDefault();
    if (!form.symbol.trim() || !form.strategy.trim()) return;
    const next = [{ ...form, id: crypto.randomUUID(), symbol: form.symbol.trim().toUpperCase(), createdAt: new Date().toISOString() }, ...positions];
    setPositions(persist(next));
    setForm(EMPTY);
  }

  function removePosition(id) {
    setPositions(persist(positions.filter((position) => position.id !== id)));
  }

  async function analyze(position) {
    setLoadingId(position.id);
    try {
      const response = await fetch('/api/positions/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo analizar la posición.');
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
        <h2 className="text-xl font-black text-slate-900">🧭 Posiciones de mi broker</h2>
        <p className="text-sm text-slate-600">Se guardan solo en este dispositivo. Gemini recibe una posición únicamente cuando pulsas Revisar.</p>
      </div>
      <form onSubmit={addPosition} className="grid grid-cols-2 gap-2">
        <input className="input" placeholder="Símbolo" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
        <input className="input" placeholder="Estrategia" value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })} />
        <input className="input" type="date" value={form.expiration} onChange={(e) => setForm({ ...form, expiration: e.target.value })} />
        <input className="input" type="number" min="1" placeholder="Cantidad" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
        <input className="input" placeholder="Mark entrada opcional" value={form.entryMark} onChange={(e) => setForm({ ...form, entryMark: e.target.value })} />
        <input className="input" placeholder="Notas / strikes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button className="primary-button col-span-2" type="submit">＋ Añadir posición</button>
      </form>
      <p className="text-xs font-bold text-slate-500">{openCount} posición(es) registradas en este Android o navegador.</p>
      {positions.map((position) => {
        const review = reviews[position.id];
        return (
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2" key={position.id}>
            <div className="flex justify-between gap-2">
              <div><strong>{position.symbol} · {position.strategy}</strong><p className="text-xs text-slate-500">{position.expiration || 'Sin vencimiento'} · {position.notes || 'Sin notas'}</p></div>
              <button className="text-xs text-red-600 font-bold" onClick={() => removePosition(position.id)}>Quitar</button>
            </div>
            <button className="secondary-button w-full" disabled={loadingId === position.id} onClick={() => analyze(position)}>
              {loadingId === position.id ? 'Revisando…' : '✨ Revisar administración con Gemini'}
            </button>
            {review?.error && <p className="text-sm text-red-700">{review.error}</p>}
            {review?.advice && (
              <div className="rounded-xl bg-white border border-slate-200 p-3 text-sm space-y-1">
                <strong>{review.advice.status} · {review.advice.recommendation}</strong>
                <p>{review.advice.explanation}</p>
                <p className="text-xs text-slate-500">Subyacente verificado: {review.underlyingPrice == null ? 'N/D' : `$${review.underlyingPrice}`} · Fuente: {review.advice.source}</p>
                {(review.advice.actions || []).map((action) => <p className="text-xs" key={action}>• {action}</p>)}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
