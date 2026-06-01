import { useState } from "react";
import { requestNotificationPermission, sendLocalTestNotification } from "../services/notificationClient";

export function NotificationStatusCard() {
  const [status, setStatus] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied");
  const [sending, setSending] = useState(false);

  async function handleEnable() {
    const result = await requestNotificationPermission();
    setStatus(result);
  }

  async function handleTest() {
    setSending(true);
    try { await sendLocalTestNotification(); }
    finally { setSending(false); }
  }

  return (
    <section className="risk-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 font-bold">Estado de notificaciones</p>
          <h2 className="text-lg font-black text-slate-900">
            {status === "granted" ? "Alertas activas" : "Alertas no activas"}
          </h2>
        </div>
        <span className="pill">{status}</span>
      </div>

      <p className="text-sm text-slate-600">
        Las alertas reales con pantalla apagada requieren backend worker + push subscription.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button className="secondary-button" onClick={handleEnable}>
          Activar
        </button>
        <button className="primary-button" onClick={handleTest} disabled={sending}>
          {sending ? "Enviando..." : "Probar alerta"}
        </button>
      </div>
    </section>
  );
}