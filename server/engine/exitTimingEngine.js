export function evaluateExitTiming(position, currentPrice, currentGreeks, timeToExpiry) {
  if (!position) return { action: "HOLD", reason: "Sin posición abierta." };

  const { takeProfit, stopLoss } = position;

  // Take profit reached
  if (position.maxProfit && currentPrice >= position.breakeven + (position.maxProfit * 0.40)) {
    return { action: "TAKE_PROFIT_40PCT", reason: "Capturado 40%+ del crédito. Cerrar parcialmente." };
  }

  // Stop loss
  if (position.maxRisk && (position.maxRisk * 0.80) >= position.maxRisk) {
    return { action: "STOP_LOSS", reason: "Pérdida alcanzó 80% del riesgo máximo." };
  }

  // Time decay: close before expiration
  if (timeToExpiry <= 1) {
    return { action: "CLOSE_BEFORE_EXPIRY", reason: "Cerrar antes de expiración. Gamma risk muy elevado." };
  }

  if (timeToExpiry <= 3 && currentGreeks?.theta > 0) {
    return { action: "TAKE_PROFIT_THETA", reason: `DTE ${timeToExpiry}: theta capturada. Cerrar.` };
  }

  // High gamma warning near expiry
  if (timeToExpiry <= 2 && currentGreeks?.gamma && Math.abs(currentGreeks.gamma) > 0.05) {
    return { action: "REDUCE_SIZE", reason: "Gamma elevado cerca de expiración. Reducir o cerrar." };
  }

  // VWAP break
  if (currentPrice && position.technicals?.vwap) {
    const vwapDiff = Math.abs(currentPrice - position.technicals.vwap) / currentPrice;
    if (vwapDiff > 0.02) {
      return { action: "WATCH", reason: "Precio lejos de VWAP. Monitorear." };
    }
  }

  return { action: "HOLD", reason: "Dentro de parámetros. Mantener." };
}