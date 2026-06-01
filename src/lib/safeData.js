export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function safeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function safeDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export function emptyScanPayload(reason = "Scanner sin datos disponibles") {
  return {
    ok: false,
    failClosed: true,
    reason,
    opportunities: [],
    rejected: [],
    signals: [],
    macro: { earnings: [], highImpactEvents: [], softImpactEvents: [], breakingRisk: [] },
    market: { regime: "NO_DATA", spyTrend: "NO_DATA", qqqTrend: "NO_DATA", vix: null, vixRegime: "NO_DATA", tapeReading: { arrow: "❔", label: "Sin datos" }, technicals: {} },
    profile: { activeSymbols: [], riskUsedPct: 0, collateralUsedPct: 0 },
    systemWarnings: [reason],
    refreshSeconds: 300,
    timestamp: new Date().toISOString()
  };
}

export function normalizeScanPayload(payload) {
  const base = emptyScanPayload();
  const p = asObject(payload);
  return {
    ...base, ...p,
    ok: Boolean(p.ok ?? !p.failClosed),
    failClosed: Boolean(p.failClosed ?? false),
    reason: p.reason || p.error || "",
    opportunities: asArray(p.opportunities || p.signals),
    rejected: asArray(p.rejected),
    signals: asArray(p.signals || p.opportunities),
    macro: { ...base.macro, ...asObject(p.macro), earnings: asArray(p?.macro?.earnings), highImpactEvents: asArray(p?.macro?.highImpactEvents), softImpactEvents: asArray(p?.macro?.softImpactEvents), breakingRisk: asArray(p?.macro?.breakingRisk) },
    market: { ...base.market, ...asObject(p.market), tapeReading: asObject(p?.market?.tapeReading).label ? p.market.tapeReading : base.market.tapeReading, technicals: asObject(p?.market?.technicals) },
    profile: { ...base.profile, ...asObject(p.profile), activeSymbols: asArray(p?.profile?.activeSymbols) },
    systemWarnings: asArray(p.systemWarnings),
    refreshSeconds: safeNumber(p.refreshSeconds, 300),
    timestamp: p.timestamp || new Date().toISOString()
  };
}