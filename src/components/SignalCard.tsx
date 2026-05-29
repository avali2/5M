import type { ProfessionalSignal } from "../types/signal";

interface SignalCardProps {
  signal: ProfessionalSignal;
  onView: (signal: ProfessionalSignal) => void;
  onCopyTicket: (signal: ProfessionalSignal) => void;
  onSave: (signal: ProfessionalSignal) => void;
  onDismiss: (signal: ProfessionalSignal) => void;
  onAskGemini: (signal: ProfessionalSignal) => void;
}

function statusClass(status: ProfessionalSignal["status"]) {
  switch (status) {
    case "READY":
      return "badge badge-ready";
    case "AGGRESSIVE":
      return "badge badge-aggressive";
    case "0DTE_SCALP":
      return "badge badge-scalp";
    case "WATCH":
      return "badge badge-watch";
    case "AVOID":
      return "badge badge-avoid";
    case "NO_DATA":
      return "badge badge-nodata";
    case "LOCKED_BY_RISK":
      return "badge badge-avoid";
    default:
      return "badge";
  }
}

export function SignalCard({
  signal,
  onView,
  onCopyTicket,
  onSave,
  onDismiss,
  onAskGemini
}: SignalCardProps) {
  const price =
    signal.credit != null
      ? `Credito $${signal.credit.toFixed(2)}`
      : signal.debit != null
        ? `Debito $${signal.debit.toFixed(2)}`
        : "Precio limite";
  const pop = signal.pop != null ? `${Math.round(signal.pop * 100)}%` : "N/A";

  return (
    <article className="card signal-card">
      <div className="signal-card__top">
        <span className={statusClass(signal.status)}>{signal.status}</span>
        <div>
          <h3>{signal.symbol}</h3>
          <p>{signal.strategyLabel}</p>
        </div>
        <strong className="score">{signal.score}</strong>
      </div>

      <div className="signal-card__grid">
        <div><span>Direccion</span><strong>{signal.bias}</strong></div>
        <div><span>DTE</span><strong>{signal.dte}</strong></div>
        <div><span>Expira</span><strong>{signal.expiration}</strong></div>
        <div><span>POP</span><strong>{pop}</strong></div>
        <div><span>Entrada</span><strong>{price}</strong></div>
        <div><span>Riesgo</span><strong>{signal.maxRiskUsd != null ? `$${Math.round(signal.maxRiskUsd)}` : "N/A"}</strong></div>
      </div>

      {signal.dte === 0 && signal.gammaRisk ? (
        <div className="gamma-strip">Gamma {signal.gammaRisk.level}: {signal.gammaRisk.reason}</div>
      ) : null}

      <div className="execution-box">
        <p><strong>Trigger:</strong> {signal.executionPlan.entryTrigger}</p>
        <p><strong>Stop:</strong> {signal.executionPlan.stopLoss}</p>
        <p><strong>Target:</strong> {signal.executionPlan.takeProfit}</p>
      </div>

      {signal.geminiCoach ? (
        <div className="gemini-box"><strong>Gemini:</strong> {signal.geminiCoach.summary}</div>
      ) : (
        <div className="gemini-box muted">Gemini pendiente de revisar o requiere revision manual.</div>
      )}

      <div className="signal-card__actions">
        <button className="primary" onClick={() => onView(signal)}>Ver</button>
        <button onClick={() => onCopyTicket(signal)}>Copiar ticket</button>
        <button onClick={() => onAskGemini(signal)}>Preguntar Gemini</button>
        <button onClick={() => onSave(signal)}>Guardar</button>
        <button className="danger" onClick={() => onDismiss(signal)}>Descartar</button>
      </div>
    </article>
  );
}
