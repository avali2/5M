import { round, clamp } from './math.js';
import { fetchJson, toArray } from './tradier-api.js';

const POLYGON_KEY = process.env.POLYGON_API_KEY || process.env.VITE_POLYGON_API_KEY;

export async function getPolygonTape(symbol) {
  if (!POLYGON_KEY) {
    return { status: "NO_POLYGON_KEY", prints: [], score: 0, summary: "Sin POLYGON_API_KEY: tape real no disponible. Usando solo OHLCV/Tradier. Señal degradada." };
  }
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const startNs = nowNs - 10n * 60n * 1_000_000_000n;
  const tradeUrl = `https://api.polygon.io/v3/trades/${symbol}?timestamp.gte=${startNs}&timestamp.lte=${nowNs}&limit=5000&sort=timestamp&order=asc&apiKey=${POLYGON_KEY}`;
  const quoteUrl = `https://api.polygon.io/v3/quotes/${symbol}?timestamp.gte=${startNs}&timestamp.lte=${nowNs}&limit=5000&sort=timestamp&order=asc&apiKey=${POLYGON_KEY}`;
  try {
    const [tradesJson, quotesJson] = await Promise.all([fetchJson(tradeUrl), fetchJson(quoteUrl)]);
    const trades = toArray(tradesJson.results);
    const quotes = toArray(quotesJson.results);
    const prints = trades.map(t => {
      const ts = Number(t.sip_timestamp || t.participant_timestamp || t.timestamp);
      const price = Number(t.price), size = Number(t.size || 0);
      const q = nearestQuote(quotes, ts);
      let side = "mid";
      if (q) { if (Number.isFinite(q.ask_price) && price >= Number(q.ask_price)) side = "ask"; else if (Number.isFinite(q.bid_price) && price <= Number(q.bid_price)) side = "bid"; }
      return { timestamp: ts, price, size, notional: price * size, side };
    }).filter(p => Number.isFinite(p.price));
    return evaluateTape(symbol, prints, "POLYGON_REAL_TAPE");
  } catch (e) { return { status: "TAPE_ERROR", prints: [], score: 0, summary: `Error tape Polygon: ${e.message}` }; }
}

function nearestQuote(quotes, ts) {
  if (!quotes.length) return null;
  let best = null;
  for (const q of quotes) { const qt = Number(q.sip_timestamp || q.participant_timestamp || q.timestamp); if (qt <= ts) best = q; else break; }
  return best;
}

export function evaluateTape(symbol, prints, status = "REAL") {
  if (!prints.length) return { symbol, status: "NO_DATA", score: 0, buyPressure: 0, sellPressure: 0, printsPerSecond: 0, largeTradeDetected: false, summary: "Sin prints recientes." };
  const ask = prints.filter(p => p.side === "ask"), bid = prints.filter(p => p.side === "bid");
  const askN = ask.reduce((s, p) => s + p.notional, 0), bidN = bid.reduce((s, p) => s + p.notional, 0);
  const total = askN + bidN || 1;
  const buyPressure = askN / total, sellPressure = bidN / total;
  const largeTradeDetected = prints.some(p => p.notional >= 500_000);
  const timestamps = prints.map(p => Number(p.timestamp)).filter(Number.isFinite);
  const seconds = Math.max(1, (Math.max(...timestamps) - Math.min(...timestamps)) / 1e9);
  const pps = prints.length / seconds;
  let score = 50 + (buyPressure - sellPressure) * 40;
  if (pps > 2) score += 5; if (largeTradeDetected) score += 5;
  const momentum = buyPressure > sellPressure + 0.10 ? "BUY_PRESSURE" : sellPressure > buyPressure + 0.10 ? "SELL_PRESSURE" : "BALANCED";
  return { symbol, status, score: Math.round(clamp(score, 0, 100)), momentum, buyPressure: round(buyPressure * 100, 1), sellPressure: round(sellPressure * 100, 1), printsPerSecond: round(pps, 2), largeTradeDetected, summary: `${momentum}: compra ${round(buyPressure * 100, 1)}% vs venta ${round(sellPressure * 100, 1)}%. Grande: ${largeTradeDetected ? "SÍ" : "NO"}.` };
}