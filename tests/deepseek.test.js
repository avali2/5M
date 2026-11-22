import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekClient, DeepSeekError, isDeepSeekConfigured } from '../server/lib/deepseek.js';

const settings = { apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', temperature: 0.2, maxTokens: 200, timeoutMs: 2000 };

function okResponse(payload) { return { ok: true, status: 200, json: async () => payload }; }

test('envía el modelo, el header de auth y devuelve texto', async () => {
  let captured = null;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return okResponse({ choices: [{ message: { content: 'respuesta del modelo' } }], model: 'deepseek-chat', usage: { total_tokens: 12 } });
  };
  const client = new DeepSeekClient(settings, { fetchImpl });
  const result = await client.chat({ messages: [{ role: 'user', content: 'hola' }] });
  assert.equal(result.text, 'respuesta del modelo');
  assert.equal(result.usage.total_tokens, 12);
  assert.ok(captured.url.endsWith('/chat/completions'));
  assert.equal(captured.options.headers.Authorization, 'Bearer sk-test');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.model, 'deepseek-chat');
  assert.equal(body.stream, false);
});

test('401 produce un error claro con status', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Authentication Fails' } }) });
  const client = new DeepSeekClient(settings, { fetchImpl });
  await assert.rejects(client.chat({ messages: [{ role: 'user', content: 'x' }] }), (error) => {
    assert.ok(error instanceof DeepSeekError);
    assert.equal(error.status, 401);
    assert.match(error.message, /DEEPSEEK_API_KEY|401/);
    return true;
  });
});

test('sin API key falla antes de llamar a la red', async () => {
  let called = false;
  const client = new DeepSeekClient({ ...settings, apiKey: '' }, { fetchImpl: async () => { called = true; } });
  await assert.rejects(client.chat({ messages: [] }), /DEEPSEEK_API_KEY/);
  assert.equal(called, false);
  assert.equal(isDeepSeekConfigured({ apiKey: '' }), false);
});

test('parsea el stream SSE y emite deltas', async () => {
  const sse = [
    'data: {"model":"deepseek-chat","choices":[{"delta":{"content":"Hola "}}]}',
    '',
    'data: {"model":"deepseek-chat","choices":[{"delta":{"content":"mundo"}}]}',
    '',
    'data: [DONE]',
    ''
  ].join('\n');
  const fetchImpl = async () => new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const client = new DeepSeekClient(settings, { fetchImpl });
  const deltas = [];
  const result = await client.stream({ messages: [{ role: 'user', content: 'hola' }], onDelta: (delta) => deltas.push(delta) });
  assert.equal(result.text, 'Hola mundo');
  assert.deepEqual(deltas, ['Hola ', 'mundo']);
  assert.equal(result.model, 'deepseek-chat');
});

test('un timeout se reporta como error de red', async () => {
  const fetchImpl = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
  const client = new DeepSeekClient({ ...settings, timeoutMs: 10 }, { fetchImpl });
  await assert.rejects(client.chat({ messages: [] }), (error) => {
    assert.ok(error instanceof DeepSeekError);
    assert.equal(error.code, 'TIMEOUT');
    return true;
  });
});
