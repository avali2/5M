import { useEffect, useState } from 'react';

const STORAGE_KEY = 'valido-trading-plan';
const premarket = ['Revisar SPY / QQQ / IWM y VIX', 'Calendario macro y earnings', 'Noticias y niveles clave', 'Cuenta, colateral y estado mental'];
const entry = ['Edge y score suficiente', 'Liquidez y bid/ask aceptables', 'Max risk / stop / take profit', 'Gatillo tecnico, no emocion'];
const exit = ['Take profit o stop', 'Invalidacion tecnica', 'Cambio IV / noticia inesperada', 'Cerrar antes de riesgo de expiracion'];

export default function TradingPlan({ scan, onAiExplain }) {
  const profile = scan?.profile || {};
  const [plan, setPlan] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  });
  const [checked, setChecked] = useState({});

  useEffect(() => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)), [plan]);

  function generatePlan() {
    setPlan({
      createdAt: new Date().toISOString(),
      maxTrades: 3,
      maxZeroDte: 0,
      permitted: 'Debit spreads, covered call, cash secured put y defined-risk credit spreads.',
      rule: 'No ejecutar operacion real si Risk Governor bloquea o falta cadena.',
      dailyLimit: profile.maxDailyLossPct ?? 5,
      weeklyLimit: profile.maxWeeklyLossPct ?? 8
    });
  }

  const ready = premarket.every((item) => checked[item]);
  return (
    <section id="trading-plan" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Plan de Trading Profesional</p>
      <h2 className="mt-1 text-xl font-bold">Reglas antes que impulsos</h2>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Checklist title="Premarket obligatorio" items={premarket} checked={checked} onChange={setChecked} />
        <Checklist title="Entrada" items={entry} checked={checked} onChange={setChecked} />
        <Checklist title="Salida" items={exit} checked={checked} onChange={setChecked} />
      </div>
      <div className="mt-4 rounded-xl border border-sigma-line bg-sigma-soft p-4 text-xs">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">Mi mandato local editable</h3><span className={ready ? 'text-sigma-green' : 'text-sigma-amber'}>{ready ? 'Checklist premarket listo' : 'Checklist incompleto'}</span></div>
        {plan.createdAt ? (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Max trades/dia" value={plan.maxTrades} />
            <Metric label="Max 0DTE" value={plan.maxZeroDte} />
            <Metric label="Stop diario" value={`${plan.dailyLimit}%`} />
            <Metric label="Stop semanal" value={`${plan.weeklyLimit}%`} />
            <p className="col-span-2 text-slate-300 md:col-span-4">{plan.permitted} {plan.rule}</p>
          </div>
        ) : <p className="mt-3 text-slate-400">Genera tu plan; se guarda localmente y no ejecuta ordenes.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={generatePlan}>Generar mi plan de trading</button>
          <button className="btn" onClick={onAiExplain}>Mejorar mi plan con IA</button>
        </div>
      </div>
    </section>
  );
}

function Checklist({ title, items, checked, onChange }) {
  return <div className="rounded-xl border border-sigma-line p-3"><h3 className="font-semibold">{title}</h3>{items.map((item) => <label className="mt-2 flex gap-2 text-xs text-slate-300" key={item}><input type="checkbox" checked={Boolean(checked[item])} onChange={(event) => onChange({ ...checked, [item]: event.target.checked })} />{item}</label>)}</div>;
}
function Metric({ label, value }) {
  return <div className="rounded-lg bg-sigma-bg p-2"><p className="eyebrow">{label}</p><p className="mt-1 font-mono">{value}</p></div>;
}
