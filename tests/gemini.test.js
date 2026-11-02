import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiReviewer, REQUIRED_NEWS_COVERAGE, extractGrounding, safeJson } from '../server/lib/gemini.js';

test('extrae JSON seguro y fuentes de grounding sin duplicados', () => {
  assert.deepEqual(safeJson('```json\n{"ok":true}\n```'), { ok: true });
  const result = extractGrounding({ candidates: [{ groundingMetadata: { groundingChunks: [
    { web: { title: 'Fed', uri: 'https://www.federalreserve.gov/test' } },
    { web: { title: 'Duplicada', uri: 'https://www.federalreserve.gov/test' } },
    { web: { title: 'Inválida', uri: 'javascript:alert(1)' } }
  ], webSearchQueries: ['Fed calendar'] } }] });
  assert.equal(result.sources.length, 1);
  assert.equal(result.searchQueries[0], 'Fed calendar');
});

test('Gemini usa Google Search y solo devuelve CLEAR con cobertura y fuentes', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  let groundingChunks = [
    { web: { title: 'Federal Reserve', uri: 'https://www.federalreserve.gov/' } },
    { web: { title: 'BLS', uri: 'https://www.bls.gov/news.release/' } },
    { web: { title: 'Reuters', uri: 'https://www.reuters.com/markets/' } }
  ];
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    const answer = {
      status: 'CLEAR', riskScore: 10, summary: 'Prueba completa.', tradeInstruction: 'Esperar precio.',
      blockers: [], catalysts: [], events: [], coverage: [...REQUIRED_NEWS_COVERAGE]
    };
    return new Response(JSON.stringify({ candidates: [{
      content: { parts: [{ text: JSON.stringify(answer) }] },
      groundingMetadata: { groundingChunks, webSearchQueries: ['Fed today'] }
    }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const reviewer = new GeminiReviewer({ apiKey: 'test-key', model: 'gemini-test', newsCacheMinutes: 5, minGroundingSources: 3, maxClearRiskScore: 35 });
    const risk = await reviewer.reviewMarketRisk({ symbols: ['AMD', 'MSFT', 'SPY'], prioritySymbols: ['AMD', 'MSFT', 'SPY'], now: new Date('2026-08-21T15:00:00Z') });
    assert.deepEqual(requestBody.tools, [{ google_search: {} }]);
    assert.equal(risk.status, 'CLEAR');
    assert.equal(risk.coverageComplete, true);
    assert.equal(risk.sources.length, 3);
    assert.equal(risk.uniqueSourceDomains.length, 3);
    const strictReviewer = new GeminiReviewer({ apiKey: 'test-key', model: 'gemini-test', newsCacheMinutes: 5, minGroundingSources: 3, maxClearRiskScore: 35 });
    groundingChunks = [
      { web: { title: 'Page A', uri: 'https://www.reuters.com/markets/a' } },
      { web: { title: 'Page B', uri: 'https://www.reuters.com/markets/b' } },
      { web: { title: 'Page C', uri: 'https://www.reuters.com/markets/c' } }
    ];
    const strictRisk = await strictReviewer.reviewMarketRisk({ symbols: ['AMD'], prioritySymbols: ['AMD'], now: new Date('2026-08-21T15:00:00Z') });
    assert.equal(strictRisk.status, 'UNKNOWN');
    assert.equal(strictRisk.coverageComplete, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
