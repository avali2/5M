/**
 * 5M · Alertas de capitulación: caídas fuertes + RSI bajo + IV elevada.
 * Propone put credit spreads definidos (estilo Al): 25-50 DTE, delta 0.22-0.38,
 * crédito/ancho mínimo 18%, riesgo <= $300, TP 50%, salida por strike/tiempo.
 */
import { getSnapshot, optionChainFor, dteFor } from './marketData.js';
import { config } from '../config.js';
import { TradierClient } from './tradier.js';
import { researchCandidate } from './capitulationResearch.js';

export const CAPITULATION_UNIVERSE = ['AMD', 'MU', 'NVDA', 'TSLA', 'META', 'AMZN', 'PLTR', 'COIN', 'SOFI'];

function isNum(value) { return typeof value === 'number' && Number.isFinite(value); }
function round2(value) { return Math.round(value * 100) / 100; }

function rsi(values, length = 14) {
  const clean = values.filter(isNum);
  if (clean.length <= length) return null;
  let gains = 0; let losses = 0;
  for (let index = 1; index <= length; index += 1) { const change = clean[index] - clean[index - 1]; if (change >= 0) gains += change; else losses -= change; }
  let avgGain = gains / length; let avgLoss = losses / length;
  for (let index = length + 1; index < clean.length; index += 1) {
    const change = clean[index] - clean[index - 1];
    avgGain = (avgGain * (length - 1) + Math.max(0, change)) / length;
    avgLoss = (avgLoss * (length - 1) + Math.max(0, -change)) / length;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function realizedVol(history, window = 20) {
  const closes = (history || []).map((bar) => bar?.close).filter(isNum);
  if (closes.length < window + 2) return null;
  const returns = [];
  for (let index = closes.length - window; index < closes.length; index += 1) returns.push(Math.log(closes[index] / closes[index - 1]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

export function evaluateCapitulation(snapshot) {
  const notes = [];
  const spot = snapshot?.quote?.price;
  const history = snapshot?.history || [];
  const closes = history.map((bar) => bar?.close).filter(isNum);
  if (!isNum(spot) || closes.length < 30) return { candidate: null, notes: ['Sin historial suficiente.'] };
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const prev2 = closes[closes.length - 3] ?? prev;
  const dayDrop = round2(((last / prev) - 1) * 100);
  const twoDayDrop = round2(((last / prev2) - 1) * 100);
  const rsi14 = rsi(closes, 14);
  const rv = realizedVol(history);
  const sharp = dayDrop <= -3.5 || twoDayDrop <= -7;
  if (!sharp) notes.push('Sin caída fuerte (día ' + dayDrop + '%, 2d ' + twoDayDrop + '%).');
  if (isNum(rsi14) && rsi14 > 38) notes.push('RSI ' + round2(rsi14) + ' todavía no está en sobreventa.');
  if (!sharp || (isNum(rsi14) && rsi14 > 38)) return { candidate: null, notes };
  const expirations = snapshot?.expirations || [];
  const candidates = expirations.map((expiration) => ({ expiration, dte: dteFor(snapshot, expiration) })).filter((row) => isNum(row.dte) && row.dte >= 25 && row.dte <= 50).sort((a, b) => Math.abs(a.dte - 35) - Math.abs(b.dte - 35));
  if (!candidates.length) notes.push('Sin vencimientos entre 25 y 50 días.');
  const expiration = candidates[0]?.expiration || null;
  const dte = candidates[0]?.dte ?? null;
  const chain = expiration ? optionChainFor(snapshot, expiration) : [];
  const near = chain.filter((option) => isNum(option.iv) && isNum(option.strike));
  const atm = near.length ? near.map((option) => ({ ...option, distance: Math.abs(option.strike - spot) })).sort((a, b) => a.distance - b.distance).slice(0, 6) : [];
  const atmIv = atm.length ? atm.reduce((sum, option) => sum + option.iv, 0) / atm.length : null;
  if (isNum(atmIv) && isNum(rv) && atmIv / rv < 1) notes.push('IV (' + round2(atmIv * 100) + '%) no supera la realizada: prima barata.');
  const puts = chain.filter((option) => option.type === 'put' && isNum(option.delta) && isNum(option.bid) && isNum(option.ask) && option.bid > 0 && option.strike < spot);
  const shorts = puts.map((option) => ({ ...option, absDelta: Math.abs(option.delta) })).filter((option) => option.absDelta >= 0.22 && option.absDelta <= 0.38).sort((a, b) => Math.abs(a.absDelta - 0.3) - Math.abs(b.absDelta - 0.3));
  const shortPut = shorts[0] || null;
  if (!shortPut) notes.push('Sin put vendido en la banda de delta 0.22-0.38.');
  let best = null;
  if (shortPut) {
    for (const width of [2, 2.5, 3, 4, 5]) {
      const longPut = puts.filter((option) => option.strike < shortPut.strike - 0.01).sort((a, b) => Math.abs(a.strike - (shortPut.strike - width)) - Math.abs(b.strike - (shortPut.strike - width)))[0] || null;
      if (!longPut) continue;
      const realWidth = Math.abs(shortPut.strike - longPut.strike);
      const credit = round2((shortPut.bid + shortPut.ask) / 2 - (longPut.bid + longPut.ask) / 2);
      if (!(credit > 0)) continue;
      const creditWidth = credit / realWidth;
      if (creditWidth < 0.18) continue;
      const maxLoss = round2((realWidth - credit) * 100);
      if (maxLoss > 300) continue;
      const score = round2(creditWidth * 100 - Math.abs(shortPut.absDelta - 0.3) * 40);
      if (!best || score > best.score) best = { shortPut, longPut, width: realWidth, credit, creditWidth, maxLoss, score };
    }
    if (!best) notes.push('Ningún ancho deja crédito/ancho >=18% con riesgo <=300.');
  }
  const candidate = best ? {
    symbol: snapshot.symbol || null,
    spot: round2(spot),
    dayDrop, twoDayDrop, rsi14: round2(rsi14), atmIv: isNum(atmIv) ? round2(atmIv) : null, ivRatio: isNum(atmIv) && isNum(rv) && rv > 0 ? round2(atmIv / rv) : null,
    expiration, dte,
    strategy: 'PUT_CREDIT_CAPITULACION',
    shortStrike: best.shortPut.strike,
    longStrike: best.longPut.strike,
    shortDelta: round2(best.shortPut.absDelta),
    width: best.width,
    credit: best.credit,
    creditWidth: round2(best.creditWidth * 100) / 100,
    maxLoss: best.maxLoss,
    contracts: 1,
    exits: { profitTargetUsd: round2(best.credit * 100 * 0.5), stopLossUsd: -best.maxLoss, shortStrikeStop: best.shortPut.strike, timeExitDte: 21 },
    legs: [
      { action: 'SELL', type: 'put', strike: best.shortPut.strike, price: round2((best.shortPut.bid + best.shortPut.ask) / 2), delta: round2(best.shortPut.delta), symbol: best.shortPut.symbol },
      { action: 'BUY', type: 'put', strike: best.longPut.strike, price: round2((best.longPut.bid + best.longPut.ask) / 2), delta: round2(best.longPut.delta), symbol: best.longPut.symbol }
    ],
    reasons: ['Caída día ' + dayDrop + '% / 2d ' + twoDayDrop + '%', 'RSI ' + round2(rsi14), 'IV/RV ' + (isNum(atmIv) && isNum(rv) && rv > 0 ? round2(atmIv / rv) : '—'), 'Crédito/ancho ' + round2(best.creditWidth * 100) + '%'],
    generatedAt: new Date().toISOString()
  } : null;
  return { candidate, notes };
}

const cache = new Map();
export async function scanCapitulation(options = {}) {
  const symbols = options.symbols || CAPITULATION_UNIVERSE;
  const tradier = config.tradier && config.tradier.token ? new TradierClient(config.tradier) : undefined;
  const results = [];
  const skipped = [];
  for (const symbol of symbols) {
    const key = 'cap:' + symbol;
    const hit = cache.get(key);
    let snapshot = null;
    if (hit && Date.now() - hit.at < 5 * 60000) snapshot = hit.value;
    else {
      try { snapshot = await getSnapshot(symbol, { tradier }); cache.set(key, { at: Date.now(), value: snapshot }); }
      catch (error) { skipped.push({ symbol, reason: error.message.slice(0, 80) }); continue; }
    }
    const evaluation = evaluateCapitulation(snapshot);
    if (evaluation.candidate) {
      const candidate = { ...evaluation.candidate };
      try { candidate.research = await researchCandidate(snapshot, candidate); } catch { candidate.research = null; }
      results.push(candidate);
    } else skipped.push({ symbol, reason: evaluation.notes[0] || 'sin señal' });
  }
  results.sort((a, b) => b.score - a.score);
  return { scannedAt: new Date().toISOString(), universe: symbols, candidates: results.slice(0, 6), skipped };
}