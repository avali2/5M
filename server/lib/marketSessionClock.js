export function getCurrentSession(date = new Date()) {
  const options = { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false };
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(date);
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  const day = date.getDay();

  if (day === 0 || day === 6) return "weekend";
  const t = hour * 60 + minute;
  if (t < 4 * 60 || t >= 20 * 60) return "closed";
  if (t < 9 * 60 + 30) return "pre";
  if (t < 9 * 60 + 40) return "open-risky";
  if (t >= 9 * 60 + 40 && t <= 11 * 60 + 15) return "optimal";
  if (t > 11 * 60 + 15 && t <= 13 * 60 + 45) return "midday";
  if (t > 13 * 60 + 45 && t < 15 * 60 + 20) return "late";
  if (t >= 15 * 60 + 20 && t < 16 * 60) return "closing";
  if (t >= 16 * 60 && t < 20 * 60) return "post";
  return "unknown";
}

export function isTradingAllowed(strategy = "", dte = 0, session = getCurrentSession()) {
  if (session === "pre" || session === "post" || session === "closed" || session === "weekend") {
    return { allowed: false, reason: `Mercado cerrado (fase: ${session}).` };
  }

  if (session === "open-risky") {
    return { allowed: false, reason: "Primeros 10 minutos: alta volatilidad, sin señales." };
  }

  if (session === "optimal") {
    return { allowed: true, reason: "Ventana óptima de trading." };
  }

  if (session === "midday") {
    const isCreditStrategy = /credit|bull put|bear call|iron condor|csp|covered call|wheel/i.test(strategy);
    const isShortDte = dte <= 7;
    if (isShortDte || !isCreditStrategy) {
      return { allowed: false, reason: "Midday solo habilita setups premium (credit spreads DTE > 7)." };
    }
    return { allowed: true, reason: "Midday con filtro premium." };
  }

  if (session === "late") {
    if (dte === 0) {
      return { allowed: false, reason: "No abrir nuevos credit spreads 0DTE después de 13:45." };
    }
    return { allowed: true, reason: "Late window con restricción 0DTE." };
  }

  if (session === "closing") {
    if (dte === 0 && /credit|bull put|bear call/i.test(strategy)) {
      return { allowed: false, reason: "No abrir credit spreads 0DTE después de 15:20." };
    }
    return { allowed: true, reason: "Priorizar salidas, no nuevas entradas." };
  }

  return { allowed: false, reason: `Sesión ${session} bloqueada por defecto.` };
}