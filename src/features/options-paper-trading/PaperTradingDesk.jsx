import { useEffect, useMemo, useState } from 'react';
import {
  calculateBreakEven,
  calculateMaxProfit,
  calculateMaxRisk,
  calculateNetGreeks,
  calculatePayoff,
  estimateEdge,
  estimateProbability,
  validateStrategy
} from '../options-simulator/calculations.js';
import { legsFromSignal, templateLegs } from '../options-simulator/templates.js';

const STORAGE_KEY = 'valido-paper-trades-v2';
const money = (value) => Number.isFinite(value) ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'No disponible';
const templates = [
  ['SPY 0DTE educativo', 'SPY', 600, 'Bull Put Credit Spread', 0],
  ['SPY 1DTE', 'SPY', 600, 'Iron Condor', 1],
  ['QQQ 1DTE', 'QQQ', 520, 'Bear Call Credit Spread', 1],
  ['NVDA weekly', 'NVDA', 130, 'Bull Call Debit Spread', 7],
  ['SOFI covered/cash secured', 'SOFI', 14, 'Cash Secured Put', 30],
  ['Iron Condor example', 'SPY', 600, 'Iron Condor', 7],
  ['Credit Spread example', 'QQQ', 520, 'Bull Put Credit Spread', 7],
  ['Debit Spread example', 'AAPL', 200, 'Bull Call Debit Spread', 14],
  ['PMCC example', 'SOFI', 14, 'PMCC', 45]
];

function loadTrades() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function PaperTradingDesk({ importedSetup, profile, onSaveJournal, onReplay }) {
  const [sourceMode, setSourceMode] = useState('manual');
  const [symbol, setSymbol] = useState('SPY');
  const [spot, setSpot] = useState(600);
  const [strategy, setStrategy] = useState('Bull Put Credit Spread');
  const [dte, setDte] = useState(7);
  const [iv, setIv] = useState('');
  const [legs, setLegs] = useState(() => templateLegs('Bull Put Credit Spread', 600));
  const [trades, setTrades] = useState(loadTrades);
  const [message, setMessage] = useState('');
  const [exitPrice, setExitPrice] = useState('');

  useEffect(() => {
    if (!importedSetup) return;
    setSymbol(importedSetup.symbol || 'SPY');
    setSpot(importedSetup.underlyingPrice || 100);
    setStrategy(importedSetup.strategy || 'Bull Put Credit Spread');
    setDte(importedSetup.dte ?? 7);
    setIv(importedSetup.iv ?? '');
    setSourceMode(importedSetup.sourceMode || (importedSetup.edge ? 'snapshot' : 'manual'));
    setLegs(importedSetup.legs?.length
      ? (importedSetup.sourceMode === 'manual'
          ? importedSetup.legs.map((leg) => ({ ...leg }))
          : legsFromSignal(importedSetup))
      : templateLegs(importedSetup.strategy, importedSetup.underlyingPrice || 100));
    setMessage('Estrategia importada. Revisa la cadena y registra un fill simulado antes de practicar.');
  }, [importedSetup]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  }, [trades]);

  const analytics = useMemo(() => {
    const input = { legs, spot: Number(spot), commissions: 2.6 };
    const maxRisk = calculateMaxRisk(input);
    const maxProfit = calculateMaxProfit(input);
    const pop = estimateProbability(legs);
    const warnings = validateStrategy({
      legs, strategy, spot: Number(spot), accountSize: profile?.accountSize || 2000,
      riskPercent: profile?.riskPct || 2, dte: Number(dte), gammaRisk: importedSetup?.gammaRisk || 'unavailable'
    });
    return {
      maxRisk,
      maxProfit,
      breakEven: calculateBreakEven(input),
      greeks: calculateNetGreeks(legs),
      pop,
      edge: estimateEdge({ maxRisk, maxProfit, probability: pop.probability, legs }),
      warnings
    };
  }, [legs, spot, strategy, dte, profile?.accountSize, profile?.riskPct, importedSetup?.gammaRisk]);

  const chainReview = useMemo(() => {
    const hasChain = legs.length > 0;
    const allQuotes = hasChain && legs.every((leg) => Number.isFinite(Number(leg.price)) || (Number.isFinite(Number(leg.bid)) && Number.isFinite(Number(leg.ask))));
    const narrow = hasChain && legs.every((leg) => {
      if (!Number.isFinite(Number(leg.bid)) || !Number.isFinite(Number(leg.ask))) return sourceMode === 'manual' || sourceMode === 'mock educativo';
      const mid = (Number(leg.bid) + Number(leg.ask)) / 2;
      return mid > 0 && (Number(leg.ask) - Number(leg.bid)) / mid <= 0.2;
    });
    const oi = legs.every((leg) => !leg.openInterest || Number(leg.openInterest) >= 100);
    return [
      ['Expiracion / DTE', Number(dte) <= 1 ? 'Peligroso' : 'Bueno', Number(dte) <= 1 ? '0DTE/1DTE exige confirmacion y menor riesgo.' : 'DTE compatible con estudio definido.'],
      ['Bid / Ask', allQuotes && narrow ? 'Bueno' : allQuotes ? 'Peligroso' : 'No disponible', 'Spread ancho implica slippage; usa limit orders.'],
      ['Volume / Open Interest', oi ? 'Aceptable' : 'Peligroso', 'OI bajo reduce calidad de fill y salida.'],
      ['IV y Vega', iv !== '' ? 'Aceptable' : 'No disponible', 'IV decide si vender o comprar prima tiene sentido.'],
      ['Greeks', analytics.pop.probability !== null ? 'Aceptable' : 'No disponible', 'Delta/Gamma/Theta ayudan a medir probabilidad y riesgo.'],
      ['Risk Governor', analytics.warnings.length ? 'Peligroso' : 'Bueno', analytics.warnings.join(' ') || 'Riesgo dentro de datos ingresados.']
    ];
  }, [legs, dte, sourceMode, iv, analytics.pop.probability, analytics.warnings]);

  function loadTemplate(template) {
    const [, nextSymbol, nextSpot, nextStrategy, nextDte] = template;
    setSourceMode('mock educativo');
    setSymbol(nextSymbol);
    setSpot(nextSpot);
    setStrategy(nextStrategy);
    setDte(nextDte);
    setIv('');
    setLegs(templateLegs(nextStrategy, nextSpot));
    setMessage('Plantilla educativa cargada: no representa precios actuales del mercado.');
  }

  function createPaperTrade() {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      sourceMode,
      symbol,
      spot: Number(spot),
      strategy,
      dte: Number(dte),
      iv: iv === '' ? null : Number(iv),
      legs,
      status: analytics.warnings.some((warning) => warning.includes('Bloqueado')) ? 'Cancelado por Risk Governor' : 'Abierto',
      maxRisk: analytics.maxRisk,
      maxProfit: analytics.maxProfit,
      breakEven: analytics.breakEven,
      pop: analytics.pop.probability,
      entryDebitCredit: legs.reduce((sum, leg) => sum + (leg.side === 'SELL' ? 1 : -1) * Number(leg.price || 0) * 100, 0),
      notes: sourceMode === 'live' ? 'Fuente marcada por usuario; verificar en broker.' : 'Practica educativa sin ejecucion real.'
    };
    setTrades((current) => [entry, ...current]);
    onReplay?.(entry);
    setMessage(entry.status === 'Abierto' ? 'Paper trade abierto. No se envio ninguna orden real.' : 'Risk Governor cancelo practica como operacion real; puedes estudiarla.');
  }

  async function closeTrade(trade) {
    if (!Number.isFinite(Number(exitPrice))) {
      setMessage('Introduce un precio subyacente de salida simulado.');
      return;
    }
    const pnl = calculatePayoff({ legs: trade.legs, underlyingPrice: Number(exitPrice), commissions: 2.6 });
    const closed = { ...trade, status: 'Cerrado', exitPrice: Number(exitPrice), pnl, closedAt: new Date().toISOString() };
    setTrades((current) => current.map((item) => item.id === trade.id ? closed : item));
    await onSaveJournal?.({
      symbol: closed.symbol,
      strategy: closed.strategy,
      outcome: 'PAPER TRADE',
      pnl: closed.pnl,
      reason: 'Paper Trading de Opciones',
      notes: `${closed.sourceMode} | salida simulada ${closed.exitPrice} | no es orden real`,
      lesson: 'Revisar plan, fill estimado y resultado.'
    });
    setMessage('Trade cerrado y guardado en Journal como simulacion.');
  }

  const closed = trades.filter((trade) => trade.status === 'Cerrado' && Number.isFinite(trade.pnl));
  const wins = closed.filter((trade) => trade.pnl > 0);
  const totalPnl = closed.reduce((sum, trade) => sum + trade.pnl, 0);
  const losses = closed.filter((trade) => trade.pnl < 0);

  return (
    <section id="paper" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Paper Trading de Opciones</p>
      <h2 className="mt-1 text-xl font-bold">Practicar con mercado cerrado</h2>
      <p className="mt-2 rounded-lg bg-blue-500/10 p-3 text-xs leading-5 text-slate-300">Paper Trading no ejecuta ordenes reales. Los fills y resultados son estimaciones educativas. Modo practica offline: los datos no son en vivo salvo que una senal indique chain server-side.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {templates.map((template) => <button className="btn text-xs" key={template[0]} onClick={() => loadTemplate(template)}>{template[0]}</button>)}
      </div>
      {message && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-sigma-amber">{message}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        <Field label="Fuente / modo"><select className="input" value={sourceMode} onChange={(event) => setSourceMode(event.target.value)}><option>manual</option><option>snapshot</option><option>delayed</option><option>mock educativo</option></select></Field>
        <Field label="Simbolo"><input className="input" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></Field>
        <Field label="Precio manual"><input className="input" type="number" step="0.01" value={spot} onChange={(event) => setSpot(Number(event.target.value))} /></Field>
        <Field label="DTE"><input className="input" type="number" value={dte} onChange={(event) => setDte(Number(event.target.value))} /></Field>
        <Field label="IV % manual"><input className="input" type="number" placeholder="No disponible" value={iv} onChange={(event) => setIv(event.target.value)} /></Field>
      </div>
      <p className="mt-3 text-xs text-slate-400">{strategy} | Edita legs detalladamente en el Simulador y usa "Enviar a Paper Trading".</p>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Metric label="Max risk" value={money(analytics.maxRisk)} />
        <Metric label="Max profit" value={money(analytics.maxProfit)} />
        <Metric label="Break-even" value={analytics.breakEven.join(' / ') || 'No disponible'} />
        <Metric label="POP est." value={analytics.pop.probability === null ? 'No disponible' : `${analytics.pop.probability}%`} />
        <Metric label="EV est." value={money(analytics.edge.expectedValue)} />
        <Metric label="Theta" value={Number.isFinite(analytics.greeks.theta) ? String(analytics.greeks.theta) : 'No disponible'} />
      </div>
      <button className="btn btn-primary mt-4" onClick={createPaperTrade}>Registrar entrada simulada</button>

      <div className="mt-6 rounded-xl border border-sigma-line p-3">
        <h3 className="font-semibold">Checklist de Cadena de Opciones</h3>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {chainReview.map(([label, state, detail]) => (
            <div className="rounded-lg bg-sigma-soft p-3 text-xs" key={label}>
              <div className="flex justify-between gap-2"><strong>{label}</strong><span className={state === 'Bueno' ? 'text-sigma-green' : state === 'Peligroso' ? 'text-sigma-red' : 'text-sigma-amber'}>{state}</span></div>
              <p className="mt-1 text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-sigma-gold">{analytics.warnings.length ? 'Cadena apta para paper, no real: revisa advertencias.' : 'Cadena apta para practicar. La aprobacion real requiere data live revalidada.'}</p>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[.72fr_1.28fr]">
        <div className="rounded-xl border border-sigma-line p-3">
          <h3 className="font-semibold">Metricas paper</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="Trades" value={String(trades.length)} />
            <Metric label="Win rate" value={closed.length ? `${Math.round((wins.length / closed.length) * 100)}%` : 'No disponible'} />
            <Metric label="P/L simulado" value={money(totalPnl)} />
            <Metric label="Avg loss" value={losses.length ? money(losses.reduce((sum, trade) => sum + trade.pnl, 0) / losses.length) : 'No disponible'} />
          </div>
        </div>
        <div className="rounded-xl border border-sigma-line p-3">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Operaciones paper</h3><input className="input max-w-44" type="number" step="0.01" placeholder="Spot salida" value={exitPrice} onChange={(event) => setExitPrice(event.target.value)} /></div>
          <div className="mt-3 max-h-56 space-y-2 overflow-auto">
            {trades.length ? trades.map((trade) => (
              <div className="rounded-lg bg-sigma-soft p-3 text-xs" key={trade.id}>
                <div className="flex flex-wrap justify-between gap-2"><strong>{trade.symbol} {trade.strategy}</strong><span className="text-sigma-gold">{trade.status} | {trade.sourceMode}</span></div>
                <p className="mt-1 text-slate-400">Entrada spot {trade.spot} | Riesgo {money(trade.maxRisk)} | P/L {money(trade.pnl)}</p>
                {trade.status === 'Abierto' && <button className="btn mt-2 text-xs" onClick={() => closeTrade(trade)}>Cerrar con spot simulado</button>}
              </div>
            )) : <p className="text-xs text-slate-400">Aun no hay paper trades.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }) {
  return <label className="text-xs text-slate-400">{label}{children}</label>;
}

function Metric({ label, value }) {
  return <div className="rounded-lg bg-sigma-soft p-2"><p className="eyebrow">{label}</p><p className="mt-1 font-mono text-xs text-slate-100">{value}</p></div>;
}
