function finite(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const parsed = finite(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

export function applyTradierAccountSizing({ storedProfile = {}, policy = {}, snapshot = null, syncLimitsFromEnv = true } = {}) {
  const online = snapshot?.status === 'ONLINE';
  const paperTrading = online && snapshot?.paperTrading === true;
  const accountSize = online
    ? Math.max(0, finite(snapshot?.balances?.totalEquity, finite(snapshot?.balances?.totalCash, 0)))
    : finite(storedProfile.accountSize, finite(policy.accountSize, 2000));
  const riskPct = finite(syncLimitsFromEnv && online ? policy.riskPct : storedProfile.riskPct, finite(policy.riskPct, 2));
  const maxCollateralPct = finite(syncLimitsFromEnv && online ? policy.maxCollateralPct : storedProfile.maxCollateralPct, finite(policy.maxCollateralPct, 35));
  const optionBuyingPower = online ? finite(snapshot.balances.optionBuyingPower) : null;
  const theoreticalRiskBudget = accountSize * riskPct / 100;
  const theoreticalCollateralBudget = accountSize * maxCollateralPct / 100;
  const maxRiskDollars = optionBuyingPower === null
    ? theoreticalRiskBudget
    : Math.min(theoreticalRiskBudget, Math.max(0, optionBuyingPower));
  const maxCollateralDollars = optionBuyingPower === null
    ? theoreticalCollateralBudget
    : Math.min(theoreticalCollateralBudget, Math.max(0, optionBuyingPower));
  const optionRequirement = online ? finite(snapshot.balances.optionRequirement, 0) : null;
  const currentRequirement = online ? finite(snapshot.balances.currentRequirement, 0) : null;
  const requirement = Math.max(optionRequirement || 0, currentRequirement || 0);
  const brokerCollateralPct = online && accountSize > 0 ? requirement / accountSize * 100 : null;
  const closePl = online ? finite(snapshot.balances.closePl, 0) : 0;
  const brokerDailyLossPct = online && closePl < 0 && accountSize > 0 ? Math.abs(closePl) / accountSize * 100 : 0;
  const activeSymbols = online ? snapshot.activeSymbols : (storedProfile.activeSymbols || []);
  const holdings = online ? snapshot.holdings : (storedProfile.holdings || {});
  return {
    ...storedProfile,
    accountSize: round(accountSize),
    riskPct: round(riskPct),
    maxCollateralPct: round(maxCollateralPct),
    maxRiskDollars: round(maxRiskDollars),
    maxCollateralDollars: round(maxCollateralDollars),
    optionBuyingPower: round(optionBuyingPower),
    cashAvailable: online ? round(snapshot.balances.cashAvailable ?? snapshot.balances.totalCash) : null,
    holdings,
    activeSymbols,
    openPositionCount: online ? snapshot.positions.length : activeSymbols.length,
    collateralUsedPct: brokerCollateralPct === null
      ? finite(storedProfile.collateralUsedPct, 0)
      : round(Math.max(finite(storedProfile.collateralUsedPct, 0), brokerCollateralPct)),
    dailyLossPct: round(Math.max(finite(storedProfile.dailyLossPct, 0), brokerDailyLossPct)),
    limitsSource: online && syncLimitsFromEnv ? 'render_env_and_tradier' : 'stored_profile',
    capitalSource: online ? (paperTrading ? 'tradier_paper' : 'tradier_live') : 'configured_fallback',
    accountSync: {
      status: online ? 'ONLINE' : snapshot?.status || 'NOT_CONFIGURED',
      source: online ? (paperTrading ? 'Tradier Sandbox' : 'Tradier read-only') : 'Configured fallback',
      accountIdMasked: snapshot?.accountIdMasked || null,
      accountType: snapshot?.accountType || null,
      totalEquity: online ? round(snapshot.balances.totalEquity) : null,
      totalCash: online ? round(snapshot.balances.totalCash) : null,
      optionBuyingPower: online ? round(snapshot.balances.optionBuyingPower) : null,
      openPl: online ? round(snapshot.balances.openPl) : null,
      closePl: online ? round(snapshot.balances.closePl) : null,
      marginCall: Boolean(snapshot?.balances?.marginCall),
      pendingOrdersCount: online ? snapshot.balances.pendingOrdersCount : null,
      positionCount: online ? snapshot.positions.length : null,
      asOf: snapshot?.asOf || null,
      readOnly: !paperTrading,
      paperTrading,
      error: snapshot?.error || null
    }
  };
}

export function positionSizeForSetup(setup = {}, profile = {}) {
  const maxRisk = finite(setup.maxRisk);
  const collateral = finite(setup.collateralRequired, maxRisk);
  const riskBudget = finite(profile.maxRiskDollars, finite(profile.accountSize, 0) * finite(profile.riskPct, 0) / 100);
  const collateralBudget = finite(profile.maxCollateralDollars, finite(profile.accountSize, 0) * finite(profile.maxCollateralPct, 0) / 100);
  if (!maxRisk || maxRisk <= 0 || riskBudget <= 0) return 0;
  const byRisk = Math.floor(riskBudget / maxRisk);
  const byCollateral = collateral && collateral > 0 ? Math.floor(collateralBudget / collateral) : byRisk;
  return Math.max(0, Math.min(byRisk, byCollateral));
}
