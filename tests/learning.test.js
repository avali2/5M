import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningSummary } from '../server/lib/learning.js';
import { getLearningSummary, getStoreStatus, saveScan, saveSignalFeedback } from '../server/lib/store.js';
import { selectRotatingUniverse, universeCatalog } from '../server/lib/universe.js';

test('el universo conserva prioridad e índices ETF y rota los demás símbolos', () => {
  const catalog = universeCatalog();
  assert.deepEqual(catalog.priority, ['AMD', 'MSFT', 'SPY']);
  assert.deepEqual(catalog.indexProxies, ['SPY', 'QQQ', 'IWM', 'DIA']);
  assert.deepEqual(catalog.contextIndices, ['SPX', 'NDX', 'RUT', 'VIX']);
  assert.deepEqual(catalog.magnificentSeven, ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA']);
  assert.deepEqual(catalog.wheelSymbols, ['SOFI', 'MARA']);
  const first = selectRotatingUniverse({ maxSymbols: 12, now: new Date('2026-08-24T14:00:00Z') });
  const second = selectRotatingUniverse({ maxSymbols: 12, now: new Date('2026-08-24T14:05:00Z') });
  for (const symbol of ['AMD', 'MSFT', 'SPY', 'QQQ', 'IWM', 'DIA', 'SOFI', 'MARA']) {
    assert.ok(first.includes(symbol));
    assert.ok(second.includes(symbol));
  }
  assert.equal(first.length, 12);
  assert.equal(second.length, 12);
  assert.notDeepEqual(first, second);
});

test('el aprendizaje no valida muestras pequeñas y sí valida al alcanzar el mínimo', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    instanceId: `i-${index}`,
    signalId: `s-${index}`,
    symbol: index < 10 ? 'AMD' : 'SPY',
    profileId: 'CORE',
    strategy: 'BULL_PUT_CREDIT_SPREAD',
    action: index < 13 ? 'WIN' : 'LOSS',
    pnlUsd: index < 13 ? 15 : -20,
    feedbackAt: new Date(2026, 7, 1, 10, index).toISOString()
  }));
  const early = buildLearningSummary(rows.slice(0, 19), { minimumValidatedSamples: 20 });
  const validated = buildLearningSummary(rows, { minimumValidatedSamples: 20 });
  assert.equal(early.overall.status, 'EARLY');
  assert.equal(early.advisory.usable, false);
  assert.equal(validated.overall.status, 'VALIDATED');
  assert.equal(validated.overall.sampleSize, 20);
  assert.equal(validated.overall.winRate, 0.65);
  assert.equal(validated.advisory.usable, true);
});

test('SQLite guarda señales y feedback y produce un resumen de aprendizaje', async () => {
  const scanId = `scan-learning-${Date.now()}`;
  const signalId = `signal-learning-${Date.now()}`;
  const instanceId = `${scanId}:${signalId}`;
  await saveScan({
    id: scanId,
    generatedAt: new Date().toISOString(),
    source: 'Tradier',
    summary: { ready: 1 },
    marketRisk: { status: 'CLEAR' },
    signals: [{
      id: signalId,
      instanceId,
      generatedAt: new Date().toISOString(),
      symbol: 'AMD',
      strategy: 'BULL_PUT_CREDIT_SPREAD',
      profile: { id: 'CORE' },
      status: 'READY',
      score: 82,
      popEstimate: 0.7,
      shortDelta: -0.3,
      dte: 28,
      credit: 0.45,
      maxRiskUsd: 255
    }]
  });
  await saveSignalFeedback({ instanceId, signalId, action: 'TAKEN', entryCredit: 0.45 });
  await saveSignalFeedback({ instanceId, signalId, action: 'WIN', pnlUsd: 22.5 });
  const summary = await getLearningSummary();
  const status = await getStoreStatus();
  assert.equal(summary.overall.sampleSize, 1);
  assert.equal(summary.overall.wins, 1);
  assert.equal(summary.overall.totalPnlUsd, 22.5);
  assert.equal(status.provider, 'sqlite');
  assert.ok(status.signalsStored >= 1);
  assert.ok(status.feedbackEvents >= 2);
});
