import { getSnapshot } from '../server/lib/marketData.js';
import { buildDirectionalSignals } from '../server/lib/nitoDirectional.js';
import { buildSpreadIdeas } from '../server/lib/aggressiveSpreads.js';
import { buildPositioning } from '../server/lib/positioning.js';
import { config } from '../server/config.js';

let failures = 0;
function checkNumbers(object, path = '') {
  const bad = [];
  for (const [key, value] of Object.entries(object || {})) {
    if (typeof value === 'number' && !Number.isFinite(value)) bad.push(path + key);
    else if (value && typeof value === 'object' && !Array.isArray(value)) bad.push(...checkNumbers(value, path + key + '.'));
  }
  return bad;
}

for (const symbol of ['AMD', 'SPY', 'QQQ', 'NVDA', 'TSLA']) {
  try {
    const snapshot = await getSnapshot(symbol, {});
    const nito = buildDirectionalSignals({ snapshot, settings: { ...config.nito, side: 'both' }, account: { sizeUsd: 10000, riskPct: 1.5 } });
    const spreads = buildSpreadIdeas({ snapshot, profile: 'aggressive', settings: config.spreads });
    const positioning = buildPositioning({ snapshot });
    const bad = [...nito.signals.flatMap((signal) => checkNumbers(signal)), ...spreads.ideas.flatMap((idea) => checkNumbers(idea)), ...checkNumbers(positioning)];
    const nitoLabel = nito.signals.map((signal) => signal.side + ':' + signal.score + ':' + signal.contract.strike + ':' + signal.contract.dte + 'd').join(',') || 'none';
    const spreadLabel = spreads.ideas.slice(0, 3).map((idea) => idea.strategy + ':' + idea.score + ':' + idea.pricing.credit).join(',');
    console.log(symbol, '| price', snapshot.quote.price.toFixed(2),
      '| trend', snapshot.technical.trend, '| flow', snapshot.flow?.direction, (snapshot.flow?.confidence ?? 0) + '%',
      '| NITO', nitoLabel, '| gate', nito.gate.status,
      '| SPREADS', spreads.ideas.length, spreadLabel,
      '| POS', positioning.byStrike.length + 'strikes', 'gex', positioning.totals.gexUsdPerPct,
      'walls', positioning.walls.callWall + '/' + positioning.walls.putWall, 'pain', positioning.walls.maxPain?.strike,
      '| NaN', bad.length ? bad.slice(0, 4).join(',') : 'ok');
    if (bad.length) failures += 1;
  } catch (error) {
    failures += 1;
    console.log(symbol, 'ERROR', error.message, error.stack?.split('\n')[1]);
  }
}
console.log(failures ? 'FAILURES: ' + failures : 'ALL OK');
