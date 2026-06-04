function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function analyzePositionRisk(position = {}, market = {}) {
  const symbol = String(position.symbol || position.underlying || '').toUpperCase();
  const quote = list(market.quotes).find((item) => item.symbol === symbol);
  const price = number(quote?.price ?? position.currentPrice ?? position.mark);
  const entry = number(position.realEntry ?? position.plannedEntry ?? position.entryPrice ?? position.entry);
  const pnl = number(position.pnl ?? position.openPnL, entry !== null && price !== null ? Number((price - entry).toFixed(2)) : null);
  const stopText = String(position.plannedExit || position.stopLoss || '');
  const stop = number(stopText.match(/(\d+\.?\d*)/)?.[1]);
  const dte = position.expiration ? Math.ceil((new Date(`${position.expiration}T16:00:00`).getTime() - Date.now()) / 86400000) : null;
  const lossPct = entry && pnl !== null ? (pnl / Math.abs(entry)) * 100 : null;
  const nearStop = stop !== null && price !== null && price <= stop * 1.05;
  const urgentDte = dte !== null && dte <= 2;
  let health = 'HEALTHY';
  let action = 'MANTENER';
  let urgency = 'LOW';
  const reasons = [];
  if (dte !== null && dte < 0) {
    health = 'EXPIRED_OR_INVALID';
    action = 'REVISAR_MANUAL';
    urgency = 'HIGH';
    reasons.push('Position is expired or invalid.');
  } else if (nearStop || (lossPct !== null && lossPct <= -50)) {
    health = 'CRITICAL_RISK';
    action = 'REDUCIR_RIESGO';
    urgency = 'HIGH';
    reasons.push('Position is near stop or loss is critical.');
  } else if (urgentDte && pnl !== null && pnl < 0) {
    health = 'ROLL_CANDIDATE';
    action = 'ROLLEAR';
    urgency = 'MEDIUM';
    reasons.push('Short DTE with negative P/L increases gamma risk.');
  } else if (pnl !== null && entry && pnl / Math.abs(entry) >= 0.5) {
    health = 'TAKE_PROFIT';
    action = 'TOMAR_GANANCIA';
    urgency = 'MEDIUM';
    reasons.push('Profit target zone reached.');
  } else if (urgentDte) {
    health = 'WATCH';
    action = 'REVISAR_MANUAL';
    urgency = 'MEDIUM';
    reasons.push('Low DTE requires active monitoring.');
  }
  return {
    id: position.id || `${symbol}-${position.strategy || 'position'}`,
    symbol,
    strategy: position.strategy || 'Manual position',
    source: position.source || 'manual',
    health,
    status: health === 'CRITICAL_RISK' ? 'CRITICAL_RISK' : 'MANAGE_POSITION',
    action,
    urgency,
    reason: reasons[0] || 'Position is within current risk limits.',
    currentRisk: {
      openPnL: pnl,
      openPnLPct: lossPct === null ? null : Number(lossPct.toFixed(2)),
      dte,
      currentPrice: price,
      stop,
      assignmentRisk: urgentDte ? 'MEDIUM' : 'LOW',
      liquidityRisk: 'UNKNOWN'
    },
    greeks: {
      netDelta: number(position.delta),
      netGamma: number(position.gamma),
      netTheta: number(position.theta),
      netVega: number(position.vega)
    },
    plan: {
      primary: action,
      explanation: reasons[0] || 'Maintain and monitor price, Greeks, earnings, liquidity and invalidation.',
      steps: action === 'ROLLEAR'
        ? ['Buy to close current short leg', 'Sell to close current long leg', 'Open new defined-risk spread 7-14 DTE beyond support/resistance']
        : ['Recheck mark, bid/ask, news, earnings and risk before any manual action'],
      doNotRollIf: ['Roll requires large debit', 'Technical support/resistance failed with volume', 'High-impact macro event is imminent']
    }
  };
}

export function analyzePortfolioRisk({ positions = [], market = {} } = {}) {
  const analyzed = positions.map((position) => analyzePositionRisk(position, market));
  const critical = analyzed.filter((item) => item.health === 'CRITICAL_RISK');
  return {
    ok: true,
    status: critical.length ? 'CRITICAL_RISK' : analyzed.length ? 'MANAGE_POSITION' : 'NO_OPEN_POSITIONS',
    positions: analyzed,
    summary: {
      total: analyzed.length,
      critical: critical.length,
      manage: analyzed.filter((item) => item.status === 'MANAGE_POSITION').length
    }
  };
}
