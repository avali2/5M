import { config } from '../config.js';
import { fetchJson } from './http.js';

const REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    marketNote: { type: 'STRING' },
    reviews: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          candidateId: { type: 'STRING' },
          decision: { type: 'STRING', enum: ['APPROVE', 'WATCH', 'REJECT'] },
          confidence: { type: 'NUMBER' },
          summary: { type: 'STRING' },
          riskFlags: { type: 'ARRAY', items: { type: 'STRING' } },
          entryTrigger: { type: 'STRING' },
          takeProfit: { type: 'STRING' },
          stopLoss: { type: 'STRING' },
          management: { type: 'STRING' }
        },
        required: ['candidateId', 'decision', 'confidence', 'summary', 'riskFlags', 'entryTrigger', 'takeProfit', 'stopLoss', 'management']
      }
    }
  },
  required: ['marketNote', 'reviews']
};

function extractText(payload) {
  return payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
}

function safeJson(text) {
  const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

export class GeminiReviewer {
  constructor(settings = config.gemini) {
    this.settings = settings;
  }

  get configured() {
    return Boolean(this.settings.apiKey);
  }

  async review(candidates, marketContext) {
    if (!this.configured) {
      return { configured: false, ok: false, error: 'GEMINI_API_KEY no está configurada.', marketNote: '', reviews: [] };
    }
    if (!candidates.length) return { configured: true, ok: true, marketNote: 'No hay candidatos suficientes para revisar.', reviews: [] };

    const prompt = [
      'Eres el revisor de riesgo de 5 MILLIONS, un sistema de señales de opciones para ejecución MANUAL en Robinhood.',
      'Tu función es auditar candidatos calculados por código con datos reales de Tradier.',
      'No inventes precios, strikes, probabilidad, eventos, soporte/resistencia ni noticias.',
      'No cambies candidateId, strikes, expiración, crédito, riesgo ni contratos.',
      'Aprueba solamente spreads verticales de crédito con riesgo definido, liquidez razonable, DTE permitido y una tesis coherente con la tendencia.',
      'Si los datos son insuficientes o hay una contradicción, usa WATCH o REJECT. No fuerces una operación.',
      'La probabilidad es una aproximación basada principalmente en delta; no la presentes como garantía.',
      'Devuelve JSON válido exactamente con el esquema solicitado. Las strings deben estar en español.',
      '',
      `CONTEXTO DE MERCADO:\n${JSON.stringify(marketContext)}`,
      '',
      `CANDIDATOS:\n${JSON.stringify(candidates)}`
    ].join('\n');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.settings.model)}:generateContent`;
    const payload = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.settings.apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: 'application/json',
          responseSchema: REVIEW_SCHEMA
        }
      })
    }, 30000);
    const parsed = safeJson(extractText(payload));
    if (!parsed || !Array.isArray(parsed.reviews)) {
      throw new Error('Gemini no devolvió el JSON estructurado esperado.');
    }
    return {
      configured: true,
      ok: true,
      model: this.settings.model,
      marketNote: String(parsed.marketNote || ''),
      reviews: parsed.reviews.map((review) => ({
        candidateId: String(review.candidateId || ''),
        decision: ['APPROVE', 'WATCH', 'REJECT'].includes(review.decision) ? review.decision : 'WATCH',
        confidence: Math.max(0, Math.min(100, Number(review.confidence) || 0)),
        summary: String(review.summary || ''),
        riskFlags: Array.isArray(review.riskFlags) ? review.riskFlags.map(String).slice(0, 6) : [],
        entryTrigger: String(review.entryTrigger || ''),
        takeProfit: String(review.takeProfit || ''),
        stopLoss: String(review.stopLoss || ''),
        management: String(review.management || '')
      }))
    };
  }
}

export function isGeminiConfigured() {
  return Boolean(config.gemini.apiKey);
}
