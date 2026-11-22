import test from 'node:test';
import assert from 'node:assert/strict';
import { getSnapshot } from '../server/lib/marketData.js';
import { buildSpreadIdeas } from '../server/lib/aggressiveSpreads.js';
import { config } from '../server/config.js';

const SYMBOLS = ['SPY', 'QQQ', 'AMD', 'NVDA'];

async function ideasFor(symbol, profile = 'aggressive', extra = {}) {
  const snapshot = await getSnapshot(symbol, {});
  return buildSpreadIdeas({ snapshot, profile, settings: config.spreads, ...extra });
}

test('construye ideas agresivas con patas, crédito y riesgo coherentes', async () => {
  const all = [];
  for (const symbol of SYMBOLS) all.push(...(await ideasFor(symbol)).ideas);
  assert.ok(all.length >= 3, 'esperaba al menos 3 spreads en el radar demo');
  for (const idea of all) {
    assert.ok(idea.legs.length >= 2);
    assert.ok(idea.legs.every((leg) => leg.strike > 0 && leg.price >= 0));
    assert.ok(Number.isFinite(idea.score) && idea.score > 0);
    assert.ok(Number.isFinite(idea.pricing.maxLossUsd) && idea.pricing.maxLossUsd > 0);
    assert.ok(Number.isFinite(idea.pricing.maxProfitUsd) && idea.pricing.maxProfitUsd >= 0);
    assert.ok(Number.isFinite(idea.pricing.maxLossUsd));
    assert.ok(idea.risk.pop === null || (idea.risk.pop >= 0 && idea.risk.pop <= 1));
    assert.ok(idea.risk.stress.length === 7);
    assert.ok(idea.risk.stress.every((row) => Number.isFinite(row.pnlUsd)));
    assert.ok(idea.plan.exits.length >= 2);
    assert.ok(idea.plan.management.length >= 3);
    assert.ok(idea.copy.includes('VENDE') || idea.copy.includes('COMPRA'));
    assert.equal(idea.meta.simulated, true);
    if (!['CALL_DEBIT', 'PUT_DEBIT'].includes(idea.strategy)) {
      assert.ok(idea.pricing.credit > 0, 'los créditos deben ser positivos');
    }
  }
});

test('el perfil máximo es más agresivo que el estándar', async () => {
  const standard = (await ideasFor('SPY', 'standard')).ideas;
  const max = (await ideasFor('SPY', 'max')).ideas;
  const avgDte = (list) => list.reduce((sum, idea) => sum + idea.dte, 0) / Math.max(1, list.length);
  if (standard.length && max.length) {
    assert.ok(avgDte(max) <= avgDte(standard) + 1, 'el perfil máximo debe usar menos días');
    assert.ok(max.every((idea) => idea.aggression === 'MAXIMO'));
    assert.ok(standard.every((idea) => idea.aggression === 'ESTANDAR'));
  }
});

test('respeta el límite de ideas por símbolo y el filtro de estrategia', async () => {
  const result = await ideasFor('QQQ', 'aggressive', { strategies: ['IRON_CONDOR'] });
  assert.ok(result.ideas.length <= config.spreads.maxIdeasPerSymbol);
  assert.ok(result.ideas.every((idea) => idea.strategy === 'IRON_CONDOR'));
  const bySymbol = new Map();
  for (const idea of result.ideas) bySymbol.set(idea.symbol, (bySymbol.get(idea.symbol) || 0) + 1);
  for (const count of bySymbol.values()) assert.ok(count <= config.spreads.maxIdeasPerSymbol);
});

test('es determinista y no devuelve NaN', async () => {
  const first = await ideasFor('AMD');
  const second = await ideasFor('AMD');
  assert.deepEqual(first.ideas.map((idea) => [idea.id, idea.score]), second.ideas.map((idea) => [idea.id, idea.score]));
  const walk = (object) => {
    for (const value of Object.values(object || {})) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), 'encontré un NaN');
      else if (value && typeof value === 'object') walk(value);
    }
  };
  for (const idea of first.ideas) walk(idea);
});

test('sin cotización devuelve aviso en vez de explotar', async () => {
  const result = buildSpreadIdeas({ snapshot: { symbol: 'X' }, profile: 'aggressive', settings: config.spreads });
  assert.deepEqual(result.ideas, []);
  assert.ok(result.meta.warnings.length);
});