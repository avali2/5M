import express from 'express';
import { runInstitutionalScan } from './institutional-engine.mjs';

const router = express.Router();

async function callGemini(prompt) {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    })
  });
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

router.get('/daily-summary', async (_req, res) => {
  try {
    const scan = await runInstitutionalScan({ symbols: ['SPY', 'QQQ', 'VIX'] });
    const spyTech = scan.results.find(r => r.symbol === 'SPY')?.technicals;
    const vix = scan.results.find(r => r.symbol === 'VIX')?.quote?.price;

    const prompt = `
      Eres Gemini Guardian, asistente de trading de opciones. Genera un resumen muy corto (máx 150 palabras) del mercado actual:
      - Tendencia SPY: ${spyTech?.trend}
      - RSI: ${spyTech?.rsi14}
      - VWAP sesgo: ${spyTech?.vwapBias}
      - VIX: ${vix}
      Además, da un consejo práctico para operar con opciones hoy (máx 100 palabras), enfocado en gestión de riesgo y estrategia.
      Devuelve JSON: { "marketOverview": "...", "tip": "..." }
    `;

    const result = await callGemini(prompt);
    let parsed;
    try { parsed = JSON.parse(result); }
    catch {
      const parts = result.split(/consejo|tip|recomendación/i);
      parsed = { marketOverview: parts[0].trim(), tip: parts[1]?.trim() || 'Revisa las señales credit spreads.' };
    }
    res.json(parsed);
  } catch (error) {
    console.error('Gemini summary error:', error);
    res.status(500).json({ marketOverview: 'No se pudo obtener resumen', tip: 'Revisa tu conexión y API key.' });
  }
});

export default router;