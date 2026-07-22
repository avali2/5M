import React, { useEffect, useMemo, useState } from 'react';
import { api } from './lib/api.js';
import { GeminiBriefCard } from './components/GeminiBriefCard.tsx';
import GeminiAssistant from './components/GeminiAssistant.jsx';
import BrokerAlertSystem from './components/BrokerAlertSystem.jsx';
import { MarketPulseCard } from './components/MarketPulseCard.jsx';
import { NewsImpactList } from './components/NewsImpactList.jsx';
import MarketSentiment from './components/MarketSentiment.jsx';
import NotificationManager from './components/NotificationManager.jsx';
import SystemStatus from './components/SystemStatus.jsx';
import { OperationalSignals } from './components/OperationalSignals.jsx';
import { BrokerPositionsDesk } from './components/BrokerPositionsDesk.jsx';
import { DailyGeminiLesson } from './components/DailyGeminiLesson.jsx';
import { DailyTradingWorkflow } from './components/DailyTradingWorkflow.jsx';
import { TradierAutopilotDesk } from './components/TradierAutopilotDesk.jsx';
import PaperTradingDesk from './features/options-paper-trading/PaperTradingDesk.jsx';
import InfoTooltip from './components/InfoTooltip.jsx';
import NoGreenTodayPanel from './features/scanner/NoGreenTodayPanel.jsx';
import { loadRiskConfig, saveRiskConfig } from './config/riskConfig.ts';
import { classifyNewsEvent } from './services/newsImpactClassifier.ts';
import { professionalSignalsFromScan } from './utils/proSignalAdapter.js';
import { deleteJournalEntry, loadDeletedJournalIds, loadLocalJournalEntries, loadManualBrokerPositions, loadTakenSignals, markSignalTaken, saveLocalJournalEntry } from './services/tradeStorage.js';

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

function daysToExpiration(expiration) {
  if (!expiration) return null;
  const expiry = new Date(`${expiration}T16:00:00`).getTime();
  if (!Number.isFinite(expiry)) return null;
  return Math.ceil((expiry - Date.now()) / 86400000);
}

function Metric({ label, value, help, tone = 'slate', icon = '•' }) {
  const tones = {
    blue: 'from-blue-50 to-sky-50 border-blue-100 text-blue-900',
    green: 'from-emerald-50 to-teal-50 border-emerald-100 text-emerald-900',
    amber: 'from-amber-50 to-orange-50 border-amber-100 text-amber-900',
    violet: 'from-violet-50 to-fuchsia-50 border-violet-100 text-violet-900',
    red: 'from-red-50 to-rose-50 border-red-100 text-red-900',
    slate: 'from-slate-50 to-white border-slate-200 text-slate-900'
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${tones[tone] || tones.slate} border p-3 shadow-sm`}>
      <p className="text-xs font-bold text-slate-700"><span className="mr-1">{icon}</span>{label}{help && <InfoTooltip explanation={help} position="bottom" />}</p>
      <p className="mt-1 text-base font-black">{value}</p>
    </div>
  );
}

function HomeHero({ scan, ready, watch, pulse, workerStatus, accountStatus }) {
  const mood = ready.length ? 'Hay tickets verdes para revisar' : watch.length ? 'Mercado en vigilancia' : 'Capital protegido';
  const workerTone = workerStatus?.status === 'ONLINE' ? 'green' : workerStatus?.status === 'STALE' ? 'amber' : 'red';
  return (
    <section className="home-hero p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">VALIDO 1M · Gemini Guardian</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Panel principal</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">{mood}. Estrategia moderada-agresiva, pero solo con riesgo definido, datos verificables y aprobacion final humana.</p>
        </div>
        <span className="rounded-2xl border border-blue-100 bg-white px-4 py-2 text-sm font-black text-blue-700 shadow-sm">✨ {pulse.bestModeNow?.replaceAll('_', ' ') || 'ESPERAR'}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric icon="🟢" tone="green" label="READY" value={ready.length} />
        <Metric icon="🟡" tone="amber" label="WATCH" value={watch.length} />
        <Metric icon="📡" tone={workerTone} label="Scanner" value={workerStatus?.status || 'VERIFICANDO'} />
        <Metric icon="💼" tone="violet" label="Capital" value={accountStatus?.status === 'ONLINE' ? 'Tradier' : 'Respaldo'} />
        <Metric icon="📡" tone="blue" label="Ultimo scan" value={scan?.asOf ? new Date(scan.asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'N/D'} />
      </div>
      {workerStatus?.status !== 'ONLINE' && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">Scanner {workerStatus?.status || 'sin estado'}: {workerStatus?.lastError || workerStatus?.reason || 'esperando heartbeat del worker.'}</p>}
    </section>
  );
}

function WatchedUniversePanel({ scan, study, studyingSymbol, onStudy }) {
  const symbols = [
    ...(scan?.watchlist?.symbols || []),
    ...(scan?.universeCoverage?.rotatingThisCycle || [])
  ];
  const unique = [...new Set(symbols)].filter(Boolean);
  if (!unique.length) return null;
  return (
    <section className="risk-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Universo vigilado</p>
          <h2 className="text-xl font-black text-slate-900">Acciones listas para escanear</h2>
          <p className="text-sm text-slate-700">Incluye S&P 100 del PDF, indices como contexto, SOFI, NU, F y rotacion liquida.</p>
        </div>
        <span className="pill">{unique.length} simbolos</span>
      </div>
      {study?.study && (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3 text-sm text-violet-950">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">Gemini estudio {study.symbol}</p>
          <p className="mt-1 font-black">{study.study.verdict?.replaceAll('_', ' ') || 'REVISION'}</p>
          <p className="mt-1 leading-6">{study.study.summary}</p>
          <p className="mt-2 text-xs font-bold">Accion: {study.study.nextAction || 'Revisar datos antes de operar.'}</p>
        </div>
      )}
      <div className="flex max-h-40 flex-wrap gap-2 overflow-auto pr-1">
        {unique.map((symbol) => (
          <button
            key={symbol}
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-black shadow-sm ${studyingSymbol === symbol ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-700'}`}
            onClick={() => onStudy(symbol)}
          >
            {studyingSymbol === symbol ? 'Gemini...' : symbol}
          </button>
        ))}
      </div>
    </section>
  );
}

function TapeReadingCard({ tape }) {
  if (!tape) return null;
  return (
    <section className="market-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Tape reading proxy</p>
          <h2 className="text-xl font-black text-slate-900">📈 Presion del mercado</h2>
        </div>
        <span className="pill">Confianza {tape.confidence || 0}%</span>
      </div>
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
        <h3 className="text-lg font-black text-sky-950">{tape.arrow || '•'} {tape.label || 'Sin datos'}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-700">{tape.explanation || 'Esperando datos suficientes de precio, volumen y VWAP.'}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(tape.signals || []).slice(0, 4).map((item, index) => <p className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700" key={`${item}-${index}`}>🔎 {item}</p>)}
      </div>
    </section>
  );
}

function RiskLimits({ profile, riskConfig, manualPositions = [] }) {
  const cfg = riskConfig || loadRiskConfig();
  const accountValue = Number(profile?.accountSize ?? cfg.accountValue);
  const riskPct = Number(profile?.riskPct ?? cfg.defaultRiskPct);
  const tradeBudget = Number(profile?.maxRiskDollars ?? accountValue * riskPct / 100);
  const account = profile?.accountSync;
  return (
    <section className="risk-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black text-slate-900">🛡️ Limites de riesgo</h2><span className="pill">{account?.status === 'ONLINE' ? `Tradier ${account.accountIdMasked || ''} · solo lectura` : 'Respaldo configurado'}</span></div>
      <div className="grid grid-cols-2 gap-3">
        <Metric icon="💼" tone="blue" label="Cuenta" value={`$${Math.round(accountValue).toLocaleString()}`} />
        <Metric icon="🎯" tone="green" label="Riesgo / trade" value={`$${Math.round(tradeBudget)} (${riskPct}%)`} />
        <Metric icon="🏦" tone="violet" label="Buying power opciones" value={profile?.optionBuyingPower == null ? 'N/D' : `$${Math.round(profile.optionBuyingPower).toLocaleString()}`} />
        <Metric icon="📌" tone="amber" label="Trades abiertos" value={`${profile?.openPositionCount ?? manualPositions.length} / ${profile?.maxOpenTrades ?? cfg.maxOpenTrades}`} />
      </div>
      {account?.marginCall && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-black text-red-800">Tradier reporta margin call. Las nuevas senales quedan bloqueadas.</p>}
    </section>
  );
}

function GuardianActivity({ scan, signals }) {
  const ready = signals.filter((signal) => ['READY', '0DTE_SCALP'].includes(signal.status)).length;
  const watch = signals.filter((signal) => signal.status === 'WATCH').length;
  const blocked = signals.filter((signal) => ['AVOID', 'NO_DATA', 'LOCKED_BY_RISK'].includes(signal.status)).length;
  return (
    <section className="risk-card p-4 space-y-3">
      <div className="flex justify-between gap-2">
        <div>
          <h2 className="text-xl font-black">🧠 Gemini Guardian <InfoTooltip explanation="Scanner autonomo. Revisa medias, volumen, RSI, soporte/resistencia, noticias, earnings, griegas, liquidez y riesgo cuando esos datos existen." position="bottom" /></h2>
          <p className="text-sm text-slate-700">Estrategia moderada-agresiva con riesgo definido. Tu siempre tomas la decision final.</p>
        </div>
        <span className="pill">{scan?.decision?.status === 'no_trade' ? 'ESPERAR' : scan?.decision?.status || 'CARGANDO'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric icon="✅" tone="green" label="READY" value={ready} />
        <Metric icon="👀" tone="amber" label="WATCH" value={watch} />
        <Metric icon="⛔" tone="red" label="BLOCKED" value={blocked} />
      </div>
      <p className="text-xs text-slate-500">Ultimo ciclo: {scan?.asOf ? new Date(scan.asOf).toLocaleString() : 'pendiente'} · Refresco: {scan?.refreshSeconds || 300}s</p>
      <p className="text-xs text-slate-700">Universo: {scan?.universeCoverage?.scannedThisCycle || 'N/D'} simbolos este ciclo. Indices y acciones se conservan; si falta cadena se marca SIN DATOS.</p>
      <p className="text-xs text-slate-700">Gemini: {scan?.agent?.tokenBudget ? `${scan.agent.tokenBudget.dailyTokenBudget - scan.agent.tokenBudget.tokensUsed} tokens disponibles hoy` : 'presupuesto no disponible'}.</p>
    </section>
  );
}

function parseSignal(entry) {
  if (entry.signalOriginal) return entry.signalOriginal;
  if (typeof entry.signal_original === 'string') {
    try { return JSON.parse(entry.signal_original); } catch { return {}; }
  }
  return entry.signal_original || {};
}

function journalGeminiOpinion(entry) {
  const signal = parseSignal(entry);
  const dte = daysToExpiration(entry.expiration || signal.expiration);
  const maxRisk = signal.maxRiskUsd ?? signal.maxRisk ?? null;
  const hasPlan = Boolean(entry.plannedExit || entry.planned_exit || signal.executionPlan?.stopLoss);
  if (dte !== null && dte < 0) return '⚫ Gemini: operacion vencida. Revisar resultado real, P/L y leccion antes de tomar otra señal similar.';
  if (dte !== null && dte <= 3) return '🔴 Gemini: vencimiento muy cerca. Prioridad: confirmar mark real, gamma risk y plan de cierre.';
  if (!hasPlan) return '🟡 Gemini: falta plan de salida completo. No repetir esta estructura sin TP, stop y regla de roll.';
  if (!maxRisk) return '🟡 Gemini: riesgo contractual incompleto. Validar max loss y liquidez antes de considerarla una entrada modelo.';
  return '🟢 Gemini: decision registrada con plan. Vigilar mark, short strike, noticias, earnings y disciplina del stop.';
}

function JournalMetric({ label, value, tone = 'slate' }) {
  const styles = {
    green: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
    blue: 'bg-blue-50 text-blue-800 border-blue-100',
    violet: 'bg-violet-50 text-violet-800 border-violet-100',
    slate: 'bg-white text-slate-700 border-slate-200'
  };
  return <div className={`rounded-xl border p-2 ${styles[tone]}`}><p className="text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p><p className="mt-1 text-xs font-black">{value || 'N/D'}</p></div>;
}

function JournalBrokerSummary({ entries = [], manualPositions = [] }) {
  const openEntries = entries.filter((entry) => !String(entry.outcome || entry.status || '').toUpperCase().includes('CLOSED'));
  const closedEntries = entries.length - openEntries.length;
  const risk = entries.reduce((sum, entry) => {
    const signal = parseSignal(entry);
    const value = Number(signal.maxRiskUsd ?? signal.maxRisk ?? entry.maxRiskUsd);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <JournalMetric tone="blue" label="Broker manual" value={`${manualPositions.length} abiertas`} />
        <JournalMetric tone="green" label="Journal open" value={openEntries.length} />
        <JournalMetric tone="violet" label="Cerradas" value={closedEntries} />
        <JournalMetric tone="amber" label="Riesgo registrado" value={risk ? `$${Math.round(risk)}` : 'N/D'} />
      </div>
      {manualPositions.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {manualPositions.slice(0, 4).map((position) => (
            <div className="rounded-xl border border-blue-100 bg-white p-2 text-xs" key={position.id}>
              <strong>{position.symbol} · {position.strategy}</strong>
              <p className="mt-1 text-slate-600">{position.expiration || 'Sin vencimiento'} · Entrada {position.entryMark || 'N/D'} · Mark {position.currentMark || 'N/D'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TradeJournal({ entries, onDelete, manualPositions = [] }) {
  return (
    <>
      <section id="journal" className="risk-card p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">📓 Journal operativo</h2>
            <p className="text-sm text-slate-700">Señales tomadas, posiciones cerradas y decisiones de gestion. Las operaciones vencidas locales se limpian automaticamente despues de unos dias.</p>
          </div>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{entries?.length || 0} registros</span>
        </div>
        <JournalBrokerSummary entries={entries} manualPositions={manualPositions} />
        {entries?.length ? entries.slice(0, 12).map((entry) => {
          const signal = parseSignal(entry);
          const expiration = entry.expiration || signal.expiration;
          const dte = daysToExpiration(expiration);
          const status = dte !== null && dte < 0 ? 'VENCIDA' : entry.outcome || entry.status || 'OPEN';
          const legs = signal.legs?.length ? signal.legs.map((leg) => `${leg.side} ${leg.optionType || leg.type} ${leg.strike}`).join(' / ') : entry.notes?.match(/Strikes: ([^\n]+)/)?.[1];
          return (
            <article className="journal-entry rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm" key={entry.id || `${entry.symbol}-${entry.createdAt || entry.created_at}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">Decision registrada</p>
                  <h3 className="mt-1 text-lg font-black text-slate-950">💼 {entry.symbol} · {entry.strategy}</h3>
                  <p className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt || entry.created_at || entry.timestamp || Date.now()).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{status}</span>
                  <button type="button" className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-black text-red-700" onClick={() => onDelete(entry.id)}>Eliminar</button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                <JournalMetric tone="blue" label="Exp / DTE" value={expiration ? `${expiration} · ${dte ?? 'N/D'} DTE` : 'SIN DATOS'} />
                <JournalMetric tone="violet" label="Strikes" value={legs || 'SIN DATOS'} />
                <JournalMetric tone="green" label="POP" value={signal.pop != null ? `${Math.round(signal.pop * 100)}%` : 'SIN DATOS'} />
                <JournalMetric tone="amber" label="Max risk" value={signal.maxRiskUsd ? `$${Math.round(signal.maxRiskUsd)}` : 'SIN DATOS'} />
                <JournalMetric label="Score" value={entry.confidence || signal.score || 'N/D'} />
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700"><strong>🎯 Razon / entrada:</strong><br />{entry.reason || entry.planned_entry || entry.plannedEntry || 'Sin razon registrada.'}</p>
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700"><strong>🚪 Salida:</strong><br />{entry.planned_exit || entry.plannedExit || signal.executionPlan?.stopLoss || 'Pendiente definir TP, stop y roll.'}</p>
              </div>
              <p className="mt-3 rounded-xl border border-violet-100 bg-violet-50 p-3 text-xs font-semibold leading-5 text-violet-900">{journalGeminiOpinion(entry)}</p>
            </article>
          );
        }) : (
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600 space-y-1">
            <p>Aun no hay decisiones registradas.</p>
            <p>Usa "Tome esta señal" en Señales o añade una posicion manual en Riesgo.</p>
          </div>
        )}
      </section>
      <DailyTradingWorkflow />
      <DailyGeminiLesson />
    </>
  );
}

function SettingsPanel({ riskConfig, onSaveRisk }) {
  const [cfg, setCfg] = useState(riskConfig);
  function save() { saveRiskConfig(cfg); onSaveRisk(cfg); }
  return (
    <section id="config" className="risk-card p-4 space-y-3">
      <h2 className="text-xl font-black">⚙️ Configuracion operativa</h2>
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
  const [manualPositions, setManualPositions] = useState(loadManualBrokerPositions);
  const [symbolStudy, setSymbolStudy] = useState(null);
  const [studyingSymbol, setStudyingSymbol] = useState('');
  const [workerStatus, setWorkerStatus] = useState({ status: 'VERIFICANDO' });
  const [accountStatus, setAccountStatus] = useState({ status: 'VERIFICANDO' });

  async function load(force = false) {
    setError('');
    try {
      const [nextScan, nextWorker, nextAccount] = await Promise.all([
        force ? api.refresh() : api.scan(),
        api.workerStatus(),
        api.accountStatus()
      ]);
      setScan(nextScan);
      setWorkerStatus(nextWorker);
      setAccountStatus(nextAccount);
    } catch (loadError) { setError(loadError.message); }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    window.dispatchEvent(new Event('valido-auth-required'));
  }

  async function loadJournalEntries() {
    const serverEntries = await api.journal().catch(() => []);
    const localEntries = loadLocalJournalEntries();
    const deleted = new Set(loadDeletedJournalIds());
    const seen = new Set();
    return [...localEntries, ...serverEntries].filter((entry) => {
      const key = entry.id || `${entry.symbol}-${entry.strategy}-${entry.createdAt || entry.created_at}`;
      if (deleted.has(key) || deleted.has(entry.id)) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function deleteJournal(id) {
    deleteJournalEntry(id);
    setEntries(await loadJournalEntries());
    setToast('Operacion eliminada del Journal');
    window.setTimeout(() => setToast(''), 2500);
  }

  async function studySymbol(symbol) {
    setStudyingSymbol(symbol);
    try {
      const result = await api.symbolStudy(symbol);
      setSymbolStudy(result);
    } finally {
      setStudyingSymbol('');
    }
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
    try {
      await api.addJournal(journalEntry);
    } catch (saveError) {
      saveLocalJournalEntry({ ...journalEntry, outcome: 'OPEN / WATCHING', notes: `${journalEntry.notes}\nDB fallback: ${saveError.message}` });
    }
    markSignalTaken(signal.id);
    setTakenSignalIds(loadTakenSignals());
    setEntries(await loadJournalEntries());
    setToast('Señal registrada en el Journal de Paper. Riesgo queda solo para posiciones manuales.');
    window.setTimeout(() => setToast(''), 3500);
    setActiveTab('paper');
  }

  useEffect(() => {
    load();
    loadJournalEntries().then(setEntries).catch(() => {});
    fetch('/api/gemini/daily-lesson').then((response) => response.json()).then(setDailyLesson).catch(() => {});
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function reloadPositions() { setManualPositions(loadManualBrokerPositions()); }
    window.addEventListener('positions-updated', reloadPositions);
    window.addEventListener('storage', reloadPositions);
    return () => {
      window.removeEventListener('positions-updated', reloadPositions);
      window.removeEventListener('storage', reloadPositions);
    };
  }, []);

  const signals = useMemo(() => professionalSignalsFromScan(scan || {}), [scan]);
  const activeSymbols = useMemo(() => new Set(manualPositions.map((position) => position.symbol)), [manualPositions]);
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

  const ready = signals.filter((signal) => ['READY', '0DTE_SCALP'].includes(signal.status));
  const watch = signals.filter((signal) => signal.status === 'WATCH');
  const pulse = {
    spyTrend: scan?.market?.spyTrend || scan?.market?.regime || 'NO_DATA',
    qqqTrend: scan?.market?.technicals?.QQQ?.trend || 'NO_DATA',
    vix: scan?.market?.vix ?? null,
    macroStatus: news.some((item) => item.stars >= 5) ? 'DANGER' : news.some((item) => item.stars >= 4) ? 'CAUTION' : 'CLEAR',
    tapeReading: scan?.market?.tapeReading,
    bestModeNow: ready.length ? 'REVISAR_ENTRADAS' : watch.length ? 'ESPERAR_GATILLO' : 'PRESERVAR_CAPITAL'
  };
  const watchedUniverse = [
    ...(scan?.watchlist?.symbols || []),
    ...(scan?.universeCoverage?.rotatingThisCycle || [])
  ];
  const bestSymbols = [...new Set([
    ...ready.map((signal) => signal.symbol),
    ...watch.map((signal) => signal.symbol),
    ...watchedUniverse
  ].filter(Boolean))].slice(0, 5);
  const brief = {
    mood: pulse.macroStatus === 'DANGER' ? 'EVENT_RISK' : scan?.market?.regime || 'CHOP',
    mode: ready.length ? 'BUSCAR_ENTRADAS' : 'ESPERAR',
    summary: ready.length ? `${ready.length} ticket(s) READY requieren revision final.` : watch.length ? `${watch.length} escenario(s) en vigilancia. No hay entrada verde aprobada todavia.` : 'Sin entrada limpia. Gemini Guardian conserva capital y explica si faltan datos.',
    bullets: [
      `Mercado: ${scan?.market?.regime || 'SIN DATOS'}`,
      'Estrategia base: moderada-agresiva con riesgo definido',
      `READY: ${ready.length} · WATCH: ${watch.length}`,
      accountStatus?.status === 'ONLINE' ? `Broker: Tradier ${accountStatus.accountIdMasked || ''} conectado en solo lectura` : 'Broker: usando respaldo configurado; revisa sincronizacion Tradier'
    ],
    bestSymbols,
    blockedSymbols: signals.filter((signal) => signal.status === 'AVOID').slice(0, 3).map((signal) => signal.symbol),
    motivation: dailyLesson?.motivation || 'Solo ejecutar tickets verdes, completos y aprobados por Gemini.'
  };
  const tabs = [
    ['inicio', '🏠', 'Inicio'], ['signals', '📡', 'Señales'],
    ['paper', '📊', 'Paper'], ['tradier', '📈', 'En vivo'], ['config', '⚙️', 'Config']
  ];

  return (
    <div className="pro-console">
      <header className="app-header sticky top-0 z-30 px-4 py-3 bg-slate-900/90 backdrop-blur border-b border-slate-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-lg font-black text-white shadow-md shadow-indigo-900/40">V</div>
            <div><h1 className="text-lg font-black text-white">VALIDO 1M</h1><p className="text-xs text-indigo-300 font-medium">Personal Broker · Gemini AI Active</p></div>
          </div>
          <div className="flex items-center gap-2">
            <BrokerAlertSystem signals={signals} scan={scan} onOpenSignal={() => setActiveTab('signals')} />
            <span className="hidden rounded-full border border-indigo-500/30 bg-indigo-950/60 px-3 py-1 text-xs font-black text-indigo-200 sm:inline-flex">Moderado-agresivo · riesgo definido</span>
            <button aria-label="Cerrar sesion" className="rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-black text-slate-300 hover:bg-slate-700 transition" onClick={logout} title="Cerrar sesion" type="button">Salir</button>
          </div>
        </div>
      </header>
      <main className="home-pro pb-24">
        {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border border-green-200 bg-white px-4 py-3 text-sm font-bold text-green-800 shadow-lg">{toast}</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}
        {activeTab === 'inicio' && <><HomeHero scan={scan} ready={ready} watch={watch} pulse={pulse} workerStatus={workerStatus} accountStatus={accountStatus} /><GeminiAssistant scan={scan} signals={signals} /><GeminiBriefCard {...brief} /><GuardianActivity scan={scan} signals={signals} /><NoGreenTodayPanel scan={scan} /><MarketSentiment /><MarketPulseCard pulse={pulse} /><TapeReadingCard tape={pulse.tapeReading} /><DailyGeminiLesson /><WatchedUniversePanel scan={scan} study={symbolStudy} studyingSymbol={studyingSymbol} onStudy={studySymbol} /><NewsImpactList news={news} /></>}
        {activeTab === 'signals' && <OperationalSignals signals={signals} onAccept={acceptSignal} takenSignalIds={takenSignalIds} />}
        {activeTab === 'paper' && <><PaperTradingDesk profile={scan?.profile} onSaveJournal={api.addJournal} /><RiskLimits profile={scan?.profile} riskConfig={riskConfig} manualPositions={manualPositions} /><BrokerPositionsDesk /><TradierAutopilotDesk scan={scan} view="paper" /><TradeJournal entries={entries} onDelete={deleteJournal} manualPositions={manualPositions} /></>}
        {activeTab === 'tradier' && <TradierAutopilotDesk scan={scan} view="live" />}
        {activeTab === 'config' && <><SettingsPanel riskConfig={riskConfig} onSaveRisk={setRiskConfig} /><NotificationManager /><SystemStatus /></>}
        <footer className="text-xs text-slate-500 text-center py-4">Paper autonomo en Tradier Sandbox. Cuenta real: datos, criterio Gemini y preview bajo control humano.<span className="block mt-1">v{VALIDO_VERSION}</span></footer>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-100 bg-white/95 px-1 py-2 shadow-[0_-12px_30px_rgba(37,99,235,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl justify-start gap-1 overflow-x-auto px-1 sm:justify-around">{tabs.map(([id, icon, label]) => <button key={id} onClick={() => setActiveTab(id)} className={`flex min-w-[64px] shrink-0 flex-col items-center rounded-md px-2 py-1.5 text-[11px] font-bold transition ${activeTab === id ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700'}`}><span className="text-base">{icon}</span><span>{label}</span></button>)}</div>
      </nav>
    </div>
  );
}
