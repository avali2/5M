/**
 * 5M · Cliente DeepSeek (API compatible con OpenAI Chat Completions).
 * Sin dependencias. Soporta streaming SSE, timeouts, reintentos y errores claros.
 */
import { config } from '../config.js';

export function isDeepSeekConfigured(settings = config.deepseek) {
  return Boolean(settings?.apiKey);
}

export class DeepSeekError extends Error {
  constructor(message, status = 500, code = 'DEEPSEEK_ERROR') {
    super(message);
    this.name = 'DeepSeekError';
    this.status = status;
    this.code = code;
  }
}

const STATUS_MESSAGES = {
  400: 'DeepSeek rechazó la solicitud (400). Revisá el modelo y el formato.',
  401: 'DEEPSEEK_API_KEY inválida o vencida (401).',
  402: 'Saldo agotado en DeepSeek (402). Cargá crédito o usá Gemini.',
  422: 'Parámetros inválidos para DeepSeek (422).',
  429: 'DeepSeek está limitando pedidos (429). Esperá unos segundos.',
  500: 'DeepSeek tuvo un error interno (500).',
  502: 'DeepSeek no responde (502).',
  503: 'DeepSeek está saturado (503).'
};

export class DeepSeekClient {
  constructor(settings = config.deepseek, { fetchImpl = globalThis.fetch } = {}) {
    this.settings = settings;
    this.fetchImpl = fetchImpl;
  }

  url(path = '/chat/completions') {
    return `${String(this.settings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '')}${path}`;
  }

  headers() {
    if (!this.settings.apiKey) throw new DeepSeekError('Falta DEEPSEEK_API_KEY en el servidor.', 503, 'NO_KEY');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.settings.apiKey}`,
      Accept: 'application/json'
    };
  }

  body({ messages, model, temperature, maxTokens, stream, json }) {
    const body = {
      model: model || this.settings.model || 'deepseek-chat',
      messages,
      temperature: temperature ?? this.settings.temperature ?? 0.4,
      max_tokens: maxTokens ?? this.settings.maxTokens ?? 1600,
      stream: Boolean(stream)
    };
    if (json && !stream) body.response_format = { type: 'json_object' };
    return body;
  }

  async request(path, { messages, model, temperature, maxTokens, stream = false, json = false, signal } = {}) {
    const timeout = this.settings.timeoutMs || 45000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const abort = () => controller.abort();
    signal?.addEventListener?.('abort', abort);
    try {
      const response = await this.fetchImpl(this.url(path), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.body({ messages, model, temperature, maxTokens, stream, json })),
        signal: controller.signal
      });
      return response;
    } catch (error) {
      if (error.name === 'AbortError') throw new DeepSeekError('DeepSeek tardó demasiado. Probá de nuevo.', 504, 'TIMEOUT');
      throw new DeepSeekError(`No se pudo conectar con DeepSeek: ${error.message}`, 503, 'NETWORK');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', abort);
    }
  }

  async chat(options = {}) {
    const started = Date.now();
    const response = await this.request('/chat/completions', { ...options, stream: false });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message ? `${STATUS_MESSAGES[response.status] || 'Error de DeepSeek.'} (${payload.error.message})` : STATUS_MESSAGES[response.status] || `DeepSeek respondió HTTP ${response.status}.`;
      throw new DeepSeekError(message, response.status, 'HTTP');
    }
    const text = payload?.choices?.[0]?.message?.content?.trim() || '';
    if (!text) throw new DeepSeekError('DeepSeek devolvió una respuesta vacía.', 502, 'EMPTY');
    return {
      text,
      model: payload?.model || options.model || this.settings.model,
      usage: payload?.usage || null,
      latencyMs: Date.now() - started,
      raw: payload
    };
  }

  /** Streaming SSE: acumula texto y llama onDelta por fragmento. */
  async stream(options = {}) {
    const started = Date.now();
    const response = await this.request('/chat/completions', { ...options, stream: true });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new DeepSeekError(payload?.error?.message || STATUS_MESSAGES[response.status] || `DeepSeek HTTP ${response.status}.`, response.status, 'HTTP');
    }
    if (!response.body) throw new DeepSeekError('DeepSeek no devolvió stream.', 502, 'NO_STREAM');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let usage = null;
    let model = options.model || this.settings.model;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { continue; }
        model = parsed.model || model;
        usage = parsed.usage || usage;
        const delta = parsed.choices?.[0]?.delta?.content || '';
        if (delta) { text += delta; options.onDelta?.(delta); }
      }
    }
    return { text: text.trim(), model, usage, latencyMs: Date.now() - started };
  }
}
