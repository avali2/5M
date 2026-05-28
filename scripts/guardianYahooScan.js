const url = process.env.GUARDIAN_YAHOO_URL || 'http://127.0.0.1:8787/api/guardian/yahoo';

const response = await fetch(url, {
  headers: process.env.APP_ACCESS_KEY ? { 'x-valido-key': process.env.APP_ACCESS_KEY } : {}
});

if (!response.ok) {
  throw new Error(`Guardian Yahoo scan failed: ${response.status} ${await response.text()}`);
}

const payload = await response.json();
console.log(JSON.stringify({
  timestamp: payload.timestamp,
  mode: payload.marketDataMode,
  dailyBest: payload.guardianEdge?.dailyBest ? {
    symbol: payload.guardianEdge.dailyBest.symbol,
    classification: payload.guardianEdge.dailyBest.classification,
    strategy: payload.guardianEdge.dailyBest.strategy,
    popEstimated: payload.guardianEdge.dailyBest.popEstimated,
    edgeScore: payload.guardianEdge.dailyBest.edgeScore
  } : null,
  tickets: payload.guardianEdge?.tickets?.length || 0
}, null, 2));
