/**
 * 5M · Motor matemático de opciones (puro, sin dependencias).
 * Precios, Greeks, volatilidad implícita, probabilidades, escenarios y métricas
 * de estructura. Todas las funciones son deterministas y devuelven null cuando
 * un dato no es válido: nunca inventamos una prima.
 *
 * Convenciones:
 *  - T = años calendario (dte / 365).
 *  - r = tasa libre de riesgo anual (por defecto 4.3%).
 *  - q = dividend yield anual.
 *  - theta se devuelve por día calendario; vega por 1 punto de vol (0.01);
 *    rho por 1 punto porcentual de tasa (0.01).
 *  - Probabilidades bajo medida neutral al riesgo (lognormal). No son garantías.
 */

export const CONTRACT_SIZE = 100;
export const DEFAULT_RATE = Number(process.env.OPTIONS_RATE || 0.043);
export const DEFAULT_DIVIDEND = Number(process.env.OPTIONS_DIVIDEND || 0);

export const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const safe = (value) => (isNum(value) ? value : null);

/* ------------------------------------------------------------------ */
/* Distribución normal                                                 */
/* ------------------------------------------------------------------ */

const ERF_COEFFS = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  let y = 0;
  for (let i = 0; i < ERF_COEFFS.length; i += 1) y += ERF_COEFFS[i] * Math.pow(t, i + 1);
  return sign * (1 - y * Math.exp(-ax * ax));
}
export function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
export function normCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/* ------------------------------------------------------------------ */
/* Black-Scholes                                                       */
/* ------------------------------------------------------------------ */

export function yearFraction(dte) {
  return isNum(dte) ? Math.max(0, dte) / 365 : null;
}

function d1d2({ S, K, T, sigma, r = DEFAULT_RATE, q = DEFAULT_DIVIDEND }) {
  if (![S, K, T, sigma, r, q].every(isNum) || S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return null;
  const vol = sigma * Math.sqrt(T);
  if (!(vol > 0)) return null;
  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / vol;
  return { d1, d2: d1 - vol, vol };
}

/** Precio teórico de una opción europea (Black-Scholes-Merton). */
export function bsPrice({ type, S, K, T, sigma, r = DEFAULT_RATE, q = DEFAULT_DIVIDEND }) {
  const params = d1d2({ S, K, T, sigma, r, q });
  const call = String(type).toLowerCase() === 'call';
  if (!params) {
    // Sin volatilidad válida solo conocemos el valor intrínseco descontado.
    if (![S, K, T].every(isNum) || S <= 0 || K <= 0) return null;
    if (T <= 0) return call ? Math.max(0, S - K) : Math.max(0, K - S);
    return null;
  }
  const { d1, d2 } = params;
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  if (call) return S * dfQ * normCdf(d1) - K * dfR * normCdf(d2);
  return K * dfR * normCdf(-d2) - S * dfQ * normCdf(-d1);
}

/** Greeks analíticos. theta/día, vega/0.01, rho/0.01. */
export function bsGreeks({ type, S, K, T, sigma, r = DEFAULT_RATE, q = DEFAULT_DIVIDEND }) {
  const params = d1d2({ S, K, T, sigma, r, q });
  if (!params) return null;
  const call = String(type).toLowerCase() === 'call';
  const { d1, d2 } = params;
  const sqrtT = Math.sqrt(T);
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  const delta = call ? dfQ * normCdf(d1) : -dfQ * normCdf(-d1);
  const gamma = (dfQ * normPdf(d1)) / (S * sigma * sqrtT);
  const vega = (S * dfQ * normPdf(d1) * sqrtT) / 100;
  const commonTheta = -(S * dfQ * normPdf(d1) * sigma) / (2 * sqrtT);
  const thetaAnnual = call
    ? commonTheta - r * K * dfR * normCdf(d2) + q * S * dfQ * normCdf(d1)
    : commonTheta + r * K * dfR * normCdf(-d2) - q * S * dfQ * normCdf(-d1);
  const rho = (call ? K * T * dfR * normCdf(d2) : -K * T * dfR * normCdf(-d2)) / 100;
  return {
    delta,
    gamma,
    theta: thetaAnnual / 365,
    vega,
    rho,
    // Probabilidades neutrales al riesgo.
    probITM: call ? normCdf(d2) : normCdf(-d2),
    probTouch: clamp(2 * (call ? normCdf(d2) : normCdf(-d2)), 0, 1)
  };
}

/**
 * Volatilidad implícita por Newton-Raphson con respaldo de bisección.
 * Devuelve null si el precio no está dentro de límites arbitrables.
 */
export function impliedVol({ type, S, K, T, price, r = DEFAULT_RATE, q = DEFAULT_DIVIDEND, tolerance = 1e-6 }) {
  if (![S, K, T, price].every(isNum) || S <= 0 || K <= 0 || T <= 0 || price <= 0) return null;
  const call = String(type).toLowerCase() === 'call';
  const intrinsic = call ? Math.max(0, S * Math.exp(-q * T) - K * Math.exp(-r * T))
    : Math.max(0, K * Math.exp(-r * T) - S * Math.exp(-q * T));
  const upper = call ? S * Math.exp(-q * T) : K * Math.exp(-r * T);
  if (price <= intrinsic + 1e-8 || price >= upper) return null;

  const priceAt = (sigma) => bsPrice({ type, S, K, T, sigma, r, q });
  let sigma = 0.4;
  for (let i = 0; i < 60; i += 1) {
    const model = priceAt(sigma);
    if (!isNum(model)) break;
    const diff = model - price;
    if (Math.abs(diff) < tolerance) return sigma;
    const greeks = bsGreeks({ type, S, K, T, sigma, r, q });
    const vegaRaw = greeks ? greeks.vega * 100 : 0;
    if (!(vegaRaw > 1e-8)) break;
    const next = sigma - diff / vegaRaw;
    if (!isNum(next) || next <= 0.001 || next > 5) break;
    sigma = next;
  }
  // Bisección robusta en [0.01, 5]
  let low = 0.005;
  let high = 5;
  if (!(priceAt(low) < price && priceAt(high) > price)) return isNum(sigma) && sigma > 0 ? sigma : null;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const diff = priceAt(mid) - price;
    if (Math.abs(diff) < tolerance) return mid;
    if (diff > 0) high = mid; else low = mid;
  }
  return (low + high) / 2;
}

/* ------------------------------------------------------------------ */
/* Probabilidades y movimientos esperados                              */
/* ------------------------------------------------------------------ */

/** P(S_T > threshold) bajo lognormal neutral al riesgo. */
export function probAbove({ S, threshold, T, sigma, r = DEFAULT_RATE, q = DEFAULT_DIVIDEND }) {
  if (![S, threshold, T, sigma, r, q].every(isNum) || S <= 0 || threshold <= 0 || T <= 0 || sigma <= 0) return null;
  const d = (Math.log(S / threshold) + (r - q - (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  return normCdf(d);
}
export function probBelow(params) {
  const above = probAbove(params);
  return above === null ? null : 1 - above;
}

/** Movimiento esperado a 1σ: precio ± S·σ·√T. */
export function expectedMove({ S, sigma, dte }) {
  const T = yearFraction(dte);
  if (![S, sigma, T].every(isNum) || S <= 0 || sigma <= 0) return null;
  const sigmaUsd = S * sigma * Math.sqrt(T);
  return {
    sigmaUsd,
    up: S + sigmaUsd,
    down: Math.max(0, S - sigmaUsd),
    pct: sigmaUsd / S,
    oneSigmaPct: (sigmaUsd / S) * 100
  };
}

/** P&L de un contrato comprado/vendido al vencimiento. */
export function optionPnLAtExpiry({ type, strike, entry, spot, quantity = 1, side = 'long' }) {
  if (![strike, entry, spot].every(isNum)) return null;
  const call = String(type).toLowerCase() === 'call';
  const intrinsic = call ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const pnl = (intrinsic - entry) * CONTRACT_SIZE * quantity * (side === 'long' ? 1 : -1);
  return { intrinsic, pnl, pnlPct: (pnl / (entry * CONTRACT_SIZE * quantity)) * 100 };
}

/** Valor teórico de una estructura multi-pata a un precio/tiempo dados. */
export function structureValue({ legs, spot, dte, sigmaShift = 0, r = DEFAULT_RATE, q = DEFAULT_DIVIDEND }) {
  if (!Array.isArray(legs) || !isNum(spot) || !isNum(dte) || dte < 0) return null;
  const T = Math.max(1 / 365, yearFraction(dte));
  let value = 0;
  for (const leg of legs) {
    const sigma = clamp((leg.iv ?? 0.3) + sigmaShift, 0.02, 5);
    const price = dte <= 0
      ? (leg.type === 'call' ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot))
      : bsPrice({ type: leg.type, S: spot, K: leg.strike, T, sigma, r, q });
    if (!isNum(price)) return null;
    const dir = leg.action === 'SELL' ? -1 : 1;
    value += dir * price * CONTRACT_SIZE * (leg.quantity ?? 1);
  }
  return value;
}

/** Beneficiarios: precios del subyacente donde el P&L cruza cero al vencimiento. */
export function breakevens({ legs, low, high }) {
  if (!Array.isArray(legs) || !legs.length || !isNum(low) || !isNum(high) || high <= low) return [];
  const payout = (spot) => {
    let total = 0;
    for (const leg of legs) {
      const call = leg.type === 'call';
      const intrinsic = call ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
      const dir = leg.action === 'SELL' ? -1 : 1;
      total += dir * (intrinsic - leg.price) * CONTRACT_SIZE * (leg.quantity ?? 1);
    }
    return total;
  };
  const result = [];
  const step = (high - low) / 600;
  let previous = payout(low);
  for (let spot = low + step; spot <= high; spot += step) {
    const current = payout(spot);
    if ((previous <= 0 && current > 0) || (previous >= 0 && current < 0)) {
      // Interpolación lineal.
      const ratio = Math.abs(previous) / (Math.abs(previous) + Math.abs(current) || 1);
      result.push(Number((spot - step + step * ratio).toFixed(2)));
    }
    previous = current;
  }
  return result;
}

/** Probabilidad de ganar al vencimiento para una estructura vertical. */
export function probabilityOfProfit({ legs, spot, dte, atmIv, low, high }) {
  if (!Array.isArray(legs) || !legs.length || !isNum(spot) || !isNum(dte) || !isNum(atmIv)) return null;
  const T = yearFraction(dte);
  if (!(T > 0)) return dte === 0 ? null : null;
  const strikes = breakevens({ legs, low, high });
  if (!strikes.length) return null;
  const sigma = atmIv;
  const bounds = [-Infinity, ...strikes, Infinity];
  let probability = 0;
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const from = bounds[i];
    const to = bounds[i + 1];
    const mid = !Number.isFinite(from) ? to - Math.max(1, spot * 0.01)
      : !Number.isFinite(to) ? from + Math.max(1, spot * 0.01)
        : (from + to) / 2;
    const total = legs.reduce((sum, leg) => {
      const call = leg.type === 'call';
      const intrinsic = call ? Math.max(0, mid - leg.strike) : Math.max(0, leg.strike - mid);
      return sum + (leg.action === 'SELL' ? -1 : 1) * (intrinsic - leg.price);
    }, 0);
    if (total <= 0) continue;
    const pAboveFrom = Number.isFinite(from) ? probAbove({ S: spot, threshold: from, T, sigma }) : 1;
    const pAboveTo = Number.isFinite(to) ? probAbove({ S: spot, threshold: to, T, sigma }) : 0;
    probability += Math.max(0, pAboveFrom - pAboveTo);
  }
  return clamp(probability, 0, 1);
}

/** P&L de la estructura frente a shocks de precio e IV. */
export function stressTest({ legs, spot, dte, atmIv, moves = [-0.1, -0.05, -0.02, 0, 0.02, 0.05, 0.1], ivShift = 0 }) {
  if (!Array.isArray(legs) || !legs.length || !isNum(spot) || !isNum(dte)) return [];
  const entry = structureValue({ legs, spot, dte, sigmaShift: 0 }) ?? 0;
  return moves.map((move) => {
    const value = structureValue({ legs, spot: spot * (1 + move), dte, sigmaShift: ivShift });
    const pnl = value === null ? null : value - entry;
    return {
      movePct: move * 100,
      spot: Number((spot * (1 + move)).toFixed(2)),
      pnlUsd: pnl === null ? null : Number(pnl.toFixed(0)),
      pnlPct: pnl === null || entry === 0 ? null : Number(((pnl / Math.abs(entry || 1)) * 100).toFixed(0))
    };
  });
}

/** P&L de una opción larga ante varios escenarios (reprecio con BS). */
export function optionScenarios({ type, strike, entry, spot, dte, iv, moves = [-0.1, -0.05, -0.02, 0, 0.02, 0.05, 0.1], daysForward = 0 }) {
  if (![strike, entry, spot, dte, iv].every(isNum)) return [];
  const remaining = Math.max(0, dte - daysForward);
  return moves.map((move) => {
    const futureSpot = spot * (1 + move);
    const T = yearFraction(remaining);
    const value = remaining <= 0
      ? (type === 'call' ? Math.max(0, futureSpot - strike) : Math.max(0, strike - futureSpot))
      : bsPrice({ type, S: futureSpot, K: strike, T, sigma: clamp(iv, 0.02, 5) });
    const pnl = value === null ? null : (value - entry) * CONTRACT_SIZE;
    return {
      movePct: move * 100,
      spot: Number(futureSpot.toFixed(2)),
      value: value === null ? null : Number(value.toFixed(2)),
      pnlUsd: pnl === null ? null : Number(pnl.toFixed(0)),
      pnlPct: pnl === null ? null : Number(((pnl / (entry * CONTRACT_SIZE)) * 100).toFixed(0))
    };
  });
}

/* ------------------------------------------------------------------ */
/* Posicionamiento institucional                                       */
/* ------------------------------------------------------------------ */

/** Gamma exposure por strike (dólares por movimiento de 1% del spot). */
export function gammaExposure({ gamma, openInterest, spot, type, contractSize = CONTRACT_SIZE }) {
  if (![gamma, openInterest, spot].every(isNum) || openInterest <= 0) return 0;
  const sign = String(type).toLowerCase() === 'call' ? 1 : -1;
  return sign * gamma * openInterest * contractSize * spot * spot * 0.01;
}

/** Delta exposure en acciones equivalentes. */
export function deltaExposure({ delta, openInterest, type, contractSize = CONTRACT_SIZE }) {
  if (![delta, openInterest].every(isNum) || openInterest <= 0) return 0;
  const sign = String(type).toLowerCase() === 'call' ? 1 : -1;
  return sign * delta * openInterest * contractSize;
}

/** Max pain: strike que minimiza el pago a los tenedores. */
export function maxPain(chain = []) {
  const strikes = [...new Set(chain.map((option) => option.strike).filter(isNum))].sort((a, b) => a - b);
  if (strikes.length < 2) return null;
  let best = null;
  for (const candidate of strikes) {
    let pain = 0;
    for (const option of chain) {
      const oi = isNum(option.openInterest) ? option.openInterest : 0;
      if (!oi) continue;
      const intrinsic = option.type === 'call' ? Math.max(0, candidate - option.strike) : Math.max(0, option.strike - candidate);
      pain += intrinsic * oi * CONTRACT_SIZE;
    }
    if (!best || pain < best.pain) best = { strike: candidate, pain };
  }
  return best;
}

export function maxPainCurve(chain = [], window = 0.12) {
  const strikes = [...new Set(chain.map((option) => option.strike).filter(isNum))].sort((a, b) => a - b);
  if (!strikes.length) return [];
  const spot = strikes[Math.floor(strikes.length / 2)];
  const from = spot * (1 - window);
  const to = spot * (1 + window);
  const curve = [];
  for (const candidate of strikes.filter((strike) => strike >= from && strike <= to)) {
    let pain = 0;
    for (const option of chain) {
      const oi = isNum(option.openInterest) ? option.openInterest : 0;
      if (!oi) continue;
      const intrinsic = option.type === 'call' ? Math.max(0, candidate - option.strike) : Math.max(0, option.strike - candidate);
      pain += intrinsic * oi * CONTRACT_SIZE;
    }
    curve.push({ strike: candidate, pain: Math.round(pain) });
  }
  return curve;
}

/** Ranking de volatilidad implícita sobre una ventana histórica de IV. */
export function ivRank({ current, low, high }) {
  if (![current, low, high].every(isNum) || high <= low) return null;
  return clamp(((current - low) / (high - low)) * 100, 0, 100);
}

export function ivPercentile(current, series = []) {
  const clean = series.filter(isNum);
  if (!isNum(current) || clean.length < 10) return null;
  const below = clean.filter((value) => value < current).length;
  return clamp((below / clean.length) * 100, 0, 100);
}

/** Skew a 25 delta: IV del put 25d menos IV del call 25d. */
export function skew25({ chain, spot, dte }) {
  if (!Array.isArray(chain) || !chain.length || !isNum(spot)) return null;
  const nearest = (type, target) => chain
    .filter((option) => option.type === type && isNum(option.iv) && isNum(option.delta))
    .sort((a, b) => Math.abs(Math.abs(a.delta) - target) - Math.abs(Math.abs(b.delta) - target))[0];
  const put = nearest('put', 0.25);
  const call = nearest('call', 0.25);
  if (!put || !call) return null;
  const diff = (put.iv - call.iv) * 100;
  return {
    value: Number(diff.toFixed(2)),
    putIv25: Number((put.iv * 100).toFixed(2)),
    callIv25: Number((call.iv * 100).toFixed(2)),
    label: diff > 6 ? 'PUT SKEW ALTO' : diff > 2 ? 'SKEW MODERADO' : diff > -2 ? 'NEUTRO' : 'CALL SKEW',
    total: diff
  };
}

export function atmIvFor({ chain, spot }) {
  if (!Array.isArray(chain) || !chain.length || !isNum(spot)) return null;
  const candidates = chain.filter((option) => isNum(option.iv) && isNum(option.strike));
  if (!candidates.length) return null;
  const atTheMoney = candidates
    .map((option) => ({ ...option, distance: Math.abs(option.strike - spot) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);
  const average = atTheMoney.reduce((sum, option) => sum + option.iv, 0) / atTheMoney.length;
  return Number(average.toFixed(4));
}

/** IV de un contrato a partir de su mid (si Tradier no la entrega). */
export function contractIv({ option, spot, dte, r = DEFAULT_RATE, q = DEFAULT_DIVIDEND }) {
  if (isNum(option?.iv) && option.iv > 0.01 && option.iv < 5) return option.iv;
  const price = option?.mid ?? (isNum(option?.bid) && isNum(option?.ask) ? (option.bid + option.ask) / 2 : null);
  const T = yearFraction(dte);
  if (!price || !T) return null;
  return impliedVol({ type: option.type, S: spot, K: option.strike, T, price, r, q });
}

/** Redondeos de presentación consistentes en todo el backend. */
export const round2 = (value) => (isNum(value) ? Math.round(value * 100) / 100 : null);
export const round4 = (value) => (isNum(value) ? Math.round(value * 10000) / 10000 : null);
export const pct = (value) => (isNum(value) ? Number((value * 100).toFixed(1)) : null);
export { safe };
