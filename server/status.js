export async function getSystemStatus() {
  const services = [];
  const warnings = [];

  // Gemini check
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  let geminiOk = false;
  let geminiMessage = '';
  if (geminiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Respond with "OK"' }] }] }),
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        geminiOk = true;
        geminiMessage = 'operational';
      } else {
        geminiMessage = `HTTP ${res.status}`;
      }
    } catch (err) { geminiMessage = err.message; }
  } else {
    geminiMessage = 'API key missing';
  }
  services.push({ name: 'gemini', ok: geminiOk, message: geminiMessage, required: false });
  if (!geminiOk) warnings.push(`Gemini: ${geminiMessage}`);

  // Tradier check
  const tradierToken = process.env.TRADIER_TOKEN;
  let tradierOk = false;
  let tradierMessage = '';
  if (tradierToken) {
    try {
      const res = await fetch('https://api.tradier.com/v1/markets/quotes?symbols=SPY', {
        headers: { Authorization: `Bearer ${tradierToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        tradierOk = true;
        tradierMessage = 'operational';
      } else {
        tradierMessage = `HTTP ${res.status}`;
      }
    } catch (err) { tradierMessage = err.message; }
  } else {
    tradierMessage = 'TRADIER_TOKEN missing';
  }
  services.push({ name: 'tradier', ok: tradierOk, message: tradierMessage, required: true });
  if (!tradierOk) warnings.push(`Tradier: ${tradierMessage}`);

  // Polygon check
  let polygonOk = false;
  let polygonMessage = '';
  if (process.env.POLYGON_API_KEY) {
    try {
      const res = await fetch(`https://api.polygon.io/v1/meta/symbols/SPX/company?apiKey=${process.env.POLYGON_API_KEY}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        polygonOk = true;
        polygonMessage = 'operational';
      } else {
        polygonMessage = `HTTP ${res.status}`;
      }
    } catch (err) { polygonMessage = err.message; }
  } else {
    polygonMessage = 'POLYGON_API_KEY missing (optional)';
  }
  services.push({ name: 'polygon', ok: polygonOk, message: polygonMessage, required: false });
  if (!polygonOk && process.env.POLYGON_API_KEY) warnings.push(`Polygon: ${polygonMessage}`);

  // Alpha Vantage check
  let avOk = false;
  let avMessage = '';
  if (process.env.ALPHA_VANTAGE_API_KEY) {
    try {
      const res = await fetch(`https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=SPY&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        avOk = true;
        avMessage = 'operational';
      } else {
        avMessage = `HTTP ${res.status}`;
      }
    } catch (err) { avMessage = err.message; }
  } else {
    avMessage = 'ALPHA_VANTAGE_API_KEY missing (optional)';
  }
  services.push({ name: 'alphaVantage', ok: avOk, message: avMessage, required: false });

  // PostgreSQL check
  let pgOk = false;
  let pgMessage = '';
  if (process.env.DATABASE_URL) {
    try {
      const { default: pg } = await import('pg');
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 });
      await pool.query('SELECT 1');
      pgOk = true;
      pgMessage = 'operational';
      await pool.end();
    } catch (err) { pgMessage = err.message; }
  } else {
    pgMessage = 'DATABASE_URL missing';
  }
  services.push({ name: 'postgresql', ok: pgOk, message: pgMessage, required: false });
  if (!pgOk && process.env.DATABASE_URL) warnings.push(`PostgreSQL: ${pgMessage}`);

  // WebPush check
  const webPushOk = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  services.push({
    name: 'webpush',
    ok: webPushOk,
    message: webPushOk ? 'operational' : 'VAPID keys missing',
    required: false
  });

  // Scheduler check
  const schedulerRunning = typeof globalThis.workerStarted !== 'undefined' && globalThis.workerStarted;
  services.push({
    name: 'scheduler',
    ok: schedulerRunning,
    message: schedulerRunning ? 'operational' : 'Scheduler not started',
    required: false
  });

  const ok = services.filter(s => s.required).every(s => s.ok);

  return {
    ok,
    services,
    warnings,
    timestamp: new Date().toISOString()
  };
}