// Earnings calendar — uses PostgreSQL if available, falls back to mock data
import { getNextEarnings } from '../db/historyRepository.js';

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
  MCD: { date: "2026-07-24", daysUntil: 54 }
};

export async function getEarningsRisk(symbol) {
  try {
    const next = await getNextEarnings(symbol?.toUpperCase());
    if (next?.earnings_date) {
      const today = new Date();
      const earningsDate = new Date(next.earnings_date);
      const daysUntil = Math.ceil((earningsDate - today) / (1000 * 60 * 60 * 24));

      if (daysUntil <= 2) return { risk: "BLOCK", daysUntil, nextEarningsDate: next.earnings_date, reason: `Earnings en ${daysUntil} día(s). Bloqueo de venta de prima.` };
      if (daysUntil <= 5) return { risk: "HIGH", daysUntil, nextEarningsDate: next.earnings_date, reason: `Earnings en ${daysUntil} días. Precaución.` };
      if (daysUntil <= 10) return { risk: "WATCH", daysUntil, nextEarningsDate: next.earnings_date, reason: `Earnings en ${daysUntil} días.` };
      return { risk: "CLEAR", daysUntil, nextEarningsDate: next.earnings_date, reason: `${daysUntil} días hasta earnings.` };
    }
  } catch { /* fallback to mock */ }

  const mock = MOCK_EARNINGS[symbol?.toUpperCase()];
  if (!mock?.daysUntil) return { risk: "CLEAR", daysUntil: null, nextEarningsDate: null };
  const { daysUntil, date } = mock;
  if (daysUntil <= 2) return { risk: "BLOCK", daysUntil, nextEarningsDate: date, reason: `Earnings en ${daysUntil} día(s).` };
  if (daysUntil <= 5) return { risk: "HIGH", daysUntil, nextEarningsDate: date, reason: `Earnings en ${daysUntil} días.` };
  if (daysUntil <= 10) return { risk: "WATCH", daysUntil, nextEarningsDate: date, reason: `Earnings en ${daysUntil} días.` };
  return { risk: "CLEAR", daysUntil, nextEarningsDate: date, reason: `${daysUntil} días.` };
}