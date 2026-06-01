export async function getSystemStatus() {
  const status = {
    timestamp: new Date().toISOString(),
    services: {
      gemini: { configured: false, working: false, message: '' },
      tradier: { configured: false, working: false, message: '' },
      polygon: { configured: false, working: false, message: '' },
      alphaVantage: { configured: false, working: false, message: '' },
      postgresql: { configured: false, working: false, message: '' },
      webpush: { configured: false, working: false, message: '' },
      scheduler: { running: false, lastScan: null, message: '' }
    },
    environment: process.env.NODE_ENV || 'development'
  };

  const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    status.services.gemini.configured = true;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Respond with "OK"' }] }] }),
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) status.services.gemini.working = true;
      else status.services.gemini.message = `HTTP ${res.status}`;
    } catch (err) { status.services.gemini.message = err.message; }
  } else { status.services.gemini.message = 'API key missing'; }

  if (process.env.TRADIER_TOKEN || process.env.VITE_TRADIER_TOKEN) {
    status.services.tradier.configured = true;
    try {
      const token = process.env.TRADIER_TOKEN || process.env.VITE_TRADIER_TOKEN;
      const res = await fetch('https://api.tradier.com/v1/markets/quotes?symbols=SPY', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) status.services.tradier.working = true;
      else status.services.tradier.message = `HTTP ${res.status}`;
    } catch (err) { status.services.tradier.message = err.message; }
  } else { status.services.tradier.message = 'TRADIER_TOKEN missing'; }

  if (process.env.POLYGON_API_KEY) {
    status.services.polygon.configured = true;
    try {
      const res = await fetch(`https://api.polygon.io/v1/meta/symbols/SPX/company?apiKey=${process.env.POLYGON_API_KEY}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) status.services.polygon.working = true;
      else status.services.polygon.message = `HTTP ${res.status}`;
    } catch (err) { status.services.polygon.message = err.message; }
  } else { status.services.polygon.message = 'POLYGON_API_KEY missing (optional)'; }

  if (process.env.ALPHA_VANTAGE_API_KEY) {
    status.services.alphaVantage.configured = true;
    try {
      const res = await fetch(`https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=SPY&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) status.services.alphaVantage.working = true;
      else status.services.alphaVantage.message = `HTTP ${res.status}`;
    } catch (err) { status.services.alphaVantage.message = err.message; }
  } else { status.services.alphaVantage.message = 'ALPHA_VANTAGE_API_KEY missing (optional)'; }

  if (process.env.DATABASE_URL) {
    status.services.postgresql.configured = true;
    try {
      const { default: pg } = await import('pg');
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 });
      await pool.query('SELECT 1');
      status.services.postgresql.working = true;
      await pool.end();
    } catch (err) { status.services.postgresql.message = err.message; }
  } else { status.services.postgresql.message = 'DATABASE_URL missing'; }

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    status.services.webpush.configured = true;
    status.services.webpush.working = true;
  } else { status.services.webpush.message = 'VAPID keys missing'; }

  if (typeof globalThis.workerStarted !== 'undefined' && globalThis.workerStarted) {
    status.services.scheduler.running = true;
    status.services.scheduler.lastScan = globalThis.lastScanTime || null;
  } else { status.services.scheduler.message = 'Scheduler not started'; }

  return status;
}