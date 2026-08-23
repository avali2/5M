import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server/index.js';
import { saveScan } from '../server/lib/store.js';

test('health endpoint no expone secretos y reporta el nombre correcto', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  const payload = await response.json();
  await new Promise((resolve) => server.close(resolve));
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.app, '5 MILLIONS');
  assert.equal(Object.hasOwn(payload, 'token'), false);
  assert.equal(Object.hasOwn(payload.configured, 'tradier'), true);
});

test('config pública prioriza AMD, MSFT y SPY sin exponer claves', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/config`);
  const payload = await response.json();
  await new Promise((resolve) => server.close(resolve));
  assert.equal(response.status, 200);
  assert.deepEqual(payload.watchlist.priority, ['AMD', 'MSFT', 'SPY']);
  assert.equal(payload.watchlist.core[0], 'AMD');
  assert.equal(Object.hasOwn(payload.integrations, 'tradierMode'), true);
  assert.equal(JSON.stringify(payload).includes('TRADIER_TOKEN'), false);
  assert.equal(JSON.stringify(payload).includes('GEMINI_API_KEY'), false);
});

test('API guarda feedback de una señal y devuelve aprendizaje', async () => {
  const scanId = `scan-api-${Date.now()}`;
  const signalId = `signal-api-${Date.now()}`;
  const instanceId = `${scanId}:${signalId}`;
  await saveScan({
    id: scanId,
    generatedAt: new Date().toISOString(),
    source: 'Tradier',
    summary: { ready: 1 },
    marketRisk: { status: 'CLEAR' },
    signals: [{ id: signalId, instanceId, generatedAt: new Date().toISOString(), symbol: 'SPY', strategy: 'BULL_PUT_CREDIT_SPREAD', profile: { id: 'CORE' }, status: 'READY' }]
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/signals/${signalId}/feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instanceId, action: 'WIN', pnlUsd: 12 })
  });
  const payload = await response.json();
  await new Promise((resolve) => server.close(resolve));
  assert.equal(response.status, 200);
  assert.equal(payload.feedback.action, 'WIN');
  assert.ok(payload.learning.overall.sampleSize >= 1);
});
