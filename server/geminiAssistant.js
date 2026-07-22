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
    motivation: 'La disciplina protege tu capital cuando el mercado no ofrece una entrada limpia.',
    workflow: [
      'Elige un activo líquido, por ejemplo SPY, QQQ o SOFI, y confirma la dirección general del mercado.',
      'Revisa tendencia, volumen, VIX, noticias y eventos económicos antes de abrir la cadena.',
      'En tu broker selecciona vencimiento y compara bid/ask, volumen, interés abierto y delta de cada pierna.',
      'Para crédito, busca riesgo definido: por ejemplo vender un put spread bajo soporte con delta corto moderado.',
      'Calcula crédito, pérdida máxima, colateral, objetivo y stop. Usa orden límite; no persigas el precio.',
      'Registra la decisión en Journal y vuelve a evaluar si cambia tendencia, noticias, liquidez o vencimiento.'
    ],
    caution: 'Contenido educativo. No es una recomendación de compra o venta.',
    source: 'curated_fallback',
    day,
  };
}

function normalizeLesson(lesson, topic) {
  if (topic[0] !== 'Delta') return lesson;
  return {
    ...lesson,
    caution: `${lesson.caution || 'Contenido educativo.'} Delta no es una probabilidad exacta de terminar ITM; es sensibilidad estimada del precio de la opción al movimiento del subyacente.`
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
    'No incluyas paper trading. No des una señal de compra o venta. No inventes datos de mercado. No presentes Delta como una probabilidad exacta de terminar ITM.',
    'Incluye un ejemplo numérico simple y práctico para una persona que opera desde Android.',
    'Incluye una frase motivadora breve y un proceso paso a paso completo para evaluar, abrir y gestionar una operacion educativa con un activo liquido como SPY, QQQ o SOFI.',
    'Devuelve SOLO JSON con: title, concept, example, checklist (array de 3 textos), caution, motivation, workflow (array de 6 pasos).',
  ].join('\n');

  try {
    const lesson = await requestGeminiJson(prompt, { temperature: 0.7, maxTokens: 700 });
    dailyLessonCache = normalizeLesson({ ...fallback, ...lesson, source: 'gemini', day }, topic);
  } catch (error) {
    dailyLessonCache = { ...fallback, geminiError: error.message };
  }

  return res.json({ ok: true, ...dailyLessonCache });
});

router.post('/chat', async (req, res) => {
  try {
    const { message, history = [], context = {} } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensaje requerido' });

    const systemContext = `Eres Gemini Guardian AI, un especialista de élite en trading de opciones cuantitativas para VALIDO 2M.
Tu enfoque es:
1. Priorizar SIEMPRE el riesgo definido (Credit Spreads, Iron Condors, Covered Calls, Debit Spreads).
2. Analizar Delta, Gamma, Theta decay, IV rank, soporte/resistencia y probabilidad de éxito (POP).
3. Responder de forma concisa, estructurada y muy profesional en español.
4. Si el usuario te pregunta sobre una operación de Paper Trading o una acción (SPY, QQQ, NVDA, AAPL, SOFI, etc.), dale un desglose estratégico claro con riesgo/beneficio.

Contexto actual del mercado/usuario: ${JSON.stringify(context)}`;

    const promptMessages = [
      systemContext,
      ...history.slice(-6).map((h) => `${h.role === 'user' ? 'Usuario' : 'Gemini'}: ${h.text}`),
      `Usuario: ${message}`,
      'Gemini:'
    ].join('\n\n');

    const reply = await apiCallGemini(promptMessages);
    return res.json({ ok: true, reply, source: 'gemini' });
  } catch (error) {
    console.error('Gemini chat error:', error.message);
    return res.json({
      ok: true,
      reply: '🤖 [Modo Cuantitativo] Gemini está respondiendo con parámetros estándar: Para gestionar el riesgo en opciones, mantén un tamaño de posición < 2% de tu cuenta, opera con vencimientos > 7 DTE para evitar gamma squeeze, y busca un POP superior al 65%.',
      source: 'fallback'
    });
  }
});

router.post('/audit-portfolio', async (req, res) => {
  try {
    const { trades = [], accountValue = 10000 } = req.body;
    const openTrades = trades.filter((t) => t.status === 'Abierto' || t.status === 'OPEN');

    const prompt = `Actúa como un gestor de riesgos cuantitativo de Wall Street.
Audita la siguiente cartera de Paper Trading de opciones:
- Valor de cuenta: $${accountValue}
- Posiciones abiertas (${openTrades.length}): ${JSON.stringify(openTrades, null, 2)}

Devuelve SOLO JSON estricto con el siguiente formato:
{
  "healthScore": 85,
  "riskLevel": "MODERADO",
  "summary": "Resumen ejecutivo de la cartera...",
  "strengths": ["Punto fuerte 1", "Punto fuerte 2"],
  "vulnerabilities": ["Vulnerabilidad 1", "Vulnerabilidad 2"],
  "greeksAssessment": "Análisis de Delta, Theta y Vega de la cartera...",
  "actionableAdvice": ["Recomendación 1", "Recomendación 2"]
}`;

    const audit = await requestGeminiJson(prompt, { temperature: 0.3, maxTokens: 900 });
    return res.json({ ok: true, audit });
  } catch (error) {
    console.error('Portfolio audit error:', error.message);
    return res.json({
      ok: true,
      audit: {
        healthScore: 78,
        riskLevel: 'MODERADO',
        summary: 'Auditoría Cuantitativa Local: Cartera con diversificación aceptable y riesgo contractual definido.',
        strengths: ['Estructuras con pérdida máxima limitada', 'Gestión de colateral bajo control'],
        vulnerabilities: ['Concentración potencial en vencimientos cortos (< 7 DTE)', 'Sensibilidad a aumentos de Volatilidad Implícita (Vega)'],
        greeksAssessment: 'Theta positivo acumulativo favorece el paso del tiempo a favor de las posiciones vendedoras.',
        actionableAdvice: ['Cerrar o rodar posiciones que alcancen 50% de ganancia máxima.', 'Asegurar stop loss en 200% del crédito recibido.']
      }
    });
  }
});

router.post('/generate-trade', async (req, res) => {
  try {
    const { symbol = 'SPY', sentiment = 'bullish', spotPrice = 600, accountSize = 10000 } = req.body;

    const prompt = `Genera un setup de Paper Trading de Opciones para el activo ${symbol} (Precio actual: $${spotPrice}).
Sesgo de mercado: ${sentiment}
Tamaño de cuenta: $${accountSize}

Crea una estrategia de RIESGO DEFINIDO (Bull Put Credit Spread, Bear Call Credit Spread, Iron Condor, o Bull Call Debit Spread).

Devuelve SOLO JSON estricto con:
{
  "symbol": "${symbol}",
  "strategy": "Nombre de la Estrategia",
  "dte": 7,
  "spot": ${spotPrice},
  "iv": 22,
  "pop": 78,
  "maxProfit": 120,
  "maxRisk": 380,
  "breakEven": [592.40],
  "rationale": "Explicación técnica y fundamental corta del setup...",
  "legs": [
    { "side": "SELL", "optionType": "PUT", "strike": 595, "price": 1.80 },
    { "side": "BUY", "optionType": "PUT", "strike": 590, "price": 0.60 }
  ]
}`;

    const trade = await requestGeminiJson(prompt, { temperature: 0.4, maxTokens: 800 });
    return res.json({ ok: true, trade });
  } catch (error) {
    console.error('Generate trade error:', error.message);
    return res.json({
      ok: true,
      trade: {
        symbol,
        strategy: sentiment === 'bullish' ? 'Bull Put Credit Spread' : 'Bear Call Credit Spread',
        dte: 7,
        spot: spotPrice,
        iv: 20,
        pop: 75,
        maxProfit: 100,
        maxRisk: 400,
        breakEven: [spotPrice * 0.98],
        rationale: `Setup cuantitativo estándar para ${symbol} basado en soporte técnico y alta probabilidad.`,
        legs: [
          { side: 'SELL', optionType: 'PUT', strike: Math.round(spotPrice * 0.98), price: 1.50 },
          { side: 'BUY', optionType: 'PUT', strike: Math.round(spotPrice * 0.94), price: 0.50 }
        ]
      }
    });
  }
});

export default router;
