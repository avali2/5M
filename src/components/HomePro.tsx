import type { ProfessionalSignal } from "../types/signal";
import { groupSignalsForHome } from "../utils/signalFilters";
import { SignalCard } from "./SignalCard";

interface HomeProProps {
  signals: ProfessionalSignal[];
  marketPulse: {
    marketStatus: "OPEN" | "CLOSED";
    mode: string;
    apiStatus: string;
    lastScan: string;
    spyBias: string;
    qqqBias: string;
    vixStatus: string;
    macroStatus: string;
    newsRisk: string;
    dataQuality: string;
    bestStrategyToday: string;
  };
  geminiBrief: string;
  alertStatus: {
    pushEnabled: boolean;
    lastAlert: string | null;
    lastError: string | null;
    nextScan: string | null;
  };
  onScanNow: () => void;
  onViewSignal: (signal: ProfessionalSignal) => void;
  onCopyTicket: (signal: ProfessionalSignal) => void;
  onSaveSignal: (signal: ProfessionalSignal) => void;
  onDismissSignal: (signal: ProfessionalSignal) => void;
  onAskGemini: (signal: ProfessionalSignal) => void;
}

export function HomePro({
  signals,
  marketPulse,
  geminiBrief,
  alertStatus,
  onScanNow,
  onViewSignal,
  onCopyTicket,
  onSaveSignal,
  onDismissSignal,
  onAskGemini
}: HomeProProps) {
  const { actionable, watch, avoid } = groupSignalsForHome(signals);

  return (
    <main className="home-pro">
      <header className="app-header card" id="decision">
        <div>
          <h1>VALIDO 1M</h1>
          <p>Options Signal Console</p>
        </div>
        <div className="header-status">
          <span>Market {marketPulse.marketStatus}</span>
          <span>Mode {marketPulse.mode}</span>
          <span>API {marketPulse.apiStatus}</span>
          <span>{marketPulse.lastScan}</span>
        </div>
        <button className="primary" onClick={onScanNow}>Escanear ahora</button>
      </header>

      <section className="card market-pulse">
        <h2>Market Pulse</h2>
        <div className="pulse-grid">
          <div><span>SPY bias</span><strong>{marketPulse.spyBias}</strong></div>
          <div><span>QQQ bias</span><strong>{marketPulse.qqqBias}</strong></div>
          <div><span>VIX</span><strong>{marketPulse.vixStatus}</strong></div>
          <div><span>Macro</span><strong>{marketPulse.macroStatus}</strong></div>
          <div><span>Noticias</span><strong>{marketPulse.newsRisk}</strong></div>
          <div><span>Data</span><strong>{marketPulse.dataQuality}</strong></div>
          <div className="pulse-grid__wide"><span>Mejor enfoque hoy</span><strong>{marketPulse.bestStrategyToday}</strong></div>
        </div>
      </section>

      <section className="card gemini-brief" id="gemini">
        <div className="section-title">
          <h2>Gemini Brief</h2>
          <span className="badge badge-gemini">COMPANION</span>
        </div>
        <p>{geminiBrief}</p>
      </section>

      {/* === AUTO GUARDIAN STATUS === */}
      <section className={`card auto-guardian ${alertStatus.pushEnabled ? 'active' : 'paused'}`}>
        <div style={{ padding: 14 }}>
          <div className="section-title">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`guardian-status-dot ${alertStatus.pushEnabled ? 'active' : 'paused'}`} />
              Auto Guardian
            </h2>
            <span className="badge badge-gemini">{alertStatus.pushEnabled ? 'ACTIVO' : 'PAUSADO'}</span>
          </div>
          <div className="pulse-grid" style={{ marginTop: 10 }}>
            <div><span>Estado</span><strong>{alertStatus.pushEnabled ? 'Escaneando' : 'Pausado'}</strong></div>
            <div><span>Último scan</span><strong>{alertStatus.lastAlert || 'Esperando...'}</strong></div>
            <div><span>Próximo scan</span><strong>{alertStatus.nextScan || 'Manual'}</strong></div>
            <div><span>Modo</span><strong>{alertStatus.pushEnabled ? 'Buscando señales' : 'Solo observación'}</strong></div>
            <div className="pulse-grid__wide"><span>Fase de mercado</span><strong>{alertStatus.lastAlert ? 'Activo' : 'Esperando datos'}</strong></div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="badge badge-ready" style={{ fontSize: 9 }}>Market pulse: 60s</span>
            <span className="badge badge-wait" style={{ fontSize: 9 }}>Scanner: 180s</span>
            <span className="badge badge-gemini" style={{ fontSize: 9 }}>Gemini: ~5min</span>
          </div>
        </div>
      </section>

      <section className="signal-feed" id="signals">
        <div className="section-title">
          <h2>Signal Feed</h2>
          <span>{actionable.length} accionables</span>
        </div>

        {actionable.length === 0 ? (
          <div className="card empty-state">
            No hay entrada accionable ahora. El sistema conserva watchlist/avoid abajo y no inventa senales con datos incompletos.
          </div>
        ) : (
          actionable.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              onView={onViewSignal}
              onCopyTicket={onCopyTicket}
              onSave={onSaveSignal}
              onDismiss={onDismissSignal}
              onAskGemini={onAskGemini}
            />
          ))
        )}

        <div className="compact-lists">
          <div className="card compact-list">
            <h2>Watchlist</h2>
            {watch.length === 0 ? (
              <p>No hay setups en vigilancia.</p>
            ) : (
              watch.map((signal) => (
                <button key={signal.id} onClick={() => onViewSignal(signal)}>
                  {signal.symbol} - {signal.strategyLabel} - Score {signal.score}
                </button>
              ))
            )}
          </div>

          <div className="card compact-list">
            <h2>Avoid / No Data</h2>
            {avoid.length === 0 ? (
              <p>No hay bloqueos criticos.</p>
            ) : (
              avoid.map((signal) => (
                <button key={signal.id} onClick={() => onViewSignal(signal)}>
                  {signal.symbol} - {signal.blockedReason || signal.status}
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="card alert-status">
        <h2>Alert Status</h2>
        <div className="pulse-grid">
          <div><span>Push</span><strong>{alertStatus.pushEnabled ? "ON" : "OFF"}</strong></div>
          <div><span>Ultima alerta</span><strong>{alertStatus.lastAlert || "Ninguna"}</strong></div>
          <div><span>Proximo scan</span><strong>{alertStatus.nextScan || "Manual"}</strong></div>
          <div><span>Error</span><strong>{alertStatus.lastError || "OK"}</strong></div>
        </div>
      </section>
    </main>
  );
}
