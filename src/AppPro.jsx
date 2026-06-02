import React, { useEffect, useMemo, useState } from 'react';
import { api } from './lib/api.js';
import { GeminiBriefCard } from './components/GeminiBriefCard.tsx';
import { MarketPulseCard } from './components/MarketPulseCard.jsx';
import { NewsImpactList } from './components/NewsImpactList.jsx';
import MarketSentiment from './components/MarketSentiment.jsx';
import NotificationManager from './components/NotificationManager.jsx';
import SystemStatus from './components/SystemStatus.jsx';
import { OperationalSignals } from './components/OperationalSignals.jsx';
import { BrokerPositionsDesk } from './components/BrokerPositionsDesk.jsx';
import { DailyGeminiLesson } from './components/DailyGeminiLesson.jsx';
import { loadRiskConfig, saveRiskConfig } from './config/riskConfig.ts';
import { classifyNewsEvent } from './services/newsImpactClassifier.ts';
import { professionalSignalsFromScan } from './utils/proSignalAdapter.js';

const VALIDO_VERSION = import.meta.env.VITE_VALIDO_BUILD_VERSION || 'local-dev';

function dateMatches(dateStr, addDays = 0) {
  if (!dateStr) return false;
  const expected = new Date(Date.now() + addDays * 86400000).toISOString().slice(0, 10);
  const parsed = new Date(dateStr);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === expected;
}

function RiskDesk({ profile, riskConfig }) {
  const cfg = riskConfig || loadRiskConfig();
  const tradeBudget = cfg.accountValue * cfg.defaultRiskPct / 100;
  return (
    <section id="risk" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black text-slate-900">🛡️ Límites de riesgo</h2>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Cuenta" value={`$${cfg.accountValue}`} />
        <Metric label="Riesgo / trade" value={`$${tradeBudget} (${cfg.defaultRiskPct}%)`} />
        <Metric label="Colateral máx." value={`${cfg.collateralCapPct}%`} />
        <Metric label="Trades abiertos" value={`${profile?.activeSymbols?.length || 0} / ${cfg.maxOpenTrades}`} />
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500 font-bold">{label}</p><p className="text-base text-slate-900 font-black mt-1">{value}</p></div>;
}

function GuardianActivity({ scan, signals }) {
  const ready = signals.filter((signal) => ['READY', 'AGGRESSIVE', '0DTE_SCALP'].includes(signal.status)).length;
  const watch = signals.filter((signal) => signal.status === 'WATCH').length;
  const blocked = signals.filter((signal) => ['AVOID', 'NO_DATA', 'LOCKED_BY_RISK'].includes(signal.status)).length;
  return (
    <section className="risk-card p-4 space-y-3">
      <div className="flex justify-between gap-2">
        <div><h2 className="text-xl font-black">🤖 Auto Guardian</h2><p className="text-sm text-slate-600">Clasifica el mercado por sí solo. Solo avisa cuando el filtro permite actuar.</p></div>
        <span className="pill">{scan?.decision?.status || 'CARGANDO'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="🟢 Revisar" value={ready} /><Metric label="🟠 Vigilar" value={watch} /><Metric label="🔴 Evitar" value={blocked} />
      </div>
      <p className="text-xs text-slate-500">Último ciclo: {scan?.asOf ? new Date(scan.asOf).toLocaleString() : 'pendiente'} · Refresco: {scan?.refreshSeconds || 300}s</p>
    </section>
  );
}

function TradeJournal({ entries }) {
  return (
    <section id="journal" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black">📓 Journal de decisiones</h2>
      {entries?.length ? entries.slice(0, 8).map((entry) => (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm" key={entry.id}>
          <strong>{entry.symbol} · {entry.strategy}</strong>
          <p className="text-slate-500">{entry.outcome} · {new Date(entry.createdAt || entry.created_at).toLocaleDateString()}</p>
        </div>
      )) : (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600 space-y-1">
          <p>Aún no hay decisiones registradas.</p>
          <p>Usa Riesgo para registrar posiciones actuales y anota la razón de cada ajuste en Notas.</p>
        </div>
      )}
    </section>
  );
}

function SettingsPanel({ riskConfig, onSaveRisk }) {
  const [cfg, setCfg] = useState(riskConfig);
  function save() { saveRiskConfig(cfg); onSaveRisk(cfg); }
  return (
    <section id="config" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black">⚙️ Configuración operativa</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor cuenta" value={cfg.accountValue} onChange={(value) => setCfg({ ...cfg, accountValue: value })} />
        <Field label="Riesgo %" value={cfg.defaultRiskPct} onChange={(value) => setCfg({ ...cfg, defaultRiskPct: value })} />
        <Field label="Colateral %" value={cfg.collateralCapPct} onChange={(value) => setCfg({ ...cfg, collateralCapPct: value })} />
        <Field label="Máx. trades" value={cfg.maxOpenTrades} onChange={(value) => setCfg({ ...cfg, maxOpenTrades: value })} />
      </div>
      <button className="primary-button w-full" onClick={save}>Guardar configuración</button>
    </section>
  );
}

function Field({ label, value, onChange }) {
  return <label className="rounded-2xl bg-slate-50 border border-slate-200 p-3"><span className="text-xs text-slate-500 font-bold">{label}</span><input className="input mt-1" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export default function AppPro() {
  const [activeTab, setActiveTab] = useState('inicio');
  const [scan, setScan] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [riskConfig, setRiskConfig] = useState(loadRiskConfig);

  async function load(force = false) {
    setError('');
    try { setScan(force ? await api.refresh() : await api.scan()); } catch (loadError) { setError(loadError.message); }
  }

  useEffect(() => {
    load();
    api.journal().then(setEntries).catch(() => {});
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const signals = useMemo(() => professionalSignalsFromScan(scan || {}), [scan]);
  const news = useMemo(() => {
    const macro = scan?.macro || {};
    return [
      ...(macro.earnings || []).map((event) => classifyNewsEvent({ title: `${event.symbol} Earnings ${event.date}`, symbol: event.symbol, eventDate: event.date, isEarnings: true, isToday: dateMatches(event.date), isTomorrow: dateMatches(event.date, 1) })),
      ...(macro.highImpactEvents || []).map((event) => classifyNewsEvent({ title: event.title || event.event || '', eventDate: event.date, isMacro: true, isToday: dateMatches(event.date) })),
      ...(macro.softImpactEvents || []).map((event) => classifyNewsEvent({ title: event.title || event.event || '', eventDate: event.date, isMacro: true })),
      ...(macro.breakingRisk || []).map((event) => classifyNewsEvent({ title: event.headline || event.title || '', source: event.source, url: event.url })),
    ].filter(Boolean);
  }, [scan]);
  const ready = signals.filter((signal) => ['READY', 'AGGRESSIVE', '0DTE_SCALP'].includes(signal.status));
  const watch = signals.filter((signal) => signal.status === 'WATCH');
  const pulse = {
    spyTrend: scan?.market?.spyTrend || scan?.market?.regime || 'NO_DATA',
    qqqTrend: scan?.market?.technicals?.QQQ?.trend || 'NO_DATA',
    vix: scan?.market?.vix ?? null,
    macroStatus: news.some((item) => item.stars >= 5) ? 'DANGER' : news.some((item) => item.stars >= 4) ? 'CAUTION' : 'CLEAR',
    tapeReading: scan?.market?.tapeReading,
    bestModeNow: ready.length ? 'REVISAR_ENTRADAS' : watch.length ? 'ESPERAR_GATILLO' : 'PRESERVAR_CAPITAL',
  };
  const brief = {
    mood: pulse.macroStatus === 'DANGER' ? 'EVENT_RISK' : scan?.market?.regime || 'CHOP',
    mode: ready.length ? 'BUSCAR_ENTRADAS' : 'ESPERAR',
    summary: ready.length ? `${ready.length} ticket(s) requieren revisión final.` : watch.length ? `${watch.length} escenario(s) en vigilancia. No hay entrada aprobada todavía.` : 'Sin entrada limpia. El Guardian conserva capital.',
    bullets: [...ready, ...watch].slice(0, 4).map((signal) => `${signal.symbol} · ${signal.strategyLabel} · ${signal.status}`),
    bestSymbols: [...ready, ...watch].slice(0, 3).map((signal) => signal.symbol),
    blockedSymbols: signals.filter((signal) => signal.status === 'AVOID').slice(0, 3).map((signal) => signal.symbol),
  };
  const tabs = [
    ['inicio', '🏠', 'Inicio'], ['signals', '📡', 'Señales'], ['news', '📰', 'Noticias'],
    ['risk', '🛡️', 'Riesgo'], ['journal', '📓', 'Journal'], ['config', '⚙️', 'Config'],
  ];

  return (
    <div className="pro-console bg-slate-50">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3">
        <h1 className="text-lg font-bold">VALIDO 1M</h1><p className="text-xs text-slate-500">Options Guardian · Gemini Auditor</p>
      </header>
      <main className="home-pro pb-24">
        {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}
        {activeTab === 'inicio' && <><GeminiBriefCard {...brief} /><GuardianActivity scan={scan} signals={signals} /><MarketSentiment /><MarketPulseCard pulse={pulse} /><OperationalSignals signals={signals} compact /><DailyGeminiLesson /></>}
        {activeTab === 'signals' && <OperationalSignals signals={signals} />}
        {activeTab === 'news' && <NewsImpactList events={news} />}
        {activeTab === 'risk' && <><RiskDesk profile={scan?.profile} riskConfig={riskConfig} /><BrokerPositionsDesk /></>}
        {activeTab === 'journal' && <TradeJournal entries={entries} />}
        {activeTab === 'config' && <><SettingsPanel riskConfig={riskConfig} onSaveRisk={setRiskConfig} /><NotificationManager /><SystemStatus /></>}
        <footer className="text-xs text-slate-500 text-center py-4">Educational / decision-support only. No auto-trading enabled.<span className="block mt-1">v{VALIDO_VERSION}</span></footer>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 px-1 py-2">
        <div className="flex justify-around max-w-lg mx-auto">{tabs.map(([id, icon, label]) => <button key={id} onClick={() => setActiveTab(id)} className={`flex flex-col items-center px-2 py-1.5 rounded-lg text-[11px] font-bold ${activeTab === id ? 'bg-blue-600 text-white' : 'text-slate-500'}`}><span className="text-base">{icon}</span><span>{label}</span></button>)}</div>
      </nav>
    </div>
  );
}
