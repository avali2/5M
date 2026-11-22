/**
 * 5M · Posicionamiento institucional inferido desde la cadena de opciones.
 * GEX/DEX por strike, muros, gamma flip, max pain, movimiento esperado e IV.
 * Todo es inferencia: la cadena no revela identidad ni intención de cada operador.
 */
import { optionChainFor, dteFor } from './marketData.js';
import {
  gammaExposure, deltaExposure, maxPain, maxPainCurve, expectedMove, skew25, atmIvFor, clamp, round2
} from './optionsMath.js';

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

function realizedVolatility(history = [], window = 20) {
  const closes = history.map((bar) => bar?.close).filter(isNum);
  if (closes.length < window + 2) return null;
  const returns = [];
  for (let index = closes.length - window; index < closes.length; index += 1) {
    returns.push(Math.log(closes[index] / closes[index - 1]));
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

export function buildIvProfile(snapshot) {
  if (!snapshot?.quote?.price) return null;
  const spot = snapshot.quote.price;
  const term = [];
  for (const expiration of snapshot.expirations || []) {
    const chain = optionChainFor(snapshot, expiration);
    if (!chain.length) continue;
    const atm = atmIvFor({ chain, spot });
    if (!isNum(atm)) continue;
    term.push({ expiration, dte: dteFor(snapshot, expiration), iv: atm });
  }
  term.sort((left, right) => (left.dte ?? 0) - (right.dte ?? 0));
  const atm = term[0]?.iv ?? null;
  const realized = realizedVolatility(snapshot.history);
  const rvRatio = isNum(atm) && isNum(realized) && realized > 0.01 ? atm / realized : null;
  const verdict = rvRatio === null ? 'SIN_REFERENCIA'
    : rvRatio < 0.88 ? 'FAVORABLE' : rvRatio < 1.15 ? 'NEUTRO' : 'CARO';
  const primary = optionChainFor(snapshot, snapshot.expirations?.[0]);
  const skew = skew25({ chain: primary, spot, dte: dteFor(snapshot, snapshot.expirations?.[0]) });
  const slope = term.length >= 2 && isNum(term[0].iv) && isNum(term[term.length - 1].iv)
    ? term[term.length - 1].iv - term[0].iv : null;
  return {
    atm,
    term,
    realizedVol: realized,
    rvRatio,
    verdict,
    skew25d: skew,
    termSlope: slope,
    label: verdict === 'FAVORABLE' ? 'Prima barata vs volatilidad realizada'
      : verdict === 'CARO' ? 'Prima cara vs volatilidad realizada' : 'Prima en línea con lo realizado'
  };
}

function aggregateByStrike(chain, spot) {
  const map = new Map();
  for (const option of chain) {
    if (!isNum(option.strike)) continue;
    const row = map.get(option.strike) || {
      strike: option.strike, gex: 0, dex: 0, callOi: 0, putOi: 0, callVol: 0, putVol: 0, callGamma: 0, putGamma: 0
    };
    const call = option.type === 'call';
    const oi = isNum(option.openInterest) ? option.openInterest : 0;
    if (oi > 0) {
      if (isNum(option.gamma)) row.gex += gammaExposure({ gamma: option.gamma, openInterest: oi, spot, type: option.type });
      if (isNum(option.delta)) row.dex += deltaExposure({ delta: option.delta, openInterest: oi, type: option.type });
      if (call) { row.callOi += oi; row.callGamma += option.gamma || 0; } else { row.putOi += oi; row.putGamma += option.gamma || 0; }
    }
    if (call) row.callVol += isNum(option.volume) ? option.volume : 0;
    else row.putVol += isNum(option.volume) ? option.volume : 0;
    map.set(option.strike, row);
  }
  return [...map.values()].sort((left, right) => left.strike - right.strike);
}

function findWalls(rows) {
  let callWall = null; let putWall = null; let secondCallWall = null; let secondPutWall = null;
  for (const row of rows) {
    if (row.gex > 0 && (!callWall || row.gex > callWall.gex)) { secondCallWall = callWall; callWall = row; }
    else if (row.gex > 0 && (!secondCallWall || row.gex > secondCallWall.gex)) secondCallWall = row;
    if (row.gex < 0 && (!putWall || row.gex < putWall.gex)) { secondPutWall = putWall; putWall = row; }
    else if (row.gex < 0 && (!secondPutWall || row.gex < secondPutWall.gex)) secondPutWall = row;
  }
  return {
    callWall: callWall?.strike ?? null,
    putWall: putWall?.strike ?? null,
    secondCallWall: secondCallWall?.strike ?? null,
    secondPutWall: secondPutWall?.strike ?? null,
    callWallGex: callWall ? round2(callWall.gex) : null,
    putWallGex: putWall ? round2(putWall.gex) : null
  };
}

function gammaFlipStrike(rows) {
  if (rows.length < 3) return null;
  let cumulative = 0;
  let previous = null;
  for (const row of rows) {
    const next = cumulative + row.gex;
    if (previous !== null && Math.sign(previous) !== Math.sign(next) && Math.sign(previous) !== 0) {
      const ratio = Math.abs(previous) / (Math.abs(previous) + Math.abs(next) || 1);
      return round2(rows[rows.indexOf(row) - 1]?.strike + ratio * (row.strike - (rows[rows.indexOf(row) - 1]?.strike ?? row.strike)));
    }
    previous = next;
    cumulative = next;
  }
  return null;
}

export function buildPositioning({ snapshot, expiration = null } = {}) {
  if (!snapshot?.quote?.price) {
    return { symbol: snapshot?.symbol ?? null, warnings: ['Sin cotización disponible.'], narrative: [], byStrike: [], totals: {}, walls: {}, regime: {}, iv: null, expectedMove: null, maxPainCurve: [] };
  }
  const spot = snapshot.quote.price;
  const chosen = expiration && snapshot.chains?.[expiration] ? expiration : snapshot.expirations?.[0] ?? null;
  const chain = optionChainFor(snapshot, chosen);
  const dte = dteFor(snapshot, chosen);
  const iv = buildIvProfile(snapshot);
  const warnings = [];
  if (!chain.length) warnings.push('La cadena de opciones está vacía para ese vencimiento.');
  const hasGreeks = chain.some((option) => isNum(option.gamma));
  const hasOi = chain.some((option) => isNum(option.openInterest) && option.openInterest > 0);
  if (!hasGreeks) warnings.push('La fuente no entregó Greeks: GEX y DEX quedan en cero.');
  if (!hasOi) warnings.push('Open interest no disponible: muros y max pain no son confiables.');

  const rows = aggregateByStrike(chain, spot);
  const walls = findWalls(rows);
  const pain = maxPain(chain);
  const curve = maxPainCurve(chain);
  const totalGex = rows.reduce((sum, row) => sum + row.gex, 0);
  const totalDex = rows.reduce((sum, row) => sum + row.dex, 0);
  const callOi = rows.reduce((sum, row) => sum + row.callOi, 0);
  const putOi = rows.reduce((sum, row) => sum + row.putOi, 0);
  const callVol = rows.reduce((sum, row) => sum + row.callVol, 0);
  const putVol = rows.reduce((sum, row) => sum + row.putVol, 0);
  const atm = iv?.atm ?? atmIvFor({ chain, spot });
  const move = isNum(atm) && isNum(dte) ? expectedMove({ S: spot, sigma: atm, dte }) : null;
  const flip = gammaFlipStrike(rows);
  const dealerGamma = totalGex > 0 ? 'LONG' : totalGex < 0 ? 'SHORT' : 'NEUTRAL';
  const behavior = dealerGamma === 'LONG' ? 'PINNED' : dealerGamma === 'SHORT' ? 'VOLATILE' : 'TREND';

  const narrative = [];
  if (walls.callWall) narrative.push(`Muro de calls en $${walls.callWall}: si el precio llega, suele aparecer oferta de dealers y el avance se frena. Por encima, el movimiento puede acelerarse por cobertura.`);
  if (walls.putWall) narrative.push(`Muro de puts en $${walls.putWall}: zona donde se concentra la cobertura. Debajo de ese nivel el mercado suele moverse más rápido y con más volatilidad.`);
  if (isNum(pain?.strike)) narrative.push(`Max pain en $${pain.strike}: el vencimiento tiende a gravitar hacia ahí porque minimiza el pago total a los tenedores.`);
  if (isNum(flip)) narrative.push(`Gamma flip cerca de $${flip}: por encima de ese nivel los dealers amortiguan; por debajo, amplifican los movimientos.`);
  if (move) narrative.push(`Movimiento esperado a ${dte ?? '—'} días: ±$${round2(move.sigmaUsd)} (${round2(move.pct * 100)}%). Usalo como referencia de objetivos, no como pronóstico.`);
  if (iv?.skew25d) narrative.push(`Sesgo a 25 delta: ${iv.skew25d.label} (${iv.skew25d.value} pts). Un skew de puts alto indica que el mercado paga más por protección bajista.`);
  if (dealerGamma === 'SHORT') narrative.push('Los dealers están cortos de gamma: los movimientos tienden a exagerarse y los rangos se rompen con más facilidad.');

  return {
    symbol: snapshot.symbol,
    asOf: snapshot.asOf,
    simulated: Boolean(snapshot.simulated),
    spot,
    expiration: chosen,
    dte,
    totals: {
      gexUsdPerPct: round2(totalGex),
      dexShares: round2(totalDex),
      callOi, putOi, callVol, putVol,
      pcOi: putOi > 0 ? round2(callOi / putOi) : null,
      pcVol: putVol > 0 ? round2(callVol / putVol) : null
    },
    walls: { ...walls, gammaFlip: flip, maxPain: pain ? { strike: pain.strike, payoutUsd: pain.pain } : null },
    regime: { dealerGamma, behavior, note: dealerGamma === 'LONG' ? 'Los dealers compran caídas y venden subidas: mercado proclive a rango.' : dealerGamma === 'SHORT' ? 'Los dealers venden caídas y compran subidas: movimientos amplificados.' : 'Exposición equilibrada: sin sesgo claro de gamma.' },
    byStrike: rows.map((row) => ({ ...row, gex: round2(row.gex), dex: round2(row.dex) })),
    maxPainCurve: curve,
    expectedMove: move ? { up: round2(move.up), down: round2(move.down), sigmaUsd: round2(move.sigmaUsd), pct: round2(move.pct * 100) } : null,
    iv,
    narrative,
    warnings
  };
}
