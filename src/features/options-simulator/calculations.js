const MULTIPLIER = 100;
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
const hasNumber = (value) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));

function premium(leg) {
  if (leg.price !== '' && leg.price != null && Number.isFinite(Number(leg.price))) return Number(leg.price);
  if (leg.mid !== '' && leg.mid != null && Number.isFinite(Number(leg.mid))) return Number(leg.mid);
  const bid = Number(leg.bid);
  const ask = Number(leg.ask);
  return Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : 0;
}

function sign(leg) {
  return String(leg.side).toUpperCase() === 'BUY' ? 1 : -1;
}

function quantity(leg) {
  return Math.max(1, number(leg.quantity) || 1);
}

function optionValue(leg, underlyingPrice) {
  const strike = number(leg.strike);
  return String(leg.type).toUpperCase() === 'CALL'
    ? Math.max(underlyingPrice - strike, 0)
    : Math.max(strike - underlyingPrice, 0);
}

export function calculatePayoff({ legs = [], underlyingPrice, commissions = 0 }) {
  const price = number(underlyingPrice);
  const payoff = legs.reduce((total, leg) => {
    const multiplier = MULTIPLIER * quantity(leg);
    if (String(leg.type).toUpperCase() === 'STOCK') {
      return total + sign(leg) * (price - number(leg.entryPrice ?? leg.strike)) * multiplier;
    }
    return total + sign(leg) * (optionValue(leg, price) - premium(leg)) * multiplier;
  }, 0);
  return round(payoff - number(commissions), 2);
}

function priceRange(legs, spot) {
  const strikes = legs.map((leg) => number(leg.strike)).filter((value) => value > 0);
  const high = Math.max(spot * 1.8, ...(strikes.map((strike) => strike * 1.4)), spot + 10);
  return Array.from({ length: 121 }, (_, index) => round((high * index) / 120, 2));
}

function nakedShortCall(legs) {
  const stockCover = legs.some((leg) => String(leg.type).toUpperCase() === 'STOCK' && sign(leg) > 0);
  return legs.some((leg) => {
    if (String(leg.type).toUpperCase() !== 'CALL' || sign(leg) > 0) return false;
    const cover = legs.some((candidate) =>
      String(candidate.type).toUpperCase() === 'CALL' && sign(candidate) > 0 &&
      number(candidate.strike) >= number(leg.strike) && quantity(candidate) >= quantity(leg)
    );
    return !stockCover && !cover;
  });
}

function unlimitedLongCall(legs) {
  const longCalls = legs.filter((leg) => String(leg.type).toUpperCase() === 'CALL' && sign(leg) > 0)
    .reduce((total, leg) => total + quantity(leg), 0);
  const shortCalls = legs.filter((leg) => String(leg.type).toUpperCase() === 'CALL' && sign(leg) < 0)
    .reduce((total, leg) => total + quantity(leg), 0);
  return longCalls > shortCalls;
}

export function calculateMaxRisk({ legs = [], spot = 100, commissions = 0 }) {
  if (nakedShortCall(legs)) return Infinity;
  const lowest = Math.min(...priceRange(legs, spot).map((price) => calculatePayoff({ legs, underlyingPrice: price, commissions })));
  return round(Math.max(0, -lowest), 2);
}

export function calculateMaxProfit({ legs = [], spot = 100, commissions = 0 }) {
  if (nakedShortCall(legs) || unlimitedLongCall(legs)) return Infinity;
  const highest = Math.max(...priceRange(legs, spot).map((price) => calculatePayoff({ legs, underlyingPrice: price, commissions })));
  return round(Math.max(0, highest), 2);
}

export function calculateBreakEven({ legs = [], spot = 100, commissions = 0 }) {
  const points = priceRange(legs, spot).map((price) => ({ price, pl: calculatePayoff({ legs, underlyingPrice: price, commissions }) }));
  const crossings = [];
  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    if (point.pl === 0) crossings.push(point.price);
    if ((previous.pl < 0 && point.pl > 0) || (previous.pl > 0 && point.pl < 0)) {
      const ratio = Math.abs(previous.pl) / (Math.abs(previous.pl) + Math.abs(point.pl));
      crossings.push(round(previous.price + ((point.price - previous.price) * ratio), 2));
    }
  });
  return [...new Set(crossings)].slice(0, 3);
}

export function calculateNetGreeks(legs = []) {
  return ['delta', 'gamma', 'theta', 'vega'].reduce((values, greek) => ({
    ...values,
    [greek]: legs.some((leg) => hasNumber(leg[greek]))
      ? round(legs.reduce((total, leg) => total + sign(leg) * number(leg[greek]) * quantity(leg), 0), greek === 'gamma' ? 5 : 3)
      : null
  }), {});
}

export function estimateProbability(legs = []) {
  const shorts = legs.filter((leg) => sign(leg) < 0 && hasNumber(leg.delta));
  if (shorts.length) {
    const probability = Math.max(1, Math.min(99, 100 - shorts.reduce((sum, leg) => sum + Math.abs(number(leg.delta)) * 100, 0)));
    return { probability: round(probability, 0), method: 'Estimacion delta de strikes cortos; no es garantia.' };
  }
  const long = legs.find((leg) => sign(leg) > 0 && hasNumber(leg.delta));
  return long
    ? { probability: round(Math.abs(number(long.delta)) * 100, 0), method: 'Proxy delta de la opcion comprada; no es garantia.' }
    : { probability: null, method: 'No disponible: faltan deltas verificadas.' };
}

export function estimateEdge({ maxRisk, maxProfit, probability, legs = [] }) {
  if (![maxRisk, maxProfit, probability].every(Number.isFinite) || maxRisk <= 0) {
    return { expectedValue: null, returnOnCapital: null, slippage: null, model: 'No disponible: faltan riesgo, ganancia o POP.' };
  }
  const slippage = round(legs.reduce((total, leg) => {
    const bid = Number(leg.bid);
    const ask = Number(leg.ask);
    return hasNumber(leg.bid) && hasNumber(leg.ask) ? total + Math.max(0, ask - bid) * 50 * quantity(leg) : total;
  }, 0), 2);
  const winProbability = probability / 100;
  return {
    expectedValue: round((winProbability * maxProfit) - ((1 - winProbability) * maxRisk) - slippage, 2),
    returnOnCapital: round((maxProfit / maxRisk) * 100, 1),
    slippage,
    model: 'POP delta disponible; EV resta perdida maxima y slippage medio estimado.'
  };
}

export function buildPayoffChart({ legs = [], spot = 100, commissions = 0, dte = 30 }) {
  const greeks = calculateNetGreeks(legs);
  return priceRange(legs, spot).map((price) => {
    const expiration = calculatePayoff({ legs, underlyingPrice: price, commissions });
    const move = price - spot;
    const estimatedToday = round(calculatePayoff({ legs, underlyingPrice: spot, commissions }) + ((greeks.delta || 0) * move * MULTIPLIER) + (0.5 * (greeks.gamma || 0) * move * move * MULTIPLIER), 2);
    return {
      price,
      expiration,
      estimatedToday,
      ivUp10: round(estimatedToday + (greeks.vega || 0) * 10 * MULTIPLIER, 2),
      ivDown10: round(estimatedToday - (greeks.vega || 0) * 10 * MULTIPLIER, 2),
      theta1d: round(estimatedToday + (greeks.theta || 0) * MULTIPLIER, 2),
      theta3d: round(estimatedToday + (greeks.theta || 0) * MULTIPLIER * Math.min(3, dte), 2),
      theta7d: round(estimatedToday + (greeks.theta || 0) * MULTIPLIER * Math.min(7, dte), 2)
    };
  });
}

export function simulateScenario({ legs = [], spot = 100, atr = 0, commissions = 0, dte = 30 }) {
  const greeks = calculateNetGreeks(legs);
  const current = calculatePayoff({ legs, underlyingPrice: spot, commissions });
  const priceEstimate = (move) => round(current + (greeks.delta || 0) * move * MULTIPLIER + 0.5 * (greeks.gamma || 0) * move * move * MULTIPLIER, 2);
  const dayDecay = (greeks.theta || 0) * MULTIPLIER;
  return [
    { label: 'Precio sube 1 ATR', value: priceEstimate(number(atr)), assumption: 'Delta/Gamma constantes' },
    { label: 'Precio baja 1 ATR', value: priceEstimate(-number(atr)), assumption: 'Delta/Gamma constantes' },
    { label: 'Precio lateral hoy', value: current, assumption: 'Spot sin cambio' },
    { label: 'IV sube 10 puntos', value: round(current + (greeks.vega || 0) * 10 * MULTIPLIER, 2), assumption: 'Vega constante' },
    { label: 'IV baja 10 puntos', value: round(current - (greeks.vega || 0) * 10 * MULTIPLIER, 2), assumption: 'Vega constante' },
    { label: 'Pasa 1 dia', value: round(current + dayDecay, 2), assumption: 'Theta constante' },
    { label: 'Pasa 50% del DTE', value: round(current + dayDecay * Math.max(1, dte / 2), 2), assumption: 'Theta lineal; educativo' },
    { label: 'Vencimiento lateral', value: calculatePayoff({ legs, underlyingPrice: spot, commissions }), assumption: 'Payoff contractual' }
  ];
}

export function validateStrategy({ legs = [], strategy, spot = 100, accountSize = 0, riskPercent = 2, dte = 30, gammaRisk }) {
  const warnings = [];
  if (nakedShortCall(legs)) warnings.push('Bloqueado: no se permiten naked calls.');
  const shortPut = legs.some((leg) => String(leg.type).toUpperCase() === 'PUT' && sign(leg) < 0);
  const protectedPut = legs.some((leg) => String(leg.type).toUpperCase() === 'PUT' && sign(leg) > 0);
  if (shortPut && !protectedPut && strategy !== 'Cash Secured Put') warnings.push('Bloqueado: la put corta debe estar protegida o marcada cash secured.');
  legs.forEach((leg) => {
    const bid = Number(leg.bid);
    const ask = Number(leg.ask);
    const midpoint = (bid + ask) / 2;
    if (hasNumber(leg.bid) && hasNumber(leg.ask) && midpoint > 0 && (ask - bid) / midpoint > 0.2) warnings.push(`Liquidez: spread bid/ask ancho en ${leg.strike || ''} ${leg.type}.`);
    if (hasNumber(leg.openInterest) && Number(leg.openInterest) < 100) warnings.push(`Liquidez: open interest bajo en ${leg.strike || ''} ${leg.type}.`);
    if (hasNumber(leg.volume) && Number(leg.volume) < 10) warnings.push(`Liquidez: volumen bajo en ${leg.strike || ''} ${leg.type}.`);
  });
  const maxRisk = calculateMaxRisk({ legs, spot });
  if (Number.isFinite(maxRisk) && accountSize > 0 && maxRisk > accountSize * riskPercent / 100) warnings.push('Riesgo mayor al maximo permitido por tu cuenta.');
  if (dte <= 1 && gammaRisk === 'negative') warnings.push('0DTE/1DTE con gamma negativa: solo observacion o paper trade.');
  if (/Calendar|Diagonal|PMCC/i.test(strategy)) warnings.push('Educativo: esta estructura requiere expiraciones por leg y modelo IV para valoracion pre-vencimiento precisa.');
  return [...new Set(warnings)];
}
