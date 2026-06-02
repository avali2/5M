import React, { useEffect, useState } from "react";

function normalizeServices(data) {
  if (Array.isArray(data?.services)) return data.services;
  if (Array.isArray(data?.checks)) return data.checks;
  return [];
}

function statusClass(service) {
  if (service?.ok) return { dot: "🟢", box: "border-green-200 bg-green-50", text: "text-green-800", label: "Activo" };
  if (service?.required) return { dot: "🔴", box: "border-red-200 bg-red-50", text: "text-red-800", label: "Inactivo" };
  return { dot: "🟡", box: "border-yellow-200 bg-yellow-50", text: "text-yellow-800", label: "Opcional" };
}

export default function SystemStatus() {
  const [status, setStatus] = useState({ ok: false, services: [], warnings: [], timestamp: null });
  async function load() {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      setStatus({
        ok: Boolean(data?.ok), services: normalizeServices(data),
        warnings: Array.isArray(data?.warnings) ? data.warnings : [],
        timestamp: data?.timestamp || new Date().toISOString()
      });
    } catch (err) {
      setStatus({ ok: false, services: [], warnings: [err?.message || "No se pudo leer /api/status"], timestamp: new Date().toISOString() });
    }
  }
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, []);
  const services = Array.isArray(status.services) ? status.services : [];

  return (
    <section id="system-status" className="risk-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Estado del sistema</h2>
          <p className="text-xs text-slate-500 mt-1">APIs, Gemini, scanner, scheduler y servicios externos.</p>
        </div>
        <button onClick={load} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">↻ Revisar</button>
      </div>
      {services.length === 0 ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">🔴 No se pudo leer el estado del backend.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {services.map((svc, i) => {
            const s = statusClass(svc);
            return (
              <div key={svc.key || svc.name || i} className={`rounded-2xl border p-3 ${s.box}`}>
                <div className="flex items-center justify-between gap-2">
                  <strong className={`text-sm ${s.text}`}>{s.dot} {svc.name || "Servicio"}</strong>
                  <span className={`text-xs font-black ${s.text}`}>{s.label}</span>
                </div>
                 <p className="mt-2 text-xs text-slate-600">{svc.message || (svc.ok ? "OK" : "Sin detalle")}</p>
              </div>
            );
          })}
        </div>
      )}
      {Array.isArray(status.warnings) && status.warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {status.warnings.map((w, i) => <p key={i}>⚠️ {w}</p>)}
        </div>
      )}
      <p className="text-[11px] text-slate-400">Última revisión: {status.timestamp ? new Date(status.timestamp).toLocaleString() : "—"}</p>
    </section>
  );
}
