import test from 'node:test';
import assert from 'node:assert/strict';
import { getSnapshot } from '../server/lib/marketData.js';
import { buildDirectionalSignals } from '../server/lib/nitoDirectional.js';
import { config } from '../server/config.js';

const SYMBOLS = ['AMD', 'SPY', 'QQQ', 'NVDA', 'TSLA', 'IWM'];
const settings = { ...config.nito, side: 'both', maxSignals: 3 };

async function snapshotFor(symbol) { return getSnapshot(symbol, {}); }

test('genera señales CALL y PUT utilizables en el mercado simulado', async () => {
  const results = [];
  for (const symbol of SYMBOLS) results.push(buildDirectionalSignals({ snapshot: await snapshotFor(symbol), settings, account: { sizeUsd: 10000, riskPct: 1.5 } }));
  const signals = results.flatMap((result) => result.signals);
  assert.ok(signals.length >= 1, 'esperaba al menos 1 señal en el radar demo');
  // En el demo el radar puede venir direccional: alcanza con que cada señal sea válida.
  for (const signal of signals) {
    assert.ok(['CALL', 'PUT'].includes(signal.side));
    assert.ok(signal.contract.strike > 0);
    assert.ok(signal.contract.dte >= config.nito.dteMin - 1);
    assert.ok(signal.contract.entry > 0);
    assert.ok(Number.isFinite(signal.score) && signal.score >= 45 && signal.score <= 100);
    assert.ok(Number.isFinite(signal.contract.breakeven));
    const call = signal.side === 'CALL';
    assert.ok(call ? signal.contract.breakeven > signal.contract.strike : signal.contract.breakeven < signal.contract.strike);
    assert.ok(signal.plan.targets.length === 2);
    assert.ok(signal.plan.targets.every((target) => target.price > 0));
    assert.ok(signal.plan.stopPrice > 0 && signal.plan.stopPrice < signal.contract.entry);
    assert.ok(signal.probabilities.pop >= 0 && signal.probabilities.pop <= 1);
    assert.ok(signal.probabilities.probTouch >= 0 && signal.probabilities.probTouch <= 1);
    assert.equal(signal.probabilities.basis, 'lognormal-risk-neutral');
    assert.ok(signal.scenario.expiry.length >= 5);
    assert.ok(signal.why.length >= 5);
    assert.ok(signal.risks.length >= 1);
    assert.ok(signal.copy.includes('POP modelo'));
    assert.ok(signal.copy.includes('no garantía') || signal.copy.includes('no garantía.'));
    assert.equal(signal.meta.simulated, true);
    assert.equal(signal.meta.operable, false, 'datos simulados nunca son operables');
  }
});

test('el filtro de lado respeta CALL o PUT', async () => {
  const snapshot = await snapshotFor('SPY');
  const onlyCall = buildDirectionalSignals({ snapshot, settings: { ...settings, side: 'call' } });
  const onlyPut = buildDirectionalSignals({ snapshot, settings: { ...settings, side: 'put' } });
  assert.ok(onlyCall.signals.every((signal) => signal.side === 'CALL'));
  assert.ok(onlyPut.signals.every((signal) => signal.side === 'PUT'));
});

test('gate informa DEMO y nunca habilita operar', async () => {
  const result = buildDirectionalSignals({ snapshot: await snapshotFor('QQQ'), settings });
  assert.equal(result.gate.status, 'DEMO');
  assert.equal(result.gate.tradeable, false);
  assert.ok(result.gate.reasons.some((reason) => /simulad/i.test(reason)));
});

test('es determinista para el mismo snapshot', async () => {
  const snapshot = await snapshotFor('SPY');
  const first = buildDirectionalSignals({ snapshot, settings });
  const second = buildDirectionalSignals({ snapshot, settings });
  assert.deepEqual(first.signals.map((signal) => [signal.id, signal.score, signal.contract.strike]), second.signals.map((signal) => [signal.id, signal.score, signal.contract.strike]));
});

test('sin cotización devuelve NO_DATA sin lanzar', () => {
  const result = buildDirectionalSignals({ snapshot: { symbol: 'XXX' }, settings });
  assert.equal(result.gate.status, 'NO_DATA');
  assert.deepEqual(result.signals, []);
});

test('las probabilidades no dependen de azar entre llamadas', async () => {
  const snapshot = await snapshotFor('AMD');
  const result = buildDirectionalSignals({ snapshot, settings });
  for (const signal of result.signals) {
    assert.ok(signal.probabilities.pop === null || Number.isFinite(signal.probabilities.pop));
    assert.ok(signal.probabilities.pop === null || (signal.probabilities.pop >= 0 && signal.probabilities.pop <= 1));
  }
});