import { useEffect, useState } from 'react';
import { apiGet } from './lib/api.js';
import { useApi } from './lib/hooks.js';

const fmt = (value) => { if (!Number.isFinite(Number(value))) return '—'; const abs = Math.abs(Number(value)); return abs >= 100 ? Number(value).toFixed(2) : abs >= 1 ? Number(value).toFixed(2) : Number(value).toFixed(4); };

export default function WatchlistStrip() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((value) => value + 1), 30000); return () => clearInterval(id); }, []);
  const api = useApi(() => apiGet('/api/watchlist'), [tick]);
  const quotes = api.data?.quotes || [];
  if (quotes.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row between">
        <p className="eyebrow">Precios en vivo · se actualiza cada 30s</p>
        <span className="tiny muted">{api.data?.updatedAt ? new Date(api.data.updatedAt).toLocaleTimeString('es-US', { timeZone: 'America/New_York' }) + ' ET' : ''}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginTop: 4, scrollbarWidth: 'none' }}>
        {quotes.map((quote) => (
          <div key={quote.symbol} style={{ minWidth: 92, border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px', background: 'var(--surface)' }}>
            <p className="tiny" style={{ fontWeight: 700 }}>{quote.symbol}</p>
            <p className="mono" style={{ fontSize: 13, marginTop: 2 }}>{fmt(quote.price)}</p>
            <p className="tiny" style={{ color: (quote.changePct || 0) >= 0 ? 'var(--up)' : 'var(--down)', marginTop: 2 }}>{(quote.changePct || 0) >= 0 ? '+' : ''}{(quote.changePct || 0).toFixed(2)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}