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
import { DailyTradingWorkflow } from './components/DailyTradingWorkflow.jsx';
import InfoTooltip from './components/InfoTooltip.jsx';
import { loadRiskConfig, saveRiskConfig } from './config/riskConfig.ts';
import { classifyNewsEvent } from './services/newsImpactClassifier.ts';
import { professionalSignalsFromScan } from './utils/proSignalAdapter.js';
import { createOrUpdateWatchedPositionFromSignal, loadLocalJournalEntries, loadTakenSignals, loadWatchedPositions, markSignalTaken, saveLocalJournalEntry } from './services/tradeStorage.js';

const VALIDO_VERSION = import.meta.env.VITE_VALIDO_BUILD_VERSION || 'local-dev';

function dateMatches(dateStr, addDays = 0) {
  if (!dateStr) return false;
  const expected = new Date(Date.now() + addDays * 86400000).toISOString().slice(0, 10);
  const parsed = new Date(dateStr);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === expected;
}
function dateWithinDays(dateStr, days = 14) {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  const diff = parsed.getTime() - Date.now();
  return diff >= 0 && diff <= days * 86400000;
}

function Metric({ label, value, help }) {
  return <div className="rounded-2xl bg-slate-100 border border-slate-200 p-3"><p className="text-xs text-slate-800 font-bold">{label}{help && <InfoTooltip explanation={help} position="bottom" />}</p><p className="text-base text-slate-900 font-black mt-1">{value}</p></div>;
}

function RiskLimits({ profile, riskConfig }) {
  const cfg = riskConfig || loadRiskConfig();
  const tradeBudget = cfg.accountValue * cfg.defaultRiskPct / 100;
  return (
    <section className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black text-slate-900">Limites de riesgo</h2>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Cuenta" value={`$${cfg.accountValue}`} />
        <Metric label="Riesgo / trade" value={`$${tradeBudget} (${cfg.defaultRiskPct}%)`} />
        <Metric label="Colateral max." value={`${cfg.collateralCapPct}%`} />
        <Metric label="Trades abiertos" value={`${profile?.activeSymbols?.length || loadWatchedPositions().length} / ${cfg.maxOpenTrades}`} />
      </div>
    </section>
  );
}

function GuardianActivity({ scan, signals }) {
  const ready = signals.filter((signal) => ['READY', 'AGGRESSIVE', '0DTE_SCALP'].includes(signal.status)).length;
  const watch = signals.filter((signal) => signal.status === 'WATCH').length;
  const blocked = signals.filter((signal) => ['AVOID', 'NO_DATA', 'LOCKED_BY_RISK'].includes(signal.status)).length;
  return (
    <section className="risk-card p-4 space-y-3">
      <div className="flex justify-between gap-2">
        <div>
          <h2 className="text-xl font-black">Gemini Guardian <InfoTooltip explanation="Scanner autonomo. Revisa medias, volumen, RSI, soporte/resistencia, noticias, earnings, griegas, liquidez y riesgo cuando esos datos existen." position="bottom" /></h2>
          <p className="text-sm text-slate-700">Estrategia moderada-agresiva con riesgo definido. Tu siempre tomas la decision final.</p>
        </div>
        <span className="pill">{scan?.decision?.status === 'no_trade' ? 'ESPERAR' : scan?.decision?.status || 'CARGANDO'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="READY" value={ready} />
        <Metric label="WATCH" value={watch} />
        <Metric label="BLOCKED" value={blocked} />
      </div>
      <p className="text-xs text-slate-500">Ultimo ciclo: {scan?.asOf ? new Date(scan.asOf).toLocaleString() : 'pendiente'} · Refresco: {scan?.refreshSeconds || 300}s</p>
      <p className="text-xs text-slate-700">Universo: {scan?.universeCoverage?.scannedThisCycle || 'N/D'} simbolos este ciclo. Indices y acciones se conservan; si falta cadena se marca SIN DATOS.</p>
      <p className="text-xs text-slate-700">Gemini: {scan?.agent?.tokenBudget ? `${scan.agent.tokenBudget.dailyTokenBudget - scan.agent.tokenBudget.tokensUsed} tokens disponibles hoy` : 'presupuesto no disponible'}.</p>
    </section>
  );
}

function TradeJournal({ entries }) {
  return (
    <>
      <section id="journal" className="risk-card p-4 space-y-3">
        <div>
          <h2 className="text-xl font-black">Journal operativo</h2>
          <p className="text-sm text-slate-700">Señales tomadas, posiciones cerradas y decisiones de gestion. La educacion queda separada abajo.</p>
        </div>
        {entries?.length ? entries.slice(0, 12).map((entry) => (
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm" key={entry.id || `${entry.symbol}-${entry.createdAt || entry.created_at}`}>
            <strong>{entry.symbol} · {entry.strategy}</strong>
            <p className="text-slate-500">{entry.outcome || entry.status || 'OPEN'} · {new Date(entry.createdAt || entry.created_at || Date.now()).toLocaleDateString()}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{entry.reason || entry.notes || 'Snapshot guardado. Pendiente de notas post-trade.'}</p>
            <p className="mt-1 text-xs text-violet-800">Gemini: {entry.lesson || 'Pendiente de revision post-trade.'}</p>
          </div>
        )) : (
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600 space-y-1">
            <p>Aun no hay decisiones registradas.</p>
            <p>Usa "Tome esta señal" en Señales o añade una posicion manual en Riesgo.</p>
          </div>
        )}
      </section>
      <DailyTradingWorkflow />
    </>
  );
}

function SettingsPanel({ riskConfig, onSaveRisk }) {
  const [cfg, setCfg] = useState(riskConfig);
  function save() { saveRiskConfig(cfg); onSaveRisk(cfg); }
  return (
    <section id="config" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black">Configuracion operativa</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor cuenta" value={cfg.accountValue} onChange={(value) => setCfg({ ...cfg, accountValue: value })} />
        <Field label="Riesgo %" value={cfg.defaultRiskPct} onChange={(value) => setCfg({ ...cfg, defaultRiskPct: value })} />
        <Field label="Colateral %" value={cfg.collateralCapPct} onChange={(value) => setCfg({ ...cfg, collateralCapPct: value })} />
        <Field label="Max. trades" value={cfg.maxOpenTrades} onChange={(value) => setCfg({ ...cfg, maxOpenTrades: value })} />
      </div>
      <button className="primary-button w-full" onClick={save}>Guardar configuracion</button>
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
  const [dailyLesson, setDailyLesson] = useState(null);
  const [takenSignalIds, setTakenSignalIds] = useState(loadTakenSignals);
  const [toast, setToast] = useState('');

  async function load(force = false) {
    setError('');
    try { setScan(force ? await api.refresh() : await api.scan()); } catch (loadError) { setError(loadError.message); }
  }

  async function loadJournalEntries() {
    const serverEntries = await api.journal().catch(() => []);
    const localEntries = loadLocalJournalEntries();
    const seen = new Set();
    return [...localEntries, ...serverEntries].filter((entry) => {
      const key = entry.id || `${entry.symbol}-${entry.strategy}-${entry.createdAt || entry.created_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function acceptSignal(signal) {
    if (!signal?.id) throw new Error('Invalid signal');
    const legsText = (signal.legs || []).map((leg) => `${leg.side} ${leg.optionType || leg.type} ${leg.strike}`).join(' / ');
    const journalEntry = {
      id: `journal-${signal.id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      symbol: signal.symbol,
      strategy: signal.strategyLabel || signal.strategy,
      outcome: 'OPEN / WATCHING',
      source: 'signal_taken',
      expiration: signal.expiration,
      confidence: signal.score,
      reason: signal.geminiCoach?.summary || signal.executionPlan?.entryTrigger || signal.technicalSummary,
      plannedEntry: signal.executionPlan?.entryTrigger || `${signal.credit ? 'Credito' : 'Debito'} ${signal.credit ?? signal.debit ?? 'SIN DATOS'}`,
      plannedExit: `${signal.executionPlan?.takeProfit || 'TP segun plan'} / ${signal.executionPlan?.stopLoss || 'Stop segun plan'}`,
      notes: [
        `Strikes: ${legsText || 'SIN DATOS'}`,
        `Exp: ${signal.expiration || 'SIN DATOS'} (${signal.dte ?? 'SIN DATOS'} DTE)`,
        `POP: ${signal.pop ?? 'SIN DATOS'} | Max risk: ${signal.maxRiskUsd ?? 'SIN DATOS'} | Max profit: ${signal.maxProfitUsd ?? 'SIN DATOS'}`,
        'Fuente: signal_taken'
      ].join('\n'),
      regime: scan?.market?.regime,
      lesson: signal.geminiCoach?.mainRisk || 'Revisar fill real, liquidez, noticias, earnings y plan de salida.',
      signalOriginal: { ...signal, takenAt: new Date().toISOString(), marketContext: scan?.market || null, macroContext: scan?.macro || null }
    };
    let saved = null;
    try {
      saved = await api.addJournal(journalEntry);
    } catch (saveError) {
      saved = saveLocalJournalEntry({ ...journalEntry, outcome: 'OPEN / WATCHING', notes: `${journalEntry.notes}\nDB fallback: ${saveError.message}` });
    }
    createOrUpdateWatchedPositionFromSignal(signal, saved || journalEntry);
    markSignalTaken(signal.id);
    setTakenSignalIds(loadTakenSignals());
    setEntries(await loadJournalEntries());
    setToast('Señal registrada en Journal y Riesgo');
    window.setTimeout(() => setToast(''), 3500);
    setActiveTab('journal');
  }

  useEffect(() => {
    load();
    loadJournalEntries().then(setEntries).catch(() => {});
    fetch('/api/gemini/daily-lesson').then((response) => response.json()).then(setDailyLesson).catch(() => {});
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const signals = useMemo(() => professionalSignalsFromScan(scan || {}), [scan]);
  const activeSymbols = useMemo(() => new Set(loadWatchedPositions().map((position) => position.symbol)), [entries, activeTab]);
  const news = useMemo(() => {
    const macro = scan?.macro || {};
    const all = [
      ...(macro.earnings || []).filter((event) => dateWithinDays(event.date, 10)).map((event) => classifyNewsEvent({ title: `${event.symbol} Earnings ${event.date}`, symbol: event.symbol, eventDate: event.date, isEarnings: true, isToday: dateMatches(event.date), isTomorrow: dateMatches(event.date, 1) })),
      ...(macro.highImpactEvents || []).map((event) => classifyNewsEvent({ title: event.title || event.event || '', eventDate: event.date, isMacro: true, isToday: dateMatches(event.date) })),
      ...(macro.softImpactEvents || []).map((event) => classifyNewsEvent({ title: event.title || event.event || '', eventDate: event.date, isMacro: true })),
      ...(macro.breakingRisk || []).map((event) => classifyNewsEvent({ title: event.headline || event.title || '', source: event.source, url: event.url, publishedAt: event.publishedAt })),
      ...(macro.news || []).slice(0, 10).map((event) => classifyNewsEvent({ title: event.headline || event.title || '', source: event.source, url: event.url, publishedAt: event.datetime || event.publishedAt })),
      ...(macro.companyNews || []).slice(0, 20).map((event) => classifyNewsEvent({ title: event.headline || event.title || '', symbol: event.symbol, source: event.source, url: event.url, publishedAt: event.datetime || event.publishedAt }))
    ].filter(Boolean);
    return all.map((event) => activeSymbols.has(event.symbol) ? { ...event, stars: Math.max(event.stars || 0, 5), action: event.action || 'MANAGE_NOW', whyItMatters: event.whyItMatters || 'Relacionada con una posicion activa o vigilada en Riesgo.' } : event);
  }, [scan, activeSymbols]);

  const ready = signals.filter((signal) => ['READY', 'AGGRESSIVE', '0DTE_SCALP'].includes(signal.status));
  const watch = signals.filter((signal) => signal.status === 'WATCH');
  const pulse = {
    spyTrend: scan?.market?.spyTrend || scan?.market?.regime || 'NO_DATA',
    qqqTrend: scan?.market?.technicals?.QQQ?.trend || 'NO_DATA',
    vix: scan?.market?.vix ?? null,
    macroStatus: news.some((item) => item.stars >= 5) ? 'DANGER' : news.some((item) => item.stars >= 4) ? 'CAUTION' : 'CLEAR',
    tapeReading: scan?.market?.tapeReading,
    bestModeNow: ready.length ? 'REVISAR_ENTRADAS' : watch.length ? 'ESPERAR_GATILLO' : 'PRESERVAR_CAPITAL'
  };
  const brief = {
    mood: pulse.macroStatus === 'DANGER' ? 'EVENT_RISK' : scan?.market?.regime || 'CHOP',
    mode: ready.length ? 'BUSCAR_ENTRADAS' : 'ESPERAR',
    summary: ready.length ? `${ready.length} ticket(s) READY requieren revision final.` : watch.length ? `${watch.length} escenario(s) en vigilancia. No hay entrada verde aprobada todavia.` : 'Sin entrada limpia. Gemini Guardian conserva capital y explica si faltan datos.',
    bullets: [
      `Mercado: ${scan?.market?.regime || 'SIN DATOS'}`,
      `Estrategia base: moderada-agresiva con riesgo definido`,
      `READY: ${ready.length} · WATCH: ${watch.length}`,
      `Broker: no conectado; Riesgo usa LocalJournalAdapter`
    ],
    bestSymbols: [...ready, ...watch].slice(0, 3).map((signal) => signal.symbol),
    blockedSymbols: signals.filter((signal) => signal.status === 'AVOID').slice(0, 3).map((signal) => signal.symbol),
    motivation: dailyLesson?.motivation || 'Solo ejecutar tickets verdes, completos y aprobados por Gemini.'
  };
  const tabs = [
    ['inicio', 'V', 'Inicio'], ['signals', 'S', 'Señales'], ['news', 'N', 'Noticias'],
    ['risk', 'R', 'Riesgo'], ['journal', 'J', 'Journal'], ['config', 'C', 'Config']
  ];

  return (
    <div className="pro-console bg-slate-50">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3">
        <h1 className="text-lg font-bold">VALIDO 1M</h1><p className="text-xs text-slate-500">Options Guardian · Gemini Auditor</p>
      </header>
      <main className="home-pro pb-24">
        {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border border-green-200 bg-white px-4 py-3 text-sm font-bold text-green-800 shadow-lg">{toast}</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}
        {activeTab === 'inicio' && <><GeminiBriefCard {...brief} /><GuardianActivity scan={scan} signals={signals} /><MarketSentiment /><MarketPulseCard pulse={pulse} /><DailyGeminiLesson /></>}
        {activeTab === 'signals' && <OperationalSignals signals={signals} onAccept={acceptSignal} takenSignalIds={takenSignalIds} />}
        {activeTab === 'news' && <NewsImpactList news={news} />}
        {activeTab === 'risk' && <><RiskLimits profile={scan?.profile} riskConfig={riskConfig} /><BrokerPositionsDesk /></>}
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
