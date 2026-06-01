import { getCurrentSession, isTradingAllowed } from '../lib/marketSessionClock.js';
import { getEarningsRisk } from '../lib/earningsCalendar.js';

export function evaluateEntryTiming(ticket) {
  const session = getCurrentSession();
  const trading = isTradingAllowed(ticket.strategy, ticket.dte, session);

  if (!trading.allowed) {
    return { allowed: false, reason: trading.reason };
  }

  const earnings = getEarningsRisk(ticket.symbol);
  if (earnings.risk === "BLOCK") {
    if (/credit|bull put|bear call|csp|covered call|wheel|iron condor|butterfly/i.test(ticket.strategy)) {
      return { allowed: false, reason: earnings.reason };
    }
  }

  // VWAP chase check
  if (ticket.technicals?.vwap && ticket.technicals?.atr14) {
    const price = ticket.spot || ticket.technicals.price;
    if (price && Math.abs(price - ticket.technicals.vwap) > ticket.technicals.atr14 * 2) {
      return { allowed: false, reason: `Precio lejos de VWAP: ${price} vs ${ticket.technicals.vwap}. NO_CHASE.` };
    }
  }

  // Bid/ask spread check
  if (ticket.optionsQuality?.score && ticket.optionsQuality.score < 50) {
    return { allowed: false, reason: "Calidad de opciones insuficiente (bid/ask spread amplio o baja liquidez)." };
  }

  return {
    allowed: true,
    reason: "ENTRY_OK",
    context: { session, earningsRisk: earnings.risk, daysUntilEarnings: earnings.daysUntil }
  };
}