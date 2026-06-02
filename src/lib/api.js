import { normalizeScanPayload, emptyScanPayload, asArray } from "./safeData.js";

async function requestJson(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
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
    try { return normalizeScanPayload(await requestJson("/api/scan/refresh")); }
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
  }
};
