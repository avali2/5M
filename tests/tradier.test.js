import test from 'node:test';
import assert from 'node:assert/strict';
import { TradierClient } from '../server/lib/tradier.js';

test('Tradier usa el token del cliente y no expone credenciales en la URL', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify({ clock: { state: 'open' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const client = new TradierClient({ token: 'injected-token', baseUrl: 'https://tradier.test/v1' });
    assert.deepEqual(await client.getMarketClock(), { state: 'open' });
    assert.equal(captured.url, 'https://tradier.test/v1/markets/clock');
    assert.equal(captured.options.headers.Authorization, 'Bearer injected-token');
    assert.equal(captured.url.includes('injected-token'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Tradier consulta Time & Sales de 5 minutos con sesión regular', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify({ series: { data: [{ timestamp: 1787326200, open: 100, high: 101, low: 99.5, close: 100.5, volume: 1200 }] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const client = new TradierClient({ token: 'timesales-token', baseUrl: 'https://tradier.test/v1' });
    const bars = await client.getTimeSales('AMD', { interval: '5min', lookbackDays: 3, now: new Date('2026-08-21T15:00:00Z') });
    const url = new URL(captured.url);
    assert.equal(url.pathname, '/v1/markets/timesales');
    assert.equal(url.searchParams.get('symbol'), 'AMD');
    assert.equal(url.searchParams.get('interval'), '5min');
    assert.equal(url.searchParams.get('session_filter'), 'open');
    assert.equal(captured.options.headers.Authorization, 'Bearer timesales-token');
    assert.equal(captured.url.includes('timesales-token'), false);
    assert.equal(bars.length, 1);
    assert.equal(bars[0].close, 100.5);
    assert.ok(bars[0].timestamp);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
