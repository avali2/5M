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

function GeminiVerdict({ coach }: { coach: ProfessionalSignal["geminiCoach"] }) {
  if (!coach) {
    return (
      <div className="gemini-box muted">
        <p><strong>Gemini Guardian:</strong> Pendiente de revisión o requiere revisión manual.</p>
      </div>
    );
  }

  const verdictColor = coach.decision === "takeable" ? "var(--ready)" 
    : coach.decision === "aggressive_takeable" || coach.decision === "scalp_only" ? "var(--aggressive)"
    : coach.decision === "watch" ? "var(--watch)" 
    : "var(--avoid)";

  return (
    <div className="gemini-box" style={{ borderLeft: `4px solid ${verdictColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <p style={{ fontWeight: 700, color: 'var(--gemini)', fontSize: 13, margin: 0 }}>
          Gemini Guardian
        </p>
        <span className={`badge ${
          coach.decision === "takeable" ? "badge-ready" 
          : coach.decision === "aggressive_takeable" ? "badge-aggressive"
          : coach.decision === "scalp_only" ? "badge-scalp"
          : coach.decision === "watch" ? "badge-watch"
          : "badge-avoid"
        }`} style={{ fontSize: 9 }}>
          {coach.decision === "takeable" ? "APROBADA" 
            : coach.decision === "aggressive_takeable" ? "AGRESIVA"
            : coach.decision === "scalp_only" ? "SCALP"
            : coach.decision === "watch" ? "OBSERVAR"
            : "EVITAR"}
        </span>
      </div>
      <p style={{ margin: '4px 0', fontSize: 12, lineHeight: 1.4 }}>{coach.summary}</p>
      <p style={{ margin: '4px 0', fontSize: 11, color: 'var(--pro-muted)' }}>
        <strong>Confianza:</strong> {coach.confidence}/100
      </p>
      {coach.mainRisk && (
        <p style={{ margin: '4px 0', fontSize: 11, color: '#fecaca' }}>
          <strong>Riesgo principal:</strong> {coach.mainRisk}
        </p>
      )}
      {coach.doNotEnterIf && (
        <p style={{ margin: '4px 0', fontSize: 11, color: 'var(--watch)' }}>
          <strong>No entrar si:</strong> {coach.doNotEnterIf}
        </p>
      )}
      {coach.checklist && coach.checklist.length > 0 && (
        <div style={{ marginTop: 6, padding: 6, background: 'rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 11 }}>
          <strong style={{ color: 'var(--gemini-blue)' }}>Checklist Gemini:</strong>
          {coach.checklist.slice(0, 4).map((item, i) => (
            <p key={i} style={{ margin: '2px 0', color: 'var(--pro-muted)' }}>• {item}</p>
          ))}
        </div>
      )}
    </div>
  );
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
        <div className="gemini-highlight"><span>Gemini</span><strong>{signal.geminiCoach ? `${signal.geminiCoach.confidence}/100` : "Pendiente"}</strong></div>
        <div><span>Max ganancia</span><strong>{signal.maxProfitUsd != null ? `$${Math.round(signal.maxProfitUsd)}` : "N/A"}</strong></div>
      </div>

      {signal.dte === 0 && signal.gammaRisk ? (
        <div className="gamma-strip">Gamma {signal.gammaRisk.level}: {signal.gammaRisk.reason} | Max hold: {signal.gammaRisk.maxHoldMinutes || 'N/A'}min | Evitar despuès de {signal.gammaRisk.avoidAfterTime || '3:30pm ET'}</div>
      ) : null}

      <div className="execution-box">
        <p><strong>Entrada:</strong> {signal.executionPlan.entryTrigger}</p>
        <p><strong>Stop loss:</strong> {signal.executionPlan.stopLoss}</p>
        <p><strong>Take profit:</strong> {signal.executionPlan.takeProfit}</p>
        <p><strong>Tiempo límite:</strong> {signal.executionPlan.timeStop}</p>
      </div>

      <GeminiVerdict coach={signal.geminiCoach} />

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