/**
 * 5M · Analista IA unificado: DeepSeek + Gemini.
 *
 * Recibe lo que el motor ya calculó y lo interpreta en español. No recalcula
 * precios, no promete resultados y cae a texto claro cuando un proveedor falla.
 */
import { config } from '../config.js';
import { DeepSeekClient, DeepSeekError, isDeepSeekConfigured } from './deepseek.js';
import { isGeminiConfigured } from './gemini.js';

const CACHE_TTL_MS = Math.max(1, config.ai.cacheMinutes) * 60000;
const cache = new Map();
const MAX_CONTEXT_CHARS = 9000;

export class AIError extends Error {
  constructor(message, status = 503, code = 'AI_ERROR') {
    super(message); this.name = 'AIError'; this.status = status; this.code = code;
  }
}

export function aiStatus() {
  return {
    gemini: { configured: isGeminiConfigured(), model: config.gemini.model },
    deepseek: { configured: isDeepSeekConfigured(), model: config.deepseek.model },
    preferred: config.ai.preferred,
    tasks: ['signal', 'spread', 'positioning', 'briefing', 'risk', 'chat', 'bot', 'journal']
  };
}

function resolveProvider(requested) {
  const preferred = String(requested || config.ai.preferred || 'auto').toLowerCase();
  const deepseek = isDeepSeekConfigured();
  const gemini = isGeminiConfigured();
  if (preferred === 'deepseek') return deepseek ? 'deepseek' : gemini ? 'gemini' : null;
  if (preferred === 'gemini') return gemini ? 'gemini' : deepseek ? 'deepseek' : null;
  return deepseek ? 'deepseek' : gemini ? 'gemini' : null;
}

function otherProvider(provider) {
  if (provider === 'deepseek') return isGeminiConfigured() ? 'gemini' : null;
  if (provider === 'gemini') return isDeepSeekConfigured() ? 'deepseek' : null;
  return null;
}

/* ------------------------------- Gemini REST ------------------------------ */
export class GeminiClient {
  constructor(settings = config.gemini, { fetchImpl = globalThis.fetch } = {}) {
    this.settings = settings;
    this.fetchImpl = fetchImpl;
  }

  url(stream = false) {
    const action = stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.settings.model}:${action}key=${this.settings.apiKey}`;
  }

  body({ system, messages, json = false, temperature = config.ai.temperature, maxTokens = config.ai.maxTokens }) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
      generationConfig: { temperature, maxOutputTokens: maxTokens }
    };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    return body;
  }

  async ask({ system, messages, json = false, signal }) {
    const started = Date.now();
    const response = await this.fetchImpl(this.url(false), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.body({ system, messages, json })),
      signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new AIError(payload?.error?.message ? `Gemini: ${payload.error.message}` : `Gemini HTTP ${response.status}.`, response.status, 'GEMINI_HTTP');
    const text = (payload?.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
    if (!text) throw new AIError('Gemini devolvió una respuesta vacía.', 502, 'GEMINI_EMPTY');
    const usage = payload?.usageMetadata ? { prompt_tokens: payload.usageMetadata.promptTokenCount, completion_tokens: payload.usageMetadata.candidatesTokenCount, total_tokens: payload.usageMetadata.totalTokenCount } : null;
    return { text, model: this.settings.model, usage, latencyMs: Date.now() - started };
  }

  async streamAsk({ system, messages, onDelta, signal }) {
    const response = await this.fetchImpl(this.url(true), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.body({ system, messages })),
      signal
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new AIError(payload?.error?.message || `Gemini HTTP ${response.status}.`, response.status, 'GEMINI_HTTP');
    }
    if (!response.body) throw new AIError('Gemini no devolvió stream.', 502, 'GEMINI_NO_STREAM');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
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
        const delta = (parsed?.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
        if (delta) { text += delta; onDelta?.(delta); }
      }
    }
    return { text: text.trim(), model: this.settings.model, usage: null };
  }
}

const deepseekClient = new DeepSeekClient();
const geminiClient = new GeminiClient();

/* ------------------------------- Guardrails ------------------------------- */
const GUARDRAILS = `
Sos el analista de 5 MILLIONS, una mesa de opciones sobre acciones y ETFs de EE.UU.
Reglas duras:
- Escribí en español neutro, claro y breve (máximo 220 palabras salvo que pidan más).
- Solo usás los datos del contexto. Si falta un dato, decilo explícitamente; nunca inventes precios, Greeks, volumen ni eventos.
- No prometas ganancias ni des probabilidades "reales": podés citar las del modelo aclarando que es un modelo.
- Siempre recordá el riesgo: opciones compradas pueden perder el 100% de la prima; los spreads de crédito tienen riesgo de asignación.
- No des asesoramiento financiero personalizado; hablá de escenarios y planes condicionales.
- Priorizá: dirección, nivel de invalidación, tamaño, y qué haría cambiar de opinión.
- Formato: viñetas cortas con números concretos. Sin markdown de tablas.
`;

function compact(payload) {
  try {
    const text = JSON.stringify(payload ?? {});
    return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS)}…(truncado)` : text;
  } catch { return '{}'; }
}

const TASKS = {
  signal: {
    system: `${GUARDRAILS}\nTarea: explicar una señal de compra de CALL o PUT que YA calculó el motor. No cambies precios ni strikes. Devolvé exactamente estas secciones con viñetas: TESIS, ENTRADA, RIESGO/INVALIDACIÓN, GESTIÓN, QUÉ ME HARÍA DUDAR. Máximo 180 palabras.`,
    prompt: (payload) => `Señal NiTo calculada por el motor:\n${compact(payload)}\nExplicá la señal con el formato pedido.`
  },
  spread: {
    system: `${GUARDRAILS}\nTarea: explicar un spread agresivo ya construido. Devolvé: POR QUÉ ES AGRESIVO, ESCENARIO FAVORABLE, ESCENARIO ADVERSO, AJUSTES POSIBLES, CHECKLIST ANTES DE ENTRAR. Máximo 180 palabras.`,
    prompt: (payload) => `Spread calculado por el motor:\n${compact(payload)}\nExplicá la idea.`
  },
  positioning: {
    system: `${GUARDRAILS}\nTarea: interpretar el posicionamiento (GEX, muros, max pain, IV). Devolvé: LECTURA (2-3 viñetas), NIVELES CLAVE, QUÉ VIGILAR, LÍMITES DEL ANÁLISIS. Máximo 170 palabras. Aclarás que es inferencia y no identifica instituciones.`,
    prompt: (payload) => `Posicionamiento inferido:\n${compact(payload)}\nInterpretalo.`
  },
  briefing: {
    system: `${GUARDRAILS}\nTarea: briefing operativo del día. Devolvé un párrafo inicial de 1 frase y luego 3-5 viñetas con: estado del mercado, mejor oportunidad, riesgo principal del día, evento a vigilar. Máximo 150 palabras.`,
    prompt: (payload) => `Contexto del día:\n${compact(payload)}\nEscribí el briefing.`
  },
  bot: {
    system: `${GUARDRAILS}\nTarea: sos el supervisor de riesgo de un bot automático de spreads de crédito. Revisás un plan YA calculado por el motor y respondés SOLO un objeto JSON válido, sin texto extra: {"decision":"APPROVE"|"REJECT"|"WAIT","confidence":0-100,"reasons":["..."],"risks":["..."],"adjustments":["..."]}.

La estrategia aprobada es esta (si el plan la cumple, aprobalo):
- Vende put spread en tendencia alcista (precio > EMA50 > EMA200) o call spread en tendencia bajista (precio < EMA50 < EMA200).
- Delta del strike vendido entre 0.15 y 0.22; vencimiento 30-45 días.
- Crédito/ancho MAYOR O IGUAL A 14% es aceptable (la estrategia ya filtró lo mínimo).
- Riesgo por operación ≤ 500 USD (o el presupuesto indicado).
- Salidas: 50% del crédito, stop 2,5x, cierre por tiempo a 21 días.

Criterios:
- APPROVE si la tendencia está alineada, el crédito/ancho cumple el mínimo, el riesgo entra en el presupuesto y no hay señales visibles en contra en el contexto.
- REJECT solo por problemas concretos y visibles: tendencia contraria, crédito/ancho por debajo de 14%, riesgo excedido, o datos contradictorios.
- WAIT si los datos son inconsistentes o falta lo imprescindible (por ejemplo, el spot).
- No exijas datos que el payload no trae (calendario macro, historial de IV, noticias): trabajá con lo que hay y mencionalo como riesgo, no como motivo de rechazo.
- La confianza refleja cuánto se cumple la regla, no tu optimismo.`,
    prompt: (payload) => `Plan del bot y contexto de mercado:\n${compact(payload)}\nDevolvé solo el JSON de revisión.`
  },
  journal: {
    system: `${GUARDRAILS}\nTarea: resumen diario del bot para el trader. Devolvé 4 viñetas cortas: estado del bot, operaciones del día, riesgo abierto y una recomendación concreta. Máximo 120 palabras.`,
    prompt: (payload) => `Estado y journal del bot:\n${compact(payload)}\nEscribí el resumen diario.`
  },
  risk: {
    system: `${GUARDRAILS}\nTarea: auditoría de riesgo de una señal o spread. Devolvé: RIESGOS (3-5 viñetas ordenadas por gravedad), CHECKS PREVIOS (lista), QUÉ CANCELARÍA LA OPERACIÓN. Sé directo y escéptico. Máximo 170 palabras.`,
    prompt: (payload) => `Operación a auditar:\n${compact(payload)}\nAuditala.`
  }
};

function cacheKey(task, provider, payload) {
  const raw = JSON.stringify({ task, provider, payload }).slice(0, 4000);
  let hash = 5381;
  for (let index = 0; index < raw.length; index += 1) hash = ((hash << 5) + hash) ^ raw.charCodeAt(index);
  return `${task}:${provider}:${(hash >>> 0).toString(36)}`;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.value;
}
function writeCache(key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 120) cache.delete(cache.keys().next().value);
}

async function callProvider({ provider, system, messages, json = false, signal }) {
  if (provider === 'deepseek') {
    const result = await deepseekClient.chat({ messages: [{ role: 'system', content: system }, ...messages], json });
    return { ...result, provider: 'deepseek' };
  }
  const result = await geminiClient.ask({ system, messages, json, signal });
  return { ...result, provider: 'gemini' };
}

export async function analyzeTask({ task = 'signal', provider, payload = {}, question = '' } = {}) {
  const definition = TASKS[task];
  if (!definition) throw new AIError(`Tarea de IA desconocida: ${task}`, 400, 'TASK');
  const chosen = resolveProvider(provider);
  if (!chosen) throw new AIError('No hay proveedor de IA configurado. Agregá DEEPSEEK_API_KEY o GEMINI_API_KEY.', 503, 'NO_PROVIDER');
  const messages = [{ role: 'user', content: definition.prompt(payload, question) }];
  const key = cacheKey(task, chosen, payload);
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  const attempts = [chosen, otherProvider(chosen)].filter(Boolean);
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const result = await callProvider({ provider: attempt, system: definition.system, messages, json: task === 'bot' });
      const output = {
        provider: result.provider,
        model: result.model,
        text: result.text,
        structured: safeStructured(result.text),
        latencyMs: result.latencyMs,
        usage: result.usage ?? null,
        fallbackUsed: attempt !== chosen
      };
      writeCache(key, output);
      return output;
    } catch (error) {
      lastError = error;
      if (error.status === 401 || error.status === 402) break;
    }
  }
  throw new AIError(lastError?.message || 'La IA no respondió.', lastError?.status || 503, 'AI_FAIL');
}

function safeStructured(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

export async function streamChat({ messages = [], provider, context = {}, onDelta } = {}) {
  const chosen = resolveProvider(provider);
  if (!chosen) throw new AIError('No hay proveedor de IA configurado. Agregá DEEPSEEK_API_KEY o GEMINI_API_KEY.', 503, 'NO_PROVIDER');
  const system = `${GUARDRAILS}\nContexto del símbolo y datos actuales (usalo solo si es relevante):\n${compact(context)}`;
  const normalized = messages
    .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-10)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 4000) }));
  if (!normalized.length) throw new AIError('Mensaje vacío.', 400, 'EMPTY');
  const attempts = [chosen, otherProvider(chosen)].filter(Boolean);
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const result = attempt === 'deepseek'
        ? await deepseekClient.stream({ messages: [{ role: 'system', content: system }, ...normalized], onDelta })
        : await geminiClient.streamAsk({ system, messages: normalized, onDelta });
      return { provider: attempt, model: result.model, usage: result.usage ?? null, text: result.text };
    } catch (error) {
      lastError = error;
      if (error instanceof DeepSeekError && error.status === 401) break;
    }
  }
  throw new AIError(lastError?.message || 'La IA no respondió.', lastError?.status || 503, 'AI_FAIL');
}