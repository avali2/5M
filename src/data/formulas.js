export const OPTION_FORMULAS = {
  expectedMove: {
    label: 'Expected Move',
    formula: 'underlyingPrice * impliedVolatility * sqrt(DTE / 365)',
    explanation: 'Rango aproximado de una desviacion estandar implicado por IV. No predice gaps ni cambios bruscos de volatilidad.'
  },
  creditSpreadMaxRisk: {
    label: 'Max Risk - Credit Spread',
    formula: '(spreadWidth - creditReceived) * 100 * contracts',
    explanation: 'Riesgo definido si ambas legs permanecen abiertas hasta salida/vencimiento.'
  },
  creditSpreadMaxProfit: {
    label: 'Max Profit - Credit Spread',
    formula: 'creditReceived * 100 * contracts',
    explanation: 'Ganancia maxima teorica antes de comisiones si el spread expira fuera del dinero.'
  },
  debitSpreadMaxRisk: {
    label: 'Max Risk - Debit Spread',
    formula: 'debitPaid * 100 * contracts',
    explanation: 'Perdida maxima teorica del debito pagado.'
  },
  debitSpreadMaxProfit: {
    label: 'Max Profit - Debit Spread',
    formula: '(spreadWidth - debitPaid) * 100 * contracts',
    explanation: 'Ganancia maxima teorica si el spread termina completamente ITM.'
  },
  ironCondorMaxRisk: {
    label: 'Max Risk - Iron Condor',
    formula: '(maxWingWidth - netCredit) * 100 * contracts',
    explanation: 'Usa el ala mas ancha porque solo un lado puede perder completamente al vencimiento.'
  },
  popDeltaApproximation: {
    label: 'POP por Delta',
    formula: 'POP ~= 1 - abs(shortDelta)',
    explanation: 'Aproximacion rapida para opciones OTM. No garantiza resultado; falla con gaps, skew y cambios de IV.'
  },
  evManagedExit: {
    label: 'Expected Value gestionado',
    formula: '(probWin * targetProfit) - ((1 - probWin) * plannedStopLoss)',
    explanation: 'Usa take profit y stop planificados, no solo max profit/max loss.'
  },
  returnOnCapital: {
    label: 'Return on Capital',
    formula: 'maxProfit / collateralRequired',
    explanation: 'Mide prima o ganancia maxima en relacion con el capital bloqueado.'
  }
};
