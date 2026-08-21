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
