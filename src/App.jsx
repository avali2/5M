import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from './lib/api.js';
import NotificationCenter from './features/notifications/NotificationCenter.jsx';
import OptionsStrategyLab from './features/options-simulator/OptionsStrategyLab.jsx';
import LearningCenter from './features/learning/LearningCenter.jsx';
import LearningRoadmap from './features/learning/LearningRoadmap.jsx';
import ProSignals from './features/pro-signals/ProSignals.jsx';
import AiStatusPanel from './features/ai-status/AiStatusPanel.jsx';
import PaperTradingDesk from './features/options-paper-trading/PaperTradingDesk.jsx';
import RiskGovernorPanel from './features/risk-governor/RiskGovernorPanel.jsx';
import ProDataMap from './features/pro-data-map/ProDataMap.jsx';
import GreeksVolatilityAcademy from './features/greeks-volatility-academy/GreeksVolatilityAcademy.jsx';
import GexLab from './features/gex-dealer-positioning-lab/GexLab.jsx';
import MovingAveragePlaybook from './features/moving-average-options-playbook/MovingAveragePlaybook.jsx';
import TradingPlan from './features/pro-trading-plan/TradingPlan.jsx';
import StrategyLibrary from './features/options-strategy-library/StrategyLibrary.jsx';
import TapeReadingLab from './features/tape-reading-lab/TapeReadingLab.jsx';
import OptionsFlowLite from './features/options-flow-lite/OptionsFlowLite.jsx';
import AlgorithmicStrategyLab from './features/algorithmic-strategy-lab/AlgorithmicStrategyLab.jsx';
import PracticeReplay from './features/practice-replay/PracticeReplay.jsx';
import SourceFormulaAudit from './features/source-formula-audit/SourceFormulaAudit.jsx';
import DailyLearningCards from './features/dashboard-education/DailyLearningCards.jsx';
import GuardianPanel from './features/options-guardian-agent/GuardianPanel.jsx';
import GeminiGuardianCommandCenter from './components/GeminiGuardianCommandCenter.jsx';
import { HomePro } from './components/HomePro.tsx';
import { processProfessionalAlerts } from './services/proAlertEngine.ts';
import { geminiBriefFromScan, marketPulseFromScan, professionalSignalsFromScan } from './utils/proSignalAdapter.js';

const cash = (value) => Number.isFinite(value) ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '--';
const decimal = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits) : '--';
const dateTime = (value) => value ? new Intl.DateTimeFormat('es-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value)) : '--';
const VALIDO_BUILD_VERSION = import.meta.env.VITE_VALIDO_BUILD_VERSION || 'local-dev';
const VALIDO_BUILD_TIMESTAMP = import.meta.env.VITE_VALIDO_BUILD_TIMESTAMP || 'no timestamp';
const CHART_THEME = {
  grid: '#d7e2ef',
  axis: '#64748b',
  tooltip: {
    background: 'var(--chart-tooltip-bg)',
    border: '1px solid var(--border-soft)',
    borderRadius: 12,
    boxShadow: '0 14px 36px rgba(15, 23, 42, .12)',
    color: 'var(--chart-tooltip-text)'
  },
  tooltipLabel: { color: 'var(--text-muted)', fontWeight: 700 },
  tooltipItem: { color: 'var(--text-main)' },
  cursor: { fill: 'rgba(37, 99, 235, 0.08)' }
};
function Empty({ children }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

function AccessGate({ error, onUnlock }) {
  const [key, setKey] = useState('');
  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 p-5 text-slate-900">
      <form className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(event) => { event.preventDefault(); onUnlock(key); }}>
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400 text-2xl font-black text-slate-950">V</div>
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Acceso privado</p>
        <h1 className="mt-2 text-2xl font-bold">VALIDO 1M OS</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">Introduce la clave privada configurada en el servidor. Tus tokens del broker nunca se guardan en el telefono.</p>
        {error && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs text-red-600">{error}</p>}
        <input className="mt-5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" type="password" autoComplete="current-password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Clave de acceso" />
        <button className="mt-3 inline-flex w-full items-center justify-center rounded-xl border-0 bg-gradient-to-r from-blue-600 to-purple-600 px-3.5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" type="submit">Entrar al desk</button>
      </form>
    </div>
  );
}

function MobileQuickNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-slate-200 bg-white/95 px-1 py-2 backdrop-blur md:hidden">
      {[['decision', 'Inicio'], ['signals', 'Señales'], ['gemini', 'Gemini'], ['news', 'Noticias'], ['risk', 'Riesgo'], ['journal', 'Journal'], ['settings', 'Config']].map(([target, label]) => (
        <a className="rounded-lg px-2 py-2 text-[10px] font-semibold text-slate-600" href={`#${target}`} key={target}>{label}</a>
      ))}
    </nav>
  );
}

function DesktopTabs() {
  const tabs = [
    ['decision', 'Inicio'],
    ['signals', 'Señales'],
    ['gemini', 'Gemini'],
    ['news', 'Noticias'],
    ['risk', 'Riesgo'],
    ['journal', 'Journal'],
    ['settings', 'Configuración']
  ];
  return (
    <nav className="mx-auto hidden overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:flex md:gap-1" style={{ width: 'min(1180px, calc(100% - 28px))' }}>
      {tabs.map(([target, label]) => <a className="whitespace-nowrap rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900" href={`#${target}`} key={target}>{label}</a>)}
    </nav>
  );
}

function CollapsibleSection({ id, title, subtitle, children, defaultOpen = false }) {
  return (
    <section id={id} className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <details open={defaultOpen}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Modulo secundario</p>
            <h2 className="mt-1 text-lg font-black text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">Abrir / cerrar</span>
        </summary>
        <div className="space-y-5 border-t border-slate-200 bg-slate-50 p-4 md:p-5">
          {children}
        </div>
      </details>
    </section>
  );
}

function DailyAssistant({ scan }) {
  const assistant = scan?.assistant;
  if (!assistant) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-blue-500/5 to-transparent p-4 md:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Valido coach de la sesion</p>
        <h2 className="mt-2 text-xl font-bold">{assistant.action}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{assistant.actionReason}</p>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-2">
          <TradeValue label="Estado de horario ET" value={assistant.marketSession} />
          <TradeValue label="Lectura volatilidad" value={assistant.volatility} />
          <TradeValue label="Proximo evento bloqueante" value={assistant.nextEvent ? `${assistant.nextEvent.title} - ${dateTime(assistant.nextEvent.date)}` : 'Sin evento bloqueante detectado'} />
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Antes de decidir</p>
            {assistant.checklist.map((item) => <p className="mt-2 text-xs leading-5 text-slate-600" key={item}>- {item}</p>)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Horario practico para income options</p>
          {assistant.timingTips.map((tip) => <p className="mt-3 text-xs leading-5 text-slate-600" key={tip}>{tip}</p>)}
          <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-700">
            Son reglas de disciplina, no predicciones. Un horario favorable no reemplaza liquidez, riesgo definido ni un setup aprobado.
          </p>
        </div>
      </div>
    </section>
  );
}

function ProviderCoverage({ scan }) {
  const visibleProviders = (scan?.providers || []).filter((provider) => !(provider.hiddenWhenMissing && !provider.configured));
  const missingRequired = visibleProviders.some((provider) => provider.required && !provider.configured);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-end justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Data layer</p><h3 className="mt-1 text-lg font-semibold">Fuentes verificadas</h3></div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">Server-side keys</span>
      </div>
      <div className="space-y-2">
        {visibleProviders.map((provider) => {
          const providerMissingRequired = !provider.configured && provider.required;
          const status = provider.configured ? 'CONFIGURED' : providerMissingRequired ? 'MISSING REQUIRED' : provider.important ? 'IMPORTANT MISSING' : 'OPTIONAL';
          return (
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3" key={provider.id}>
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${provider.configured ? 'bg-green-500' : providerMissingRequired ? 'bg-red-500' : provider.important ? 'bg-amber-500' : 'bg-slate-300'}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <strong className="text-sm">{provider.name}</strong>
                <span className={`text-[10px] font-bold ${provider.configured ? 'text-green-600' : providerMissingRequired ? 'text-red-600' : provider.important ? 'text-amber-600' : 'text-slate-500'}`}>{status}</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{provider.coverage.join(' / ')}</p>
            </div>
          </div>
          );
        })}
      </div>
      <p className={`mt-4 rounded-lg p-3 text-xs leading-5 ${missingRequired ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-green-700'}`}>
        {missingRequired
          ? 'Falta una fuente esencial. Sin chain real, calendario y news, el motor no genera tarjetas operables.'
          : 'Feeds esenciales activos. Los proveedores opcionales amplian contexto, pero no fabrican trades.'}
      </p>
    </section>
  );
}

function DataCollectionPanel({ scan }) {
  const collection = scan?.collection;
  if (!collection) return null;
  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Data collection</p>
          <h3 className="mt-1 text-lg font-semibold">Activa aunque la aprobacion sea NO TRADE</h3>
          <p className="mt-2 text-xs text-slate-500">{collection.note || 'Capturando snapshots e IV historica para decisiones futuras.'}</p>
        </div>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-[10px] font-bold text-blue-700">{collection.backend === 'postgresql' ? 'POSTGRESQL' : 'LOCAL FALLBACK'}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TradeValue label="Symbols scanned" value={collection.scannedSymbols ?? '--'} />
        <TradeValue label="Chains stored" value={collection.chainsCollected ?? collection.snapshots ?? '--'} />
        <TradeValue label="IV symbols" value={collection.ivSymbols ?? '--'} />
        <TradeValue label="Latest snapshot" value={collection.latestSnapshotAt ? dateTime(collection.latestSnapshotAt) : '--'} />
      </div>
    </section>
  );
}

function DataHealthPanel({ scan }) {
  const health = scan?.dataHealth;
  if (!health) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Data health</p><h3 className="mt-1 text-lg font-semibold">Estado y procedencia de datos</h3></div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{health.validSymbols?.length || 0} simbolos validos</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">Actualizado: {dateTime(health.timestamp)}. Live/delayed depende de tu suscripcion en cada proveedor.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(health.metrics || []).map((metric) => (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs" key={metric.name}>
            <div className="flex justify-between gap-2"><strong>{metric.name}</strong><span className={metric.available ? 'text-green-600' : 'text-amber-600'}>{metric.available ? 'OK' : 'No disponible'}</span></div>
            <p className="mt-2 leading-5 text-slate-500">{metric.source}</p>
          </div>
        ))}
      </div>
      {!!health.endpointErrors?.length && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs text-red-600">Errores de endpoints: {health.endpointErrors.slice(0, 3).join(' | ')}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {(health.providers || []).filter((provider) => provider.urlToReadMore).map((provider) => (
          <a className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" href={provider.urlToReadMore} target="_blank" rel="noreferrer" key={provider.id}>Fuente {provider.source}</a>
        ))}
      </div>
    </section>
  );
}

function MarketSentiment({ scan }) {
  const market = scan?.market;
  if (!market) return null;
  const sentiment = market.regime === 'BULL_TREND' ? 'Risk-On' :
    ['BEAR_TREND', 'RISK_OFF', 'PANIC'].includes(market.regime) ? 'Risk-Off' :
      market.regime === 'HIGH_VOLATILITY' ? 'Volatility Expansion' :
        ['LOW_VOLATILITY', 'GAMMA_PINNED'].includes(market.regime) ? 'Volatility Compression' : 'Neutral';
  const reason = `SPY ${market.technicals?.SPY?.trend || 'No disponible'}, QQQ ${market.technicals?.QQQ?.trend || 'No disponible'}, VIX ${Number.isFinite(market.vix) ? market.vix : 'No disponible'} y breadth ${Number.isFinite(market.breadth) ? `${market.breadth}%` : 'No disponible'}.`;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Sentimiento del Mercado</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Sesgo institucional: {sentiment}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{market.regime}</span></div>
      <p className="mt-3 text-xs leading-5 text-slate-600">{reason}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">Se invalida si cambian tendencia/breadth, aparece riesgo macro, el VIX se expande o el proxy gamma cambia de regimen.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TradeValue label="SPY trend" value={market.technicals?.SPY?.trend || 'No disponible'} />
        <TradeValue label="QQQ trend" value={market.technicals?.QQQ?.trend || 'No disponible'} />
        <TradeValue label="VIX9D" value="No disponible" />
        <TradeValue label="Put/Call" value="No disponible" />
      </div>
    </section>
  );
}

function ConditionalIdeas({ scan, onSimulate }) {
  const labels = { bullish: 'Alcista', bearish: 'Bajista', neutral: 'Lateral / neutral' };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Plan educativo condicionado</p><h3 className="mt-1 text-lg font-semibold">Tres escenarios, aunque hoy sea NO TRADE</h3></div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold text-amber-700">No son ordenes aprobadas</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">Estas ideas solo usan strikes si existe cadena real. Deben convertirse en plan aprobado tras cumplir todos los gatillos y pasar un nuevo escaneo.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {(scan?.conditionalIdeas || []).map((idea) => (
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" key={idea.educationBias}>
            <p className="font-semibold text-blue-600">{labels[idea.educationBias]}</p>
            {idea.strategy ? (
              <>
                <p className="mt-2 font-mono font-semibold text-slate-800">{idea.symbol} {idea.strategy}</p>
                <p className="mt-1 text-slate-600">Exp: {idea.expiration} | Strikes: {idea.strikes}</p>
                <p className="mt-1 text-slate-600">Riesgo max: {cash(idea.maxRisk)} | POP est.: {decimal(idea.pop, 0)}% | Score: {idea.confidenceScore}/100</p>
                <p className="mt-2 rounded bg-amber-500/10 p-2 text-amber-700">{idea.classification}</p>
                {(idea.activationRules || []).slice(0, 3).map((rule) => <p className="mt-2 leading-5 text-slate-500" key={rule}>- {rule}</p>)}
                <button className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" onClick={() => onSimulate(idea)}>Simular esta estrategia</button>
              </>
            ) : <p className="mt-2 leading-5 text-amber-700">{idea.reason}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function NewsPanel({ scan }) {
  const provider = scan?.providers?.find((item) => item.id === 'finnhub' && item.configured);
  const items = [...(scan?.macro?.companyNews || []), ...(scan?.macro?.news || [])].filter((item) => item.url).slice(0, 12);
  return (
    <section id="news" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Noticias que afectan las operaciones</p>
      <h3 className="mt-1 text-lg font-semibold">Fuentes para leer antes de ejecutar</h3>
      {!provider && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">No hay proveedor de noticias por simbolo configurado. Agrega FINNHUB_API_KEY en el backend.</p>}
      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {items.map((item) => {
          const highRisk = (scan?.macro?.breakingRisk || []).some((risk) => risk.url === item.url);
          const relevance = highRisk ? 95 : item.symbol ? 70 : 40;
          return (
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs" key={`${item.url}-${item.symbol || 'market'}`}>
              <div className="flex justify-between gap-2"><span className="font-mono text-blue-600">{item.symbol || 'MARKET'}</span><span className={highRisk ? 'text-red-600' : 'text-slate-500'}>{highRisk ? 'Riesgo alto' : 'Neutral / revisar'} | Rel. {relevance}/100</span></div>
              <p className="mt-2 font-semibold leading-5 text-slate-800">{item.headline}</p>
              <p className="mt-1 line-clamp-2 text-slate-500">{item.summary || 'Resumen no disponible por la fuente.'}</p>
              <p className="mt-2 text-slate-500">{item.source} | {dateTime(item.datetime)}</p>
              <div className="mt-2 flex gap-2">
                <a className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200" href={item.url} target="_blank" rel="noreferrer">Abrir noticia</a>
                <button className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200" onClick={() => navigator.clipboard?.writeText(item.url)}>Copiar link</button>
              </div>
            </article>
          );
        })}
        {!items.length && provider && <Empty>No se recibieron noticias enlazables en la ultima consulta.</Empty>}
      </div>
    </section>
  );
}

function TopSetupCard({ setup, rank, onSimulate }) {
  const wheelPhase = setup.strategy === 'Cash Secured Put' ? 'Wheel: acquisition phase' :
    setup.strategy === 'Covered Call' ? 'Wheel: income phase' : null;
  const execution = setup.executionPlan;
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-amber-400 px-2 py-1 font-mono text-xs font-black text-slate-900">#{rank}</span>
          <div>
            <p className="font-mono text-xl font-bold">{setup.symbol}</p>
            <p className="text-xs font-semibold text-amber-600">{setup.strategy}</p>
            {wheelPhase && <p className="mt-1 text-[10px] font-semibold text-blue-600">{wheelPhase}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Confidence score</p>
          <p className="font-mono text-2xl font-bold text-green-600">{setup.confidenceScore ?? setup.score}/100</p>
        </div>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[1.15fr_.85fr]">
        <div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {setup.legs.map((leg) => (
              <div className="grid grid-cols-[50px_1fr_auto] border-b border-slate-200/70 px-3 py-2 font-mono text-xs last:border-0" key={leg.symbol}>
                <strong className={leg.side === 'SELL' ? 'text-green-600' : 'text-red-600'}>{leg.side}</strong>
                <span>{leg.strike} {leg.type}</span>
                <span className="text-slate-500">{leg.mid}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <TradeValue label="Expiration" value={`${setup.expiration} (${setup.dte} DTE)`} />
            <TradeValue label={Number.isFinite(setup.debit) ? 'Debit' : 'Credit'} value={decimal(setup.debit ?? setup.credit, 2)} />
            <TradeValue label="POP est." value={`${decimal(setup.pop, 0)}%`} />
            <TradeValue label="Max profit" value={cash(setup.maxProfit)} />
            <TradeValue label="Max risk" value={cash(setup.maxRisk)} />
            <TradeValue label="Expected move" value={Number.isFinite(setup.expectedMove) ? `+/- $${decimal(setup.expectedMove, 2)}` : '--'} />
          </div>
        </div>
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <TradeValue label="Short delta" value={decimal(setup.delta, 3)} />
            <TradeValue label="Theta" value={decimal(setup.theta, 3)} />
            <TradeValue label="IV Rank" value={Number.isFinite(setup.ivRank) ? `${setup.ivRank}` : 'warming'} />
            <TradeValue label="Gamma risk" value={setup.gammaRisk} />
            <TradeValue label="Liquidity" value={`${decimal(setup.liquidityScore, 1)}/10`} />
            <TradeValue label="Sesgo" value={setup.institutionalBias} />
            <TradeValue label="Gamma" value={decimal(setup.gamma, 4)} />
            <TradeValue label="Vega" value={decimal(setup.vega, 3)} />
            <TradeValue label="Collateral" value={cash(setup.collateralRequired)} />
            <TradeValue label="Breakeven" value={(setup.breakevens || []).map((value) => decimal(value, 2)).join(' / ') || '--'} />
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Reasoning</p>
            {setup.reasoning.join(' + ')}.
          </div>
          <p className="rounded-lg bg-emerald-500/10 p-3 text-green-700"><strong>TP:</strong> {setup.takeProfit}<br /><strong>Stop:</strong> {setup.stopLoss}</p>
          {execution && (
            <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-3 text-slate-700">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">{execution.label}</p>
              <p className="mt-2 font-semibold">Cantidad inicial: {execution.contracts} contrato</p>
              <p className="mt-2">{execution.orderType}</p>
              <p className="mt-2 text-slate-500">Capacidad maxima por limites actuales: {execution.maximumContracts} contrato(s).</p>
              {execution.entryRules.map((rule) => <p className="mt-2 text-slate-600" key={rule}>- {rule}</p>)}
              <p className="mt-3 text-[11px] leading-5 text-amber-700">{execution.note}</p>
            </div>
          )}
          <button className="inline-flex w-full items-center justify-center rounded-xl border-0 bg-gradient-to-r from-blue-600 to-purple-600 px-3.5 py-2 text-sm font-bold text-white transition hover:opacity-90" onClick={() => onSimulate(setup)}>Simular esta estrategia</button>
        </div>
      </div>
    </article>
  );
}

function TradeValue({ label, value }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p><p className="mt-1 font-mono text-xs font-semibold text-slate-800">{value}</p></div>;
}

function TopOpportunities({ scan, onSimulate }) {
  return (
    <section id="signals" className="scroll-mt-24">
      <div className="mb-4 flex items-end justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Motor de oportunidades</p><h2 className="mt-1 text-2xl font-bold">Mejores planes del momento</h2></div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">Solo aprobadas</span>
      </div>
      <div className="space-y-4">
        {scan?.opportunities?.length ? scan.opportunities.map((setup, index) => <TopSetupCard setup={setup} rank={index + 1} onSimulate={onSimulate} key={`${setup.symbol}-${setup.strategy}`} />) : (
          <Empty>Señal actual: NO TRADE. No hay estructura con strikes recomendados que haya superado todos los filtros en este momento.</Empty>
        )}
      </div>
    </section>
  );
}

function MarketDashboard({ scan, onExplain }) {
  const market = scan?.market;
  const technical = market?.technicals?.SPY;
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Market breadth</p>
        <h3 className="mt-1 text-lg font-semibold">Regimen automatico</h3>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <TradeValue label="SPY trend" value={market?.spyTrend || '--'} />
          <TradeValue label="Volatility" value={market?.volatility || '--'} />
          <TradeValue label="Breadth > SMA" value={Number.isFinite(market?.breadth) ? `${market.breadth}%` : '--'} />
          <TradeValue label="VIX" value={Number.isFinite(market?.vix) ? decimal(market.vix) : '--'} />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Sector rotation</p>
        <h3 className="mt-1 text-lg font-semibold">20 sesiones</h3>
        {market?.sectorRotation?.length ? (
          <ResponsiveContainer width="100%" height={145}>
            <BarChart data={market.sectorRotation.slice(0, 6)} margin={{ top: 15, right: 8, left: -25, bottom: 0 }}>
              <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
              <XAxis dataKey="symbol" tick={{ fill: CHART_THEME.axis, fontSize: 11 }} />
              <YAxis tick={{ fill: CHART_THEME.axis, fontSize: 10 }} />
              <Tooltip cursor={CHART_THEME.cursor} contentStyle={CHART_THEME.tooltip} labelStyle={CHART_THEME.tooltipLabel} itemStyle={CHART_THEME.tooltipItem} />
              <Bar dataKey="return20d">
                {market.sectorRotation.slice(0, 6).map((item) => <Cell fill={item.return20d >= 0 ? '#18bf86' : '#ef5961'} key={item.symbol} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty>Esperando historico real.</Empty>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Technical engine</p><h3 className="mt-1 text-lg font-semibold">SPY structure</h3></div>
          <button className="text-xs text-amber-600" onClick={() => onExplain('expectedMove')}>Explicar</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <TradeValue label="EMA 8" value={decimal(technical?.ema8, 2)} />
          <TradeValue label="EMA 21" value={decimal(technical?.ema21, 2)} />
          <TradeValue label="EMA 50" value={decimal(technical?.ema50, 2)} />
          <TradeValue label="EMA 200" value={decimal(technical?.ema200, 2)} />
          <TradeValue label="RSI 14" value={decimal(technical?.rsi14, 1)} />
          <TradeValue label="MACD hist." value={decimal(technical?.macd?.histogram, 3)} />
          <TradeValue label="ATR 14" value={decimal(technical?.atr14, 2)} />
          <TradeValue label="VWAP proxy diario" value={decimal(technical?.vwap20, 2)} />
          <TradeValue label="Volumen relativo" value={Number.isFinite(technical?.relativeVolume20) ? `${decimal(technical.relativeVolume20, 2)}x` : '--'} />
          <TradeValue label="Realized vol" value={Number.isFinite(technical?.realizedVolatility20) ? `${decimal(technical.realizedVolatility20, 1)}%` : '--'} />
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">VWAP es proxy rolling diario. VWAP y tendencia intradia permanecen No disponible hasta conectar barras intradia.</p>
      </div>
    </section>
  );
}

function GammaDesk({ scan, onExplain }) {
  const surfaces = scan?.gammaSurfaces || [];
  const selected = surfaces.find((item) => item.symbol === 'SPY') || surfaces[0];
  const profile = (selected?.profile || []).slice(-18);
  const totals = surfaces.slice(0, 8).map((item) => ({ symbol: item.symbol, value: item.value || 0, risk: item.regime }));
  return (
    <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">GEX surface</p><h3 className="mt-1 text-lg font-semibold">{selected?.symbol || 'SPY'} gamma walls and pin zones</h3></div>
          <button className="text-xs text-amber-600" onClick={() => onExplain('gammaExposure')}>Explicar</button>
        </div>
        {profile.length ? (
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={profile} margin={{ top: 18, right: 8, left: -5, bottom: 0 }}>
              <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
              <XAxis dataKey="strike" tick={{ fill: CHART_THEME.axis, fontSize: 10 }} />
              <YAxis tick={{ fill: CHART_THEME.axis, fontSize: 10 }} />
              <Tooltip cursor={CHART_THEME.cursor} contentStyle={CHART_THEME.tooltip} labelStyle={CHART_THEME.tooltipLabel} itemStyle={CHART_THEME.tooltipItem} />
              <Bar dataKey="netGamma">
                {profile.map((row) => <Cell fill={row.netGamma >= 0 ? '#4f8ff7' : '#ef5961'} key={row.strike} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty>Esperando Greeks y open interest reales de una cadena.</Empty>}
        {selected && <p className="mt-2 text-[11px] text-slate-500">{selected.label}. No se presenta como posicion dealer confirmada.</p>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Microstructure risk</p>
        <h3 className="mt-1 text-lg font-semibold">Gamma desk</h3>
        {selected ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <TradeValue label="Regime" value={selected.regime} />
              <TradeValue label="Net GEX" value={decimal(selected.value, 0)} />
              <TradeValue label="Call wall" value={selected.walls?.call ?? '--'} />
              <TradeValue label="Put wall" value={selected.walls?.put ?? '--'} />
              <TradeValue label="Gamma flip" value={selected.gammaFlipLevel ?? '--'} />
              <TradeValue label="Pinning zones" value={(selected.pinningZones || []).join(', ') || '--'} />
            </div>
            <div className="mt-3 space-y-1">
              {totals.map((item) => <div className="flex justify-between rounded bg-slate-50 px-3 py-1.5 text-xs" key={item.symbol}><span className="font-mono">{item.symbol}</span><span className={item.risk === 'positive' ? 'text-green-600' : 'text-red-600'}>{item.risk} {decimal(item.value, 0)}</span></div>)}
            </div>
          </>
        ) : <div className="mt-3"><Empty>Sin superficies almacenadas aun.</Empty></div>}
      </div>
    </section>
  );
}

function ScannerBoards({ scan }) {
  const safe = (scan?.opportunities || []).slice().sort((a, b) => a.maxRisk - b.maxRisk);
  const premium = (scan?.opportunities || []).slice().sort((a, b) => b.credit - a.credit);
  const diagnostics = [...(scan?.opportunities || []), ...(scan?.rejected || [])]
    .filter((item) => Number.isFinite(item.ivRank))
    .slice(0, 10)
    .map((item) => ({ name: `${item.symbol} ${item.strategy.split(' ')[0]}`, ivRank: item.ivRank, eligible: !item.blocks.length }));
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Safest spreads</p>
        <h3 className="mt-1 text-lg font-semibold">Riesgo menor aprobado</h3>
        <div className="mt-3 space-y-2">
          {safe.length ? safe.slice(0, 4).map((item) => (
            <div className="flex justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs" key={`${item.symbol}-${item.strategy}`}>
              <div><strong className="font-mono">{item.symbol}</strong><p className="text-slate-500">{item.strategy}</p></div>
              <div className="text-right"><strong className="text-green-600">{cash(item.maxRisk)}</strong><p className="text-slate-500">{item.score}/100</p></div>
            </div>
          )) : <Empty>Sin spreads aprobados.</Empty>}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Top premium sellers</p>
        <h3 className="mt-1 text-lg font-semibold">Credito aprobado</h3>
        <div className="mt-3 space-y-2">
          {premium.length ? premium.slice(0, 4).map((item) => (
            <div className="flex justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs" key={`${item.symbol}-${item.strategy}`}>
              <div><strong className="font-mono">{item.symbol}</strong><p className="text-slate-500">{item.expiration}</p></div>
              <div className="text-right"><strong className="text-amber-600">${decimal(item.credit, 2)}</strong><p className="text-slate-500">POP {decimal(item.pop, 0)}%</p></div>
            </div>
          )) : <Empty>Sin credito que pase todos los gates.</Empty>}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">IV heatmap</p>
        <h3 className="mt-1 text-lg font-semibold">Ranking IV observado</h3>
        {diagnostics.length ? (
          <>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={diagnostics} layout="vertical" margin={{ top: 10, right: 8, left: 40, bottom: 0 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: CHART_THEME.axis, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: CHART_THEME.axis, fontSize: 10 }} width={75} />
                <Tooltip cursor={CHART_THEME.cursor} contentStyle={CHART_THEME.tooltip} labelStyle={CHART_THEME.tooltipLabel} itemStyle={CHART_THEME.tooltipItem} />
                <Bar dataKey="ivRank">
                  {diagnostics.map((item) => <Cell fill={item.eligible ? '#18bf86' : '#f4aa32'} key={item.name} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-slate-500">Ambar = diagnostico descartado, no operable.</p>
          </>
        ) : <div className="mt-3"><Empty>IV Rank se habilita tras acumular IV real.</Empty></div>}
      </div>
    </section>
  );
}

function SofiDesk({ scan }) {
  const quote = scan?.market?.quotes?.find((item) => item.symbol === 'SOFI');
  const surface = scan?.gammaSurfaces?.find((item) => item.symbol === 'SOFI');
  const approved = scan?.opportunities?.find((item) => item.symbol === 'SOFI');
  const diagnostics = (scan?.rejected || []).filter((item) => item.symbol === 'SOFI').slice(0, 3);
  const collateralLimit = scan?.profile ? scan.profile.accountSize * scan.profile.maxCollateralPct / 100 : null;
  const stockLotCost = Number.isFinite(quote?.price) ? quote.price * 100 : null;
  const strategies = [
    ['Bull Put Spread', 'Riesgo definido para tesis alcista/neutral; solo si IV, gamma, liquidez y colateral pasan.'],
    ['Cash Secured Put', 'Cobra prima para posible compra de 100 acciones; requiere efectivo suficiente para asignacion.'],
    ['Covered Call', 'Ingreso sobre 100 acciones ya poseidas; no debe venderse como naked call.'],
    ['Wheel', 'CSP seguido de covered call si existe asignacion; exige querer ser propietario y controlar capital.']
  ];
  return (
    <section id="sofi" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">Focus stock lab</p>
          <h2 className="mt-1 text-xl font-bold">SOFI Options Desk</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">SOFI se escanea automaticamente con cadena real. Por su precio, las puts garantizadas y Wheel pueden ser interesantes solo cuando encajan en tu colateral y aceptas asignacion.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${approved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{approved ? 'SETUP APROBADO' : 'EN OBSERVACION'}</span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[.75fr_1.25fr]">
        <div className="grid grid-cols-2 gap-2">
          <TradeValue label="Precio real" value={Number.isFinite(quote?.price) ? `$${decimal(quote.price, 2)}` : '--'} />
          <TradeValue label="Movimiento" value={Number.isFinite(quote?.changePercent) ? `${decimal(quote.changePercent, 2)}%` : '--'} />
          <TradeValue label="GEX proxy" value={surface?.regime || '--'} />
          <TradeValue label="Gamma flip" value={surface?.gammaFlipLevel ?? '--'} />
          <TradeValue label="100 acciones aprox." value={cash(stockLotCost)} />
          <TradeValue label="Tu limite colateral" value={cash(collateralLimit)} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {strategies.map(([name, description]) => (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={name}>
              <p className="text-sm font-semibold text-amber-600">{name}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
            </div>
          ))}
        </div>
      </div>
      {approved ? (
        <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-xs text-green-700">SOFI tiene un plan aprobado en la seccion de señales. Verifica precio limit y riesgo en el broker antes de actuar.</p>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-700">SOFI no tiene señal operable ahora.</p>
          {diagnostics.length ? diagnostics.map((item) => (
            <div className="mt-2 rounded border border-amber-500/20 bg-white/50 p-2 text-xs leading-5 text-slate-600" key={item.strategy}>
              <strong className="text-red-600">NO OPERAR - {item.strategy}</strong>
              <p>Expira: {item.expiration} | Strikes analizados: {item.strikes} | Score: {item.score}/100</p>
              <p className="text-slate-500">Bloqueo: {item.blocks[0] || 'score menor al requerido'}.</p>
            </div>
          )) : <p className="mt-2 text-xs text-slate-500">Esperando la primera cadena procesada de SOFI.</p>}
          {Number.isFinite(stockLotCost) && Number.isFinite(collateralLimit) && stockLotCost > collateralLimit && (
            <p className="mt-3 text-xs leading-5 text-slate-600">Una asignacion de 100 acciones cerca del precio actual representa aproximadamente {cash(stockLotCost)}, por encima de tu limite de colateral de {cash(collateralLimit)}. Una CSP/Wheel solo seria admisible con un strike y capital que respeten tu mandato.</p>
          )}
        </div>
      )}
    </section>
  );
}

// Legacy lesson retained while the searchable LearningCenter supplies the active academy view.
// eslint-disable-next-line no-unused-vars
function OptionsAcademy({ scan, onExplain }) {
  const guide = scan?.assistant?.greekTargets || [];
  const lessons = [
    ['Credit spread', 'Vendes una opcion y compras proteccion. La ganancia y la perdida maxima estan definidas desde el inicio.'],
    ['Iron condor', 'Dos credit spreads alrededor de un rango. Necesita mercado estable, liquidez y bajo riesgo de evento.'],
    ['IV crush', 'Despues de un evento, la volatilidad implicita puede caer; puede ayudar al vendedor o danar al comprador.'],
    ['Assignment', 'CSP y covered calls pueden terminar en compra o venta de 100 acciones por contrato.']
  ];
  return (
    <section id="academy" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Academia Valido 1M</p><h2 className="mt-1 text-xl font-bold">Aprende mientras decides</h2></div>
        <button className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" onClick={() => onExplain('theta')}>Explicar Theta</button>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-500">Un setup atractivo no es solo prima alta: busca riesgo limitado, salida clara, liquidez y una razon estadistica para entrar. Estos rangos son filtros del sistema, no garantias de ganancia.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {guide.map((item) => (
          <button className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-amber-400" key={item.name} onClick={() => onExplain(item.name === 'Delta corto' ? 'expectedMove' : item.name === 'Theta' ? 'theta' : item.name === 'Gamma' ? 'gammaExposure' : item.name === 'Vega' ? 'vega' : 'liquidity')}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{item.name}</p>
            <p className="mt-2 font-mono text-sm font-semibold text-amber-600">{item.target}</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">{item.meaning}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {lessons.map(([title, text]) => (
          <div className="rounded-lg border border-slate-200 bg-slate-100 p-3" key={title}>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{text}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <a className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" href="https://www.optionseducation.org/" target="_blank" rel="noreferrer">OIC: riesgos y educacion</a>
        <a className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" href="https://www.cboe.com/about/hours" target="_blank" rel="noreferrer">Cboe: horarios oficiales</a>
        <a className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" href="https://docs.tradier.com/reference/brokerage-api-markets-get-options-chains" target="_blank" rel="noreferrer">Tradier: fuente de la chain</a>
      </div>
    </section>
  );
}

function SmartMoney({ scan }) {
  const macro = scan?.macro;
  const connected = (id) => Boolean(scan?.providers?.find((provider) => provider.id === id)?.configured);
  const sources = [
    { name: 'Unusual options activity', connected: connected('benzinga'), count: macro?.flow?.length || 0, detail: 'Benzinga signal feed' },
    { name: 'Block trades', connected: connected('benzinga'), count: macro?.blockTrades?.length || 0, detail: 'Benzinga block_trade' },
    { name: 'Insider activity', connected: connected('finnhub'), count: macro?.insiders?.length || 0, detail: 'Finnhub filings data' },
    { name: 'Dark pools', connected: false, count: null, detail: 'Dedicated licensed feed required' }
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Smart money tracker</p><h3 className="mt-1 text-lg font-semibold">Cobertura de actividad institucional</h3></div>
      <div className="grid gap-2 md:grid-cols-4">
        {sources.map((source) => (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs" key={source.name}>
            <div className="flex items-center justify-between gap-2">
              <strong>{source.name}</strong>
              <span className={source.connected ? 'text-green-600' : 'text-amber-600'}>{source.connected ? `${source.count} hits` : 'Unavailable'}</span>
            </div>
            <p className="mt-2 text-slate-500">{source.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RisksAndEvents({ scan }) {
  const macro = scan?.macro;
  const rejected = scan?.rejected || [];
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Earnings danger / Macro risk</p><h3 className="mt-1 text-lg font-semibold">Eventos que pueden bloquear theta</h3></div>
        {!macro ? <Empty>Calendario no conectado.</Empty> : (
          <div className="space-y-2">
            {(macro.highImpactEvents || []).slice(0, 5).map((event) => (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs" key={`${event.title}-${event.date}`}>
                <strong className="text-red-600">{event.title}</strong><p className="mt-1 text-slate-500">{dateTime(event.date)} - {event.source}</p>
              </div>
            ))}
            {!macro.highImpactEvents?.length && <p className="rounded-lg bg-emerald-500/10 p-3 text-xs text-green-700">Sin evento macro bloqueante en la ventana configurada.</p>}
            {(macro.earnings || []).slice(0, 6).map((event) => (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs" key={`${event.symbol}-${event.date}`}><strong>{event.symbol}</strong> earnings: {event.date} <span className="text-slate-500">({event.source})</span></p>
            ))}
            {(macro.breakingRisk || []).slice(0, 3).map((item) => (
              <a className="block rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs" href={item.url} target="_blank" rel="noreferrer" key={item.url}>
                <strong className="text-amber-700">News risk: {item.headline}</strong>
                <p className="mt-1 text-slate-500">{item.source} - {dateTime(item.datetime)}</p>
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Discard engine</p><h3 className="mt-1 text-lg font-semibold">Candidatos rechazados</h3></div>
        {rejected.length ? (
          <div className="max-h-[320px] overflow-auto scrollbar">
            <table className="w-full">
              <thead><tr><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Ticker</th><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Strategy</th><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Score</th><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Razon</th></tr></thead>
              <tbody>{rejected.map((setup) => (
                <tr key={`${setup.symbol}-${setup.strategy}`}>
                  <td className="px-3 py-2 font-mono text-xs">{setup.symbol}</td>
                  <td className="px-3 py-2 text-xs">{setup.strategy}</td>
                  <td className="px-3 py-2 font-mono text-xs">{setup.score}</td>
                  <td className="max-w-[310px] whitespace-normal px-3 py-2 text-xs text-slate-500">{setup.blocks[0] || 'Score below threshold'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="px-4 pb-4"><Empty>Sin candidatos mientras faltan datos esenciales.</Empty></div>}
      </div>
    </section>
  );
}

function edgeCardTone(classification) {
  if (classification === 'EDGE_READY') return 'border-emerald-200 bg-emerald-50 text-emerald-950';
  if (classification === 'AGGRESSIVE_EDGE' || classification === 'CAPITAL_HEAVY' || classification === 'HIGH_POP_BAD_PAYOUT') return 'border-amber-300 bg-amber-50 text-amber-950';
  if (classification === 'TRADE_CANDIDATE' || classification === 'WAIT_TRIGGER') return 'border-blue-200 bg-blue-50 text-blue-950';
  return 'border-slate-200 bg-white text-slate-900';
}

function formatRobinhoodTicket(ticket = {}) {
  const legs = ticket.legs?.length
    ? ticket.legs.map((leg) => {
      const side = /sell/i.test(leg.side || leg.action || '') ? 'Sell to Open' : 'Buy to Open';
      const type = String(leg.type || '').toUpperCase();
      return `${side} ${leg.quantity || 1} ${ticket.symbol} ${ticket.expiration || 'EXP'} ${leg.strike} ${type}`;
    })
    : [ticket.legsText || 'Confirmar legs en cadena'];
  return [
    `Robinhood Ticket - VALIDO 1M`,
    `Symbol: ${ticket.symbol || 'N/D'}`,
    `Strategy: ${ticket.strategy || 'N/D'}`,
    `Action in Robinhood: ${ticket.robinhoodAction || ticket.orderType || 'Limit order'}`,
    `Expiration: ${ticket.expiration || 'Confirmar'}`,
    'Legs:',
    ...legs.map((leg) => `- ${leg}`),
    `Limit: ${ticket.entryLimit || 'Confirmar bid/ask'}`,
    `Max Risk: ${cash(ticket.maxRisk)}`,
    `Max Profit: ${cash(ticket.maxProfit)}`,
    `Breakeven: ${ticket.breakEven || 'Confirmar'}`,
    `Take Profit: ${ticket.takeProfit || 'Plan no disponible'}`,
    `Stop Loss: ${ticket.stopLoss || 'Plan no disponible'}`,
    `Invalidation: ${ticket.invalidation || 'Revalidar soporte/resistencia y macro/news'}`,
    'Warning: revisar cadena, bid/ask, max loss del broker y contexto macro antes de enviar. No usar market order.'
  ].join('\n');
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

function PriorityAlertsStrip({ scan, onSimulate, onPaper, onJournal, onCopyTicket, onAiExplain }) {
  const approvedTickets = (scan?.guardianEdge?.actionableTickets || []).slice(0, 3);
  const reviewTickets = approvedTickets.length ? [] : (scan?.guardianEdge?.candidateTickets || scan?.guardianEdge?.tickets || []).slice(0, 3);
  const tickets = approvedTickets.length ? approvedTickets : reviewTickets;
  const showingReviewOnly = approvedTickets.length === 0 && reviewTickets.length > 0;
  const hasEdge = approvedTickets.length > 0 || reviewTickets.length > 0;
  const alerts = (scan?.alerts || []).filter((alert) => !(hasEdge && alert.kind === 'no_trade')).slice(0, 3);
  return (
    <section className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">Alertas principales</p>
          <h2 className="mt-1 text-2xl font-black text-slate-900">Opciones primero: tickets, watchlist y riesgos</h2>
          <p className="mt-1 text-sm text-slate-600">
            {showingReviewOnly
              ? 'No hay señal operable aprobada; estos son candidatos visibles para estudio/revision manual.'
              : 'Candidatos de riesgo definido. Gemini revisa mas setups de credito, pero una alerta no es orden ni garantia.'}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">Auto refresh {scan?.refreshSeconds || 300}s</span>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {tickets.length ? tickets.map((ticket) => (
          <article className={`rounded-2xl border p-4 shadow-sm ${edgeCardTone(ticket.classification)}`} key={ticket.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.14em] opacity-75">{showingReviewOnly ? 'EN REVISION - NO OPERABLE' : ticket.classification}</p>
                <h3 className="mt-1 text-xl font-black">{ticket.symbol} {ticket.strategy}</h3>
                <p className="mt-1 text-xs opacity-80">{ticket.riskClass}</p>
              </div>
              <span className="rounded-full bg-white/75 px-2 py-1 text-[11px] font-bold">Score {ticket.edgeScore}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <p className="rounded-lg bg-white/70 p-2"><strong>Exp</strong><br />{ticket.expiration || 'Confirmar'}</p>
              <p className="rounded-lg bg-white/70 p-2"><strong>POP est.</strong><br />{Number.isFinite(ticket.popEstimated) ? `${ticket.popEstimated.toFixed(1)}%` : 'N/D'}</p>
              <p className="rounded-lg bg-white/70 p-2"><strong>Max profit est.</strong><br />{cash(ticket.maxProfit)}</p>
              <p className="rounded-lg bg-white/70 p-2"><strong>Max risk</strong><br />{cash(ticket.maxRisk)}</p>
            </div>
            <p className="mt-3 rounded-lg bg-white/70 p-2 text-xs"><strong>Legs:</strong> {ticket.legsText || 'Confirmar chain'}</p>
            <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs"><strong>Limit:</strong> {ticket.entryLimit}</p>
            <p className="mt-2 text-xs"><strong>Invalidacion:</strong> {ticket.invalidation}</p>
            {ticket.education?.whyStrategy && (
              <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs"><strong>Aprendizaje:</strong> {ticket.education.whyStrategy}</p>
            )}
            {showingReviewOnly && <p className="mt-2 rounded-lg border border-amber-200 bg-white/80 p-2 text-xs font-semibold text-amber-900">Gemini/Risk Guard no lo aprobo como entrada real. Usar solo para revision, simulador o paper.</p>}
            {ticket.tapeProxy && <p className="mt-2 text-xs"><strong>Tape proxy:</strong> {ticket.tapeProxy.label} ({ticket.tapeProxy.pressureScore})</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="inline-flex items-center justify-center rounded-xl border-0 bg-gradient-to-r from-blue-600 to-purple-600 px-3.5 py-2 text-xs font-bold text-white transition hover:opacity-90" onClick={() => onCopyTicket?.(ticket)}>Copiar ticket</button>
              <button className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" onClick={() => onSimulate?.(ticket.sourceSetup || ticket)}>Simular</button>
              <button className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" onClick={() => onPaper?.(ticket.sourceSetup || ticket)}>Guardar paper</button>
              <button className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" onClick={() => onJournal?.(ticket)}>Journal</button>
              <button className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" onClick={onAiExplain}>Explicar</button>
            </div>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700 xl:col-span-2">
            <strong>No hay ticket visible ahora.</strong>
            <p className="mt-2">{scan?.decision?.reasons?.[0] || 'El scanner sigue vigilando. Si falta chain, macro/news clearance o max loss, la decision correcta es NO TRADE.'}</p>
          </div>
        )}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Ultimas alertas</p>
          <div className="mt-3 space-y-2">
            {alerts.length ? alerts.map((alert) => (
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs" key={alert.key + alert.date}>
                <p className={`font-bold ${['a_setup', 'trade_candidate'].includes(alert.kind) ? 'text-emerald-700' : 'text-amber-700'}`}>{alert.kind === 'trade_candidate' ? 'Candidato Guardian' : alert.kind === 'a_setup' ? 'Setup aprobado' : 'No trade / riesgo'}</p>
                <p className="mt-1 text-slate-700">{alert.message}</p>
                <p className="mt-1 text-slate-500">{dateTime(alert.createdAt)}</p>
              </div>
            )) : <p className="text-sm text-slate-500">Apareceran al escanear.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function RiskDesk({ scan }) {
  const profile = scan?.profile;
  if (!profile) return null;
  const tradeBudget = profile.accountSize * profile.riskPct / 100;
  const collateralLimit = profile.accountSize * profile.maxCollateralPct / 100;
  const dailyLossLimit = profile.accountSize * profile.maxDailyLossPct / 100;
  const weeklyLossLimit = profile.accountSize * profile.maxWeeklyLossPct / 100;
  const killSwitch = profile.tradingPaused || profile.dailyLossPct >= profile.maxDailyLossPct || profile.weeklyLossPct >= profile.maxWeeklyLossPct || profile.collateralUsedPct >= 80;
  return (
    <section id="risk" className={`scroll-mt-24 rounded-2xl border p-4 shadow-sm ${killSwitch ? 'border-red-500/40 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Mesa institucional de riesgo</p><h3 className="mt-1 text-lg font-semibold">Mandato de supervivencia del capital</h3></div>
        <span className={killSwitch ? 'text-xs font-bold text-red-600' : 'text-xs font-bold text-green-600'}>{killSwitch ? 'TRADING BLOCKED' : 'LIMITS ACTIVE'}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <TradeValue label="Account" value={cash(profile.accountSize)} />
        <TradeValue label="Risk / trade" value={`${cash(tradeBudget)} (${profile.riskPct}%)`} />
        <TradeValue label="Max collateral" value={`${cash(collateralLimit)} (${profile.maxCollateralPct}%)`} />
        <TradeValue label="Daily stop" value={`${cash(dailyLossLimit)} (${profile.maxDailyLossPct}%)`} />
        <TradeValue label="Daily loss used" value={`${decimal(profile.dailyLossPct, 1)}%`} />
        <TradeValue label="Weekly stop" value={`${cash(weeklyLossLimit)} (${profile.maxWeeklyLossPct}%)`} />
        <TradeValue label="Weekly loss used" value={`${decimal(profile.weeklyLossPct, 1)}%`} />
        <TradeValue label="Collateral used" value={`${decimal(profile.collateralUsedPct, 1)}%`} />
        <TradeValue label="Risk mode" value={profile.riskMode || 'CONSERVADOR'} />
        <TradeValue label="Open trades" value={`${profile.activeSymbols?.length || 0} / ${profile.maxOpenTrades}`} />
        <TradeValue label="1DTE approval" value={profile.allow1DteApproval ? 'Enabled' : 'Blocked'} />
        <TradeValue label="0DTE" value="Collection only" />
      </div>
    </section>
  );
}

function TradeJournal({ scan }) {
  const candidate = scan?.opportunities?.[0] || scan?.rejected?.[0];
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState({ symbol: '', strategy: '', outcome: 'OBSERVADA', mentalState: 'DISCIPLINADO', plannedEntry: '', realEntry: '', plannedExit: '', realExit: '', pnl: '', mae: '', mfe: '', error: '', ruleViolated: '', ruleRespected: '', lesson: '', notes: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.journal().then(setEntries).catch(() => {});
    const update = () => api.journal().then(setEntries).catch(() => {});
    window.addEventListener('journal-updated', update);
    return () => window.removeEventListener('journal-updated', update);
  }, []);
  useEffect(() => {
    if (!candidate) return;
    setDraft((current) => ({
      ...current,
      symbol: candidate.symbol,
      strategy: candidate.strategy,
      reason: candidate.reasoning?.join(' + ') || '',
      regime: scan.market?.regime || '',
      confidence: candidate.confidenceScore ?? candidate.score
    }));
  }, [candidate?.symbol, candidate?.strategy, scan?.market?.regime]);
  async function saveEntry(event) {
    event.preventDefault();
    if (!draft.symbol || !draft.strategy) return;
    setSaving(true);
    try {
      const item = await api.addJournal(draft);
      setEntries((current) => [item, ...current]);
      setDraft((current) => ({ ...current, notes: '', lesson: '', pnl: '', mae: '', mfe: '', error: '', ruleViolated: '', ruleRespected: '' }));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section id="journal" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Trade journal</p>
      <h3 className="mt-1 text-lg font-semibold">Decision audit trail</h3>
      <form className="mt-4 grid gap-2 md:grid-cols-[105px_1fr_140px_150px_auto]" onSubmit={saveEntry}>
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm outline-none focus:border-blue-500" value={draft.symbol} onChange={(event) => setDraft({ ...draft, symbol: event.target.value.toUpperCase() })} placeholder="SPY" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.strategy} onChange={(event) => setDraft({ ...draft, strategy: event.target.value })} placeholder="Strategy" />
        <select className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value })}>
          <option>OBSERVADA</option>
          <option>EJECUTADA</option>
          <option>PAPER TRADE</option>
          <option>IGNORADA</option>
          <option>CANCELADA POR RISK GOVERNOR</option>
        </select>
        <select className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.mentalState} onChange={(event) => setDraft({ ...draft, mentalState: event.target.value })}>
          <option>DISCIPLINADO</option><option>TRANQUILO</option><option>ANSIEDAD</option><option>FOMO</option><option>REVENGE</option><option>CANSANCIO</option>
        </select>
        <button className="inline-flex items-center justify-center rounded-xl border-0 bg-gradient-to-r from-blue-600 to-purple-600 px-3.5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" disabled={saving}>{saving ? 'Saving...' : 'Record'}</button>
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.plannedEntry} onChange={(event) => setDraft({ ...draft, plannedEntry: event.target.value })} placeholder="Entrada planificada" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.realEntry} onChange={(event) => setDraft({ ...draft, realEntry: event.target.value })} placeholder="Entrada real" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.plannedExit} onChange={(event) => setDraft({ ...draft, plannedExit: event.target.value })} placeholder="Salida planificada" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.realExit} onChange={(event) => setDraft({ ...draft, realExit: event.target.value })} placeholder="Salida real" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.pnl} onChange={(event) => setDraft({ ...draft, pnl: event.target.value })} placeholder="P/L USD" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.mae} onChange={(event) => setDraft({ ...draft, mae: event.target.value })} placeholder="MAE USD" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.mfe} onChange={(event) => setDraft({ ...draft, mfe: event.target.value })} placeholder="MFE USD" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 md:col-span-2" value={draft.error} onChange={(event) => setDraft({ ...draft, error: event.target.value })} placeholder="Error cometido" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.ruleViolated} onChange={(event) => setDraft({ ...draft, ruleViolated: event.target.value })} placeholder="Regla violada" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={draft.ruleRespected} onChange={(event) => setDraft({ ...draft, ruleRespected: event.target.value })} placeholder="Regla respetada" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 md:col-span-3" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Notas de ejecucion" />
        <input className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 md:col-span-2" value={draft.lesson} onChange={(event) => setDraft({ ...draft, lesson: event.target.value })} placeholder="Leccion aprendida" />
      </form>
      <div className="mt-4 max-h-48 space-y-2 overflow-auto scrollbar">
        {entries.length ? entries.slice(0, 10).map((entry) => (
          <div className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs" key={entry.id}>
            <div><strong className="font-mono">{entry.symbol}</strong> <span className="text-slate-600">{entry.strategy}</span><p className="text-slate-500">{entry.notes || entry.reason || 'No notes'}</p><p className="text-slate-500">{entry.mental_state || entry.mentalState || ''} {entry.lesson ? `| ${entry.lesson}` : ''}</p></div>
            <div className="text-right"><strong className="text-amber-600">{entry.outcome}</strong><p className="text-slate-500">{dateTime(entry.createdAt || entry.created_at)}</p></div>
          </div>
        )) : <Empty>Aun no hay decisiones registradas.</Empty>}
      </div>
    </section>
  );
}

function WatchlistAndProfile({ scan, onSaveWatchlist, onSaveProfile }) {
  const [symbols, setSymbols] = useState('');
  const [profile, setProfile] = useState(null);
  const [holdings, setHoldings] = useState('');
  const [activeSymbols, setActiveSymbols] = useState('');
  useEffect(() => {
    setSymbols((scan?.watchlist?.symbols || []).join(', '));
    if (scan?.profile) {
      setProfile(scan.profile);
      setHoldings(Object.entries(scan.profile.holdings || {}).map(([symbol, shares]) => `${symbol}:${shares}`).join(', '));
      setActiveSymbols((scan.profile.activeSymbols || []).join(', '));
    }
  }, [scan?.watchlist?.updatedAt, scan?.profile?.updatedAt, scan?.decision?.status]);
  return (
    <section id="settings" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Mandato persistente</p>
      <h3 className="mt-1 text-lg font-semibold">Watchlist y control de riesgo</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">Aqui defines universo y limites de capital. VIX, IV, tendencia, gamma y eventos nunca se introducen manualmente.</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">Incluidos: SPY, SPX, QQQ, IWM, DIA, MAG7 y SOFI. Puedes agregar XSP o NDX si tu plan de datos y broker los soportan.</p>
      <label className="mt-4 block text-xs text-slate-500">Watchlist adicional</label>
      <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={symbols} onChange={(event) => setSymbols(event.target.value)} placeholder="SPY, QQQ, NVDA" />
      <button className="mt-2 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200" onClick={() => onSaveWatchlist(symbols.split(',').map((item) => item.trim()))}>Guardar watchlist</button>
      {profile && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <ProfileInput label="Cuenta USD" value={profile.accountSize} onChange={(value) => setProfile({ ...profile, accountSize: value })} />
          <ProfileInput label="Riesgo por trade %" value={profile.riskPct} onChange={(value) => setProfile({ ...profile, riskPct: value })} />
          <ProfileInput label="Colateral max %" value={profile.maxCollateralPct} onChange={(value) => setProfile({ ...profile, maxCollateralPct: value })} />
          <ProfileInput label="Perdida diaria max %" value={profile.maxDailyLossPct} onChange={(value) => setProfile({ ...profile, maxDailyLossPct: value })} />
          <ProfileInput label="Perdida diaria actual %" value={profile.dailyLossPct} onChange={(value) => setProfile({ ...profile, dailyLossPct: value })} />
          <ProfileInput label="Perdida semanal max %" value={profile.maxWeeklyLossPct} onChange={(value) => setProfile({ ...profile, maxWeeklyLossPct: value })} />
          <ProfileInput label="Perdida semanal actual %" value={profile.weeklyLossPct} onChange={(value) => setProfile({ ...profile, weeklyLossPct: value })} />
          <ProfileInput label="Colateral usado %" value={profile.collateralUsedPct} onChange={(value) => setProfile({ ...profile, collateralUsedPct: value })} />
          <ProfileInput label="Operaciones abiertas max" value={profile.maxOpenTrades} onChange={(value) => setProfile({ ...profile, maxOpenTrades: value })} />
          <label className="text-xs text-slate-500">
            Modo
            <select className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" value={profile.riskMode || 'CONSERVADOR'} onChange={(event) => setProfile({ ...profile, riskMode: event.target.value })}>
              <option>CONSERVADOR</option><option>NORMAL</option><option>AGRESIVO EDUCATIVO</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
            <input type="checkbox" checked={profile.tradingPaused || false} onChange={(event) => setProfile({ ...profile, tradingPaused: event.target.checked })} />
            Kill switch
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
            <input type="checkbox" checked={profile.allow1DteApproval || false} onChange={(event) => setProfile({ ...profile, allow1DteApproval: event.target.checked })} />
            Habilitar aprobacion 1DTE
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
            <input type="checkbox" checked={profile.allow0Dte || false} onChange={(event) => setProfile({ ...profile, allow0Dte: event.target.checked })} />
            0DTE solo con confirmacion
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
            <input type="checkbox" checked={profile.allowEarnings || false} onChange={(event) => setProfile({ ...profile, allowEarnings: event.target.checked })} />
            Earnings educativo
          </label>
          <ProfileInput label="Perdidas consecutivas hoy" value={profile.consecutiveDailyLosses || 0} onChange={(value) => setProfile({ ...profile, consecutiveDailyLosses: value })} />
          <label className="col-span-2 text-xs text-slate-500">
            Acciones cubiertas (para Covered Call / Wheel)
            <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm outline-none focus:border-blue-500" value={holdings} onChange={(event) => setHoldings(event.target.value)} placeholder="AAPL:100, F:200" />
          </label>
          <label className="col-span-2 text-xs text-slate-500">
            Posiciones activas (control de correlacion)
            <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm outline-none focus:border-blue-500" value={activeSymbols} onChange={(event) => setActiveSymbols(event.target.value)} placeholder="SPY, QQQ" />
          </label>
          <button className="col-span-2 mt-1 inline-flex items-center justify-center rounded-xl border-0 bg-gradient-to-r from-blue-600 to-purple-600 px-3.5 py-2 text-sm font-bold text-white transition hover:opacity-90" onClick={() => {
            const parsed = Object.fromEntries(holdings.split(',').map((item) => item.trim().split(':')).filter(([symbol, shares]) => symbol && Number(shares) >= 100).map(([symbol, shares]) => [symbol.toUpperCase(), Number(shares)]));
            const active = activeSymbols.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
            onSaveProfile({ ...profile, holdings: parsed, activeSymbols: active });
          }}>Guardar mandato</button>
        </div>
      )}
    </section>
  );
}

function ProfileInput({ label, value, onChange }) {
  return (
    <label className="text-xs text-slate-500">
      {label}
      <input className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm outline-none focus:border-blue-500" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Explainers({ onOpen }) {
  const terms = [['ivRank', 'IV Rank'], ['gammaExposure', 'Gamma Exposure'], ['theta', 'Theta Decay'], ['expectedMove', 'Expected Move'], ['vega', 'Vega Risk'], ['liquidity', 'Liquidity Score']];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">AI Explainer System</p>
      <h3 className="mt-1 text-lg font-semibold">Metricas auditables</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        {terms.map(([id, label]) => <button className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200" onClick={() => onOpen(id)} key={id}>{label}</button>)}
      </div>
    </section>
  );
}

function Modal({ item, onClose }) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={onClose}>
      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onMouseDown={(event) => event.stopPropagation()}>
        <button className="float-right text-slate-500" onClick={onClose}>X</button>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Explicador institucional</p>
        <h2 className="mt-2 text-2xl font-bold">{item.title}</h2>
        <p className="mt-4 text-sm leading-6 text-slate-600">{item.simple}</p>
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-500/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">Lectura institucional</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{item.institutional}</p>
        </div>
      </div>
    </div>
  );
}

function VersionBadge() {
  const v = VALIDO_BUILD_VERSION;
  const ts = VALIDO_BUILD_TIMESTAMP;
  const shortTs = ts !== 'no timestamp' ? new Date(ts).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }) : '';
  return (
    <a
      href="/archivo"
      title={`Build: ${v} | ${ts}`}
      className="fixed right-3 top-3 z-50 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[10px] font-semibold text-slate-500 shadow-sm backdrop-blur hover:border-amber-400 hover:text-slate-900 md:right-4 md:top-4"
    >
      v{v}{shortTs ? ` · ${shortTs}` : ''}
    </a>
  );
}

export default function App() {
  const [scan, setScan] = useState(null);
  const [explainers, setExplainers] = useState({});
  const [selectedExplainer, setSelectedExplainer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [seconds, setSeconds] = useState(300);
  const [notificationEnabled, setNotificationEnabled] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const [simulationSetup, setSimulationSetup] = useState(null);
  const [paperSetup, setPaperSetup] = useState(null);
  const [replayTrade, setReplayTrade] = useState(null);
  const [auditItem, setAuditItem] = useState(null);
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

  useEffect(() => {
    load();
    api.explainers().then(setExplainers).catch(() => {});
  }, []);

  useEffect(() => {
    const countdown = window.setInterval(() => setSeconds((current) => current > 1 ? current - 1 : scan?.refreshSeconds || 300), 1000);
    const refresh = window.setInterval(() => load(), (scan?.refreshSeconds || 300) * 1000);
    return () => { window.clearInterval(countdown); window.clearInterval(refresh); };
  }, [scan?.refreshSeconds, notificationEnabled]);

  const selected = useMemo(() => selectedExplainer ? explainers[selectedExplainer] : null, [selectedExplainer, explainers]);
  const professionalSignals = useMemo(() => professionalSignalsFromScan(scan || {}), [scan]);
  const marketPulse = useMemo(() => marketPulseFromScan(scan || {}), [scan]);
  const geminiBrief = useMemo(() => geminiBriefFromScan(scan || {}, professionalSignals), [scan, professionalSignals]);
  const archiveMode = typeof window !== 'undefined' && ['/archivo', '/laboratorio', '/dev'].some((path) => window.location.pathname.startsWith(path));
  const alertStatus = useMemo(() => ({
    pushEnabled: notificationEnabled,
    lastAlert: latestAlert.current,
    lastError: error || null,
    nextScan: seconds ? `${seconds}s` : null
  }), [notificationEnabled, error, seconds]);
  async function unlock(key) {
    api.setAccessKey(key);
    api.explainers().then(setExplainers).catch(() => {});
    await load();
  }

  function simulateSetup(setup) {
    setSimulationSetup({ ...setup, simulationRequestId: Date.now() });
    window.setTimeout(() => document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function paperSetupTrade(setup) {
    setPaperSetup({ ...setup, paperRequestId: Date.now() });
    window.setTimeout(() => document.getElementById('paper')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function openAiPanel() {
    document.getElementById('ai-status')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveSimulationJournal(entry) {
    await api.addJournal(entry);
    window.dispatchEvent(new Event('journal-updated'));
  }

  async function copyGuardianTicket(ticket) {
    await copyText(ticket.robinhoodTicket || formatRobinhoodTicket(ticket));
  }

  async function saveTicketToJournal(ticket) {
    await api.addJournal({
      symbol: ticket.symbol,
      strategy: ticket.strategy,
      outcome: ticket.classification?.includes('READY') ? 'OBSERVADA' : 'PAPER TRADE',
      reason: ticket.notificationBody || ticket.education?.whyStrategy || ticket.invalidation,
      plannedEntry: ticket.entryLimit,
      plannedExit: `${ticket.takeProfit || ''} / ${ticket.stopLoss || ''}`.trim(),
      notes: ticket.robinhoodTicket || formatRobinhoodTicket(ticket),
      lesson: ticket.education?.educationNote || ticket.education?.whyStrategy || 'Revisar bid/ask, max loss, invalidacion y plan antes de cualquier decision.',
      source: 'guardian-edge-ticket',
      confidence: ticket.edgeScore,
      maxRisk: ticket.maxRisk,
      maxProfit: ticket.maxProfit,
      expiration: ticket.expiration,
      createdFromTicketId: ticket.id
    });
    window.dispatchEvent(new Event('journal-updated'));
    window.setTimeout(() => document.getElementById('journal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  async function saveProfessionalSignal(signal) {
    await api.addJournal({
      symbol: signal.symbol,
      strategy: signal.strategyLabel,
      outcome: signal.status === 'READY' ? 'OBSERVADA' : signal.status,
      reason: signal.geminiCoach?.summary || signal.technicalSummary,
      plannedEntry: signal.executionPlan.entryTrigger,
      plannedExit: `${signal.executionPlan.takeProfit} / ${signal.executionPlan.stopLoss}`,
      notes: signal.ticketText,
      lesson: signal.geminiCoach?.mainRisk || 'Riesgo primero: confirmar datos antes de actuar.',
      source: 'professional-signal-console',
      confidence: signal.score,
      maxRisk: signal.maxRiskUsd,
      maxProfit: signal.maxProfitUsd,
      expiration: signal.expiration
    });
    window.dispatchEvent(new Event('journal-updated'));
  }

  async function copyProfessionalSignal(signal) {
    await copyText(signal.ticketText);
  }

  function viewProfessionalSignal(signal) {
    window.history.replaceState(null, '', `/signals/${encodeURIComponent(signal.id)}`);
    setAuditItem({ metric: 'Professional Signal', setup: signal });
  }

  function dismissProfessionalSignal(signal) {
    latestAlert.current = signal.id;
  }

  if (locked) return <AccessGate error={accessError} onUnlock={unlock} />;

  return (
    <div className="min-h-screen bg-slate-50">
      <VersionBadge />
      <div className="py-3"><DesktopTabs /></div>
      <div className="mx-auto max-w-7xl space-y-5 px-3 pb-24 pt-2 md:px-5">
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>}
        <HomePro
          signals={professionalSignals}
          marketPulse={marketPulse}
          geminiBrief={geminiBrief}
          alertStatus={alertStatus}
          onScanNow={() => load(true)}
          onViewSignal={viewProfessionalSignal}
          onCopyTicket={copyProfessionalSignal}
          onSaveSignal={saveProfessionalSignal}
          onDismissSignal={dismissProfessionalSignal}
          onAskGemini={openAiPanel}
        />

        <section id="news">
          <NewsPanel scan={scan} />
        </section>
        <section id="risk" className="space-y-4">
          <RiskDesk scan={scan} />
          <RiskGovernorPanel scan={scan} />
        </section>
        <section id="journal">
          <TradeJournal scan={scan} />
        </section>
        <section id="settings" className="grid gap-4 lg:grid-cols-3">
          <NotificationCenter enabled={notificationEnabled} onEnabled={setNotificationEnabled} />
          <AiStatusPanel scan={scan} />
          <WatchlistAndProfile scan={scan} onSaveWatchlist={async (symbols) => { await api.saveWatchlist(symbols); load(true); }} onSaveProfile={async (profile) => { await api.saveProfile(profile); load(true); }} />
        </section>

        {archiveMode && (
          <section id="archivo" className="space-y-5">
            <CollapsibleSection id="archivo-guardian" title="Archivo Guardian / scanner completo" defaultOpen>
              <GeminiGuardianCommandCenter scan={scan} loading={loading} onRefresh={() => load(true)} onAiExplain={openAiPanel} onSimulate={simulateSetup} onPaper={paperSetupTrade} />
              <PriorityAlertsStrip scan={scan} onSimulate={simulateSetup} onPaper={paperSetupTrade} onJournal={saveTicketToJournal} onCopyTicket={copyGuardianTicket} onAiExplain={openAiPanel} />
              <GuardianPanel
                scan={scan}
                onSimulate={simulateSetup}
                onPaper={paperSetupTrade}
                onRefresh={() => load(true)}
                onOpenChecklist={() => document.getElementById('paper')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                onOpenJournal={() => document.getElementById('journal')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                onAiExplain={openAiPanel}
              />
              <ProSignals scan={scan} onSimulate={simulateSetup} onPaper={paperSetupTrade} onAudit={setAuditItem} onAiExplain={openAiPanel} />
              <ScannerBoards scan={scan} />
              <TopOpportunities scan={scan} onSimulate={simulateSetup} />
              <ConditionalIdeas scan={scan} onSimulate={simulateSetup} />
              <RisksAndEvents scan={scan} />
            </CollapsibleSection>
            <CollapsibleSection id="laboratorio" title="Laboratorio y paper ocultos">
              <OptionsStrategyLab prefillSetup={simulationSetup} profile={scan?.profile} onSaveJournal={saveSimulationJournal} onSendPaper={paperSetupTrade} />
              <PaperTradingDesk importedSetup={paperSetup} profile={scan?.profile} onSaveJournal={saveSimulationJournal} onReplay={setReplayTrade} />
              <MarketSentiment scan={scan} />
              <SofiDesk scan={scan} />
              <MarketDashboard scan={scan} onExplain={setSelectedExplainer} />
              <GammaDesk scan={scan} onExplain={setSelectedExplainer} />
              <SmartMoney scan={scan} />
              <GexLab scan={scan} />
              <MovingAveragePlaybook scan={scan} />
              <TapeReadingLab scan={scan} />
              <OptionsFlowLite scan={scan} />
              <AlgorithmicStrategyLab onPaper={paperSetupTrade} />
              <PracticeReplay importedTrade={replayTrade} />
            </CollapsibleSection>
            <CollapsibleSection id="archivo-educacion" title="Educacion y fuentes completas">
              <DailyAssistant scan={scan} />
              <DailyLearningCards scan={scan} onSimulate={simulateSetup} onPaper={paperSetupTrade} />
              <GreeksVolatilityAcademy />
              <TradingPlan scan={scan} onAiExplain={openAiPanel} />
              <StrategyLibrary onSimulate={simulateSetup} onPaper={paperSetupTrade} />
              <LearningCenter scan={scan} />
              <LearningRoadmap onSimulate={simulateSetup} onPaper={paperSetupTrade} />
              <ProviderCoverage scan={scan} />
              <DataCollectionPanel scan={scan} />
              <DataHealthPanel scan={scan} />
              <ProDataMap scan={scan} />
              <Explainers onOpen={setSelectedExplainer} />
            </CollapsibleSection>
          </section>
        )}

        <footer className="text-xs leading-5 text-slate-500">
          Educational / decision-support only. No auto-trading enabled. Candidatos de alta probabilidad con riesgo definido, sujetos a validacion de datos, liquidez, volatilidad y contexto macro.
          <span className="mt-2 block font-mono text-[11px]">VALIDO_BUILD_VERSION {VALIDO_BUILD_VERSION} | Build {dateTime(VALIDO_BUILD_TIMESTAMP)} | <a href="/archivo" className="text-blue-600 hover:underline">Archivo</a></span>
        </footer>
      </div>
      <MobileQuickNav />
      <Modal item={selected} onClose={() => setSelectedExplainer(null)} />
      <SourceFormulaAudit item={auditItem} onClose={() => setAuditItem(null)} />
    </div>
  );
}