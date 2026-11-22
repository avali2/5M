import test from 'node:test';
import assert from 'node:assert/strict';
import { aiStatus, analyzeTask, streamChat, GeminiClient, AIError } from '../server/lib/aiAnalyst.js';

const geminiSettings = { apiKey: 'test-key', model: 'gemini-2.5-flash' };

test('sin claves la tarea falla con un mensaje accionable', async () => {
  const status = aiStatus();
  await assert.rejects(analyzeTask({ task: 'signal', payload: {} }), (error) => {
    assert.ok(error instanceof AIError);
    assert.ok(error.status === 503);
    assert.match(error.message, /DEEPSEEK_API_KEY|GEMINI_API_KEY|proveedor/i);
    return true;
  });
  assert.equal(typeof status.deepseek.configured, 'boolean');
  assert.ok(status.tasks.includes('briefing'));
});

test('una tarea desconocida responde 400', async () => {
  await assert.rejects(analyzeTask({ task: 'inventada', payload: {} }), (error) => {
    assert.equal(error.status, 400);
    return true;
  });
});

test('streamChat sin proveedor falla con error claro', async () => {
  await assert.rejects(streamChat({ messages: [{ role: 'user', content: 'hola' }] }), (error) => {
    assert.ok(error instanceof AIError);
    return true;
  });
});

test('cliente Gemini arma el request y extrae el texto', async () => {
  let captured = null;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'análisis gemini' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const client = new GeminiClient(geminiSettings, { fetchImpl });
  const result = await client.ask({ system: 'sos analista', messages: [{ role: 'user', content: 'explicá' }] });
  assert.equal(result.text, 'análisis gemini');
  assert.equal(result.usage.total_tokens, 30);
  assert.match(captured.url, /generateContent/);
  assert.match(captured.url, /gemini-2.5-flash/);
  const body = JSON.parse(captured.options.body);
  assert.equal(body.systemInstruction.parts[0].text, 'sos analista');
  assert.equal(body.contents[0].role, 'user');
});

test('Gemini stream emite deltas y acumula el texto', async () => {
  const sse = [
    'data: {"candidates":[{"content":{"parts":[{"text":"Hola "}]}}]}',
    '',
    'data: {"candidates":[{"content":{"parts":[{"text":"trader"}]}}]}',
    ''
  ].join('\n');
  const fetchImpl = async () => new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const client = new GeminiClient(geminiSettings, { fetchImpl });
  const deltas = [];
  const result = await client.streamAsk({ system: 's', messages: [{ role: 'user', content: 'x' }], onDelta: (delta) => deltas.push(delta) });
  assert.equal(result.text, 'Hola trader');
  assert.deepEqual(deltas, ['Hola ', 'trader']);
});

test('Gemini 429 se propaga con status', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 });
  const client = new GeminiClient(geminiSettings, { fetchImpl });
  await assert.rejects(client.ask({ system: 's', messages: [{ role: 'user', content: 'x' }] }), (error) => {
    assert.ok(error instanceof AIError);
    assert.equal(error.status, 429);
    return true;
  });
});
