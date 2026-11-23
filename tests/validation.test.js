import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifact } from '../server/lib/validation.js';

function artifact(overrides = {}) {
  return {
    schema_version: '1.0.0',
    validation_id: 'val-test',
    created_at: '2026-11-23T00:00:00Z',
    strategy: { git_commit: 'abc1234', config_sha256: 'sha256:x' },
    dataset: { vendor: 'ThetaData' },
    splits: { holdout: ['2025-01-01', '2026-09-30'] },
    statistics: { trades: 250, expectancy: 12.5, bootstrap_ci_95: [3.2, 21.1], deflated_sharpe_probability: 0.97 },
    robustness: { plus_1_tick: 'PASS', minus_1_tick: 'PASS', delta_plus_5: 'PASS', delta_minus_5: 'PASS', stress_2020: 'PASS', double_slippage: 'PASS' },
    decision: { status: 'APPROVED_FOR_LIVE', live_trading: true },
    signature: { value: 'firma' },
    ...overrides
  };
}

test('acepta un artefacto completo con backtest robusto y LIVE_TRADING', () => {
  const result = validateArtifact(artifact(), { LIVE_TRADING: 'true' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test('rechaza si faltan pruebas de robustez o DSR', () => {
  const result = validateArtifact(artifact({ robustness: { plus_1_tick: 'FAIL' }, statistics: { trades: 20, expectancy: 5, bootstrap_ci_95: [1, 4], deflated_sharpe_probability: 0.4 } }), { LIVE_TRADING: 'true' });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('robustness.plus_1_tick'));
  assert.ok(result.missing.includes('statistics.trades >= 200'));
  assert.ok(result.missing.includes('deflated_sharpe_probability >= 0.95'));
});

test('rechaza con LIVE_TRADING apagado aunque el artefacto esté aprobado', () => {
  const result = validateArtifact(artifact(), {});
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('LIVE_TRADING=true'));
});
