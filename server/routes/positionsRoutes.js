import express from 'express';
import { addPosition, closePosition, getOpenPositions, getAllPositions, getPositionById } from '../db/positionsRepository.js';
import { requestGeminiJson } from '../lib/geminiJson.js';

const router = express.Router();

function daysToExpiration(expiration) {
  if (!expiration) return null;
  const expiry = new Date(`${expiration}T16:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - Date.now()) / 86400000);
}

function localAdvice(position, underlyingPrice) {
  const dte = daysToExpiration(position.expiration);
  const urgent = dte !== null && dte <= 3;
  const expired = dte !== null && dte < 0;
  const priceLabel = Number.isFinite(underlyingPrice) ? `$${underlyingPrice.toFixed(2)}` : 'no disponible';

  return {
    status: expired ? 'CRITICO' : urgent ? 'RIESGO' : 'VIGILANCIA',
    recommendation: expired ? 'REVISAR_CIERRE' : urgent ? 'REVISAR_SALIDA' : 'MANTENER_CON_PLAN',
    explanation: expired
      ? 'La fecha informada ya venció. Confirma el estado real de la posición en tu broker.'
      : urgent
        ? `Quedan ${dte} días o menos. El riesgo gamma puede cambiar rápido cerca del vencimiento.`
        : 'Revisa la posición con tu precio real del contrato o spread antes de cambiar el plan.',
    actions: [
      `Confirma en tu broker el mark actual del contrato o spread. VALIDO solo verificó el subyacente en ${priceLabel}.`,
      'Define por escrito el nivel de pérdida máxima y el objetivo de salida.',
      'Verifica liquidez, bid/ask y riesgo de asignación antes de ajustar.',
    ],
    risks: urgent ? ['Vencimiento cercano', 'Movimiento acelerado por gamma', 'Slippage al ajustar'] : ['Precio del contrato no verificado', 'Liquidez y bid/ask pendientes'],
    limitations: ['VALIDO no está conectado a tu cuenta del broker.', 'No se calcula P&L de opciones sin el mark real del contrato o spread.'],
  };
}

async function getUnderlyingPrice(symbol) {
  try {
    const { getQuote } = await import('../engine/tradier-api.js');
    const quote = await getQuote(symbol);
    return Number(quote?.price);
  } catch {
    return null;
  }
}

async function analyzePosition(position) {
  const symbol = String(position?.symbol || '').trim().toUpperCase();
  const strategy = String(position?.strategy || '').trim();
  if (!symbol || !strategy) {
    const error = new Error('Símbolo y estrategia son obligatorios.');
    error.status = 400;
    throw error;
  }

  const normalized = { ...position, symbol, strategy };
  const underlyingPrice = await getUnderlyingPrice(symbol);
  const fallback = localAdvice(normalized, underlyingPrice);
  const prompt = [
    'Eres Gemini Guardian para gestión prudente de posiciones de opciones ya existentes.',
    'No inventes precios, P&L, probabilidades ni datos del broker. No sugieras paper trading.',
    'El precio verificado es solo del subyacente, nunca del contrato o spread.',
    `Posición declarada por el usuario: ${JSON.stringify(normalized)}`,
    `Precio actual verificado del subyacente ${symbol}: ${Number.isFinite(underlyingPrice) ? underlyingPrice : 'no disponible'}`,
    `Días aproximados al vencimiento: ${daysToExpiration(normalized.expiration) ?? 'no disponible'}`,
    'Devuelve SOLO JSON con: status (SEGURA|VIGILANCIA|RIESGO|CRITICO), recommendation, explanation, actions (array), risks (array), limitations (array).',
  ].join('\n');

  try {
    const gemini = await requestGeminiJson(prompt, { temperature: 0.2, maxTokens: 800 });
    return { underlyingPrice, advice: { ...fallback, ...gemini, source: 'gemini' } };
  } catch (error) {
    return { underlyingPrice, advice: { ...fallback, source: 'local_fallback', geminiError: error.message } };
  }
}

router.post('/analyze', async (req, res) => {
  try {
    const result = await analyzePosition(req.body?.position || req.body);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/', (_req, res) => {
  res.json({ ok: true, positions: getOpenPositions(), all: getAllPositions() });
});

router.post('/', (req, res) => {
  try {
    res.json({ ok: true, position: addPosition(req.body) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const position = closePosition(req.params.id, req.body);
    if (!position) return res.status(404).json({ error: 'Posición no encontrada.' });
    return res.json({ ok: true, position });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id/analysis', async (req, res) => {
  try {
    const position = getPositionById(req.params.id);
    if (!position) return res.status(404).json({ error: 'Posición no encontrada.' });
    return res.json({ ok: true, position, ...(await analyzePosition(position)) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
