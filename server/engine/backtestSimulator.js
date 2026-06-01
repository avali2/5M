import { round } from './math.js';

/**
 * Simulates a signal's outcome using price history.
 * Entry: opening price on the day after signal.
 * Exit: according to rules (take profit 40%, stop loss 80% of max risk, or at expiration).
 */
export function simulateSignal(signal, priceHistory) {
  if (!priceHistory || priceHistory.length < 2) {
    return { pnl: 0, pnlPercent: 0, wasProfitable: false, exitDate: signal.expiration || new Date().toISOString().slice(0, 10), exitPrice: signal.spot || 0 };
  }

  const entryBar = priceHistory[0];
  const entryPrice = entryBar?.close || signal.spot || 0;
  const maxRisk = signal.maxRisk || signal.maxLoss || 100;
  const maxProfit = signal.maxProfit || 50;
  const isCredit = (signal.credit || 0) > 0;

  const takeProfitTarget = isCredit ? maxProfit * 0.40 : maxProfit * 0.50;
  const stopLossTarget = isCredit ? maxRisk * 0.80 : maxRisk * 0.50;

  let exitPrice = entryPrice;
  let exitDate = signal.expiration || priceHistory[priceHistory.length - 1]?.date || new Date().toISOString().slice(0, 10);

  for (let i = 1; i < priceHistory.length; i++) {
    const bar = priceHistory[i];
    const close = bar?.close || exitPrice;

    if (isCredit) {
      const profitEstimate = (entryPrice - close) * 100;
      const lossEstimate = (close - entryPrice) * 100;
      if (profitEstimate >= takeProfitTarget) {
        exitPrice = close;
        exitDate = bar.date;
        break;
      }
      if (lossEstimate >= stopLossTarget) {
        exitPrice = close;
        exitDate = bar.date;
        break;
      }
    } else {
      const profitEstimate = (close - entryPrice) * 100;
      const lossEstimate = (entryPrice - close) * 100;
      if (profitEstimate >= takeProfitTarget) {
        exitPrice = close;
        exitDate = bar.date;
        break;
      }
      if (lossEstimate >= stopLossTarget) {
        exitPrice = close;
        exitDate = bar.date;
        break;
      }
    }
  }

  const pnl = isCredit
    ? (entryPrice - exitPrice) * 100
    : (exitPrice - entryPrice) * 100;

  const pnlPercent = maxRisk > 0 ? round(pnl / maxRisk * 100, 2) : 0;
  const wasProfitable = pnl > 0;

  return { pnl: round(pnl, 2), pnlPercent, wasProfitable, exitDate, exitPrice: round(exitPrice, 2) };
}