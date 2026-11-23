/**
 * 5M · Contrato de validación para habilitar dinero real.
 * Requiere un artefacto inmutable con métricas OOS y pruebas de robustez.
 */
export function validateArtifact(artifact, env = process.env) {
  const a = artifact || {};
  const missing = [];
  const need = (condition, label) => { if (!condition) missing.push(label); };
  need(Boolean(a.schema_version), 'schema_version');
  need(Boolean(a.validation_id), 'validation_id');
  need(Boolean(a.created_at), 'created_at');
  need(Boolean(a.strategy?.git_commit), 'strategy.git_commit');
  need(Boolean(a.strategy?.config_sha256), 'strategy.config_sha256');
  need(Boolean(a.dataset?.vendor), 'dataset.vendor');
  need(Array.isArray(a.splits?.holdout) && a.splits.holdout.length === 2, 'splits.holdout');
  const stats = a.statistics || {};
  need(Number(stats.trades) >= 200, 'statistics.trades >= 200');
  need(Number(stats.expectancy) > 0, 'statistics.expectancy > 0');
  need(Array.isArray(stats.bootstrap_ci_95) && Number(stats.bootstrap_ci_95[0]) > 0, 'bootstrap_ci_95[0] > 0');
  need(Number(stats.deflated_sharpe_probability) >= 0.95, 'deflated_sharpe_probability >= 0.95');
  const robustness = a.robustness || {};
  for (const key of ['plus_1_tick', 'minus_1_tick', 'delta_plus_5', 'delta_minus_5', 'stress_2020', 'double_slippage']) {
    need(String(robustness[key] || '').toUpperCase() === 'PASS', 'robustness.' + key);
  }
  need(a.decision?.status === 'APPROVED_FOR_LIVE', 'decision.status APPROVED_FOR_LIVE');
  need(a.decision?.live_trading === true, 'decision.live_trading true');
  need(Boolean(a.signature?.value), 'signature.value');
  const enabled = env.LIVE_TRADING === 'true';
  if (!enabled) missing.push('LIVE_TRADING=true');
  return {
    ok: missing.length === 0,
    enabled,
    validationId: a.validation_id || null,
    status: a.decision?.status || null,
    trades: Number(stats.trades || 0),
    expectancy: Number(stats.expectancy || 0),
    dsr: Number(stats.deflated_sharpe_probability || 0),
    missing
  };
}
