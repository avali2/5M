import express from 'express';
import { runInstitutionalScan } from './institutional-engine.mjs';

const router = express.Router();

async function callGemini(prompt) {
  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
      })
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
    throw new Error(`Gemini API error ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

router.get('/daily-summary', async (_req, res) => {
  try {
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({
        marketOverview: 'Gemini Guardian no está configurado. Agrega VITE_GEMINI_API_KEY en las variables de entorno de Render.',
        tip: 'Sin Gemini, las señales se basan solo en el motor cuantitativo. Revisa los credit spreads manualmente.',
        source: 'local_fallback'
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
      // Continue with unknown values — Gemini can still give a general tip
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

    try {
      const result = await callGemini(prompt);
      let parsed;
      try { parsed = JSON.parse(result); }
      catch {
        const parts = result.split(/consejo|tip|recomendación/i);
        parsed = {
          marketOverview: parts[0]?.trim() || `Mercado con tendencia ${spyTrend}.`,
          tip: parts[1]?.trim() || 'Prioriza credit spreads con riesgo definido y gestión estricta.'
        };
      }
      res.json({ ...parsed, source: 'gemini' });
    } catch (geminiErr) {
      console.error('Gemini call failed:', geminiErr.message);
      res.json({
        marketOverview: `El motor cuantitativo detecta tendencia ${spyTrend} con VIX en ${vix}.`,
        tip: 'Sin auditoría Gemini. Revisa manualmente las señales credit spread y confirma liquidez antes de operar.',
        source: 'local_fallback'
      });
    }
  } catch (error) {
    console.error('Gemini daily-summary fatal error:', error.message);
    res.json({
      marketOverview: 'No se pudo obtener resumen hoy. El sistema está en modo degradado.',
      tip: 'Revisa tu conexión y verifica que las APIs estén configuradas correctamente.',
      source: 'error'
    });
  }
});

export default router;