export function summarizeAiBudget(status = {}) {
  const budget = status.budget || {};
  return {
    requests: `${budget.requestsUsed ?? 0} / ${budget.dailyRequestBudget ?? '--'}`,
    tokens: `${budget.tokensUsed ?? 0} / ${budget.dailyTokenBudget ?? '--'}`,
    usagePercent: budget.usagePercent ?? 0,
    automaticEnabled: Boolean(budget.automaticEnabled),
    manualExplain: budget.manualExplain !== false,
    cooldowns: budget.cooldowns || {},
    lastError: budget.lastError || null
  };
}

export function shouldUseDeterministicTutor(status = {}) {
  const budget = status.budget || {};
  return status.activeProvider === 'deterministic' ||
    Number(budget.usagePercent || 0) >= Number(budget.disableAllAtUsagePercent || 95) ||
    Boolean(budget.lastError);
}
