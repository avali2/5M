import { createHash } from 'node:crypto';
import { requestJson } from '../lib/http.js';
import { cache } from '../lib/cache.js';

export class OpenAiProvider {
  constructor(settings) {
    this.settings = settings;
    this.name = 'OpenAI';
    this.blockedUntil = 0;
    this.lastFailure = '';
    this.lastUsedAt = null;
    this.callsToday = 0;
    this.callsDate = null;
  }

  get configured() {
    return Boolean(this.settings.apiKey && this.settings.model);
  }

  status() {
    const today = new Date().toISOString().slice(0, 10);
    return {
      configured: this.configured,
      enabled: Boolean(this.settings.enabled),
      model: this.configured ? this.settings.model : null,
      automaticCalls: false,
      manualOnly: true,
      cooldownUntil: this.blockedUntil > Date.now() ? new Date(this.blockedUntil).toISOString() : null,
      lastUsedAt: this.lastUsedAt,
      callsToday: this.callsDate === today ? this.callsToday : 0,
      dailyLimit: this.settings.dailyLimit,
      lastError: this.lastFailure || null,
      costEstimate: 'No disponible: consulta el panel de facturacion del proveedor.'
    };
  }

  async summarize(scan) {
    if (!this.settings.enabled) throw new Error('Asistente IA desactivado. Activalo en el entorno solo si deseas solicitar una explicacion.');
    if (!this.configured) throw new Error('Asistente IA no configurado: faltan OPENAI_API_KEY u OPENAI_MODEL.');
    const today = new Date().toISOString().slice(0, 10);
    if (this.callsDate !== today) {
      this.callsDate = today;
      this.callsToday = 0;
    }
    if (this.callsToday >= this.settings.dailyLimit) {
      throw new Error('Limite diario de explicaciones IA alcanzado.');
    }
    if (this.blockedUntil > Date.now()) throw new Error(this.lastFailure);
    const safePayload = {
      asOf: scan.asOf,
      decision: scan.decision,
      regime: scan.market?.regime,
      volatility: scan.market?.volatility,
      events: scan.macro?.highImpactEvents?.slice(0, 5),
      setups: scan.opportunities?.slice(0, 5).map((setup) => ({
        symbol: setup.symbol,
        strategy: setup.strategy,
        score: setup.score,
        pop: setup.pop,
        risk: setup.maxRisk,
        blocks: setup.blocks
      }))
    };
    const digest = createHash('sha256').update(JSON.stringify(safePayload)).digest('hex').slice(0, 16);
    try {
      const summary = await cache.remember(`openai:summary:${digest}`, 1800000, async () => {
      this.callsToday += 1;
      this.lastUsedAt = new Date().toISOString();
      const data = await requestJson(this.name, 'https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.settings.model,
        input: [
          {
            role: 'system',
            content: [{
              type: 'input_text',
              text: 'Eres analista de riesgo de opciones. Resume en espanol simple y prudente. No recomiendes ejecutar; menciona bloqueos, fuentes faltantes y riesgo maximo. Maximo 120 palabras.'
            }]
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: JSON.stringify(safePayload) }]
          }
        ]
      })
      });
      return data.output_text || data.output?.flatMap((item) => item.content || []).map((content) => content.text).filter(Boolean).join(' ') || null;
      });
      this.lastFailure = '';
      return summary;
    } catch (error) {
      if (/HTTP 429/i.test(error.message)) {
        this.blockedUntil = Date.now() + 30 * 60 * 1000;
        this.lastFailure = 'OpenAI rate limit: explicacion manual pausada 30 minutos mientras el analisis cuantitativo continua';
        throw new Error(this.lastFailure);
      }
      this.lastFailure = error.message;
      throw error;
    }
  }
}
