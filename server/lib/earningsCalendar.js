// Mock earnings data for key symbols
const MOCK_EARNINGS = {
  AAPL: { date: "2026-07-30", daysUntil: 60 },
  MSFT: { date: "2026-07-22", daysUntil: 52 },
  NVDA: { date: "2026-08-21", daysUntil: 82 },
  AMZN: { date: "2026-07-31", daysUntil: 61 },
  META: { date: "2026-07-30", daysUntil: 60 },
  GOOGL: { date: "2026-07-29", daysUntil: 59 },
  TSLA: { date: "2026-07-22", daysUntil: 52 },
  JPM: { date: "2026-07-14", daysUntil: 44 },
  BAC: { date: "2026-07-15", daysUntil: 45 },
  AMD: { date: "2026-07-29", daysUntil: 59 },
  SOFI: { date: "2026-07-29", daysUntil: 59 },
  NFLX: { date: "2026-07-17", daysUntil: 47 },
  COST: { date: "2026-09-24", daysUntil: 114 },
  MCD: { date: "2026-07-24", daysUntil: 54 },
  SPY: { date: null, daysUntil: null },
  QQQ: { date: null, daysUntil: null },
  IWM: { date: null, daysUntil: null },
  DIA: { date: null, daysUntil: null }
};

export function getEarningsRisk(symbol) {
  const earnings = MOCK_EARNINGS[symbol?.toUpperCase()];
  if (!earnings || !earnings.daysUntil) return { risk: "CLEAR", daysUntil: null, nextEarningsDate: null };

  const daysUntil = earnings.daysUntil;

  if (daysUntil <= 2) return { risk: "BLOCK", daysUntil, nextEarningsDate: earnings.date, reason: `Earnings en ${daysUntil} día(s). Bloqueo de venta de prima.` };
  if (daysUntil <= 5) return { risk: "HIGH", daysUntil, nextEarningsDate: earnings.date, reason: `Earnings en ${daysUntil} días. Precaución con venta de prima.` };
  if (daysUntil <= 10) return { risk: "WATCH", daysUntil, nextEarningsDate: earnings.date, reason: `Earnings en ${daysUntil} días.` };

  return { risk: "CLEAR", daysUntil, nextEarningsDate: earnings.date, reason: `${daysUntil} días hasta earnings.` };
}