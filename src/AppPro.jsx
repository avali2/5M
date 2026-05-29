import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { HomePro } from './components/HomePro.tsx';
import NotificationCenter from './features/notifications/NotificationCenter.jsx';
import { processProfessionalAlerts } from './services/proAlertEngine.ts';
import { geminiBriefFromScan, marketPulseFromScan, professionalSignalsFromScan } from './utils/proSignalAdapter.js';

const LegacyArchive = React.lazy(() => import('./App.jsx'));
const dateTime = (value) => value ? new Intl.DateTimeFormat('es-US', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value)) : '--';
const money = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '--';

function AccessGate({ error, onUnlock }) {
  const [key, setKey] = useState('');
  return (
    <div className="pro-console grid min-h-screen place-items-center p-5">
      <form className="card w-full max-w-md p-6" onSubmit={(event) => { event.preventDefault(); onUnlock(key); }}>
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-violet-500 text-2xl font-black text-white">V</div>
        <p className="mt-5 text-xs font-black uppercase tracking-[.18em] text-sky-300">Acceso privado</p>
        <h1 className="mt-2 text-2xl font-black">VALIDO 1M</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">Introduce la clave privada. Los tokens del broker y proveedores nunca se exponen al navegador.</p>
        {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
        <input className="mt-5 h-11 w-full rounded-xl border border-[#26364f] bg-[#0b1728] px-3 text-sm text-white outline-none" type="password" autoComplete="current-password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Clave de acceso" />
        <button className="primary mt-3 w-full" type="submit">Entrar</button>
      </form>
    </div>
  );
}

function MainNav() {
  const items = [['decision', 'Inicio'], ['signals', 'Senales'], ['gemini', 'Gemini'], ['news', 'Noticias'], ['risk', 'Riesgo'], ['journal', 'Journal'], ['settings', 'Config']];
  return (
    <>
      <nav className="mx-auto hidden overflow-x-auto rounded-xl border border-[#26364f] bg-[#0b1728] p-2 md:flex md:gap-1" style={{ width: 'min(1180px, calc(100% - 28px))' }}>
        {items.map(([target, label]) => <a className="whitespace-nowrap rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-[#1d3557] hover:text-white" href={`#${target}`} key={target}>{label}</a>)}
      </nav>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-[#26364f] bg-[#07111f]/95 px-1 py-2 backdrop-blur md:hidden">
        {items.map(([target, label]) => <a className="rounded-lg px-2 py-2 text-[10px] font-semibold text-slate-300" href={`#${target}`} key={target}>{label}</a>)}
      </nav>
    </>
  );
}

function SimpleNews({ scan }) {
  const macro = scan?.macro || {};
  const items = [
    ...(macro.highImpactEvents || []).map((item) => ({ tone: 'BLOCK', title: item.title || item.event || item.name || 'High impact macro', detail: item.date || item.datetime })),
    ...(macro.softImpactEvents || []).map((item) => ({ tone: 'CAUTION', title: item.title || item.event || item.name || 'Macro caution', detail: item.date || item.datetime })),
    ...(macro.breakingRisk || []).slice(0, 6).map((item) => ({ tone: item.caution ? 'CAUTION' : 'INFO', title: item.headline || item.title, detail: item.source }))
  ];
  return (
    <section id="news" className="pro-section card p-4">
      <div className="section-title"><h2>Noticias / Macro</h2><span className="badge badge-watch">{items.length ? `${items.length} items` : 'CLEAR'}</span></div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.slice(0, 8).map((item, index) => (
          <div className="rounded-xl border border-white/10 bg-white/[.035] p-3 text-sm" key={`${item.title}-${index}`}>
            <strong>{item.tone}: {item.title}</strong>
            <p className="mt-1 text-slate-400">{item.detail ? dateTime(item.detail) : 'Fuente server-side'}</p>
          </div>
        )) : <p className="text-sm text-slate-400">Sin bloqueo macro/news reportado en el ultimo scan.</p>}
      </div>
    </section>
  );
}

function SimpleRisk({ scan }) {
  const profile = scan?.profile || {};
  const reasons = scan?.decision?.reasons || [];
  return (
    <section id="risk" className="pro-section card p-4">
      <div className="section-title"><h2>Riesgo</h2><span className="badge badge-gemini">{scan?.decision?.label || scan?.decision?.status || 'Loading'}</span></div>
      <div className="pulse-grid mt-3">
        <div><span>Cuenta</span><strong>{money(profile.accountSize)}</strong></div>
        <div><span>Riesgo/trade</span><strong>{profile.riskPct ?? '--'}%</strong></div>
        <div><span>Colateral max</span><strong>{profile.maxCollateralPct ?? '--'}%</strong></div>
        <div><span>Open trades</span><strong>{profile.activeSymbols?.length || 0}/{profile.maxOpenTrades || '--'}</strong></div>
        <div><span>0DTE</span><strong>{profile.allow0Dte ? 'Enabled' : 'Guarded'}</strong></div>
        <div><span>Daily loss</span><strong>{profile.dailyLossPct ?? 0}%</strong></div>
      </div>
      {reasons.length ? <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{reasons.slice(0, 3).join(' | ')}</div> : null}
    </section>
  );
}

function SimpleJournal({ scan, entries, onRefresh }) {
  return (
    <section id="journal" className="pro-section card p-4">
      <div className="section-title"><h2>Journal</h2><button onClick={onRefresh}>Actualizar</button></div>
      <div className="mt-3 grid gap-2">
        {entries.length ? entries.slice(0, 6).map((entry) => (
          <div className="rounded-xl border border-white/10 bg-white/[.035] p-3 text-sm" key={entry.id}>
            <strong>{entry.symbol} - {entry.strategy}</strong>
            <p className="mt-1 text-slate-400">{entry.outcome} | {dateTime(entry.createdAt || entry.created_at)}</p>
          </div>
        )) : <p className="text-sm text-slate-400">Guarda una senal desde Signal Feed para empezar el registro.</p>}
      </div>
      <p className="mt-3 text-xs text-slate-500">Ultimo scan: {dateTime(scan?.asOf)}</p>
    </section>
  );
}

function SettingsPanel({ notificationEnabled, setNotificationEnabled, scan }) {
  return (
    <section id="settings" className="pro-section grid gap-4 lg:grid-cols-2">
      <NotificationCenter enabled={notificationEnabled} onEnabled={setNotificationEnabled} />
      <div className="card p-4">
        <h2 className="m-0">Configuracion / API</h2>
        <div className="mt-3 grid gap-2 text-sm">
          {(scan?.providers || []).slice(0, 8).map((provider) => (
            <div className="flex justify-between rounded-xl border border-white/10 bg-white/[.035] p-3" key={provider.id || provider.name}>
              <span>{provider.name || provider.id}</span>
              <strong>{provider.configured ? 'OK' : provider.required ? 'FALTA' : 'OPCIONAL'}</strong>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Archivo tecnico oculto: <a href="/archivo">/archivo</a></p>
      </div>
    </section>
  );
}

export default function AppPro() {
  const archiveMode = typeof window !== 'undefined' && ['/archivo', '/laboratorio', '/dev'].some((path) => window.location.pathname.startsWith(path));
  const [scan, setScan] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [seconds, setSeconds] = useState(300);
  const [notificationEnabled, setNotificationEnabled] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const latestAlert = useRef(null);

  async function load(force = false) {
    setLoading(true);
    setError('');
    try {
      const data = force ? await api.refresh() : await api.scan();
      setLocked(false);
      setAccessError('');
      setScan(data);
      setSeconds(data.refreshSeconds || 300);
      const proSignals = professionalSignalsFromScan(data);
      const newest = proSignals.find((signal) => ['READY', 'AGGRESSIVE', '0DTE_SCALP'].includes(signal.status));
      if (notificationEnabled && newest && newest.id !== latestAlert.current) {
        await processProfessionalAlerts(proSignals);
      }
      latestAlert.current = newest?.id || null;
    } catch (loadError) {
      if (loadError.status === 401) {
        setLocked(true);
        setAccessError('Clave incorrecta o requerida por el servidor.');
        return;
      }
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadJournal() {
    api.journal().then(setEntries).catch(() => {});
  }

  useEffect(() => {
    if (archiveMode) return;
    load();
    loadJournal();
  }, []);

  useEffect(() => {
    if (archiveMode) return undefined;
    const countdown = window.setInterval(() => setSeconds((current) => current > 1 ? current - 1 : scan?.refreshSeconds || 300), 1000);
    const refresh = window.setInterval(() => load(), (scan?.refreshSeconds || 300) * 1000);
    return () => { window.clearInterval(countdown); window.clearInterval(refresh); };
  }, [archiveMode, scan?.refreshSeconds, notificationEnabled]);

  async function unlock(key) {
    api.setAccessKey(key);
    await load();
    await loadJournal();
  }

  const professionalSignals = useMemo(() => professionalSignalsFromScan(scan || {}), [scan]);
  const marketPulse = useMemo(() => marketPulseFromScan(scan || {}), [scan]);
  const geminiBrief = useMemo(() => geminiBriefFromScan(scan || {}, professionalSignals), [scan, professionalSignals]);
  const alertStatus = useMemo(() => ({
    pushEnabled: notificationEnabled,
    lastAlert: latestAlert.current,
    lastError: error || null,
    nextScan: seconds ? `${seconds}s` : null
  }), [notificationEnabled, error, seconds]);

  async function copyText(text) {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  }

  async function saveSignal(signal) {
    await api.addJournal({
      symbol: signal.symbol,
      strategy: signal.strategyLabel,
      outcome: signal.status,
      reason: signal.geminiCoach?.summary || signal.technicalSummary,
      plannedEntry: signal.executionPlan.entryTrigger,
      plannedExit: `${signal.executionPlan.takeProfit} / ${signal.executionPlan.stopLoss}`,
      notes: signal.ticketText,
      lesson: signal.geminiCoach?.mainRisk || 'Riesgo primero; no perseguir precio.',
      source: 'professional-signal-console',
      confidence: signal.score,
      maxRisk: signal.maxRiskUsd,
      maxProfit: signal.maxProfitUsd,
      expiration: signal.expiration
    });
    await loadJournal();
  }

  if (archiveMode) {
    return (
      <Suspense fallback={<div className="pro-console grid min-h-screen place-items-center text-white">Cargando archivo...</div>}>
        <LegacyArchive />
      </Suspense>
    );
  }

  if (locked) return <AccessGate error={accessError} onUnlock={unlock} />;

  return (
    <div className="pro-console">
      <div className="py-3"><MainNav /></div>
      {error && <div className="pro-section rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
      <HomePro
        signals={professionalSignals}
        marketPulse={marketPulse}
        geminiBrief={geminiBrief}
        alertStatus={alertStatus}
        onScanNow={() => load(true)}
        onViewSignal={(signal) => { window.history.replaceState(null, '', `/signals/${encodeURIComponent(signal.id)}`); }}
        onCopyTicket={(signal) => copyText(signal.ticketText)}
        onSaveSignal={saveSignal}
        onDismissSignal={(signal) => { latestAlert.current = signal.id; }}
        onAskGemini={() => document.getElementById('gemini')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />
      <SimpleNews scan={scan} />
      <SimpleRisk scan={scan} />
      <SimpleJournal scan={scan} entries={entries} onRefresh={loadJournal} />
      <SettingsPanel scan={scan} notificationEnabled={notificationEnabled} setNotificationEnabled={setNotificationEnabled} />
      <footer className="pro-footer text-xs leading-5">
        Educational / decision-support only. No auto-trading enabled. Candidatos de alta probabilidad con riesgo definido, sujetos a validacion de datos, liquidez, volatilidad y contexto macro.
        <span className="mt-2 block font-mono text-[11px]">Refresh {seconds}s {loading ? '| scanning...' : ''}</span>
      </footer>
      <MainNav />
    </div>
  );
}
