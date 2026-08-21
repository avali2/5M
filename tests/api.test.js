import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server/index.js';

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
