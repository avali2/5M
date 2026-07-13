import { normalizeScanPayload, emptyScanPayload, asArray } from "./safeData.js";

async function requestJson(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("valido-auth-required"));
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  return data;
}

export const api = {
  async scan() {
    try { return normalizeScanPayload(await requestJson("/api/scan")); }
    catch (err) { return emptyScanPayload(err?.message || "Scanner no disponible"); }
  },
  async refresh() {
    try { return normalizeScanPayload(await requestJson("/api/refresh", { method: "POST" })); }
    catch (err) { return emptyScanPayload(err?.message || "Refresh no disponible"); }
  },
  async guardianScan() {
    try { return normalizeScanPayload(await requestJson("/api/guardian/scan")); }
    catch (err) { return emptyScanPayload(err?.message || "Guardian scanner no disponible"); }
  },
  async journal() {
    try { const d = await requestJson("/api/journal"); return asArray(d?.entries || d); }
    catch { return []; }
  },
  async addJournal(entry) {
    return await requestJson("/api/journal", { method: "POST", body: JSON.stringify(entry) });
  },
  async status() {
    try { return await requestJson("/api/status"); }
    catch (err) { return { ok: false, services: [], warnings: [err?.message || "Status no disponible"] }; }
  },
  async scanDiagnostics() {
    try { return await requestJson("/api/scan/diagnostics"); }
    catch (err) { return { ok: false, topRejectionReasons: [], warnings: [err?.message || "Diagnostico no disponible"] }; }
  },
  async readySignals() {
    try { const d = await requestJson("/api/signals/ready"); return asArray(d?.signals); }
    catch { return []; }
  },
  async riskPositions() {
    try { return await requestJson("/api/risk/positions"); }
    catch (err) { return { ok: false, positions: [], warnings: [err?.message || "Riesgo no disponible"] }; }
  },
  async riskPortfolio() {
    try { return await requestJson("/api/risk/portfolio"); }
    catch (err) { return { ok: false, positions: [], account: null, warnings: [err?.message || "Riesgo no disponible"] }; }
  },
  async workerStatus() {
    try { return await requestJson("/api/worker/status"); }
    catch (err) { return { ok: false, status: "ERROR", lastError: err?.message || "Worker no disponible" }; }
  },
  async accountStatus() {
    try { return await requestJson("/api/account/status"); }
    catch (err) { return { ok: false, status: "ERROR", error: err?.message || "Tradier no disponible", orderExecutionEnabled: false }; }
  },
  async symbolStudy(symbol, payload = {}) {
    try {
      return await requestJson(`/api/symbol-study/${encodeURIComponent(symbol)}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    } catch (err) {
      return { ok: false, symbol, study: { verdict: "NO_TOMAR_AHORA", summary: err?.message || "Gemini no disponible", why: [], risks: [], nextAction: "Reintentar mas tarde." } };
    }
  },
  async tradierOverview() {
    return await requestJson("/api/tradier/overview");
  },
  async savePaperBotSettings(settings) {
    return await requestJson("/api/tradier/paper/settings", { method: "PUT", body: JSON.stringify(settings) });
  },
  async runPaperBot() {
    return await requestJson("/api/tradier/paper/run", { method: "POST" });
  },
  async cancelPaperOrder(id) {
    return await requestJson(`/api/tradier/paper/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  },
  async previewLiveSignal(signalKey, contracts = 1) {
    return await requestJson("/api/tradier/live/preview", {
      method: "POST",
      body: JSON.stringify({ signalKey, contracts })
    });
  }
};
