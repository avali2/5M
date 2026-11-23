/**
 * 5M · Cliente Binance.US (solo lectura por ahora; firma HMAC lista para órdenes).
 * Nunca loguear ni devolver claves. Ejecución real requiere confirmación explícita.
 */
import crypto from 'node:crypto';

const BASE = 'https://api.binance.us';

export function binanceConfigured(env = process.env) {
  return Boolean(env.BINANCE_US_API_KEY && env.BINANCE_US_API_SECRET);
}

export function signQuery(query, secret) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

export async function binanceSigned(pathname, params = {}, env = process.env) {
  if (!binanceConfigured(env)) throw new Error('Faltan BINANCE_US_API_KEY y BINANCE_US_API_SECRET.');
  const query = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: '5000' }).toString();
  const signature = signQuery(query, env.BINANCE_US_API_SECRET);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(BASE + pathname + '?' + query + '&signature=' + signature, {
      headers: { 'X-MBX-APIKEY': env.BINANCE_US_API_KEY },
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* respuesta no JSON */ }
    if (!response.ok) throw new Error('Binance.US ' + response.status + ': ' + ((json && (json.msg || json.error)) || text.slice(0, 120)));
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function binanceAccount(env = process.env) {
  if (!binanceConfigured(env)) return { ok: false, configured: false, error: 'Claves no configuradas en Render.' };
  try {
    const account = await binanceSigned('/api/v3/account', {}, env);
    const balances = (account.balances || [])
      .map((item) => ({ asset: item.asset, free: Number(item.free), locked: Number(item.locked) }))
      .filter((item) => item.free + item.locked > 0)
      .slice(0, 12);
    return {
      ok: true, configured: true, accountType: account.accountType || null,
      canTrade: Boolean(account.canTrade), canWithdraw: Boolean(account.canWithdraw),
      canDeposit: Boolean(account.canDeposit), balances
    };
  } catch (error) {
    return { ok: false, configured: true, error: error.message };
  }
}
