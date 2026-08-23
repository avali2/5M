const TERMINAL_ACTIONS = new Set(['WIN', 'LOSS', 'BREAKEVEN']);

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function latestTerminalRows(rows = []) {
  const latest = new Map();
  for (const row of [...rows].sort((left, right) => String(left.feedbackAt || '').localeCompare(String(right.feedbackAt || '')))) {
    const action = String(row.action || '').toUpperCase();
    if (TERMINAL_ACTIONS.has(action)) latest.set(row.instanceId, { ...row, action });
  }
  return [...latest.values()];
}

function summarize(rows, minimumValidatedSamples) {
  const wins = rows.filter((row) => row.action === 'WIN').length;
  const losses = rows.filter((row) => row.action === 'LOSS').length;
  const breakeven = rows.filter((row) => row.action === 'BREAKEVEN').length;
  const pnlValues = rows.filter((row) => row.pnlUsd !== null && row.pnlUsd !== undefined && row.pnlUsd !== '')
    .map((row) => Number(row.pnlUsd)).filter(Number.isFinite);
  const sampleSize = rows.length;
  return {
    sampleSize,
    wins,
    losses,
    breakeven,
    winRate: sampleSize ? round(wins / sampleSize) : null,
    avgPnlUsd: pnlValues.length ? round(pnlValues.reduce((sum, value) => sum + value, 0) / pnlValues.length, 2) : null,
    totalPnlUsd: pnlValues.length ? round(pnlValues.reduce((sum, value) => sum + value, 0), 2) : null,
    status: sampleSize >= minimumValidatedSamples ? 'VALIDATED' : sampleSize ? 'EARLY' : 'NO_DATA'
  };
}

function grouped(rows, keyName, minimumValidatedSamples) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row[keyName] || 'UNKNOWN');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, values]) => ({ key, ...summarize(values, minimumValidatedSamples) }))
    .sort((left, right) => right.sampleSize - left.sampleSize || left.key.localeCompare(right.key));
}

export function buildLearningSummary(rows = [], { minimumValidatedSamples = 20 } = {}) {
  const outcomes = latestTerminalRows(rows);
  const overall = summarize(outcomes, minimumValidatedSamples);
  const bySymbol = grouped(outcomes, 'symbol', minimumValidatedSamples);
  const byProfile = grouped(outcomes, 'profileId', minimumValidatedSamples);
  const byStrategy = grouped(outcomes, 'strategy', minimumValidatedSamples);
  const validatedSegments = {
    symbols: bySymbol.filter((item) => item.status === 'VALIDATED'),
    profiles: byProfile.filter((item) => item.status === 'VALIDATED'),
    strategies: byStrategy.filter((item) => item.status === 'VALIDATED')
  };
  return {
    enabled: true,
    generatedAt: new Date().toISOString(),
    minimumValidatedSamples,
    overall,
    bySymbol,
    byProfile,
    byStrategy,
    validatedSegments,
    advisory: {
      usable: overall.status === 'VALIDATED' || Object.values(validatedSegments).some((items) => items.length),
      warning: 'Estadísticas observacionales; no prueban que una configuración vaya a repetir resultados.',
      overall: overall.status === 'VALIDATED' ? overall : null,
      ...validatedSegments
    },
    recentOutcomes: outcomes.sort((left, right) => String(right.feedbackAt || '').localeCompare(String(left.feedbackAt || '')))
      .slice(0, 12)
      .map((row) => ({ instanceId: row.instanceId, signalId: row.signalId, symbol: row.symbol, profileId: row.profileId, strategy: row.strategy, action: row.action, pnlUsd: row.pnlUsd !== null && row.pnlUsd !== undefined && row.pnlUsd !== '' && Number.isFinite(Number(row.pnlUsd)) ? Number(row.pnlUsd) : null, feedbackAt: row.feedbackAt })),
    message: outcomes.length
      ? `${outcomes.length} resultado(s) cerrado(s). ${overall.status === 'VALIDATED' ? 'Muestra global validada para contexto, no para autoajuste.' : `Se requieren ${Math.max(0, minimumValidatedSamples - outcomes.length)} resultado(s) adicionales para validar la muestra global.`}`
      : 'Todavía no hay operaciones cerradas. Marca ganadora, perdedora o break-even para iniciar el aprendizaje.'
  };
}
