import { setupSignalKey } from './tradierOrders.js';

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

export function capitalBand(accountSize = 0) {
  const equity = Math.max(0, finite(accountSize, 0));
  if (equity < 1000) return { id: 'MICRO', label: 'Micro', focus: 'Debit spreads y verticales de riesgo muy pequeno.' };
  if (equity < 5000) return { id: 'SMALL', label: 'Pequena', focus: 'Verticales definidos; una posicion a la vez.' };
  if (equity < 25000) return { id: 'GROWTH', label: 'Crecimiento', focus: 'Verticales, condors selectivos y diversificacion limitada.' };
  return { id: 'ESTABLISHED', label: 'Establecida', focus: 'Portafolio definido por regimen y eficiencia de capital.' };
}

function strategyAllowed(strategy, band) {
  const name = String(strategy || '');
  if (/naked|short straddle|short strangle|ratio/i.test(name)) return false;
  if (band === 'MICRO' && /Iron Condor|Cash Secured|Covered Call|PMCC|Calendar|Diagonal/i.test(name)) return false;
  if (band === 'SMALL' && /Cash Secured|Covered Call|PMCC|Calendar|Diagonal/i.test(name)) return false;
  return true;
}

function validOptionLegs(setup = {}) {
  const legs = Array.isArray(setup.legs) ? setup.legs : [];
  if (legs.length === 1 && /sell|short/i.test(String(legs[0].side || ''))) return false;
  return legs.length >= 1 && legs.length <= 4 && legs.every((leg) =>
    /^[A-Z0-9./-]{1,6}\d{6}[CP]\d{8}$/.test(String(leg.symbol || '').toUpperCase().replaceAll(' ', ''))
  );
}

export function selectBestStrategyForCapital({ scan = {}, profile = scan.profile || {}, settings = {}, recentOrders = [], learning = {} } = {}) {
  const accountSize = Math.max(0, finite(profile.accountSize, 0));
  const band = capitalBand(accountSize);
  const riskBudget = Math.max(0, finite(profile.maxRiskDollars, accountSize * finite(settings.maxRiskPct, 1) / 100));
  const collateralBudget = Math.max(0, finite(profile.maxCollateralDollars, profile.optionBuyingPower));
  const optionBuyingPower = Math.max(0, finite(profile.optionBuyingPower, collateralBudget));
  const minScore = finite(settings.minScore, 75);
  const minPop = finite(settings.minPop, 60);
  const minLiquidityScore = finite(settings.minLiquidityScore, 6);
  const minDte = settings.allow1Dte ? 1 : 2;
  const maxContracts = Math.max(1, Math.floor(finite(settings.maxContracts, 1)));
  const openCount = Math.max(0, finite(profile.openPositionCount, 0));
  const maxOpenPositions = Math.max(1, Math.floor(finite(settings.maxOpenPositions, 3)));
  const activeSymbols = new Set(Array.isArray(profile.activeSymbols) ? profile.activeSymbols : []);
  const strategyLearning = new Map((Array.isArray(learning.strategies) ? learning.strategies : []).map((item) => [item.strategy, item]));
  const blockers = [];
  if (openCount >= maxOpenPositions) blockers.push(`Paper account already has ${openCount}/${maxOpenPositions} open positions.`);
  if (profile.accountSync?.marginCall) blockers.push('Tradier Sandbox reports a margin call.');
  if (riskBudget <= 0 || optionBuyingPower <= 0) blockers.push('No paper option buying power is available.');

  const scored = (Array.isArray(scan.opportunities) ? scan.opportunities : [])
    .filter((setup) => setup.status === 'READY_GREEN')
    .filter((setup) => finite(setup.dte, -1) >= minDte)
    .filter((setup) => !activeSymbols.has(setup.symbol))
    .filter((setup) => strategyAllowed(setup.strategy, band.id))
    .filter(validOptionLegs)
    .map((setup) => {
      const maxRisk = Math.max(0, finite(setup.maxRisk, 0));
      const collateral = Math.max(maxRisk, finite(setup.collateralRequired, maxRisk));
      const byRisk = maxRisk > 0 ? Math.floor(riskBudget / maxRisk) : 0;
      const byCollateral = collateral > 0 ? Math.floor(Math.min(collateralBudget, optionBuyingPower) / collateral) : 0;
      const contracts = Math.max(0, Math.min(maxContracts, byRisk, byCollateral, finite(setup.positionSizeContracts, maxContracts)));
      const score = finite(setup.confidenceScore ?? setup.score, 0);
      const pop = finite(setup.pop, 0);
      const liquidity = finite(setup.liquidityScore, 0);
      const returnOnRisk = maxRisk > 0 ? finite(setup.maxProfit, 0) / maxRisk * 100 : 0;
      const repeated = recentOrders.some((order) => order.symbol === setup.symbol && order.strategy === setup.strategy);
      const learned = strategyLearning.get(setup.strategy);
      const learnedAdjustment = finite(learned?.closed, 0) >= 5
        ? Math.max(-8, Math.min(4, (finite(learned.winRate, 50) - 50) * 0.16 + (finite(learned.pnl, 0) >= 0 ? 1 : -2)))
        : 0;
      const rank = score * 0.52 + pop * 0.23 + liquidity * 2 + Math.min(25, returnOnRisk) * 0.2 - (repeated ? 8 : 0) + learnedAdjustment;
      return { setup, contracts, score, pop, liquidity, returnOnRisk, rank, maxRisk, collateral, repeated, learnedAdjustment };
    })
    .filter((item) => item.contracts >= 1 && item.score >= minScore && item.pop >= minPop && item.liquidity >= minLiquidityScore && item.maxRisk > 0)
    .sort((left, right) => right.rank - left.rank || left.maxRisk - right.maxRisk);

  const selected = blockers.length ? null : scored[0] || null;
  return {
    ok: Boolean(selected),
    capitalBand: band,
    accountSize: round(accountSize),
    optionBuyingPower: round(optionBuyingPower),
    riskBudget: round(riskBudget),
    collateralBudget: round(collateralBudget),
    evaluated: scored.length,
    blockers: selected ? [] : blockers.length ? blockers : ['No READY_GREEN setup fits paper capital, POP, score, DTE and liquidity rules.'],
    recommendation: selected ? {
      signalKey: setupSignalKey(selected.setup),
      symbol: selected.setup.symbol,
      strategy: selected.setup.strategy,
      expiration: selected.setup.expiration,
      dte: selected.setup.dte,
      contracts: selected.contracts,
      score: round(selected.score, 1),
      pop: round(selected.pop, 1),
      liquidityScore: round(selected.liquidity, 1),
      returnOnRisk: round(selected.returnOnRisk, 1),
      maxRiskPerContract: round(selected.maxRisk),
      totalMaxRisk: round(selected.maxRisk * selected.contracts),
      maxProfitPerContract: round(finite(selected.setup.maxProfit, 0)),
      limitPrice: finite(selected.setup.limitPrice ?? selected.setup.credit ?? selected.setup.debit),
      premiumType: selected.setup.creditDebit?.type || (finite(selected.setup.credit) ? 'credit' : 'debit'),
      repeatedSetupPenalty: selected.repeated,
      learnedAdjustment: round(selected.learnedAdjustment, 1),
      reasons: [
        `${band.label}: ${band.focus}`,
        `Score ${round(selected.score, 1)} and modeled POP ${round(selected.pop, 1)}%.`,
        `Maximum modeled loss ${round(selected.maxRisk * selected.contracts)} fits the ${round(riskBudget)} paper risk budget.`,
        `Aggressive paper mandate: minimum liquidity ${minLiquidityScore}/10 and ${minDte}+ DTE.`,
        'Limit order only; preview and Sandbox buying-power validation are mandatory.'
      ],
      setup: selected.setup
    } : null
  };
}
