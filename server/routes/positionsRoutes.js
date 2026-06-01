import express from 'express';
import { addPosition, closePosition, getOpenPositions, getAllPositions, getPositionById } from '../db/positionsRepository.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const positions = getOpenPositions();
    const all = getAllPositions();
    res.json({ ok: true, positions, all });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const position = addPosition(req.body);
    res.json({ ok: true, position });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const position = closePosition(req.params.id, req.body);
    if (!position) return res.status(404).json({ error: 'Posición no encontrada.' });
    res.json({ ok: true, position });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/analysis', async (req, res) => {
  try {
    const position = getPositionById(req.params.id);
    if (!position) return res.status(404).json({ error: 'Posición no encontrada.' });

    const { getQuote } = await import('../engine/tradier-api.js');
    const quote = await getQuote(position.symbol);
    const currentPrice = quote.price;
    const priceChange = position.entry_price ? (currentPrice - position.entry_price) / position.entry_price : 0;
    const currentValue = (position.entry_price || 0) * (1 + priceChange);
    const pnl = ((position.entry_price || 0) - currentValue) * 100;

    const apiKey = process.env.VITE_GEMINI_API_KEY;
    let advice = { status: 'SEGURA', recommendation: 'MANTENER', explanation: 'Gemini no configurado.' };

    if (apiKey) {
      try {
        const prompt = `Eres Gemini Guardian. Tengo posición: ${position.symbol} ${position.strategy}. Precio entrada: $${position.entry_price}. Actual: $${currentPrice}. P&L: $${pnl.toFixed(2)}. Vencimiento: ${position.expiration}. Responde JSON: {"status":"SEGURA|VIGILANCIA|RIESGO|CRITICO","recommendation":"MANTENER|AJUSTAR|CERRAR|HEDGE","explanation":"...","suggestedStopLoss":null}`;
        const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } })
        });
        const data = await gRes.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) try { advice = JSON.parse(text); } catch {}
      } catch {}
    }

    res.json({ ok: true, position, currentPrice, pnl: round(pnl, 2), currentValue: round(currentValue, 2), advice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function round(n, d = 2) { return Number.isFinite(n) ? Math.round(n * Math.pow(10, d)) / Math.pow(10, d) : null; }

export default router;