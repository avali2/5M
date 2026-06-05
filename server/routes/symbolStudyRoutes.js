import express from 'express';
import { requestGeminiJson } from '../lib/geminiJson.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toPct(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed <= 1 ? parsed * 100 : parsed);
}

function text(value) {
  return String(value || '').trim();
}

function signalSymbol(item = {}) {
  return text(item.symbol || item.ticker || item.sourceSetup?.symbol).toUpperCase();
}

function collectCandidates(scan = {}, symbol = '') {
  const all = [
    ...asArray(scan.opportunities),
    ...asArray(scan.agent?.approvedSignals),
    ...asArray(scan.guardianEdge?.actionableTickets),
    ...asArray(scan.guardianEdge?.candidateTickets),
    ...asArray(scan.guardianEdge?.tickets),
    ...asArray(scan.conditionalIdeas),
    ...asArray(scan.rejected)
  ];
  const key = symbol.toUpperCase();
  return all.filter((item) => signalSymbol(item) === key);
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function localStudy({ symbol, scan = {}, proposedSignal = null }) {
  const candidates = collectCandidates(scan, symbol);
  const best = proposedSignal || candidates[0] || {};
  const quote = asArray(scan.market?.quotes).find((item) => item.symbol === symbol);
  const technicals = scan.market?.technicals?.[symbol] || best.technicals || best.sourceSetup?.technicals || {};
  const classification = text(best.status || best.classification || best.signalStatus).toUpperCase();
  const blocks = [
    ...asArray(best.blocks),
    ...asArray(best.riskGovernor?.blocks),
    ...asArray(best.warnings),
    ...asArray(best.rejectionReasons)
  ].filter(Boolean);
  const score = firstNumber(best.score, best.edgeScore, best.tradeQualityScore, best.confidenceScore, best.sourceSetup?.score, best.sourceSetup?.confidenceScore);
  const probabilityPct = toPct(best.popEstimated ?? best.probability ?? best.pop ?? best.sourceSetup?.pop ?? best.edge?.probabilityOfProfit);
  const ready = /READY|APPROVE|GREEN/.test(classification) || (score !== null && score >= 70 && probabilityPct !== null && probabilityPct >= 62 && !blocks.length);
  const noData = /DATA|NO_CHAIN|NO_QUOTE|NO_GREEKS/.test(classification) || blocks.some((item) => /chain|quote|greek|bid|ask|liquidez|open interest|volume/i.test(item));
  const verdict = ready ? 'VALE_REVISAR' : blocks.length || noData ? 'NO_TOMAR_AHORA' : 'VIGILAR';
  const earnings = asArray(scan.macro?.earnings).filter((item) => item.symbol === symbol).slice(0, 2);
  const companyNews = [
    ...asArray(scan.macro?.companyNews),
    ...asArray(scan.macro?.breakingRisk)
  ].filter((item) => !item.symbol || item.symbol === symbol).slice(0, 3);
  const strategy = text(best.strategy || best.strategyLabel || best.sourceSetup?.strategy || 'Sin ticket claro');
  const price = firstNumber(quote?.price, best.underlyingPrice, best.currentPrice, best.sourceSetup?.underlyingPrice);
  return {
    verdict,
    symbol,
    strategy,
    probabilityPct,
    score,
    summary: ready
      ? `${symbol} tiene setup revisable ahora: ${strategy}, probabilidad estimada ${probabilityPct ?? 'N/D'}% y score ${score ?? 'N/D'}.`
      : blocks.length
        ? `${symbol} no se debe tomar ahora: ${blocks[0]}.`
        : `${symbol} queda en vigilancia; faltan gatillos o datos para justificar una orden inmediata.`,
    why: [
      `Precio subyacente: ${price === null ? 'N/D' : price}`,
      `Tendencia tecnica: ${technicals.trend || 'N/D'}`,
      `Regimen mercado: ${scan.market?.regime || 'N/D'}`,
      `Score: ${score ?? 'N/D'} / Probabilidad: ${probabilityPct ?? 'N/D'}%`
    ],
    risks: blocks.length ? blocks.slice(0, 5) : [
      ...(earnings.length ? earnings.map((item) => `Earnings ${item.date}`) : []),
      'Confirmar bid/ask, liquidez, open interest y mark antes de entrar.',
      'No perseguir precio si cambia el credito/debito objetivo.'
    ],
    nextAction: ready
      ? 'Revisar cadena en el broker y usar solo orden limite si el precio sigue dentro del plan.'
      : noData ? 'Esperar datos completos de cadena, griegas, bid/ask y volumen antes de decidir.' : 'Mantener en watchlist hasta que el scanner lo suba a READY.',
    news: companyNews.map((item) => item.headline || item.title).filter(Boolean),
    source: 'local_fallback'
  };
}

function normalizeGemini(local, gemini = {}) {
  return {
    ...local,
    ...gemini,
    probabilityPct: toPct(gemini.probabilityPct ?? gemini.probability ?? local.probabilityPct),
    why: asArray(gemini.why).length ? gemini.why : local.why,
    risks: asArray(gemini.risks).length ? gemini.risks : local.risks,
    nextAction: gemini.nextAction || local.nextAction,
    source: 'gemini'
  };
}

export function createSymbolStudyRouter({ scheduler }) {
  const router = express.Router();

  async function handle(req, res, next) {
    try {
      const symbol = text(req.params.symbol).toUpperCase();
      if (!/^[A-Z.]{1,8}$/.test(symbol)) return res.status(400).json({ ok: false, error: 'Simbolo invalido.' });
      const scan = await scheduler.snapshot();
      const proposedSignal = req.body?.signal || null;
      const local = localStudy({ symbol, scan, proposedSignal });
      const prompt = [
        'Eres Gemini Guardian para una app de opciones. Modo agresivo con riesgo definido.',
        'Decide si vale la pena estudiar o tomar esta operacion ahora. No inventes datos.',
        'Si faltan bid/ask, cadena, griegas, OI, volumen o mark real, dilo claramente y no apruebes.',
        `Contexto local: ${JSON.stringify(local)}`,
        `Signal propuesto: ${JSON.stringify(proposedSignal || {})}`,
        'Devuelve SOLO JSON con: verdict (VALE_REVISAR|VIGILAR|NO_TOMAR_AHORA), probabilityPct, summary, why(array), risks(array), nextAction.'
      ].join('\n');
      try {
        const gemini = await requestGeminiJson(prompt, { temperature: 0.25, maxTokens: 700 });
        return res.json({ ok: true, symbol, asOf: scan.asOf, study: normalizeGemini(local, gemini) });
      } catch (error) {
        return res.json({ ok: true, symbol, asOf: scan.asOf, study: { ...local, geminiError: error.message } });
      }
    } catch (error) {
      next(error);
    }
  }

  router.get('/:symbol', handle);
  router.post('/:symbol', handle);
  return router;
}
