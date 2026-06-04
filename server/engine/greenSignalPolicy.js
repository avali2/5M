export const SIGNAL_STATUSES = Object.freeze({
  DATA_ERROR: 'DATA_ERROR',
  BLOCKED: 'BLOCKED',
  WATCHLIST: 'WATCHLIST',
  CANDIDATE: 'CANDIDATE',
  READY_GREEN: 'READY_GREEN',
  MANAGE_POSITION: 'MANAGE_POSITION',
  CRITICAL_RISK: 'CRITICAL_RISK'
});

const CREDIT_STRATEGY = /(Credit Spread|Bull Put|Bear Call|Iron Condor|Iron Fly|Cash Secured Put|Covered Call)/i;

function finite(value) {
  return Number.isFinite(Number(value));
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function hasQuotedLegs(setup = {}) {
  const legs = list(setup.legs);
  return legs.length >= 2 && legs.every((leg) =>
    finite(leg.strike) &&
    finite(leg.bid) &&
    finite(leg.ask) &&
    Number(leg.ask) >= Number(leg.bid)
  );
}

function creditOrDebit(setup = {}) {
  if (finite(setup.credit)) return { type: 'credit', value: Number(setup.credit) };
  if (finite(setup.debit)) return { type: 'debit', value: Number(setup.debit) };
  if (finite(setup.netCredit)) return { type: 'credit', value: Number(setup.netCredit) };
  if (finite(setup.netDebit)) return { type: 'debit', value: Number(setup.netDebit) };
  return { type: 'unknown', value: null };
}

function breakevenFor(setup = {}) {
  if (setup.breakEven || setup.breakeven) return setup.breakEven || setup.breakeven;
  const amount = creditOrDebit(setup).value;
  const legs = list(setup.legs);
  const short = legs.find((leg) => /sell|short/i.test(String(leg.side || '')));
  if (!short || !finite(short.strike) || !finite(amount)) return null;
  if (short.type === 'put') return Number((Number(short.strike) - amount).toFixed(2));
  if (short.type === 'call') return Number((Number(short.strike) + amount).toFixed(2));
  return null;
}

function shortLongGreeks(setup = {}) {
  const legs = list(setup.legs);
  return {
    shortDelta: legs.find((leg) => /sell|short/i.test(String(leg.side || '')))?.delta ?? null,
    longDelta: legs.find((leg) => /buy|long/i.test(String(leg.side || '')))?.delta ?? null,
    theta: legs.reduce((sum, leg) => sum + (finite(leg.theta) ? Number(leg.theta) : 0), 0),
    vega: legs.reduce((sum, leg) => sum + (finite(leg.vega) ? Number(leg.vega) : 0), 0),
    gamma: legs.reduce((sum, leg) => sum + (finite(leg.gamma) ? Number(leg.gamma) : 0), 0)
  };
}

export function criticalDataIssues(setup = {}) {
  const issues = [];
  if (!setup.symbol) issues.push('symbol');
  if (!setup.strategy) issues.push('strategy');
  if (!setup.expiration) issues.push('expiration');
  if (!finite(setup.dte)) issues.push('dte');
  if (!hasQuotedLegs(setup)) issues.push('quoted option legs');
  if (!setup.strikes && !list(setup.legs).every((leg) => finite(leg.strike))) issues.push('strikes');
  if (!finite(creditOrDebit(setup).value)) issues.push('limit credit/debit');
  if (!finite(setup.maxRisk) || Number(setup.maxRisk) <= 0) issues.push('max risk');
  if (!finite(setup.maxProfit)) issues.push('max profit');
  if (!finite(setup.liquidityScore)) issues.push('liquidity score');
  return issues;
}

export function classifyGreenSignal(setup = {}, { settings = {}, profile = null, globalBlocks = [] } = {}) {
  const policy = settings.policy || {};
  const signals = settings.signals || {};
  const green = settings.greenSignals || {};
  const dataIssues = criticalDataIssues(setup);
  if (dataIssues.length) {
    return { status: SIGNAL_STATUSES.DATA_ERROR, reasons: dataIssues.map((item) => `Missing critical data: ${item}`) };
  }

  const accountSize = Number(profile?.accountSize ?? policy.accountSize ?? 2000);
  const riskPct = Number(profile?.riskPct ?? policy.riskPct ?? 2);
  const maxCollateralPct = Number(profile?.maxCollateralPct ?? policy.maxCollateralPct ?? 35);
  const maxRisk = Number(setup.maxRisk);
  const collateral = Number(setup.collateralRequired ?? setup.maxRisk ?? 0);
  const dte = Number(setup.dte);
  const pop = Number(setup.pop ?? setup.edge?.probabilityOfProfit ?? 0);
  const score = Number(setup.confidenceScore ?? setup.tradeQualityScore ?? setup.score ?? 0);
  const maxBidAskPct = Number(policy.maxBidAskPct ?? 0.2);
  const maxSpreadIssue = list(setup.legs).some((leg) => {
    const bid = Number(leg.bid);
    const ask = Number(leg.ask);
    const mid = (bid + ask) / 2;
    return Number.isFinite(mid) && mid > 0 && ((ask - bid) / mid) > maxBidAskPct;
  });
  const hardBlocks = [];
  if (globalBlocks.length) hardBlocks.push(...globalBlocks);
  if (maxRisk > accountSize * riskPct / 100) hardBlocks.push(`Max risk ${maxRisk} exceeds ${riskPct}% account risk budget`);
  if (collateral > accountSize * maxCollateralPct / 100) hardBlocks.push(`Collateral ${collateral} exceeds ${maxCollateralPct}% account cap`);
  if (maxSpreadIssue) hardBlocks.push('Bid/ask spread exceeds hard limit');
  if (dte < 0) hardBlocks.push('Expiration is invalid or expired');
  if (dte <= 1 && !policy.allow0Dte && !profile?.allow0Dte) hardBlocks.push('0DTE/1DTE not allowed by risk mandate');
  if (CREDIT_STRATEGY.test(String(setup.strategy)) && list(setup.blocks).some((block) => /earnings|resultados/i.test(block))) {
    hardBlocks.push('Earnings risk blocks short premium');
  }
  if (setup.riskGovernor && setup.riskGovernor.allowedReal === false) {
    hardBlocks.push(...list(setup.riskGovernor.blocks));
  }
  if (hardBlocks.length) return { status: SIGNAL_STATUSES.BLOCKED, reasons: [...new Set(hardBlocks)] };

  const readyScore = Number(green.minReadyScore ?? signals.minReadyScore ?? process.env.MIN_READY_SCORE ?? 72);
  const candidateScore = Number(green.minCandidateScore ?? process.env.MIN_CANDIDATE_SCORE ?? 62);
  const watchlistScore = Number(green.minWatchlistScore ?? process.env.MIN_WATCHLIST_SCORE ?? 50);
  const minPopReady = Number(green.minPopReadyCreditSpread ?? process.env.MIN_POP_READY_CREDIT_SPREAD ?? 60);
  const creditPopOk = !CREDIT_STRATEGY.test(String(setup.strategy)) || pop >= minPopReady;
  if (score >= readyScore && creditPopOk) {
    return { status: SIGNAL_STATUSES.READY_GREEN, reasons: ['Risk approved, critical data complete, score and POP meet READY_GREEN policy'] };
  }
  if (score >= candidateScore) return { status: SIGNAL_STATUSES.CANDIDATE, reasons: [`Score ${score} is candidate range`] };
  if (score >= watchlistScore) return { status: SIGNAL_STATUSES.WATCHLIST, reasons: [`Score ${score} is watchlist range`] };
  return { status: SIGNAL_STATUSES.BLOCKED, reasons: [`Score ${score} below watchlist threshold`] };
}

export function enrichSignalForGreenPolicy(setup = {}, context = {}) {
  const classification = classifyGreenSignal(setup, context);
  const greeks = shortLongGreeks(setup);
  const cd = creditOrDebit(setup);
  return {
    ...setup,
    status: classification.status,
    signalStatus: classification.status,
    greenPolicy: classification,
    orderType: 'LIMIT',
    creditDebit: cd,
    limitPrice: cd.value,
    breakeven: breakevenFor(setup),
    breakEven: breakevenFor(setup),
    shortDelta: greeks.shortDelta,
    longDelta: greeks.longDelta,
    theta: Number(greeks.theta.toFixed(4)),
    vega: Number(greeks.vega.toFixed(4)),
    gamma: Number(greeks.gamma.toFixed(4)),
    takeProfit: setup.takeProfit || (cd.type === 'credit' && finite(cd.value) ? `Take profit at 40%-60% of credit (${Number((cd.value * 0.4).toFixed(2))}-${Number((cd.value * 0.6).toFixed(2))})` : 'Take profit at planned technical target'),
    stopLoss: setup.stopLoss || (cd.type === 'credit' && finite(cd.value) ? `Stop at 1.5x-2x credit (${Number((cd.value * 1.5).toFixed(2))}-${Number((cd.value * 2).toFixed(2))})` : 'Stop at 40%-50% debit loss or invalidation'),
    exitPlan: setup.exitPlan || 'Close or reduce at take-profit, stop-loss, earnings/event risk, or invalidation level.',
    invalidation: setup.invalidation || setup.activationRules?.[0] || 'Invalidate if support/resistance breaks with volume, bid/ask widens, or macro/news risk changes.',
    approvalReason: classification.reasons.join('; ')
  };
}

export function readyGreenSignals(scan = {}) {
  return list(scan.opportunities).filter((signal) => signal.status === SIGNAL_STATUSES.READY_GREEN);
}
