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

function positionPnl(position) {
  const entryMark = Number(position.entryMark);
  const currentMark = Number(position.currentMark);
  const contracts = Math.max(1, Number(position.quantity) || 1);
  if (!Number.isFinite(entryMark) || !Number.isFinite(currentMark)) return null;
  const isCredit = /credit|condor|butterfly|covered call|cash secured/i.test(String(position.strategy));
  const pnl = (isCredit ? entryMark - currentMark : currentMark - entryMark) * contracts * 100;
  return {
    entryMark, currentMark, contracts,
    pnl: Math.round(pnl * 100) / 100,
    direction: isCredit ? 'credit' : 'debit',
    note: 'Estimacion basada en marks declarados manualmente. Confirma el valor ejecutable en tu broker.'
  };
}

function localAdvice(position, underlyingPrice, pnlEstimate) {
  const dte = daysToExpiration(position.expiration);
  const urgent = dte !== null && dte <= 3;
  const expired = dte !== null && dte < 0;
  const priceLabel = Number.isFinite(underlyingPrice) ? `$${underlyingPrice.toFixed(2)}` : 'no disponible';
  return {
    status: expired ? 'CRITICO' : urgent ? 'RIESGO' : 'VIGILANCIA',
    recommendation: expired ? 'REVISAR_CIERRE' : urgent ? 'EVALUAR_CIERRE_O_AJUSTE' : 'MANTENER_CON_PLAN',
    explanation: expired
      ? 'La fecha informada ya vencio. Confirma el estado real de la posicion en tu broker.'
      : urgent ? `Quedan ${dte} dias o menos. El riesgo gamma puede cambiar rapido cerca del vencimiento.`
        : 'Revisa la posicion con tu precio real del contrato o spread antes de cambiar el plan.',
    actions: [
      `Confirma en tu broker el mark actual del contrato o spread. VALIDO solo verifico el subyacente en ${priceLabel}.`,
      pnlEstimate ? `P&L estimado con tus marks: $${pnlEstimate.pnl}. Usa una orden limite y confirma el fill antes de cerrar o ajustar.` : 'Ingresa mark de entrada y mark actual para estimar ganancia o perdida antes de decidir.',
      'Define por escrito el nivel de perdida maxima y el objetivo de salida.',
      'Verifica liquidez, bid/ask y riesgo de asignacion antes de ajustar.'
    ],
    risks: urgent ? ['Vencimiento cercano', 'Movimiento acelerado por gamma', 'Slippage al ajustar'] : ['Precio del contrato no verificado', 'Liquidez y bid/ask pendientes'],
    limitations: ['VALIDO no esta conectado a tu cuenta del broker.', 'El P&L solo se estima cuando declaras el mark real de entrada y el mark actual.']
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
    const error = new Error('Simbolo y estrategia son obligatorios.');
    error.status = 400;
    throw error;
  }
  const normalized = { ...position, symbol, strategy };
  const underlyingPrice = await getUnderlyingPrice(symbol);
  const pnlEstimate = positionPnl(normalized);
  const fallback = localAdvice(normalized, underlyingPrice, pnlEstimate);
  const prompt = [
    'Eres Gemini Guardian para gestion prudente de posiciones de opciones ya existentes.',
    'No inventes precios, P&L, probabilidades ni datos del broker. No sugieras paper trading.',
    'El precio verificado es solo del subyacente, nunca del contrato o spread.',
    `Posicion declarada por el usuario: ${JSON.stringify(normalized)}`,
    `Precio actual verificado del subyacente ${symbol}: ${Number.isFinite(underlyingPrice) ? underlyingPrice : 'no disponible'}`,
    `Dias aproximados al vencimiento: ${daysToExpiration(normalized.expiration) ?? 'no disponible'}`,
    `P&L estimado desde marks manuales: ${pnlEstimate ? JSON.stringify(pnlEstimate) : 'no disponible'}`,
    'Decide entre MANTENER, CERRAR_CON_LIMIT, TOMAR_GANANCIA, CORTAR_PERDIDA, ROLL_DEFENSIVO, CONVERTIR_ESTRUCTURA, REDUCIR_TAMANO o REVISAR_DATOS.',
    'Si recomiendas roll o conversion, especifica posicion actual, problema, nueva estrategia, nueva expiracion, nuevos strikes, delta short objetivo, credito/debito objetivo, max risk nuevo, max profit nuevo, condiciones para considerarlo y que NO hacer.',
    'Si faltan cadena, griegas, mark real, noticias o liquidez, di REVISAR_DATOS y no inventes.',
    'Devuelve SOLO JSON con: status (SEGURA|VIGILANCIA|RIESGO|CRITICO), recommendation, explanation, actions (array), risks (array), limitations (array), rollPlan (object opcional), convertPlan (object opcional).'
  ].join('\n');
  try {
    const gemini = await requestGeminiJson(prompt, { temperature: 0.2, maxTokens: 900 });
    return { underlyingPrice, pnlEstimate, advice: { ...fallback, ...gemini, source: 'gemini' } };
  } catch (error) {
    return { underlyingPrice, pnlEstimate, advice: { ...fallback, source: 'local_fallback', geminiError: error.message } };
  }
}

router.post('/analyze', async (req, res) => {
  try { res.json({ ok: true, ...(await analyzePosition(req.body?.position || req.body)) }); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});
router.get('/', (_req, res) => res.json({ ok: true, positions: getOpenPositions(), all: getAllPositions() }));
router.post('/', (req, res) => {
  try { res.json({ ok: true, position: addPosition(req.body) }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});
router.put('/:id', (req, res) => {
  try {
    const position = closePosition(req.params.id, req.body);
    if (!position) return res.status(404).json({ error: 'Posicion no encontrada.' });
    return res.json({ ok: true, position });
  } catch (error) { return res.status(500).json({ error: error.message }); }
});
router.get('/:id/analysis', async (req, res) => {
  try {
    const position = getPositionById(req.params.id);
    if (!position) return res.status(404).json({ error: 'Posicion no encontrada.' });
    return res.json({ ok: true, position, ...(await analyzePosition(position)) });
  } catch (error) { return res.status(error.status || 500).json({ error: error.message }); }
});

export default router;
