import test from 'node:test';
import assert from 'node:assert/strict';
import { OPTION_FORMULAS } from '../src/data/formulas.js';
import { OPTION_STRATEGY_LIBRARY } from '../src/data/strategies.js';
import { DEFAULT_SYMBOLS } from '../src/data/universe.js';
import { formulaLineage, signalLineage } from '../src/services/dataLineageService.js';

test('universe includes requested core symbols for scanner and education', () => {
  for (const symbol of ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLK', 'XLE', 'TLT', 'GLD', 'SPX', 'XSP', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'SOFI', 'AMD', 'RIVN', 'MCD', 'NU']) {
    assert.ok(DEFAULT_SYMBOLS.includes(symbol), `${symbol} missing`);
  }
});

test('strategy library separates risky educational structures from defined-risk tickets', () => {
  assert.ok(OPTION_STRATEGY_LIBRARY.some((strategy) => strategy.name === 'Bull Put Spread' && strategy.robinhoodReady));
  assert.ok(OPTION_STRATEGY_LIBRARY.some((strategy) => strategy.name === 'Short Strangle' && !strategy.robinhoodReady));
});

test('formula lineage reports source, formula, confidence and limitations', () => {
  assert.ok(OPTION_FORMULAS.popDeltaApproximation);
  const lineage = formulaLineage('popDeltaApproximation', 72, { source: 'probabilityEngine', confidence: 'medium' });
  assert.equal(lineage.source, 'probabilityEngine');
  assert.match(lineage.formula, /shortDelta/);
  assert.equal(lineage.confidence, 'medium');
});

test('signal lineage labels AI as explanation only, not data source', () => {
  const rows = signalLineage({ classification: 'EDGE_READY', pop: 72, ev: 12, timestamp: '2026-05-28T14:00:00.000Z' });
  assert.ok(rows.some((row) => /IA no genera/.test(row.explanation)));
  assert.ok(rows.every((row) => row.source !== 'OpenAI' && row.source !== 'Gemini'));
});
