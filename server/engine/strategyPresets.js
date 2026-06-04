export const STRATEGY_PRESETS = Object.freeze({
  CREDIT_SPREAD_7_45_DTE: {
    id: 'CREDIT_SPREAD_7_45_DTE',
    label: 'Credit Spreads 7-45 DTE',
    strategies: ['Bull Put Spread', 'Bear Call Spread'],
    dte: { min: 7, max: 45 },
    shortDelta: { min: 0.15, max: 0.30 },
    minPopReady: 60,
    creditWidthRatio: { ideal: 25, acceptable: 18 },
    takeProfitCreditPct: [40, 60],
    stopLossCreditMultiple: [1.5, 2],
    avoidEarningsWithinDays: 7,
    maxRiskPct: 2,
    prioritySymbols: ['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AMD']
  },
  INDEX_0DTE_1DTE: {
    id: 'INDEX_0DTE_1DTE',
    label: '0DTE / 1DTE Indices',
    symbols: ['SPY', 'QQQ', 'XSP', 'SPX'],
    dte: { min: 0, max: 1 },
    paperFirst: true,
    preferredWindowsET: ['10:00-11:30', '13:30-15:15'],
    requiresStop: true,
    blocksNearMacro: ['CPI', 'FOMC', 'NFP', 'PCE']
  },
  DEBIT_SPREAD_MOMENTUM: {
    id: 'DEBIT_SPREAD_MOMENTUM',
    label: 'Debit Spreads Momentum',
    strategies: ['Bull Call Debit Spread', 'Bear Put Debit Spread'],
    minRiskReward: 1.3,
    stopLossDebitPct: [40, 50],
    takeProfitDebitPct: [50, 100]
  },
  WHEEL_CSP_COVERED_CALL: {
    id: 'WHEEL_CSP_COVERED_CALL',
    label: 'Wheel / CSP / Covered Call',
    strategies: ['Cash Secured Put', 'Covered Call'],
    shortDelta: { min: 0.15, max: 0.30 },
    preferredIvRankMin: 20,
    requiresOwnershipAcceptance: true
  },
  PMCC: {
    id: 'PMCC',
    label: 'Poor Mans Covered Call',
    longDelta: { min: 0.70, max: 0.85 },
    shortDelta: { min: 0.15, max: 0.30 },
    avoidShortCallBeforeEarnings: true
  }
});

export function presetForStrategy(strategy = '', symbol = '', dte = null) {
  const name = String(strategy);
  if (/Bull Put|Bear Call|Credit Spread/i.test(name)) return STRATEGY_PRESETS.CREDIT_SPREAD_7_45_DTE;
  if ((Number(dte) <= 1) && ['SPY', 'QQQ', 'XSP', 'SPX'].includes(String(symbol).toUpperCase())) return STRATEGY_PRESETS.INDEX_0DTE_1DTE;
  if (/Debit Spread|Bull Call|Bear Put/i.test(name)) return STRATEGY_PRESETS.DEBIT_SPREAD_MOMENTUM;
  if (/Cash Secured Put|Covered Call|Wheel/i.test(name)) return STRATEGY_PRESETS.WHEEL_CSP_COVERED_CALL;
  if (/PMCC|Diagonal|Poor Mans/i.test(name)) return STRATEGY_PRESETS.PMCC;
  return null;
}
