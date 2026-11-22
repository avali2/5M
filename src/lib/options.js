/* 5M · Black-Scholes mínimo para curvas T+0 en el navegador */
const N = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const p = 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? p : 1 - p; };

export function bsPrice({ type, S, K, T, sigma, r = 0.043 }) {
  if (!(S > 0 && K > 0 && T > 0 && sigma > 0)) return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
  const vol = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / vol;
  const d2 = d1 - vol;
  const df = Math.exp(-r * T);
  return type === 'call' ? S * N(d1) - K * df * N(d2) : K * df * N(-d2) - S * N(-d1);
}

/** P&L al vencimiento de una estructura de patas. */
export function payoffAt(legs, spot) {
  return legs.reduce((total, leg) => {
    const intrinsic = leg.type === 'call' ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
    const dir = leg.action === 'SELL' ? -1 : 1;
    return total + dir * (intrinsic - leg.price) * 100 * (leg.quantity ?? 1);
  }, 0);
}

/** Valor teórico de la estructura hoy/más adelante (T+0 realista). */
export function valueNow(legs, spot, dte, atmIv, sigmaShift = 0) {
  const T = Math.max(1 / 365, dte / 365);
  return legs.reduce((total, leg) => {
    const sigma = Math.max(0.02, (leg.iv ?? atmIv ?? 0.3) + sigmaShift);
    const price = bsPrice({ type: leg.type, S: spot, K: leg.strike, T, sigma });
    const dir = leg.action === 'SELL' ? -1 : 1;
    return total + dir * price * 100 * (leg.quantity ?? 1);
  }, 0);
}

export function entryCost(legs) {
  return legs.reduce((total, leg) => total + (leg.action === 'SELL' ? 1 : -1) * leg.price * 100 * (leg.quantity ?? 1), 0);
}

export function breakevensOf(legs, low, high) {
  const points = [];
  const step = (high - low) / 400;
  let previous = payrollSafe(legs, low);
  for (let spot = low + step; spot <= high; spot += step) {
    const current = payrollSafe(legs, spot);
    if (previous === 0) points.push(spot);
    else if ((previous < 0 && current > 0) || (previous > 0 && current < 0)) points.push(spot);
    previous = current;
  }
  return points.slice(0, 4);
}
function payrollSafe(legs, spot) { return payoffAt(legs, spot); }
