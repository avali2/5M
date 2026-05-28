import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from './lib/api.js';
import NotificationCenter from './features/notifications/NotificationCenter.jsx';
import { showMobileSafeNotification } from './services/notifications.js';
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

const cash = (value) => Number.isFinite(value) ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '--';
const decimal = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits) : '--';
const dateTime = (value) => value ? new Intl.DateTimeFormat('es-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value)) : '--';
const VALIDO_BUILD_VERSION = import.meta.env.VITE_VALIDO_BUILD_VERSION || 'local-dev';
const VALIDO_BUILD_TIMESTAMP = import.meta.env.VITE_VALIDO_BUILD_TIMESTAMP || 'no timestamp';
const EDGE_LABELS = {
  EDGE_READY: 'EDGE READY',
  AGGRESSIVE_EDGE: 'EDGE AGRESIVO DETECTADO',
  TRADE_CANDIDATE: 'CANDIDATO DE ENTRADA',
  WAIT_TRIGGER: 'SETUP EN ESPERA',
  CAPITAL_HEAVY: 'CAPITAL HEAVY',
  HIGH_POP_BAD_PAYOUT: 'HIGH POP BAD PAYOUT',
  NO_READY: 'NO READY',
  NO_TRADE_REAL: 'NO TRADE REAL'
};
const tone = (status) => ['eligible', 'EDGE_READY'].includes(status)
  ? 'text-sigma-green border-sigma-green/40 bg-emerald-500/10'
  : ['configuration_required', 'conditional_edge', 'AGGRESSIVE_EDGE', 'TRADE_CANDIDATE', 'WAIT_TRIGGER', 'CAPITAL_HEAVY', 'HIGH_POP_BAD_PAYOUT', 'soft_macro'].includes(status)
    ? 'text-sigma-amber border-sigma-amber/40 bg-amber-500/10'
    : 'text-sigma-red border-sigma-red/40 bg-red-500/10';

function effectiveEngineState(scan) {
  const decision = scan?.decision;
  const edgeStatus = scan?.guardianEdge?.dailyBest?.classification || scan?.guardianEdge?.status;
  const hasActionableEdge = ['EDGE_READY', 'AGGRESSIVE_EDGE', 'TRADE_CANDIDATE', 'WAIT_TRIGGER', 'CAPITAL_HEAVY', 'HIGH_POP_BAD_PAYOUT'].includes(edgeStatus);
  const softMacroOnly = (scan?.macro?.softImpactEvents?.length || 0) > 0 && !(scan?.macro?.highImpactEvents?.length || 0);
  if (hasActionableEdge) {
    return {
      status: edgeStatus,
      label: EDGE_LABELS[edgeStatus] || edgeStatus,
      reasons: decision?.reasons || []
    };
  }
  if (softMacroOnly && decision?.status !== 'eligible') {
    return {
      status: 'soft_macro',
      label: 'RIESGO MACRO CERCANO - SOFT WARNING',
      reasons: decision?.reasons || []
    };
  }
  if (!decision) return { status: 'loading', label: 'CARGANDO ENGINE', reasons: [] };
  return decision;
}

function Empty({ children }) {
  return <div className="rounded-xl border border-dashed border-sigma-line p-6 text-center text-sm text-slate-500">{children}</div>;
}

function Header({ scan, loading, onRefresh, seconds }) {
  const engine = effectiveEngineState(scan);
  return (
    <header className="sticky top-0 z-30 border-b border-sigma-line/80 bg-white/88 px-4 backdrop-blur-xl md:px-8">
      <div className="mx-auto flex min-h-[68px] max-w-[1540px] flex-wrap items-center justify-between gap-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-amber-200 via-sigma-gold to-amber-700 text-xl font-black text-slate-950">V</div>
          <div>
            <h1 className="text-[15px] font-bold tracking-[.08em] text-slate-950">VALIDO 1M PRO</h1>
            <p className="text-[11px] text-slate-500">Institutional OS. Signals first. Risk always.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="status-chip">{engine.label}</span>
          <span className="status-chip font-mono">Refresh {seconds}s</span>
          <span className="hidden text-xs text-slate-500 sm:inline">{dateTime(scan?.asOf)} ET</span>
          <button className="btn" disabled={loading} onClick={onRefresh}>{loading ? 'Escaneando...' : 'Escanear ahora'}</button>
        </div>
      </div>
    </header>
  );
}

function AccessGate({ error, onUnlock }) {
  const [key, setKey] = useState('');
  return (
    <div className="grid min-h-screen place-items-center bg-sigma-bg p-5 text-sigma-text">
      <form className="panel w-full max-w-md p-6" onSubmit={(event) => { event.preventDefault(); onUnlock(key); }}>
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-sigma-gold text-2xl font-black text-slate-950">V</div>
        <p className="eyebrow mt-5">Acceso privado</p>
        <h1 className="mt-2 text-2xl font-bold">VALIDO 1M OS</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Introduce la clave privada configurada en el servidor. Tus tokens del broker nunca se guardan en el telefono.</p>
        {error && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs text-sigma-red">{error}</p>}
        <input className="input mt-5" type="password" autoComplete="current-password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Clave de acceso" />
        <button className="btn btn-primary mt-3 w-full" type="submit">Entrar al desk</button>
      </form>
    </div>
  );
}

function MobileQuickNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-sigma-line bg-sigma-bg/95 px-1 py-2 backdrop-blur md:hidden">
      {[['decision', 'Inicio'], ['guardian', 'Guardian'], ['pro-signals', 'Senales'], ['lab', 'Simular'], ['paper', 'Paper'], ['journal', 'Journal']].map(([target, label]) => (
        <a className="rounded-lg px-2 py-2 text-[11px] font-semibold text-slate-300" href={`#${target}`} key={target}>{label}</a>
      ))}
    </nav>
  );
}

function DesktopTabs() {
  const tabs = [
    ['decision', 'Dashboard'], ['guardian', 'Guardian'], ['pro-signals', 'Senales Pro'], ['signals', 'Scanner'], ['lab', 'Simulador'],
    ['paper', 'Paper Trading'], ['data-map', 'Fuentes Pro'], ['greeks', 'Greeks'], ['gex-lab', 'GEX Lab'],
    ['moving-averages', 'Medias'], ['trading-plan', 'Plan'], ['library', 'Biblioteca'], ['tape-lab', 'Tape'],
    ['options-flow', 'Flow'], ['algo-lab', 'Algo'], ['replay', 'Replay'], ['journal', 'Journal'], ['notification-status', 'Alertas'], ['settings', 'Config']
  ];
  return (
    <nav className="hidden overflow-x-auto rounded-xl border border-sigma-line bg-sigma-elevated p-2 md:flex md:gap-1">
      {tabs.map(([target, label]) => <a className="whitespace-nowrap rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-sigma-soft hover:text-white" href={`#${target}`} key={target}>{label}</a>)}
    </nav>
  );
}

function DecisionHero({ scan }) {
  const decision = effectiveEngineState(scan);
  if (!decision) return <div className="panel h-64 animate-pulse bg-sigma-elevated" />;
  return (
    <motion.section id="decision" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`panel scroll-mt-24 border p-5 md:p-7 ${tone(decision.status)}`}>
      <div className="grid gap-7 lg:grid-cols-[1.35fr_.95fr]">
        <div>
          <div className="eyebrow">Autonomous Market Intelligence Engine</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">{decision.label}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            {scan?.summary || decision.reasons?.join(' ') || 'Cargando datos del engine...'}
          </p>
          {scan?.summaryWarning && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-sigma-amber">
              IA manual no disponible: {scan.summaryWarning}. El scanner no depende de OpenAI y sigue funcionando.
            </p>
          )}
          {decision.reasons?.length > 0 && (
            <div className="mt-5 space-y-2">
              {decision.reasons.map((reason) => (
                <p className="rounded-lg border border-current/20 bg-black/15 px-3 py-2 text-xs" key={reason}>{reason}</p>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <HeroMetric name="Regimen" value={scan?.market?.regime || 'Blocked'} />
          <HeroMetric name="VIX real" value={Number.isFinite(scan?.market?.vix) ? decimal(scan.market.vix) : 'No feed'} />
          <HeroMetric name="Breadth" value={Number.isFinite(scan?.market?.breadth) ? `${scan.market.breadth}%` : 'No feed'} />
          <HeroMetric name="Fuente resumen" value={scan?.summarySource || 'Motor de reglas'} />
        </div>
      </div>
    </motion.section>
  );
}

function DailyAssistant({ scan }) {
  const assistant = scan?.assistant;
  if (!assistant) return null;
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-sigma-line bg-gradient-to-r from-blue-500/10 to-transparent p-4 md:p-5">
        <p className="eyebrow text-sigma-blue">Valido coach de la sesion</p>
        <h2 className="mt-2 text-xl font-bold">{assistant.action}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{assistant.actionReason}</p>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-2">
          <TradeValue label="Estado de horario ET" value={assistant.marketSession} />
          <TradeValue label="Lectura volatilidad" value={assistant.volatility} />
          <TradeValue label="Proximo evento bloqueante" value={assistant.nextEvent ? `${assistant.nextEvent.title} - ${dateTime(assistant.nextEvent.date)}` : 'Sin evento bloqueante detectado'} />
          <div className="rounded-lg border border-sigma-line bg-sigma-soft p-3">
            <p className="eyebrow">Antes de decidir</p>
            {assistant.checklist.map((item) => <p className="mt-2 text-xs leading-5 text-slate-300" key={item}>- {item}</p>)}
          </div>
        </div>
        <div className="rounded-xl border border-sigma-line bg-sigma-soft p-4">
          <p className="eyebrow">Horario practico para income options</p>
          {assistant.timingTips.map((tip) => <p className="mt-3 text-xs leading-5 text-slate-300" key={tip}>{tip}</p>)}
          <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-sigma-amber">
            Son reglas de disciplina, no predicciones. Un horario favorable no reemplaza liquidez, riesgo definido ni un setup aprobado.
          </p>
        </div>
      </div>
    </section>
  );
}

function HeroMetric({ name, value }) {
  return (
    <div className="rounded-xl border border-sigma-line/70 bg-black/20 p-3">
      <p className="eyebrow">{name}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ProviderCoverage({ scan }) {
  const visibleProviders = (scan?.providers || []).filter((provider) => !(provider.hiddenWhenMissing && !provider.configured));
  const missingRequired = visibleProviders.some((provider) => provider.required && !provider.configured);
  return (
    <section className="panel p-4">
      <div className="mb-4 flex items-end justify-between">
        <div><p className="eyebrow">Data layer</p><h3 className="mt-1 text-lg font-semibold">Fuentes verificadas</h3></div>
        <span className="status-chip">Server-side keys</span>
      </div>
      <div className="space-y-2">
        {visibleProviders.map((provider) => {
          const providerMissingRequired = !provider.configured && provider.required;
          const status = provider.configured ? 'CONFIGURED' : providerMissingRequired ? 'MISSING REQUIRED' : provider.important ? 'IMPORTANT MISSING' : 'OPTIONAL';
          return (
          <div className="flex items-start gap-3 rounded-lg border border-sigma-line bg-sigma-soft p-3" key={provider.id}>
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${provider.configured ? 'bg-sigma-green' : providerMissingRequired ? 'bg-sigma-red' : provider.important ? 'bg-sigma-amber' : 'bg-slate-300'}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <strong className="text-sm">{provider.name}</strong>
                <span className={`text-[10px] font-bold ${provider.configured ? 'text-sigma-green' : providerMissingRequired ? 'text-sigma-red' : provider.important ? 'text-sigma-amber' : 'text-slate-500'}`}>{status}</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{provider.coverage.join(' / ')}</p>
            </div>
          </div>
          );
        })}
      </div>
      <p className={`mt-4 rounded-lg p-3 text-xs leading-5 ${missingRequired ? 'bg-amber-500/10 text-sigma-amber' : 'bg-emerald-500/10 text-sigma-green'}`}>
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
    <section className="panel border border-sigma-blue/30 bg-blue-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-sigma-blue">Data collection</p>
          <h3 className="mt-1 text-lg font-semibold">Activa aunque la aprobacion sea NO TRADE</h3>
          <p className="mt-2 text-xs text-slate-400">{collection.note || 'Capturando snapshots e IV historica para decisiones futuras.'}</p>
        </div>
        <span className="status-chip text-sigma-blue">{collection.backend === 'postgresql' ? 'POSTGRESQL' : 'LOCAL FALLBACK'}</span>
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
    <section className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Data health</p><h3 className="mt-1 text-lg font-semibold">Estado y procedencia de datos</h3></div>
        <span className="status-chip">{health.validSymbols?.length || 0} simbolos validos</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">Actualizado: {dateTime(health.timestamp)}. Live/delayed depende de tu suscripcion en cada proveedor.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(health.metrics || []).map((metric) => (
          <div className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs" key={metric.name}>
            <div className="flex justify-between gap-2"><strong>{metric.name}</strong><span className={metric.available ? 'text-sigma-green' : 'text-sigma-amber'}>{metric.available ? 'OK' : 'No disponible'}</span></div>
            <p className="mt-2 leading-5 text-slate-500">{metric.source}</p>
          </div>
        ))}
      </div>
      {!!health.endpointErrors?.length && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs text-sigma-red">Errores de endpoints: {health.endpointErrors.slice(0, 3).join(' | ')}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {(health.providers || []).filter((provider) => provider.urlToReadMore).map((provider) => (
          <a className="btn text-xs" href={provider.urlToReadMore} target="_blank" rel="noreferrer" key={provider.id}>Fuente {provider.source}</a>
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
    <section className="panel p-4">
      <p className="eyebrow">Sentimiento del Mercado</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Bias institucional: {sentiment}</h3><span className="status-chip">{market.regime}</span></div>
      <p className="mt-3 text-xs leading-5 text-slate-300">{reason}</p>
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
    <section className="panel p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div><p className="eyebrow text-sigma-blue">Plan educativo condicionado</p><h3 className="mt-1 text-lg font-semibold">Tres escenarios, aunque hoy sea NO TRADE</h3></div>
        <span className="status-chip text-sigma-amber">No son ordenes aprobadas</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">Estas ideas solo usan strikes si existe cadena real. Deben convertirse en plan aprobado tras cumplir todos los gatillos y pasar un nuevo escaneo.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {(scan?.conditionalIdeas || []).map((idea) => (
          <article className="rounded-xl border border-sigma-line bg-sigma-soft p-3 text-xs" key={idea.educationBias}>
            <p className="font-semibold text-sigma-blue">{labels[idea.educationBias]}</p>
            {idea.strategy ? (
              <>
                <p className="mt-2 font-mono font-semibold text-slate-100">{idea.symbol} {idea.strategy}</p>
                <p className="mt-1 text-slate-300">Exp: {idea.expiration} | Strikes: {idea.strikes}</p>
                <p className="mt-1 text-slate-300">Riesgo max: {cash(idea.maxRisk)} | POP est.: {decimal(idea.pop, 0)}% | Score: {idea.confidenceScore}/100</p>
                <p className="mt-2 rounded bg-amber-500/10 p-2 text-sigma-amber">{idea.classification}</p>
                {(idea.activationRules || []).slice(0, 3).map((rule) => <p className="mt-2 leading-5 text-slate-400" key={rule}>- {rule}</p>)}
                <button className="btn mt-3 w-full text-xs" onClick={() => onSimulate(idea)}>Simular esta estrategia</button>
              </>
            ) : <p className="mt-2 leading-5 text-sigma-amber">{idea.reason}</p>}
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
    <section id="news" className="panel scroll-mt-24 p-4">
      <p className="eyebrow">Noticias que afectan las operaciones</p>
      <h3 className="mt-1 text-lg font-semibold">Fuentes para leer antes de ejecutar</h3>
      {!provider && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-sigma-amber">No hay proveedor de noticias por simbolo configurado. Agrega FINNHUB_API_KEY en el backend. Polygon/FMP cubren otros datos en esta version; NEWS_API_KEY requiere un adaptador adicional.</p>}
      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {items.map((item) => {
          const highRisk = (scan?.macro?.breakingRisk || []).some((risk) => risk.url === item.url);
          const relevance = highRisk ? 95 : item.symbol ? 70 : 40;
          return (
            <article className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs" key={`${item.url}-${item.symbol || 'market'}`}>
              <div className="flex justify-between gap-2"><span className="font-mono text-sigma-blue">{item.symbol || 'MARKET'}</span><span className={highRisk ? 'text-sigma-red' : 'text-slate-400'}>{highRisk ? 'Riesgo alto' : 'Neutral / revisar'} | Rel. {relevance}/100</span></div>
              <p className="mt-2 font-semibold leading-5 text-slate-100">{item.headline}</p>
              <p className="mt-1 line-clamp-2 text-slate-400">{item.summary || 'Resumen no disponible por la fuente.'}</p>
              <p className="mt-2 text-slate-500">{item.source} | {dateTime(item.datetime)}</p>
              <div className="mt-2 flex gap-2">
                <a className="btn text-[11px]" href={item.url} target="_blank" rel="noreferrer">Abrir noticia</a>
                <button className="btn text-[11px]" onClick={() => navigator.clipboard?.writeText(item.url)}>Copiar link</button>
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
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(rank * 0.04, 0.2) }} className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sigma-line p-4">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-sigma-gold px-2 py-1 font-mono text-xs font-black text-slate-950">#{rank}</span>
          <div>
            <p className="font-mono text-xl font-bold">{setup.symbol}</p>
            <p className="text-xs font-semibold text-sigma-gold">{setup.strategy}</p>
            {wheelPhase && <p className="mt-1 text-[10px] font-semibold text-sigma-blue">{wheelPhase}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="eyebrow">Confidence score</p>
          <p className="font-mono text-2xl font-bold text-sigma-green">{setup.confidenceScore ?? setup.score}/100</p>
        </div>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[1.15fr_.85fr]">
        <div>
          <div className="overflow-hidden rounded-lg border border-sigma-line">
            {setup.legs.map((leg) => (
              <div className="grid grid-cols-[50px_1fr_auto] border-b border-sigma-line/70 px-3 py-2 font-mono text-xs last:border-0" key={leg.symbol}>
                <strong className={leg.side === 'SELL' ? 'text-sigma-green' : 'text-sigma-red'}>{leg.side}</strong>
                <span>{leg.strike} {leg.type}</span>
                <span className="text-slate-400">{leg.mid}</span>
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
            <TradeValue label="Bias" value={setup.institutionalBias} />
            <TradeValue label="Gamma" value={decimal(setup.gamma, 4)} />
            <TradeValue label="Vega" value={decimal(setup.vega, 3)} />
            <TradeValue label="Collateral" value={cash(setup.collateralRequired)} />
            <TradeValue label="Breakeven" value={(setup.breakevens || []).map((value) => decimal(value, 2)).join(' / ') || '--'} />
          </div>
          <div className="rounded-lg bg-sigma-soft p-3 text-slate-300">
            <p className="eyebrow mb-2">Reasoning</p>
            {setup.reasoning.join(' + ')}.
          </div>
          <p className="rounded-lg bg-emerald-500/10 p-3 text-sigma-green"><strong>TP:</strong> {setup.takeProfit}<br /><strong>Stop:</strong> {setup.stopLoss}</p>
          {execution && (
            <div className="rounded-lg border border-sigma-gold/25 bg-amber-500/10 p-3 text-slate-200">
              <p className="eyebrow text-sigma-gold">{execution.label}</p>
              <p className="mt-2 font-semibold">Cantidad inicial: {execution.contracts} contrato</p>
              <p className="mt-2">{execution.orderType}</p>
              <p className="mt-2 text-slate-400">Capacidad maxima por limites actuales: {execution.maximumContracts} contrato(s).</p>
              {execution.entryRules.map((rule) => <p className="mt-2 text-slate-300" key={rule}>- {rule}</p>)}
              <p className="mt-3 text-[11px] leading-5 text-sigma-amber">{execution.note}</p>
            </div>
          )}
          <button className="btn btn-primary w-full" onClick={() => onSimulate(setup)}>Simular esta estrategia</button>
        </div>
      </div>
    </motion.article>
  );
}

function TradeValue({ label, value }) {
  return <div className="rounded-lg border border-sigma-line bg-sigma-soft px-2.5 py-2"><p className="eyebrow">{label}</p><p className="mt-1 font-mono text-xs font-semibold text-slate-100">{value}</p></div>;
}

function TopOpportunities({ scan, onSimulate }) {
  return (
    <section id="signals" className="scroll-mt-24">
      <div className="mb-4 flex items-end justify-between">
        <div><p className="eyebrow">Motor de oportunidades</p><h2 className="mt-1 text-2xl font-bold">Mejores planes del momento</h2></div>
        <span className="status-chip">Solo aprobadas</span>
      </div>
      <div className="space-y-4">
        {scan?.opportunities?.length ? scan.opportunities.map((setup, index) => <TopSetupCard setup={setup} rank={index + 1} onSimulate={onSimulate} key={`${setup.symbol}-${setup.strategy}`} />) : (
          <Empty>Senal actual: NO TRADE. No hay estructura con strikes recomendados que haya superado todos los filtros en este momento.</Empty>
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
      <div className="panel p-4">
        <p className="eyebrow">Market breadth</p>
        <h3 className="mt-1 text-lg font-semibold">Regimen automatico</h3>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <TradeValue label="SPY trend" value={market?.spyTrend || '--'} />
          <TradeValue label="Volatility" value={market?.volatility || '--'} />
          <TradeValue label="Breadth > SMA" value={Number.isFinite(market?.breadth) ? `${market.breadth}%` : '--'} />
          <TradeValue label="VIX" value={Number.isFinite(market?.vix) ? decimal(market.vix) : '--'} />
        </div>
      </div>
      <div className="panel p-4">
        <p className="eyebrow">Sector rotation</p>
        <h3 className="mt-1 text-lg font-semibold">20 sesiones</h3>
        {market?.sectorRotation?.length ? (
          <ResponsiveContainer width="100%" height={145}>
            <BarChart data={market.sectorRotation.slice(0, 6)} margin={{ top: 15, right: 8, left: -25, bottom: 0 }}>
              <CartesianGrid stroke="#273453" vertical={false} />
              <XAxis dataKey="symbol" tick={{ fill: '#91a0bc', fontSize: 11 }} />
              <YAxis tick={{ fill: '#91a0bc', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#111a2d', border: '1px solid #273453' }} />
              <Bar dataKey="return20d">
                {market.sectorRotation.slice(0, 6).map((item) => <Cell fill={item.return20d >= 0 ? '#18bf86' : '#ef5961'} key={item.symbol} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty>Esperando historico real.</Empty>}
      </div>
      <div className="panel p-4">
        <div className="flex justify-between">
          <div><p className="eyebrow">Technical engine</p><h3 className="mt-1 text-lg font-semibold">SPY structure</h3></div>
          <button className="text-xs text-sigma-gold" onClick={() => onExplain('expectedMove')}>Explicar</button>
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
      <div className="panel p-4">
        <div className="flex items-start justify-between">
          <div><p className="eyebrow">GEX surface</p><h3 className="mt-1 text-lg font-semibold">{selected?.symbol || 'SPY'} gamma walls and pin zones</h3></div>
          <button className="text-xs text-sigma-gold" onClick={() => onExplain('gammaExposure')}>Explicar</button>
        </div>
        {profile.length ? (
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={profile} margin={{ top: 18, right: 8, left: -5, bottom: 0 }}>
              <CartesianGrid stroke="#273453" vertical={false} />
              <XAxis dataKey="strike" tick={{ fill: '#91a0bc', fontSize: 10 }} />
              <YAxis tick={{ fill: '#91a0bc', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#111a2d', border: '1px solid #273453' }} />
              <Bar dataKey="netGamma">
                {profile.map((row) => <Cell fill={row.netGamma >= 0 ? '#4f8ff7' : '#ef5961'} key={row.strike} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty>Esperando Greeks y open interest reales de una cadena.</Empty>}
        {selected && <p className="mt-2 text-[11px] text-slate-500">{selected.label}. No se presenta como posicion dealer confirmada.</p>}
      </div>
      <div className="panel p-4">
        <p className="eyebrow">Microstructure risk</p>
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
              {totals.map((item) => <div className="flex justify-between rounded bg-sigma-soft px-3 py-1.5 text-xs" key={item.symbol}><span className="font-mono">{item.symbol}</span><span className={item.risk === 'positive' ? 'text-sigma-green' : 'text-sigma-red'}>{item.risk} {decimal(item.value, 0)}</span></div>)}
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
      <div className="panel p-4">
        <p className="eyebrow">Safest spreads</p>
        <h3 className="mt-1 text-lg font-semibold">Riesgo menor aprobado</h3>
        <div className="mt-3 space-y-2">
          {safe.length ? safe.slice(0, 4).map((item) => (
            <div className="flex justify-between rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs" key={`${item.symbol}-${item.strategy}`}>
              <div><strong className="font-mono">{item.symbol}</strong><p className="text-slate-500">{item.strategy}</p></div>
              <div className="text-right"><strong className="text-sigma-green">{cash(item.maxRisk)}</strong><p className="text-slate-500">{item.score}/100</p></div>
            </div>
          )) : <Empty>Sin spreads aprobados.</Empty>}
        </div>
      </div>
      <div className="panel p-4">
        <p className="eyebrow">Top premium sellers</p>
        <h3 className="mt-1 text-lg font-semibold">Credito aprobado</h3>
        <div className="mt-3 space-y-2">
          {premium.length ? premium.slice(0, 4).map((item) => (
            <div className="flex justify-between rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs" key={`${item.symbol}-${item.strategy}`}>
              <div><strong className="font-mono">{item.symbol}</strong><p className="text-slate-500">{item.expiration}</p></div>
              <div className="text-right"><strong className="text-sigma-gold">${decimal(item.credit, 2)}</strong><p className="text-slate-500">POP {decimal(item.pop, 0)}%</p></div>
            </div>
          )) : <Empty>Sin credito que pase todos los gates.</Empty>}
        </div>
      </div>
      <div className="panel p-4">
        <p className="eyebrow">IV heatmap</p>
        <h3 className="mt-1 text-lg font-semibold">Ranking IV observado</h3>
        {diagnostics.length ? (
          <>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={diagnostics} layout="vertical" margin={{ top: 10, right: 8, left: 40, bottom: 0 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#91a0bc', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#91a0bc', fontSize: 10 }} width={75} />
                <Tooltip contentStyle={{ background: '#111a2d', border: '1px solid #273453' }} />
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
    <section id="sofi" className="panel scroll-mt-24 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-sigma-gold">Focus stock lab</p>
          <h2 className="mt-1 text-xl font-bold">SOFI Options Desk</h2>
          <p className="mt-2 text-xs leading-5 text-slate-400">SOFI se escanea automaticamente con cadena real. Por su precio, las puts garantizadas y Wheel pueden ser interesantes solo cuando encajan en tu colateral y aceptas asignacion.</p>
        </div>
        <span className={`status-chip ${approved ? 'text-sigma-green' : 'text-sigma-amber'}`}>{approved ? 'SETUP APROBADO' : 'EN OBSERVACION'}</span>
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
            <div className="rounded-lg border border-sigma-line bg-sigma-soft p-3" key={name}>
              <p className="text-sm font-semibold text-sigma-gold">{name}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{description}</p>
            </div>
          ))}
        </div>
      </div>
      {approved ? (
        <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-xs text-sigma-green">SOFI tiene un plan aprobado en la seccion de senales. Verifica precio limit y riesgo en el broker antes de actuar.</p>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-sigma-amber">SOFI no tiene senal operable ahora.</p>
          {diagnostics.length ? diagnostics.map((item) => (
            <div className="mt-2 rounded border border-amber-500/20 bg-black/10 p-2 text-xs leading-5 text-slate-300" key={item.strategy}>
              <strong className="text-sigma-red">NO OPERAR - {item.strategy}</strong>
              <p>Expira: {item.expiration} | Strikes analizados: {item.strikes} | Score: {item.score}/100</p>
              <p className="text-slate-400">Bloqueo: {item.blocks[0] || 'score menor al requerido'}.</p>
            </div>
          )) : <p className="mt-2 text-xs text-slate-400">Esperando la primera cadena procesada de SOFI.</p>}
          {Number.isFinite(stockLotCost) && Number.isFinite(collateralLimit) && stockLotCost > collateralLimit && (
            <p className="mt-3 text-xs leading-5 text-slate-300">Una asignacion de 100 acciones cerca del precio actual representa aproximadamente {cash(stockLotCost)}, por encima de tu limite de colateral de {cash(collateralLimit)}. Una CSP/Wheel solo seria admisible con un strike y capital que respeten tu mandato.</p>
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
    <section id="academy" className="panel scroll-mt-24 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Academia Valido 1M</p><h2 className="mt-1 text-xl font-bold">Aprende mientras decides</h2></div>
        <button className="btn text-xs" onClick={() => onExplain('theta')}>Explicar Theta</button>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">Un setup atractivo no es solo prima alta: busca riesgo limitado, salida clara, liquidez y una razon estadistica para entrar. Estos rangos son filtros del sistema, no garantias de ganancia.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {guide.map((item) => (
          <button className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-left transition hover:border-sigma-gold" key={item.name} onClick={() => onExplain(item.name === 'Delta corto' ? 'expectedMove' : item.name === 'Theta' ? 'theta' : item.name === 'Gamma' ? 'gammaExposure' : item.name === 'Vega' ? 'vega' : 'liquidity')}>
            <p className="eyebrow">{item.name}</p>
            <p className="mt-2 font-mono text-sm font-semibold text-sigma-gold">{item.target}</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">{item.meaning}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {lessons.map(([title, text]) => (
          <div className="rounded-lg border border-sigma-line bg-black/20 p-3" key={title}>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">{text}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <a className="btn" href="https://www.optionseducation.org/" target="_blank" rel="noreferrer">OIC: riesgos y educacion</a>
        <a className="btn" href="https://www.cboe.com/about/hours" target="_blank" rel="noreferrer">Cboe: horarios oficiales</a>
        <a className="btn" href="https://docs.tradier.com/reference/brokerage-api-markets-get-options-chains" target="_blank" rel="noreferrer">Tradier: fuente de la chain</a>
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
    <section className="panel p-4">
      <div className="mb-3"><p className="eyebrow">Smart money tracker</p><h3 className="mt-1 text-lg font-semibold">Cobertura de actividad institucional</h3></div>
      <div className="grid gap-2 md:grid-cols-4">
        {sources.map((source) => (
          <div className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs" key={source.name}>
            <div className="flex items-center justify-between gap-2">
              <strong>{source.name}</strong>
              <span className={source.connected ? 'text-sigma-green' : 'text-sigma-amber'}>{source.connected ? `${source.count} hits` : 'Unavailable'}</span>
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
      <div className="panel p-4">
        <div className="mb-3"><p className="eyebrow">Earnings danger / Macro risk</p><h3 className="mt-1 text-lg font-semibold">Eventos que pueden bloquear theta</h3></div>
        {!macro ? <Empty>Calendario no conectado.</Empty> : (
          <div className="space-y-2">
            {(macro.highImpactEvents || []).slice(0, 5).map((event) => (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs" key={`${event.title}-${event.date}`}>
                <strong className="text-sigma-red">{event.title}</strong><p className="mt-1 text-slate-400">{dateTime(event.date)} - {event.source}</p>
              </div>
            ))}
            {!macro.highImpactEvents?.length && <p className="rounded-lg bg-emerald-500/10 p-3 text-xs text-sigma-green">Sin evento macro bloqueante en la ventana configurada.</p>}
            {(macro.earnings || []).slice(0, 6).map((event) => (
              <p className="rounded-lg bg-sigma-soft px-3 py-2 text-xs" key={`${event.symbol}-${event.date}`}><strong>{event.symbol}</strong> earnings: {event.date} <span className="text-slate-500">({event.source})</span></p>
            ))}
            {(macro.breakingRisk || []).slice(0, 3).map((item) => (
              <a className="block rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs" href={item.url} target="_blank" rel="noreferrer" key={item.url}>
                <strong className="text-sigma-amber">News risk: {item.headline}</strong>
                <p className="mt-1 text-slate-400">{item.source} - {dateTime(item.datetime)}</p>
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="panel overflow-hidden">
        <div className="p-4"><p className="eyebrow">Discard engine</p><h3 className="mt-1 text-lg font-semibold">Candidatos rechazados</h3></div>
        {rejected.length ? (
          <div className="max-h-[320px] overflow-auto scrollbar">
            <table className="w-full">
              <thead><tr><th className="table-head">Ticker</th><th className="table-head">Strategy</th><th className="table-head">Score</th><th className="table-head">Razon</th></tr></thead>
              <tbody>{rejected.map((setup) => (
                <tr key={`${setup.symbol}-${setup.strategy}`}>
                  <td className="table-cell font-mono">{setup.symbol}</td>
                  <td className="table-cell">{setup.strategy}</td>
                  <td className="table-cell font-mono">{setup.score}</td>
                  <td className="table-cell max-w-[310px] whitespace-normal text-slate-400">{setup.blocks[0] || 'Score below threshold'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="px-4 pb-4"><Empty>Sin candidatos mientras faltan datos esenciales.</Empty></div>}
      </div>
    </section>
  );
}

function AlertCenter({ scan }) {
  const hasEdge = ['EDGE_READY', 'AGGRESSIVE_EDGE', 'TRADE_CANDIDATE', 'WAIT_TRIGGER', 'CAPITAL_HEAVY', 'HIGH_POP_BAD_PAYOUT'].includes(scan?.guardianEdge?.dailyBest?.classification || scan?.guardianEdge?.status);
  const alerts = (scan?.alerts || []).filter((alert) => !(hasEdge && alert.kind === 'no_trade')).slice(0, 5);
  const labelFor = (kind) => {
    if (kind === 'a_setup') return 'Nuevo spread A+ detectado';
    if (kind === 'trade_candidate') return 'Candidato Guardian detectado';
    return 'No trade real';
  };
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div><p className="eyebrow">Smart alerts</p><h3 className="mt-1 text-lg font-semibold">Centro de alertas</h3></div>
      </div>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs" key={alert.key + alert.date}>
            <p className={`font-semibold ${['a_setup', 'trade_candidate'].includes(alert.kind) ? 'text-sigma-green' : 'text-sigma-amber'}`}>{labelFor(alert.kind)}</p>
            <p className="mt-1 text-slate-300">{alert.message}</p>
            <p className="mt-1 text-slate-500">{dateTime(alert.createdAt)}</p>
          </div>
        ))}
        {!alerts.length && <Empty>Las alertas apareceran tras un escaneo real.</Empty>}
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
    <section id="risk" className={`panel scroll-mt-24 border p-4 ${killSwitch ? 'border-red-500/40' : 'border-sigma-line'}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="eyebrow">Mesa institucional de riesgo</p><h3 className="mt-1 text-lg font-semibold">Mandato de supervivencia del capital</h3></div>
        <span className={killSwitch ? 'text-xs font-bold text-sigma-red' : 'text-xs font-bold text-sigma-green'}>{killSwitch ? 'TRADING BLOCKED' : 'LIMITS ACTIVE'}</span>
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
    <section id="journal" className="panel scroll-mt-24 p-4">
      <p className="eyebrow">Trade journal</p>
      <h3 className="mt-1 text-lg font-semibold">Decision audit trail</h3>
      <form className="mt-4 grid gap-2 md:grid-cols-[105px_1fr_140px_150px_auto]" onSubmit={saveEntry}>
        <input className="input font-mono" value={draft.symbol} onChange={(event) => setDraft({ ...draft, symbol: event.target.value.toUpperCase() })} placeholder="SPY" />
        <input className="input" value={draft.strategy} onChange={(event) => setDraft({ ...draft, strategy: event.target.value })} placeholder="Strategy" />
        <select className="input" value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value })}>
          <option>OBSERVADA</option>
          <option>EJECUTADA</option>
          <option>PAPER TRADE</option>
          <option>IGNORADA</option>
          <option>CANCELADA POR RISK GOVERNOR</option>
        </select>
        <select className="input" value={draft.mentalState} onChange={(event) => setDraft({ ...draft, mentalState: event.target.value })}>
          <option>DISCIPLINADO</option><option>TRANQUILO</option><option>ANSIEDAD</option><option>FOMO</option><option>REVENGE</option><option>CANSANCIO</option>
        </select>
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Record'}</button>
        <input className="input" value={draft.plannedEntry} onChange={(event) => setDraft({ ...draft, plannedEntry: event.target.value })} placeholder="Entrada planificada" />
        <input className="input" value={draft.realEntry} onChange={(event) => setDraft({ ...draft, realEntry: event.target.value })} placeholder="Entrada real" />
        <input className="input" value={draft.plannedExit} onChange={(event) => setDraft({ ...draft, plannedExit: event.target.value })} placeholder="Salida planificada" />
        <input className="input" value={draft.realExit} onChange={(event) => setDraft({ ...draft, realExit: event.target.value })} placeholder="Salida real" />
        <input className="input" value={draft.pnl} onChange={(event) => setDraft({ ...draft, pnl: event.target.value })} placeholder="P/L USD" />
        <input className="input" value={draft.mae} onChange={(event) => setDraft({ ...draft, mae: event.target.value })} placeholder="MAE USD" />
        <input className="input" value={draft.mfe} onChange={(event) => setDraft({ ...draft, mfe: event.target.value })} placeholder="MFE USD" />
        <input className="input md:col-span-2" value={draft.error} onChange={(event) => setDraft({ ...draft, error: event.target.value })} placeholder="Error cometido" />
        <input className="input" value={draft.ruleViolated} onChange={(event) => setDraft({ ...draft, ruleViolated: event.target.value })} placeholder="Regla violada" />
        <input className="input" value={draft.ruleRespected} onChange={(event) => setDraft({ ...draft, ruleRespected: event.target.value })} placeholder="Regla respetada" />
        <input className="input md:col-span-3" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Notas de ejecucion" />
        <input className="input md:col-span-2" value={draft.lesson} onChange={(event) => setDraft({ ...draft, lesson: event.target.value })} placeholder="Leccion aprendida" />
      </form>
      <div className="mt-4 max-h-48 space-y-2 overflow-auto scrollbar">
        {entries.length ? entries.slice(0, 10).map((entry) => (
          <div className="flex flex-wrap justify-between gap-2 rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs" key={entry.id}>
            <div><strong className="font-mono">{entry.symbol}</strong> <span className="text-slate-300">{entry.strategy}</span><p className="text-slate-500">{entry.notes || entry.reason || 'No notes'}</p><p className="text-slate-500">{entry.mental_state || entry.mentalState || ''} {entry.lesson ? `| ${entry.lesson}` : ''}</p></div>
            <div className="text-right"><strong className="text-sigma-gold">{entry.outcome}</strong><p className="text-slate-500">{dateTime(entry.createdAt || entry.created_at)}</p></div>
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
    <section id="settings" className="panel scroll-mt-24 p-4">
      <p className="eyebrow">Mandato persistente</p>
      <h3 className="mt-1 text-lg font-semibold">Watchlist y control de riesgo</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">Aqui defines universo y limites de capital. VIX, IV, tendencia, gamma y eventos nunca se introducen manualmente.</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">Incluidos: SPY, SPX, QQQ, IWM, DIA, MAG7 y SOFI. Puedes agregar XSP o NDX si tu plan de datos y broker los soportan.</p>
      <label className="mt-4 block text-xs text-slate-400">Watchlist adicional</label>
      <input className="input mt-1" value={symbols} onChange={(event) => setSymbols(event.target.value)} placeholder="SPY, QQQ, NVDA" />
      <button className="btn mt-2" onClick={() => onSaveWatchlist(symbols.split(',').map((item) => item.trim()))}>Guardar watchlist</button>
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
          <label className="text-xs text-slate-400">
            Modo
            <select className="input mt-1" value={profile.riskMode || 'CONSERVADOR'} onChange={(event) => setProfile({ ...profile, riskMode: event.target.value })}>
              <option>CONSERVADOR</option><option>NORMAL</option><option>AGRESIVO EDUCATIVO</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-sigma-line bg-sigma-soft px-3 text-xs text-slate-300">
            <input type="checkbox" checked={profile.tradingPaused || false} onChange={(event) => setProfile({ ...profile, tradingPaused: event.target.checked })} />
            Kill switch
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-sigma-line bg-sigma-soft px-3 text-xs text-slate-300">
            <input type="checkbox" checked={profile.allow1DteApproval || false} onChange={(event) => setProfile({ ...profile, allow1DteApproval: event.target.checked })} />
            Habilitar aprobacion 1DTE
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-sigma-line bg-sigma-soft px-3 text-xs text-slate-300">
            <input type="checkbox" checked={profile.allow0Dte || false} onChange={(event) => setProfile({ ...profile, allow0Dte: event.target.checked })} />
            0DTE solo con confirmacion
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-sigma-line bg-sigma-soft px-3 text-xs text-slate-300">
            <input type="checkbox" checked={profile.allowEarnings || false} onChange={(event) => setProfile({ ...profile, allowEarnings: event.target.checked })} />
            Earnings educativo
          </label>
          <ProfileInput label="Perdidas consecutivas hoy" value={profile.consecutiveDailyLosses || 0} onChange={(value) => setProfile({ ...profile, consecutiveDailyLosses: value })} />
          <label className="col-span-2 text-xs text-slate-400">
            Acciones cubiertas (para Covered Call / Wheel)
            <input className="input mt-1 font-mono" value={holdings} onChange={(event) => setHoldings(event.target.value)} placeholder="AAPL:100, F:200" />
          </label>
          <label className="col-span-2 text-xs text-slate-400">
            Posiciones activas (control de correlacion)
            <input className="input mt-1 font-mono" value={activeSymbols} onChange={(event) => setActiveSymbols(event.target.value)} placeholder="SPY, QQQ" />
          </label>
          <button className="btn btn-primary col-span-2 mt-1" onClick={() => {
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
    <label className="text-xs text-slate-400">
      {label}
      <input className="input mt-1 font-mono" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Explainers({ onOpen }) {
  const terms = [['ivRank', 'IV Rank'], ['gammaExposure', 'Gamma Exposure'], ['theta', 'Theta Decay'], ['expectedMove', 'Expected Move'], ['vega', 'Vega Risk'], ['liquidity', 'Liquidity Score']];
  return (
    <section className="panel p-4">
      <p className="eyebrow">AI Explainer System</p>
      <h3 className="mt-1 text-lg font-semibold">Metricas auditables</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        {terms.map(([id, label]) => <button className="btn text-xs" onClick={() => onOpen(id)} key={id}>{label}</button>)}
      </div>
    </section>
  );
}

function Modal({ item, onClose }) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={onClose}>
      <div className="panel max-w-xl p-6" onMouseDown={(event) => event.stopPropagation()}>
        <button className="float-right text-slate-400" onClick={onClose}>X</button>
        <p className="eyebrow">Explicador institucional</p>
        <h2 className="mt-2 text-2xl font-bold">{item.title}</h2>
        <p className="mt-4 text-sm leading-6 text-slate-300">{item.simple}</p>
        <div className="mt-5 rounded-xl border border-sigma-gold/20 bg-amber-500/10 p-4">
          <p className="eyebrow text-sigma-gold">Lectura institucional</p>
          <p className="mt-2 text-sm leading-6 text-slate-200">{item.institutional}</p>
        </div>
      </div>
    </div>
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
      const newest = data.alerts?.[0];
      if (notificationEnabled && newest && newest.key !== latestAlert.current) {
        await showMobileSafeNotification({
          title: newest.kind === 'a_setup' ? 'Valido 1M: setup detectado' : 'Valido 1M: NO TRADE',
          body: newest.message,
          tag: newest.key,
          data: { url: '/institutional-os.html#signals' }
        });
      }
      latestAlert.current = newest?.key || null;
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

  if (locked) return <AccessGate error={accessError} onUnlock={unlock} />;

  return (
    <div className="min-h-screen bg-sigma-bg text-sigma-text">
      <Header scan={scan} loading={loading} onRefresh={() => load(true)} seconds={seconds} />
      <main className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 pb-20 md:px-8 md:pb-5">
        <DesktopTabs />
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-sigma-red">{error}</div>}
        <GeminiGuardianCommandCenter scan={scan} loading={loading} onRefresh={() => load(true)} onAiExplain={openAiPanel} onSimulate={simulateSetup} />
        <DecisionHero scan={scan} />
        <GuardianPanel
          scan={scan}
          onSimulate={simulateSetup}
          onPaper={paperSetupTrade}
          onRefresh={() => load(true)}
          onOpenChecklist={() => document.getElementById('paper')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          onOpenJournal={() => document.getElementById('journal')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          onAiExplain={openAiPanel}
        />
        <DailyAssistant scan={scan} />
        <DailyLearningCards scan={scan} onSimulate={simulateSetup} onPaper={paperSetupTrade} />
        <DataCollectionPanel scan={scan} />
        <DataHealthPanel scan={scan} />
        <div className="grid gap-5 xl:grid-cols-[315px_minmax(0,1fr)]">
          <aside className="order-2 space-y-4 xl:order-1">
            <ProviderCoverage scan={scan} />
            <NotificationCenter enabled={notificationEnabled} onEnabled={setNotificationEnabled} />
            <AiStatusPanel scan={scan} />
            <AlertCenter scan={scan} />
            <WatchlistAndProfile scan={scan} onSaveWatchlist={async (symbols) => { await api.saveWatchlist(symbols); load(true); }} onSaveProfile={async (profile) => { await api.saveProfile(profile); load(true); }} />
            <Explainers onOpen={setSelectedExplainer} />
          </aside>
          <div className="order-1 space-y-5 xl:order-2">
            <RiskDesk scan={scan} />
            <RiskGovernorPanel scan={scan} />
            <MarketSentiment scan={scan} />
            <TopOpportunities scan={scan} onSimulate={simulateSetup} />
            <ConditionalIdeas scan={scan} onSimulate={simulateSetup} />
            <ProSignals scan={scan} onSimulate={simulateSetup} onPaper={paperSetupTrade} onAudit={setAuditItem} onAiExplain={openAiPanel} />
            <SofiDesk scan={scan} />
            <MarketDashboard scan={scan} onExplain={setSelectedExplainer} />
            <GammaDesk scan={scan} onExplain={setSelectedExplainer} />
            <ScannerBoards scan={scan} />
            <SmartMoney scan={scan} />
            <RisksAndEvents scan={scan} />
            <NewsPanel scan={scan} />
            <OptionsStrategyLab prefillSetup={simulationSetup} profile={scan?.profile} onSaveJournal={saveSimulationJournal} onSendPaper={paperSetupTrade} />
            <PaperTradingDesk importedSetup={paperSetup} profile={scan?.profile} onSaveJournal={saveSimulationJournal} onReplay={setReplayTrade} />
            <ProDataMap scan={scan} />
            <GreeksVolatilityAcademy />
            <GexLab scan={scan} />
            <MovingAveragePlaybook scan={scan} />
            <TradingPlan scan={scan} onAiExplain={openAiPanel} />
            <StrategyLibrary onSimulate={simulateSetup} onPaper={paperSetupTrade} />
            <TapeReadingLab scan={scan} />
            <OptionsFlowLite scan={scan} />
            <AlgorithmicStrategyLab onPaper={paperSetupTrade} />
            <PracticeReplay importedTrade={replayTrade} />
            <LearningCenter scan={scan} />
            <LearningRoadmap onSimulate={simulateSetup} onPaper={paperSetupTrade} />
            <TradeJournal scan={scan} />
          </div>
        </div>
        <footer className="border-t border-sigma-line py-5 text-xs leading-5 text-slate-500">
          Valido 1M es un sistema semiautonomo de filtrado y educacion. No envia ordenes ni sustituye la confirmacion del broker o asesoramiento financiero personalizado. Las opciones pueden perder el capital comprometido. Gamma mostrado es un proxy basado en OI/Greeks de cadena real, no posicionamiento dealer confirmado.
          <span className="mt-2 block font-mono text-[11px] text-slate-600">VALIDO_BUILD_VERSION {VALIDO_BUILD_VERSION} | Build {dateTime(VALIDO_BUILD_TIMESTAMP)}</span>
        </footer>
      </main>
      <MobileQuickNav />
      <Modal item={selected} onClose={() => setSelectedExplainer(null)} />
      <SourceFormulaAudit item={auditItem} onClose={() => setAuditItem(null)} />
    </div>
  );
}
