import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./lib/api.js";
import { GeminiBriefCard } from "./components/GeminiBriefCard.tsx";
import { MarketPulseCard } from "./components/MarketPulseCard.jsx";
import { NewsImpactList } from "./components/NewsImpactList.jsx";
import { NotificationStatusCard } from "./components/NotificationStatusCard.jsx";
import { SignalCard } from "./components/SignalCard.jsx";
import { loadRiskConfig, saveRiskConfig } from "./config/riskConfig.ts";
import { classifyNewsEvent } from "./services/newsImpactClassifier.ts";

const VALIDO_VERSION = import.meta.env.VITE_VALIDO_BUILD_VERSION || "local-dev";
const VALIDO_TIMESTAMP = import.meta.env.VITE_VALIDO_BUILD_TIMESTAMP || "";

function VersionBadge() {
  const shortDate = VALIDO_TIMESTAMP
    ? new Date(VALIDO_TIMESTAMP).toLocaleDateString("es-MX", { month: "short", day: "numeric" })
    : "";
  return (
    <a href="/" title={`Build: ${VALIDO_VERSION}`} className="fixed right-3 top-3 z-50 pill hover:border-blue-400 hover:text-white transition">
      v{VALIDO_VERSION}{shortDate ? ` · ${shortDate}` : ""}
    </a>
  );
}

function BottomNav() {
  const items = [
    ["inicio", "Inicio"],
    ["signals", "Senales"],
    ["news", "Noticias"],
    ["risk", "Riesgo"],
    ["journal", "Journal"],
    ["settings", "Config"]
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-white/10 bg-[#08111f]/95 px-1 py-3 backdrop-blur">
      {items.map(([target, label]) => (
        <a className="rounded-lg px-3 py-2 text-xs font-bold text-slate-400 hover:text-white transition" href={`#${target}`} key={target}>{label}</a>
      ))}
    </nav>
  );
}

function TopSignalsList({ signals }) {
  if (!signals?.length) return (
    <section className="signal-card p-4 space-y-3">
      <h2 className="text-xl font-black text-white">Senales del momento</h2>
      <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
        <p className="text-sm text-slate-300">No hay senales aprobadas ahora. El scanner sigue vigilando.</p>
      </div>
    </section>
  );
  return (
    <section id="signals" className="space-y-4">
      <h2 className="text-xl font-black text-white px-1">Senales del momento</h2>
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
      <h2 className="text-xl font-black text-white">Mesa de riesgo</h2>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Cuenta" value={`$${cfg.accountValue}`} />
        <Metric label="Riesgo/trade" value={`$${tradeBudget} (${cfg.defaultRiskPct}%)`} />
        <Metric label="Maximo A+" value={`$${maxBudget} (${cfg.maxRiskPct}%)`} />
        <Metric label="Colateral" value={`${cfg.collateralCapPct}%`} />
        <Metric label="Open trades" value={`${profile.activeSymbols?.length || 0} / ${cfg.maxOpenTrades}`} />
        <Metric label="PDT" value={cfg.pdtProtected ? "Protegido" : "Sin proteccion"} />
        <Metric label="Day trades" value={`${cfg.maxDayTradesRolling5Days} / 5 dias`} />
        <Metric label="0DTE" value={profile.allow0Dte ? "Permitido" : "Solo coleccion"} />
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
      <p className="text-xs text-slate-400 font-bold">{label}</p>
      <p className="text-base text-white font-black mt-1">{value}</p>
    </div>
  );
}

function TradeJournal({ entries }) {
  return (
    <section id="journal" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black text-white">Journal</h2>
      {entries?.length ? entries.slice(0, 6).map((e) => (
        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3 text-sm" key={e.id}>
          <strong className="text-white">{e.symbol} - {e.strategy}</strong>
          <p className="text-slate-300 mt-1">{e.outcome} | {new Date(e.createdAt || e.created_at).toLocaleDateString()}</p>
        </div>
      )) : (
        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
          <p className="text-sm text-slate-300">Aun sin decisiones registradas.</p>
        </div>
      )}
    </section>
  );
}

function SettingsPanel({ riskConfig, onSaveRisk }) {
  const [cfg, setCfg] = useState(riskConfig || { accountValue: 2000, defaultRiskPct: 10, maxRiskPct: 20, collateralCapPct: 35, maxOpenTrades: 3, pdtProtected: true, maxDayTradesRolling5Days: 3 });

  function handleSave() {
    saveRiskConfig(cfg);
    onSaveRisk?.(cfg);
  }

  return (
    <section id="settings" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black text-white">Configuracion de cuenta</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
          <p className="text-xs text-slate-400 font-bold">Valor cuenta</p>
          <input className="input mt-1" type="number" value={cfg.accountValue} onChange={e => setCfg({ ...cfg, accountValue: Number(e.target.value) })} />
        </div>
        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
          <p className="text-xs text-slate-400 font-bold">Riesgo %</p>
          <input className="input mt-1" type="number" value={cfg.defaultRiskPct} onChange={e => setCfg({ ...cfg, defaultRiskPct: Number(e.target.value) })} />
        </div>
        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
          <p className="text-xs text-slate-400 font-bold">Max riesgo A+ %</p>
          <input className="input mt-1" type="number" value={cfg.maxRiskPct} onChange={e => setCfg({ ...cfg, maxRiskPct: Number(e.target.value) })} />
        </div>
        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
          <p className="text-xs text-slate-400 font-bold">Max colateral %</p>
          <input className="input mt-1" type="number" value={cfg.collateralCapPct} onChange={e => setCfg({ ...cfg, collateralCapPct: Number(e.target.value) })} />
        </div>
        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
          <p className="text-xs text-slate-400 font-bold">Max trades</p>
          <input className="input mt-1" type="number" value={cfg.maxOpenTrades} onChange={e => setCfg({ ...cfg, maxOpenTrades: Number(e.target.value) })} />
        </div>
        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
          <p className="text-xs text-slate-400 font-bold">PDT</p>
          <select className="input mt-1" value={cfg.pdtProtected ? "true" : "false"} onChange={e => setCfg({ ...cfg, pdtProtected: e.target.value === "true" })}>
            <option value="true">Protegido</option>
            <option value="false">Sin proteccion</option>
          </select>
        </div>
      </div>
      <button className="primary-button w-full" onClick={handleSave}>Guardar configuracion</button>
    </section>
  );
}

export default function AppPro() {
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
    const opps = scan?.opportunities || [];
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
    const items = [
      ...(raw.highImpactEvents || []).map(e => classifyNewsEvent({ title: e.title || e.event || "", eventDate: e.date, isMacro: true, isToday: true })),
      ...(raw.softImpactEvents || []).map(e => classifyNewsEvent({ title: e.title || e.event || "", eventDate: e.date, isMacro: true })),
      ...(raw.breakingRisk || []).map(e => classifyNewsEvent({ title: e.headline || e.title || "", source: e.source, url: e.url }))
    ];
    return items.filter(Boolean);
  }, [scan]);

  const marketPulse = useMemo(() => ({
    spyTrend: scan?.market?.spyTrend || "NO_DATA",
    qqqTrend: scan?.market?.technicals?.QQQ?.trend || "NO_DATA",
    vix: scan?.market?.vix ?? null,
    vixRegime: "NORMAL",
    macroStatus: news.some(n => n.stars >= 5) ? "DANGER" : news.some(n => n.stars >= 4) ? "CAUTION" : "CLEAR",
    newsStatus: news.some(n => n.stars >= 5) ? "DANGER" : news.some(n => n.stars >= 4) ? "CAUTION" : "CLEAR",
    tapeReading: scan?.market?.tapeReading || { arrow: "❔", label: "Sin datos", explanation: "", confidence: 0, signals: [], institutionalFlow: "NO_DATA" },
    bestModeNow: scan?.opportunities?.length ? "BUSCAR_ENTRADAS" : "ESPERAR"
  }), [scan, news]);

  const geminiBrief = useMemo(() => {
    const approved = signals.filter(s => s.geminiApproved);
    return {
      mood: news.some(n => n.stars >= 5) ? "EVENT_RISK" : scan?.market?.regime === "BULL_TREND" ? "RISK_ON" : scan?.market?.regime === "BEAR_TREND" ? "RISK_OFF" : "CHOP",
      mode: approved.length ? "BUSCAR_ENTRADAS" : "ESPERAR",
      summary: approved.length
        ? `Se detectaron ${approved.length} senal(es) con edge real y aprobacion Gemini. Revisar senales abajo.`
        : `No hay senales aprobadas ahora. Se requiere mas datos de mercado o condiciones mas claras.`,
      bullets: approved.slice(0, 5).map(s => `${s.symbol} ${s.strategy} - Score ${s.score || "?"}`),
      bestSymbols: approved.map(s => s.symbol).slice(0, 3),
      blockedSymbols: (scan?.rejected || []).slice(0, 3).map(s => s.symbol),
      education: approved[0]?.geminiReview?.educationNote ? { title: "Leccion pro", lesson: approved[0].geminiReview.educationNote, proTip: "Riesgo definido, salida clara." } : undefined
    };
  }, [signals, news, scan]);

  return (
    <div className="pro-console">
      <VersionBadge />
      <div className="home-pro">
        {error && <div className="bg-red-500/10 border border-red-400/20 rounded-2xl p-4 text-sm text-red-200">{error}</div>}

        <NotificationStatusCard />
        <GeminiBriefCard {...geminiBrief} />
        <MarketPulseCard pulse={marketPulse} />
        <TopSignalsList signals={signals} />
        <NewsImpactList events={news} />
        <RiskDesk profile={scan?.profile} riskConfig={riskConfig} />
        <TradeJournal entries={entries} />
        <SettingsPanel riskConfig={riskConfig} onSaveRisk={setRiskConfig} />

        <footer className="text-xs text-slate-500 text-center py-4">
          Educational / decision-support only. No auto-trading enabled.
          <span className="block mt-1">v{VALIDO_VERSION} | Refresh {scan?.refreshSeconds || 300}s</span>
        </footer>
      </div>
      <BottomNav />
    </div>
  );
}