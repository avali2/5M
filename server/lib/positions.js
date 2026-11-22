/**
 * 5M · Posiciones abiertas del bot: marca actual, P/L, tiempo y qué hacer.
 * Usa la cadena actual para repreciar las patas con Black-Scholes.
 */
import { structureValue, atmIvFor } from './optionsMath.js';

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const round2 = (value) => (isNum(value) ? Math.round(value * 100) / 100 : null);

function chainFor(snapshot, expiration) {
  if (!snapshot?.chains) return [];
  if (expiration && snapshot.chains[expiration]) return snapshot.chains[expiration];
  const first = (snapshot.expirations || [])[0];
  return first ? snapshot.chains[first] || [] : [];
}

function legIv(chain, leg, fallback) {
  const match = chain.find((option) => option.type === leg.type && Math.abs(option.strike - leg.strike) < 0.001);
  return isNum(match?.iv) && match.iv > 0.02 ? match.iv : fallback;
}

function daysLeft(expiration, now) {
  if (!expiration) return null;
  const parsed = Date.parse(`${expiration}T21:00:00Z`);
  return Number.isFinite(parsed) ? Math.round((parsed - now.getTime()) / 86400000) : null;
}

export function analyzePositions({ trades = [], snapshots = {}, now = new Date() } = {}) {
  const positions = [];
  for (const trade of trades) {
    const plan = trade.plan || {};
    const symbol = plan.root || plan.underlying || plan.symbol || '—';
    const expiration = plan.expiration || plan.expiry || null;
    const dte = daysLeft(expiration, now);
    const snapshot = snapshots[symbol] || null;
    const spot = snapshot?.quote?.price ?? null;
    const chain = chainFor(snapshot, expiration);
    const fallbackIv = atmIvFor({ chain, spot }) || 0.3;
    const rawLegs = plan.legs || [];
    const legs = rawLegs.map((leg) => ({
      type: leg.type,
      strike: leg.strike,
      action: leg.direction === -1 || leg.action === 'SELL' ? 'SELL' : 'BUY',
      quantity: 1,
      iv: legIv(chain, leg, fallbackIv)
    }));
    const credit = isNum(trade.entry_credit) ? trade.entry_credit : isNum(plan.credit) ? plan.credit : null;
    const maxProfit = isNum(credit) ? round2(credit * 100) : null;
    const width = isNum(plan.width) ? plan.width : null;
    const maxLoss = isNum(width) && isNum(credit) ? round2((width - credit) * 100) : null;
    const value = legs.length && isNum(spot) && isNum(dte) ? structureValue({ legs, spot, dte }) : null;
    const pnlUsd = isNum(value) && isNum(credit) ? round2((credit * 100 + value)) : null;
    const pnlPct = isNum(pnlUsd) && isNum(maxProfit) && maxProfit > 0 ? round2((pnlUsd / maxProfit) * 100) : null;
    const shorts = legs.filter((leg) => leg.action === 'SELL');
    const shortLeg = shorts[0] || null;
    const shortItm = shortLeg && isNum(spot)
      ? (shortLeg.type === 'call' ? spot > shortLeg.strike : spot < shortLeg.strike)
      : false;
    const distancePct = shortLeg && isNum(spot) && spot > 0
      ? round2(((shortLeg.type === 'call' ? shortLeg.strike - spot : spot - shortLeg.strike) / spot) * 100)
      : null;
    let action = 'MANTENER';
    let priority = 'BAJA';
    if (shortItm) { action = 'ATENCIÓN: strike corto ITM, evaluar cierre o rolado'; priority = 'ALTA'; }
    else if (isNum(dte) && dte <= 2) { action = 'CERRAR por vencimiento (evitar asignación)'; priority = 'ALTA'; }
    else if (isNum(pnlUsd) && isNum(credit) && pnlUsd <= -credit * 100) { action = 'CERRAR por stop (2x crédito)'; priority = 'ALTA'; }
    else if (isNum(pnlPct) && pnlPct >= 50) { action = 'CERRAR: objetivo del 50% alcanzado'; priority = 'MEDIA'; }
    else if (isNum(dte) && dte <= 7) { action = 'Vigilar: cierre por tiempo en ≤ 7 días'; priority = 'MEDIA'; }
    positions.push({
      id: trade.id,
      symbol,
      strategy: plan.strategy || plan.name || 'SPREAD',
      expiration,
      dte,
      state: trade.state,
      credit: round2(credit),
      maxProfitUsd: maxProfit,
      maxLossUsd: maxLoss,
      markValueUsd: isNum(value) ? round2(-value) : null,
      pnlUsd,
      pnlPct,
      spot: round2(spot),
      distanceToShortPct: distancePct,
      shortStrike: shortLeg?.strike ?? null,
      shortType: shortLeg?.type ?? null,
      shortItm,
      action,
      priority,
      note: trade.note || '',
      legsCount: legs.length
    });
  }
  const open = positions.filter((position) => ['OPEN', 'EXIT_PENDING', 'ENTRY_PENDING'].includes(String(position.state || '').toUpperCase()));
  const totalPnl = positions.reduce((sum, position) => sum + (isNum(position.pnlUsd) ? position.pnlUsd : 0), 0);
  const alerts = positions.filter((position) => position.priority === 'ALTA');
  return {
    generatedAt: now.toISOString(),
    positions,
    summary: {
      total: positions.length,
      open: open.length,
      totalPnlUsd: round2(totalPnl),
      alerts: alerts.length,
      win: positions.filter((position) => isNum(position.pnlUsd) && position.pnlUsd > 0).length,
      loss: positions.filter((position) => isNum(position.pnlUsd) && position.pnlUsd < 0).length
    },
    alerts: alerts.map((position) => `${position.symbol}: ${position.action}`)
  };
}
