import { createHash } from 'node:crypto';
import { requestJson } from '../lib/http.js';
import { cache } from '../lib/cache.js';

export class GeminiProvider {
  constructor(settings = {}) {
    this.settings = settings;
    this.name = 'Gemini';
    this.lastUsedAt = null;
    this.lastError = '';
  }

  get configured() {
    return Boolean(this.settings.apiKey && this.settings.model);
  }

  get enabled() {
    return Boolean(this.settings.enabled);
  }

  status() {
    return {
      configured: this.configured,
      enabled: this.enabled,
      model: this.configured ? this.settings.model : null,
      automaticCalls: false,
      manualOnly: true,
      lastUsedAt: this.lastUsedAt,
      lastError: this.lastError || null
    };
  }

  async explain({ payload, prompt, maxOutputTokens = 650 }) {
    if (!this.enabled) throw new Error('Gemini desactivado por configuracion.');
    if (!this.configured) throw new Error('Gemini no configurado: falta GEMINI_API_KEY.');

    const safePayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const digest = createHash('sha256').update(`${prompt}:${safePayload}`).digest('hex').slice(0, 16);
    try {
      const result = await cache.remember(`gemini:explain:${digest}`, 30 * 60 * 1000, async () => {
        const model = encodeURIComponent(this.settings.model);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(this.settings.apiKey)}`;
        const data = await requestJson(this.name, url, {
          method: 'POST',
          timeoutMs: 15000,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${prompt}\n\nDATOS AUDITADOS:\n${safePayload}` }]
              }
            ],
            generationConfig: {
              temperature: 0.25,
              maxOutputTokens
            }
          })
        });
        const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n') || '';
        return {
          text: text || 'Gemini no devolvio texto util.',
          usage: {
            inputTokens: data.usageMetadata?.promptTokenCount || 0,
            outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: data.usageMetadata?.totalTokenCount || 0
          }
        };
      });
      this.lastUsedAt = new Date().toISOString();
      this.lastError = '';
      return result;
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }
}
