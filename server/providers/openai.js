import { createHash } from 'node:crypto';
import { requestJson } from '../lib/http.js';
import { cache } from '../lib/cache.js';

export class OpenAiProvider {
  constructor(settings) {
    this.settings = settings;
    this.name = 'OpenAI';
    this.blockedUntil = 0;
    this.lastFailure = '';
  }

  get configured() {
    return Boolean(this.settings.apiKey && this.settings.model);
  }

  async summarize(scan) {
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
      return await cache.remember(`openai:summary:${digest}`, 1800000, async () => {
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
    } catch (error) {
      if (/HTTP 429/i.test(error.message)) {
        this.blockedUntil = Date.now() + 30 * 60 * 1000;
        this.lastFailure = 'OpenAI: HTTP 429; narrativa pausada 30 minutos mientras el analisis cuantitativo continua';
        throw new Error(this.lastFailure);
      }
      throw error;
    }
  }
}
