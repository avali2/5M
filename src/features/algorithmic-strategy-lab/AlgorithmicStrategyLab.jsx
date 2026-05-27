import { useEffect, useState } from 'react';

const STORAGE_KEY = 'valido-algo-playbooks';
const defaults = [
  ['Bull Put Spread 1DTE con VWAP', 'Trend bullish + VWAP hold + IV moderada/alta', 'Rechazo bajo VWAP o perdida soporte', 'TP 50% credito'],
  ['Bear Call Spread 1DTE resistencia', 'Trend bearish + rechazo resistencia', 'Recupera VWAP', 'TP 50% credito'],
  ['Iron Condor 1DTE rango inicial', 'Rango confirmado + gamma positivo', 'Ruptura rango/VIX expande', 'TP 40% credito'],
  ['Debit Spread momentum continuation', 'Momentum y volumen relativo', 'Pierde breakout', 'TP por target'],
  ['VWAP Reclaim Call Debit Spread', 'Reclaim VWAP con volumen', 'Pierde VWAP', 'TP planificado'],
  ['VWAP Rejection Put Debit Spread', 'Rechazo VWAP', 'Recupera VWAP', 'TP planificado'],
  ['Opening Range Breakout definido', 'Ruptura ORB confirmada', 'Regresa al rango', 'Trailing tecnico'],
  ['Mean Reversion Iron Fly educativo', 'Pin y rango', 'Gamma adversa', 'Solo paper'],
  ['PMCC Study Mode', 'Horizonte largo', 'IV/riesgo acciones', 'Gestion call corta'],
  ['Cash Secured Put Income Mode', 'Dispuesto a asignacion', 'Gap/evento', 'TP prima'],
  ['Earnings Vol Crush Study Mode', 'Solo estudio IV', 'Gap', 'Solo paper'],
  ['Trend Pullback Credit Spread', 'Pullback a soporte', 'Soporte pierde', 'TP 50%'],
  ['High IV Rank Credit Spread', 'IV Rank alto y liquido', 'IV/gap', 'TP 50%'],
  ['Low IV Debit Spread', 'IV baja y catalizador', 'Theta', 'TP target'],
  ['Market Open No-Trade Filter', 'Primer rango sin confirmar', 'Esperar gatillo', 'No trade real']
];

function initialRules() {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') || defaults.map((rule) => ({ rule, enabled: true })); } catch { return defaults.map((rule) => ({ rule, enabled: true })); }
}

export default function AlgorithmicStrategyLab({ onPaper }) {
  const [rules, setRules] = useState(initialRules);
  useEffect(() => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules)), [rules]);
  return (
    <section id="algo-lab" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Algorithmic Strategy Lab</p>
      <h2 className="mt-1 text-xl font-bold">Playbooks sistematicos en paper mode</h2>
      <p className="mt-2 text-xs text-slate-400">Estas reglas ayudan a estudiar consistencia. No ejecutan ordenes ni sustituyen datos live/validacion de riesgo.</p>
      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {rules.map(({ rule, enabled }, index) => (
          <article className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs" key={rule[0]}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-sigma-gold">{rule[0]}</h3>
              <label className="flex gap-1 text-slate-300"><input type="checkbox" checked={enabled} onChange={(event) => setRules((current) => current.map((entry, place) => place === index ? { ...entry, enabled: event.target.checked } : entry))} /> Activo</label>
            </div>
            <p className="mt-2"><strong>Condicion:</strong> {rule[1]}</p>
            <p className="mt-1 text-slate-400"><strong>Invalidacion:</strong> {rule[2]} | <strong>Salida:</strong> {rule[3]}</p>
            <button className="btn mt-3 text-xs" disabled={!enabled} onClick={() => onPaper?.({ strategy: rule[0], symbol: 'SPY', underlyingPrice: 100, dte: 1, sourceMode: 'mock educativo' })}>Probar en paper</button>
          </article>
        ))}
      </div>
    </section>
  );
}
