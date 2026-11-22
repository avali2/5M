import test from 'node:test';
import assert from 'node:assert/strict';
import { getSnapshot } from '../server/lib/marketData.js';
import { buildPositioning, buildIvProfile } from '../server/lib/positioning.js';

test('calcula posicionamiento con muros, max pain y narrativa', async () => {
  const snapshot = await getSnapshot('SPY', {});
  const positioning = buildPositioning({ snapshot });
  assert.ok(positioning.byStrike.length > 10);
  assert.ok(Number.isFinite(positioning.totals.gexUsdPerPct));
  assert.ok(Number.isFinite(positioning.totals.dexShares));
  assert.ok(positioning.walls.callWall > 0);
  assert.ok(positioning.walls.putWall > 0);
  assert.ok(positioning.walls.maxPain && positioning.walls.maxPain.strike > 0);
  const strikes = positioning.byStrike.map((row) => row.strike);
  assert.ok(positioning.walls.maxPain.strike >= Math.min(...strikes) && positioning.walls.maxPain.strike <= Math.max(...strikes));
  assert.ok(['LONG', 'SHORT', 'NEUTRAL'].includes(positioning.regime.dealerGamma));
  assert.ok(['PINNED', 'VOLATILE', 'TREND'].includes(positioning.regime.behavior));
  assert.ok(positioning.narrative.length >= 2);
  assert.ok(positioning.expectedMove.up > positioning.spot);
  assert.ok(positioning.expectedMove.down < positioning.spot);
  assert.ok(positioning.iv.atm > 0);
  assert.equal(positioning.simulated, true);
  for (const row of positioning.byStrike) {
    assert.ok(Number.isFinite(row.gex) && Number.isFinite(row.dex));
  }
});

test('perfil de IV con término y veredicto', async () => {
  const snapshot = await getSnapshot('AMD', {});
  const profile = buildIvProfile(snapshot);
  assert.ok(profile.term.length >= 2);
  assert.ok(profile.atm > 0);
  assert.ok(['FAVORABLE', 'NEUTRO', 'CARO', 'SIN_REFERENCIA'].includes(profile.verdict));
  assert.ok(profile.term.every((row) => row.iv > 0));
});

test('sin cadena devuelve estructura vacía y advertencias', () => {
  const positioning = buildPositioning({ snapshot: { symbol: 'ZZZ', quote: { price: 10 }, expirations: [] } });
  assert.deepEqual(positioning.byStrike, []);
  assert.ok(positioning.warnings.length >= 1);
});

test('es determinista', async () => {
  const snapshot = await getSnapshot('QQQ', {});
  const first = buildPositioning({ snapshot });
  const second = buildPositioning({ snapshot });
  assert.deepEqual(first.walls, second.walls);
  assert.deepEqual(first.totals, second.totals);
  assert.equal(first.narrative.length, second.narrative.length);
});
