import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./lib/api.js";
import { GeminiBriefCard } from "./components/GeminiBriefCard.tsx";
import { MarketPulseCard } from "./components/MarketPulseCard.jsx";
import { NewsImpactList } from "./components/NewsImpactList.jsx";
import { NotificationStatusCard } from "./components/NotificationStatusCard.jsx";
import { SignalCard } from "./components/SignalCard.jsx";
import MarketSentiment from "./components/MarketSentiment.jsx";
import GeminiAssistant from "./components/GeminiAssistant.jsx";
import NotificationManager from "./components/NotificationManager.jsx";
import LearningHub from "./components/LearningHub.jsx";
import SystemStatus from "./components/SystemStatus.jsx";
import { loadRiskConfig, saveRiskConfig } from "./config/riskConfig.ts";
import { classifyNewsEvent } from "./services/newsImpactClassifier.ts";

const VALIDO_VERSION = import.meta.env.VITE_VALIDO_BUILD_VERSION || "local-dev";
const VALIDO_TIMESTAMP = import.meta.env.VITE_VALIDO_BUILD_TIMESTAMP || "";

function isDateToday(dateStr) {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === today;
}

function isDateTomorrow(dateStr) {
  if (!dateStr) return false;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === tomorrow;
}

function VersionBadge() {
  const shortDate = VALIDO_TIMESTAMP
    ? new Date(VALIDO_TIMESTAMP).toLocaleDateString("es-MX", { month: "short", day: "numeric" })
    : "";
  return (
    <a href="/" title={`Build: ${VALIDO_VERSION}`} className="fixed right-3 top-3 z-50 pill hover:border-blue-400 hover:text-slate-900 transition">
      v{VALIDO_VERSION}{shortDate ? ` · ${shortDate}` : ""}
    </a>
  );
}

function TopSignalsList({ signals }) {
  if (!signals?.length) return (
    <section className="signal-card p-4 space-y-3">
      <h2 className="text-xl font-black text-slate-900">Señales del momento</h2>
      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
        <p className="text-sm text-slate-500">No hay señales ahora. El scanner sigue vigilando.</p>
      </div>
    </section>
  );
  return (
    <section id="signals" className="space-y-4">
      <h2 className="text-xl font-black text-slate-900 px-1">Señales del momento</h2>
      {signals.slice(0, 5).map((s, i) => <SignalCard signal={s} key={s.id || i} />)}
    </section>
  );
}

function RiskDesk({ profile, riskConfig, onSave }) {
  if (!profile) return null;
  const cfg = riskConfig || loadRiskConfig();
  const tradeBudget = cfg.accountValue * cfg.defaultRiskPct / 100;
  const maxBudget = cfg.accountValue * cfg.maxRiskPct / 100;
  return (
    <section id="risk" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black text-slate-900">Mesa de riesgo</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Cuenta</p><p className="text-base text-slate-900 font-black mt-1">${cfg.accountValue}</p></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Riesgo/trade</p><p className="text-base text-slate-900 font-black mt-1">${tradeBudget} ({cfg.defaultRiskPct}%)</p></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Maximo A+</p><p className="text-base text-slate-900 font-black mt-1">${maxBudget} ({cfg.maxRiskPct}%)</p></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Colateral</p><p className="text-base text-slate-900 font-black mt-1">{cfg.collateralCapPct}%</p></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">Open trades</p><p className="text-base text-slate-900 font-black mt-1">{profile.activeSymbols?.length || 0} / {cfg.maxOpenTrades}</p></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">PDT</p><p className="text-base text-slate-900 font-black mt-1">{cfg.pdtProtected ? "Protegido" : "Sin proteccion"}</p></div>
      </div>
    </section>
  );
}

function TradeJournal({ entries }) {
  return (
    <section id="journal" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black text-slate-900">Journal</h2>
      {entries?.length ? entries.slice(0, 6).map(e => (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm" key={e.id}>
          <strong className="text-slate-900">{e.symbol} - {e.strategy}</strong>
          <p className="text-slate-500 mt-1">{e.outcome} | {new Date(e.createdAt || e.created_at).toLocaleDateString()}</p>
        </div>
      )) : (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-sm text-slate-500">Aun sin decisiones registradas.</p>
        </div>
      )}
    </section>
  );
}

function SettingsPanel({ riskConfig, onSaveRisk }) {
  const [cfg, setCfg] = useState(riskConfig || { accountValue: 2000, defaultRiskPct: 10, maxRiskPct: 20, collateralCapPct: 35, maxOpenTrades: 3, pdtProtected: true, maxDayTradesRolling5Days: 3 });
  function handleSave() { saveRiskConfig(cfg); onSaveRisk?.(cfg); }
  return (
    <section id="settings" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black text-slate-900">Configuración de cuenta</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500 font-bold">Valor cuenta</p>
          <input className="input mt-1" type="number" value={cfg.accountValue} onChange={e => setCfg({...cfg, accountValue: Number(e.target.value)})} />
        </div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500 font-bold">Riesgo %</p>
          <input className="input mt-1" type="number" value={cfg.defaultRiskPct} onChange={e => setCfg({...cfg, defaultRiskPct: Number(e.target.value)})} />
        </div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500 font-bold">Colateral %</p>
          <input className="input mt-1" type="number" value={cfg.collateralCapPct} onChange={e => setCfg({...cfg, collateralCapPct: Number(e.target.value)})} />
        </div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500 font-bold">Max trades</p>
          <input className="input mt-1" type="number" value={cfg.maxOpenTrades} onChange={e => setCfg({...cfg, maxOpenTrades: Number(e.target.value)})} />
        </div>
      </div>
      <button className="primary-button w-full" onClick={handleSave}>Guardar configuración</button>
    </section>
  );
}

export default function AppPro() {
  const [activeTab, setActiveTab] = useState('inicio');
  const [scan, setScan] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [riskConfig, setRiskConfig] = useState(loadRiskConfig);
  const latestAlert = useRef(null);

  async function load(force = false) {
    setError("");
    try {
      const data = force ? await api.refresh() : await api.scan();
      setScan(data);
    } catch (e) { setError(e.message); }
  }

  async function loadJournal() {
    try { setEntries(await api.journal()); } catch {}
  }

  useEffect(() => { load(); loadJournal(); }, []);

  const signals = useMemo(() => {
    const opps = Array.isArray(scan?.opportunities) ? scan.opportunities : [];
    return opps.map(s => ({
      ...s,
      rating: s.geminiReview?.verdict === "APPROVED" ? "A" : s.rating || s.score > 80 ? "B+" : "WATCH_ONLY",
      geminiApproved: s.geminiReview?.verdict === "APPROVED" || s.aiVerificationStatus === "APPROVED_BY_GEMINI_GUARDIAN",
      geminiSummary: s.geminiReview?.summary || s.geminiCoach?.summary || "Pendiente",
      education: s.geminiReview?.educationNote || s.geminiCoach?.mainRisk || ""
    }));
  }, [scan]);

  const news = useMemo(() => {
    const raw = scan?.macro || {};
    const earnings = raw?.earnings || [];
    const items = [
      ...earnings.map(e => classifyNewsEvent({ title: `${e.symbol} Earnings ${e.date}`, symbol: e.symbol, eventDate: e.date, isEarnings: true, isToday: isDateToday(e.date), isTomorrow: isDateTomorrow(e.date) })),
      ...(raw.highImpactEvents || []).map(e => classifyNewsEvent({ title: e.title || e.event || "", eventDate: e.date, isMacro: true, isToday: isDateToday(e.date) })),
      ...(raw.softImpactEvents || []).map(e => classifyNewsEvent({ title: e.title || e.event || "", eventDate: e.date, isMacro: true })),
      ...(raw.breakingRisk || []).map(e => classifyNewsEvent({ title: e.headline || e.title || "", source: e.source, url: e.url }))
    ];
    return items.filter(Boolean);
  }, [scan]);

  const marketPulse = useMemo(() => ({
    spyTrend: scan?.market?.spyTrend || "NO_DATA", qqqTrend: scan?.market?.technicals?.QQQ?.trend || "NO_DATA",
    vix: scan?.market?.vix ?? null, vixRegime: "NORMAL",
    macroStatus: news.some(n => n.stars >= 5) ? "DANGER" : news.some(n => n.stars >= 4) ? "CAUTION" : "CLEAR",
    newsStatus: news.some(n => n.stars >= 5) ? "DANGER" : news.some(n => n.stars >= 4) ? "CAUTION" : "CLEAR",
    tapeReading: scan?.market?.tapeReading || { arrow: "❔", label: "Sin datos" },
    bestModeNow: scan?.opportunities?.length ? "BUSCAR_ENTRADAS" : "ESPERAR"
  }), [scan, news]);

  const geminiBrief = useMemo(() => {
    const approved = signals.filter(s => s.geminiApproved);
    return {
      mood: news.some(n => n.stars >= 5) ? "EVENT_RISK" : scan?.market?.regime === "BULL_TREND" ? "RISK_ON" : scan?.market?.regime === "BEAR_TREND" ? "RISK_OFF" : "CHOP",
      mode: approved.length ? "BUSCAR_ENTRADAS" : "ESPERAR",
      summary: approved.length ? `Se detectaron ${approved.length} señal(es).` : "No hay señales aprobadas ahora.",
      bullets: approved.slice(0, 5).map(s => `${s.symbol} ${s.strategy} - Score ${s.score || "?"}`),
      bestSymbols: approved.map(s => s.symbol).slice(0, 3),
      blockedSymbols: (scan?.rejected || []).slice(0, 3).map(s => s.symbol),
    };
  }, [signals, news, scan]);

  // Tab navigation
  const tabs = [
    { id: 'inicio', label: '🏠 Inicio', icon: '🏠' },
    { id: 'signals', label: '📡 Señales', icon: '📡' },
    { id: 'news', label: '📰 Noticias', icon: '📰' },
    { id: 'risk', label: '⚠️ Riesgo', icon: '⚠️' },
    { id: 'journal', label: '📓 Journal', icon: '📓' },
    { id: 'config', label: '⚙️ Config', icon: '⚙️' },
  ];

  const showAllContent = true; // Show all sections, tabs just scroll

  return (
    <div className="pro-console bg-slate-50">
      <VersionBadge />

      {/* Fixed top bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3">
        <h1 className="text-lg font-bold text-slate-900">VALIDO 1M</h1>
        <p className="text-xs text-slate-500">Options Guardian · Gemini Auditor</p>
      </div>

      <div className="home-pro pb-24">
        {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}

        {/* Show all content regardless of active tab */}

        {activeTab === 'inicio' && (
          <>
            <GeminiBriefCard {...geminiBrief} />
            <GeminiAssistant />
            <MarketSentiment />
            <MarketPulseCard pulse={marketPulse} />
          </>
        )}
        {activeTab === 'signals' && <TopSignalsList signals={signals} />}
        {activeTab === 'news' && <NewsImpactList events={news} />}
        {activeTab === 'risk' && <RiskDesk profile={scan?.profile} riskConfig={riskConfig} />}
        {activeTab === 'journal' && <TradeJournal entries={entries} />}
        {activeTab === 'config' && (
          <>
            <SettingsPanel riskConfig={riskConfig} onSaveRisk={setRiskConfig} />
            <LearningHub />
            <NotificationManager />
            <NotificationStatusCard />
          </>
        )}

        {activeTab !== 'config' && activeTab !== 'risk' && activeTab !== 'journal' && activeTab !== 'signals' && activeTab !== 'news' && (
          <>
            <TopSignalsList signals={signals} />
            <NewsImpactList events={news} />
            <RiskDesk profile={scan?.profile} riskConfig={riskConfig} />
          </>
        )}

        <footer className="text-xs text-slate-500 text-center py-4">
          Educational / decision-support only. No auto-trading enabled.
          <span className="block mt-1">v{VALIDO_VERSION} | {scan?.refreshSeconds || 300}s refresh</span>
        </footer>
        <SystemStatus />
      </div>

      {/* Bottom Nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 px-2 py-2 backdrop-blur">
        <div className="flex justify-around max-w-lg mx-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                document.getElementById(tab.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}