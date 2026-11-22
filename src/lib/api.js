/* 5M · cliente HTTP del frontend */
export const KEY_STORAGE = 'five-millions-access-key';

export function getKey() { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; } }
export function setKey(value) { try { localStorage.setItem(KEY_STORAGE, String(value || '').trim()); } catch { /* almacenamiento no disponible */ } }

function headers(extra = {}) {
  const result = { ...extra };
  const key = getKey();
  if (key) result['X-5M-Key'] = key;
  return result;
}

export class ApiError extends Error {
  constructor(message, status) { super(message); this.name = 'ApiError'; this.status = status; }
}

async function parse(response) {
  const payload = await response.json().catch(() => null);
  if (response.status === 401) {
    try { window.dispatchEvent(new CustomEvent('5m:unauthorized')); } catch { /* sin window */ }
  }
  if (!response.ok || !payload) throw new ApiError(payload?.error || `API no disponible (HTTP ${response.status}).`, response.status);
  return payload;
}

export async function apiGet(path, { timeoutMs = 90000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { headers: headers(), signal: controller.signal, cache: 'no-store' });
    return await parse(response);
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('El servidor tardó demasiado. Probá otra vez en unos segundos.', 408);
    if (error instanceof TypeError) throw new ApiError('Sin conexión con la API de 5M. Revisá internet o el arranque del servidor.', 0);
    throw error;
  } finally { clearTimeout(timer); }
}

export async function apiPost(path, body, { timeoutMs = 90000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
      cache: 'no-store'
    });
    return await parse(response);
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('La operación tardó demasiado.', 408);
    if (error instanceof TypeError) throw new ApiError('Sin conexión con la API de 5M.', 0);
    throw error;
  } finally { clearTimeout(timer); }
}

/** Lee un stream SSE de /api/ai/chat y llama onDelta / onDone. */
export async function streamChat({ messages, context, provider, onDelta, signal }) {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ messages, context, provider }),
    signal
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error || `No se pudo abrir el chat (HTTP ${response.status}).`, response.status);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = null;
  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.split('\n').find((item) => item.startsWith('data: '));
      if (!line) continue;
      let payload = null;
      try { payload = JSON.parse(line.slice(6)); } catch { continue; }
      if (payload.error) throw new ApiError(payload.error, 500);
      if (payload.delta) onDelta?.(payload.delta);
      if (payload.done) done = payload;
    }
  }
  return done;
}