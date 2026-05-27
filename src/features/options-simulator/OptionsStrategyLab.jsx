import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  buildPayoffChart,
  calculateBreakEven,
  calculateMaxProfit,
  calculateMaxRisk,
  calculateNetGreeks,
  estimateProbability,
  simulateScenario,
  validateStrategy
} from './calculations.js';
import { legsFromSignal, STRATEGIES, templateLegs } from './templates.js';

const money = (value) => value === Infinity ? 'Ilimitado' : Number.isFinite(value) ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'No disponible';
const digits = (value, size = 2) => Number.isFinite(value) ? Number(value).toFixed(size) : 'No disponible';
const nextMonth = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const explanations = {
  risk: 'Perdida maxima estimada del payoff al vencimiento. En credit spreads: ancho menos credito, multiplicado por 100.',
  profit: 'Beneficio maximo contractual al vencimiento para estructuras limitadas. Long calls pueden tener ganancia no limitada.',
  breakeven: 'Precio al vencimiento donde el payoff neto cruza cero, incluyendo primas y comisiones.',
  greeks: 'Delta mide direccion; Gamma acelera delta; Theta estima decay temporal; Vega sensibilidad a IV.',
  pop: 'Estimacion basada en delta de strikes cortos cuando existe. No es una probabilidad garantizada.',
  chart: 'La linea de vencimiento es payoff contractual. Hoy e IV +/-10 usan una aproximacion local por Greeks.'
};

export default function OptionsStrategyLab({ prefillSetup, profile, onSaveJournal }) {
  const [symbol, setSymbol] = useState('SPY');
  const [spot, setSpot] = useState(100);
  const [strategy, setStrategy] = useState('Bull Put Credit Spread');
  const [expiration, setExpiration] = useState(nextMonth());
  const [dte, setDte] = useState(30);
  const [iv, setIv] = useState('');
  const [atr, setAtr] = useState(2);
  const [commissions, setCommissions] = useState(2.6);
  const [accountSize, setAccountSize] = useState(profile?.accountSize || 2000);
  const [riskPercent, setRiskPercent] = useState(profile?.riskPct || 2);
  const [gammaRisk, setGammaRisk] = useState('unavailable');
  const [legs, setLegs] = useState(() => templateLegs('Bull Put Credit Spread', 100));
  const [help, setHelp] = useState('chart');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (!profile) return;
    setAccountSize(profile.accountSize);
    setRiskPercent(profile.riskPct);
  }, [profile?.accountSize, profile?.riskPct]);

  useEffect(() => {
    if (!prefillSetup) return;
    setSymbol(prefillSetup.symbol);
    setSpot(prefillSetup.underlyingPrice || 100);
    setStrategy(prefillSetup.strategy);
    setExpiration(prefillSetup.expiration);
    setDte(prefillSetup.dte || 30);
    setIv(prefillSetup.iv ?? '');
    setAtr(prefillSetup.technicals?.atr14 || prefillSetup.expectedMove || 2);
    setGammaRisk(prefillSetup.gammaRisk || 'unavailable');
    setLegs(legsFromSignal(prefillSetup));
    setSaved('');
  }, [prefillSetup]);

  function loadTemplate(value) {
    setStrategy(value);
    setLegs(templateLegs(value, Number(spot)));
    setSaved('');
  }

  function updateLeg(index, field, value) {
    setLegs((current) => current.map((leg, position) => position === index
      ? { ...leg, [field]: ['side', 'type'].includes(field) ? value : value === '' ? '' : Number(value) }
      : leg));
  }

  const analytics = useMemo(() => {
    const input = { legs, spot: Number(spot), commissions: Number(commissions) };
    return {
      maxRisk: calculateMaxRisk(input),
      maxProfit: calculateMaxProfit(input),
      breakEvens: calculateBreakEven(input),
      greeks: calculateNetGreeks(legs),
      pop: estimateProbability(legs),
      chart: buildPayoffChart({ ...input, dte: Number(dte) }),
      scenarios: simulateScenario({ ...input, atr: Number(atr), dte: Number(dte) }),
      warnings: validateStrategy({ legs, strategy, spot: Number(spot), accountSize: Number(accountSize), riskPercent: Number(riskPercent), dte: Number(dte), gammaRisk })
    };
  }, [legs, spot, commissions, atr, dte, strategy, accountSize, riskPercent, gammaRisk]);

  async function saveSimulation() {
    if (!onSaveJournal) return;
    await onSaveJournal({
      symbol,
      strategy,
      outcome: 'PAPER TRADE',
      reason: 'Simulacion del Options Strategy Lab',
      confidence: prefillSetup?.confidenceScore || 0,
      notes: `Paper simulation | Exp ${expiration} | Max risk ${money(analytics.maxRisk)} | Max profit ${money(analytics.maxProfit)} | BE ${analytics.breakEvens.join(' / ') || 'N/A'} | IV ${iv || 'No disponible'}`
    });
    setSaved('Simulacion registrada como paper trade en el journal.');
  }

  return (
    <section id="lab" className="panel scroll-mt-24 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-sigma-blue">Options Strategy Lab</p>
          <h2 className="mt-1 text-xl font-bold">Simulador de Estrategias</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">Construye o carga una senal del scanner antes de actuar. Estos resultados son estimaciones basadas en datos disponibles, IV, Greeks y supuestos del modelo; no prometen ganancias.</p>
        </div>
        <button className="btn" onClick={saveSimulation}>Guardar como paper trade</button>
      </div>
      {saved && <p className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-xs text-sigma-green">{saved}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Field label="Simbolo"><input className="input" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></Field>
        <Field label="Precio actual"><input className="input" type="number" step="0.01" value={spot} onChange={(event) => setSpot(Number(event.target.value))} /></Field>
        <Field label="Estrategia"><select className="input" value={strategy} onChange={(event) => loadTemplate(event.target.value)}>{STRATEGIES.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Expiracion"><input className="input" type="date" value={expiration} onChange={(event) => setExpiration(event.target.value)} /></Field>
        <Field label="DTE"><input className="input" type="number" value={dte} onChange={(event) => setDte(Number(event.target.value))} /></Field>
        <Field label="IV %"><input className="input" type="number" value={iv} placeholder="No disponible" onChange={(event) => setIv(event.target.value)} /></Field>
        <Field label="ATR"><input className="input" type="number" step="0.01" value={atr} onChange={(event) => setAtr(Number(event.target.value))} /></Field>
        <Field label="Comisiones USD"><input className="input" type="number" step="0.01" value={commissions} onChange={(event) => setCommissions(Number(event.target.value))} /></Field>
        <Field label="Cuenta USD"><input className="input" type="number" value={accountSize} onChange={(event) => setAccountSize(Number(event.target.value))} /></Field>
        <Field label="Riesgo max %"><input className="input" type="number" value={riskPercent} onChange={(event) => setRiskPercent(Number(event.target.value))} /></Field>
      </div>
      <div className="mt-4 space-y-2">
        {legs.map((leg, index) => (
          <div className="grid gap-2 rounded-lg border border-sigma-line bg-sigma-soft p-3 sm:grid-cols-4 lg:grid-cols-10" key={`${index}-${leg.type}`}>
            <select className="input" value={leg.side} onChange={(event) => updateLeg(index, 'side', event.target.value)}><option>BUY</option><option>SELL</option></select>
            <select className="input" value={leg.type} onChange={(event) => updateLeg(index, 'type', event.target.value)}><option>CALL</option><option>PUT</option><option>STOCK</option></select>
            <SmallInput label="Strike" field="strike" leg={leg} onChange={(value) => updateLeg(index, 'strike', value)} />
            <SmallInput label="Precio/mid" field="price" leg={leg} onChange={(value) => updateLeg(index, 'price', value)} />
            <SmallInput label="Qty" field="quantity" leg={leg} onChange={(value) => updateLeg(index, 'quantity', value)} />
            <SmallInput label="Delta" field="delta" leg={leg} onChange={(value) => updateLeg(index, 'delta', value)} />
            <SmallInput label="Gamma" field="gamma" leg={leg} onChange={(value) => updateLeg(index, 'gamma', value)} />
            <SmallInput label="Theta" field="theta" leg={leg} onChange={(value) => updateLeg(index, 'theta', value)} />
            <SmallInput label="Vega" field="vega" leg={leg} onChange={(value) => updateLeg(index, 'vega', value)} />
            <button className="btn text-xs" onClick={() => setLegs((current) => current.filter((_, position) => position !== index))}>Quitar</button>
            <div className="grid gap-2 sm:col-span-4 sm:grid-cols-4 lg:col-span-10">
              <SmallInput label="Bid" field="bid" leg={leg} onChange={(value) => updateLeg(index, 'bid', value)} />
              <SmallInput label="Ask" field="ask" leg={leg} onChange={(value) => updateLeg(index, 'ask', value)} />
              <SmallInput label="Volume" field="volume" leg={leg} onChange={(value) => updateLeg(index, 'volume', value)} />
              <SmallInput label="Open interest" field="openInterest" leg={leg} onChange={(value) => updateLeg(index, 'openInterest', value)} />
            </div>
          </div>
        ))}
        <button className="btn" onClick={() => setLegs((current) => [...current, templateLegs('Long Call', Number(spot))[0]])}>Agregar leg</button>
      </div>
      {!!analytics.warnings.length && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-sigma-amber">
          {analytics.warnings.map((warning) => <p className="mt-1" key={warning}>{warning}</p>)}
        </div>
      )}
      <div className="mt-5 grid gap-4 xl:grid-cols-[.82fr_1.18fr]">
        <div>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Riesgo max." value={money(analytics.maxRisk)} onClick={() => setHelp('risk')} />
            <Metric label="Ganancia max." value={money(analytics.maxProfit)} onClick={() => setHelp('profit')} />
            <Metric label="Break-even" value={analytics.breakEvens.join(' / ') || 'No disponible'} onClick={() => setHelp('breakeven')} />
            <Metric label="POP estimada" value={analytics.pop.probability === null ? 'No disponible' : `${analytics.pop.probability}%`} onClick={() => setHelp('pop')} />
            <Metric label="Delta neta" value={digits(analytics.greeks.delta, 3)} onClick={() => setHelp('greeks')} />
            <Metric label="Gamma neta" value={digits(analytics.greeks.gamma, 5)} onClick={() => setHelp('greeks')} />
            <Metric label="Theta neta" value={digits(analytics.greeks.theta, 3)} onClick={() => setHelp('greeks')} />
            <Metric label="Vega neta" value={digits(analytics.greeks.vega, 3)} onClick={() => setHelp('greeks')} />
          </div>
          <p className="mt-3 rounded-lg border border-sigma-blue/20 bg-blue-500/10 p-3 text-xs leading-5 text-slate-300">{explanations[help]} {help === 'pop' ? analytics.pop.method : ''}</p>
        </div>
        <div className="rounded-xl border border-sigma-line bg-sigma-soft p-3">
          <button className="mb-2 text-xs font-semibold text-sigma-gold" onClick={() => setHelp('chart')}>Payoff y sensibilidad: Como se calcula?</button>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={analytics.chart}>
              <CartesianGrid stroke="#273453" vertical={false} />
              <XAxis dataKey="price" tick={{ fill: '#91a0bc', fontSize: 10 }} />
              <YAxis tick={{ fill: '#91a0bc', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#111a2d', border: '1px solid #273453' }} />
              <Legend />
              <Line type="monotone" dataKey="expiration" name="P/L vencimiento" stroke="#18bf86" dot={false} />
              <Line type="monotone" dataKey="estimatedToday" name="P/L hoy est." stroke="#4f8ff7" dot={false} />
              <Line type="monotone" dataKey="ivUp10" name="IV +10 est." stroke="#f4aa32" dot={false} />
              <Line type="monotone" dataKey="ivDown10" name="IV -10 est." stroke="#ef5961" dot={false} />
              <Line type="monotone" dataKey="theta1d" name="Theta +1d est." stroke="#a78bfa" strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="theta3d" name="Theta +3d est." stroke="#c084fc" strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="theta7d" name="Theta +7d est." stroke="#e879f9" strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-sigma-line">
        <p className="bg-sigma-soft p-3 text-sm font-semibold">Simulacion por escenarios</p>
        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {analytics.scenarios.map((scenario) => (
            <div className="rounded-lg bg-sigma-soft p-3 text-xs" key={scenario.label}>
              <p className="text-slate-400">{scenario.label}</p>
              <p className={`mt-1 font-mono font-semibold ${scenario.value >= 0 ? 'text-sigma-green' : 'text-sigma-red'}`}>{money(scenario.value)}</p>
              <p className="mt-1 text-[10px] text-slate-500">{scenario.assumption}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }) {
  return <label className="text-xs text-slate-400">{label}{children}</label>;
}

function SmallInput({ label, field, leg, onChange }) {
  return <label className="text-[10px] text-slate-500">{label}<input className="input mt-1 font-mono text-xs" type="number" step="0.001" value={leg[field] ?? ''} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Metric({ label, value, onClick }) {
  return (
    <button className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-left" onClick={onClick}>
      <p className="eyebrow">{label}</p><p className="mt-1 font-mono text-xs font-semibold text-slate-100">{value}</p><p className="mt-1 text-[10px] text-sigma-gold">Como se calcula?</p>
    </button>
  );
}
