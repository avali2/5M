import express from 'express';
import { runInstitutionalScan } from './institutional-engine.mjs';
import { callGemini as apiCallGemini, getGeminiStatus, getCachedResponse } from './geminiClient.js';
import { requestGeminiJson } from './lib/geminiJson.js';

const router = express.Router();
let dailyLessonCache = null;

const lessonTopics = [
  ['Delta', 'Cómo cambia el valor de una opción cuando se mueve el subyacente.'],
  ['Theta', 'Cómo el paso del tiempo afecta una posición de opciones.'],
  ['Riesgo definido', 'Cómo dimensionar spreads sin exceder la pérdida máxima aceptable.'],
  ['Liquidez', 'Por qué bid/ask, volumen e interés abierto importan antes de entrar o ajustar.'],
  ['Asignación', 'Cuándo una opción corta puede ser asignada y qué revisar antes del vencimiento.'],
  ['Volatilidad implícita', 'Cómo interpretar IV sin asumir que predice la dirección del mercado.'],
];

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function topicForDay(day) {
  const value = [...day].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return lessonTopics[value % lessonTopics.length];
}

function lessonFallback(day, topic) {
  return {
    title: `${topic[0]}: idea clave del día`,
    concept: topic[1],
    example: 'Antes de actuar, identifica el riesgo máximo, el vencimiento y el bid/ask real de cada pierna en tu broker.',
    checklist: ['Define el riesgo máximo.', 'Confirma liquidez y bid/ask.', 'Escribe tu condición de salida.'],
    caution: 'Contenido educativo. No es una recomendación de compra o venta.',
    source: 'curated_fallback',
    day,
  };
}

router.get('/daily-summary', async (_req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return res.json({
        ok: true,
        degraded: false,
        source: 'local_fallback',
        geminiStatus: 'not_configured',
        marketOverview: 'Gemini Guardian no está configurado. Agrega GEMINI_API_KEY en las variables de entorno de Render.',
        tip: 'Sin Gemini, las señales se basan solo en el motor cuantitativo. Revisa los credit spreads manualmente.'
      });
    }

    // Try to scan, but don't fail the endpoint if Tradier is down
    let spyTrend = 'unknown';
    let spyRsi = null;
    let vwapBias = 'unknown';
    let vix = 'N/A';

    try {
      const scan = await runInstitutionalScan({ symbols: ['SPY', 'VIX'] });
      const spyResult = scan?.results?.find(r => r.symbol === 'SPY');
      const vixResult = scan?.results?.find(r => r.symbol === 'VIX');
      spyTrend = spyResult?.technicals?.trend || 'unknown';
      spyRsi = spyResult?.technicals?.rsi14;
      vwapBias = spyResult?.technicals?.vwapBias || 'unknown';
      vix = vixResult?.quote?.price || 'N/A';
    } catch (scanErr) {
      console.error('Scan error in daily-summary:', scanErr.message);
    }

    const prompt = [
      'Eres Gemini Guardian, asistente de VALIDO 1M.',
      'Genera un resumen MUY corto (máx 100 palabras) del mercado actual basado en estos datos:',
      `- Tendencia SPY: ${spyTrend}`,
      `- RSI: ${spyRsi || 'N/A'}`,
      `- VWAP sesgo: ${vwapBias}`,
      `- VIX: ${vix}`,
      'Además, da un consejo práctico para operar con opciones hoy (máx 80 palabras).',
      'Devuelve SOLO JSON: { "marketOverview": "...", "tip": "..." }'
    ].join('\n');

    const status = getGeminiStatus();
    let ok = true;
    let degraded = false;
    let geminiStatus = status.lastStatus || 'ok';
    let source = 'gemini';
    let resultData;

    // Try cache first if in cooldown
    const cached = getCachedResponse();
    if (status.inCooldown && cached) {
      source = 'gemini_cached';
      degraded = true;
      geminiStatus = 'rate_limited';
      try {
        const parsed = JSON.parse(cached);
        resultData = { ...parsed, source, ok, degraded, geminiStatus };
        return res.json(resultData);
      } catch { /* Ignore malformed cached Gemini payloads. */ }
    }

    // Try fresh API call
    try {
      const result = await apiCallGemini(prompt);
      let parsed;
      try { parsed = JSON.parse(result); }
      catch {
        const parts = result.split(/consejo|tip|recomendación/i);
        parsed = {
          marketOverview: parts[0]?.trim() || `Mercado con tendencia ${spyTrend}.`,
          tip: parts[1]?.trim() || 'Prioriza credit spreads con riesgo definido y gestión estricta.'
        };
      }
      resultData = { ...parsed, source: 'gemini', ok, degraded, geminiStatus };
      return res.json(resultData);
    } catch (geminiErr) {
      console.error('Gemini call failed:', geminiErr.message);

      // Try cache
      const cachedNow = getCachedResponse();
      if (cachedNow) {
        try {
          const parsed = JSON.parse(cachedNow);
          return res.json({ ...parsed, source: 'gemini_cached', ok: true, degraded: true, geminiStatus: 'rate_limited' });
        } catch { /* Ignore malformed cached Gemini payloads. */ }
      }

      // Final fallback
      return res.json({
        ok: true,
        degraded: true,
        source: 'local_fallback',
        geminiStatus: geminiErr.message.includes('429') ? 'rate_limited' : 'error',
        message: 'Gemini en pausa por cuota. Usando datos locales/cache.',
        marketOverview: `El motor cuantitativo detecta tendencia ${spyTrend} con VIX en ${vix}.`,
        tip: 'Sin auditoría Gemini. Revisa manualmente las señales credit spread y confirma liquidez antes de operar.'
      });
    }
  } catch (error) {
    console.error('Gemini daily-summary fatal error:', error.message);
    res.json({
      ok: true,
      degraded: true,
      source: 'error',
      geminiStatus: 'error',
      message: 'Gemini en pausa por cuota. Usando datos locales/cache.',
      marketOverview: 'No se pudo obtener resumen hoy. El sistema está en modo degradado.',
      tip: 'Revisa tu conexión y verifica que las APIs estén configuradas correctamente.'
    });
  }
});

router.get('/quota-status', (_req, res) => {
  const status = getGeminiStatus();
  res.json({
    ok: true,
    ...status
  });
});

router.get('/daily-lesson', async (_req, res) => {
  const day = utcDay();
  if (dailyLessonCache?.day === day) return res.json({ ok: true, ...dailyLessonCache });

  const topic = topicForDay(day);
  const fallback = lessonFallback(day, topic);
  const prompt = [
    'Eres un educador de opciones claro y prudente para la app VALIDO 1M.',
    `Crea la microlección diaria sobre: ${topic[0]}.`,
    topic[1],
    'No incluyas paper trading. No des una señal de compra o venta. No inventes datos de mercado.',
    'Incluye un ejemplo numérico simple y práctico para una persona que opera desde Android.',
    'Devuelve SOLO JSON con: title, concept, example, checklist (array de 3 textos), caution.',
  ].join('\n');

  try {
    const lesson = await requestGeminiJson(prompt, { temperature: 0.7, maxTokens: 700 });
    dailyLessonCache = { ...fallback, ...lesson, source: 'gemini', day };
  } catch (error) {
    dailyLessonCache = { ...fallback, geminiError: error.message };
  }

  return res.json({ ok: true, ...dailyLessonCache });
});

export default router;
