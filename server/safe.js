export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function normalizeScanPayload(payload = {}) {
  const p = asObject(payload);
  return {
    ok: Boolean(p.ok ?? false),
    failClosed: Boolean(p.failClosed ?? false),
    reason: p.reason || p.error || "",
    opportunities: asArray(p.opportunities || p.signals),
    signals: asArray(p.signals || p.opportunities),
    rejected: asArray(p.rejected),
    systemWarnings: asArray(p.systemWarnings || p.warnings),
    refreshSeconds: Number.isFinite(Number(p.refreshSeconds)) ? Number(p.refreshSeconds) : 300,
    timestamp: p.timestamp || new Date().toISOString(),
    macro: { ...asObject(p.macro), earnings: asArray(p?.macro?.earnings), highImpactEvents: asArray(p?.macro?.highImpactEvents), softImpactEvents: asArray(p?.macro?.softImpactEvents), breakingRisk: asArray(p?.macro?.breakingRisk) },
    market: {
      regime: p?.market?.regime || "NO_DATA", spyTrend: p?.market?.spyTrend || "NO_DATA",
      qqqTrend: p?.market?.qqqTrend || p?.market?.technicals?.QQQ?.trend || "NO_DATA",
      vix: p?.market?.vix ?? null, vixRegime: p?.market?.vixRegime || "NO_DATA",
      tapeReading: p?.market?.tapeReading && typeof p.market.tapeReading === "object" ? p.market.tapeReading : { arrow: "❔", label: "Sin datos" },
      technicals: asObject(p?.market?.technicals)
    },
    profile: { ...asObject(p.profile), activeSymbols: asArray(p?.profile?.activeSymbols) }
  };
}

export function emptyScanPayload(reason = "Scanner fail-closed") {
  return normalizeScanPayload({ ok: false, failClosed: true, reason, opportunities: [], signals: [], rejected: [], systemWarnings: [reason] });
}