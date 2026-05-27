import { useMemo, useState } from 'react';

const greekCards = [
  ['Delta', 'Cuanto cambia la opcion por $1 del subyacente.', 'En spreads define direccion y aproxima probabilidad; en 0DTE cambia rapido.'],
  ['Gamma', 'Cuanto cambia Delta por $1.', 'Gamma alto cerca del vencimiento puede convertir un income trade en perdida rapidamente.'],
  ['Theta', 'Decay temporal aproximado por dia.', 'Ayuda a quien vende prima, pero no compensa un gap o gamma adversa.'],
  ['Vega', 'Sensibilidad a un punto de IV.', 'Venta de prima sufre si IV expande; compradores sufren en vol crush.'],
  ['Rho', 'Sensibilidad a tasas.', 'Suele ser secundario en DTE corto; mas relevante en LEAPS/PMCC.'],
  ['Vanna / Charm', 'Greeks de segundo orden.', 'Explican ajustes por IV/tiempo; requieren modelos y datos mas ricos.']
];

export default function GreeksVolatilityAcademy() {
  const [delta, setDelta] = useState(0.3);
  const [gamma, setGamma] = useState(0.04);
  const [theta, setTheta] = useState(-0.05);
  const [vega, setVega] = useState(0.08);
  const [move, setMove] = useState(1);
  const estimate = useMemo(() => ({
    priceMove: (delta * move + 0.5 * gamma * move * move).toFixed(3),
    nextDelta: (delta + gamma * move).toFixed(3),
    dayDecay: theta.toFixed(3),
    ivTen: (vega * 10).toFixed(3)
  }), [delta, gamma, theta, vega, move]);
  return (
    <section id="greeks" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Greeks & Volatility Academy</p>
      <h2 className="mt-1 text-xl font-bold">Entender sensibilidad antes de arriesgar capital</h2>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {greekCards.map(([title, simple, advanced]) => (
          <article className="rounded-lg border border-sigma-line bg-sigma-soft p-3 text-xs" key={title}>
            <h3 className="font-bold text-sigma-gold">{title}</h3><p className="mt-2">{simple}</p><p className="mt-2 text-slate-400">{advanced}</p>
          </article>
        ))}
      </div>
      <div className="mt-5 rounded-xl border border-sigma-line p-4">
        <h3 className="font-semibold">Mini simulador de Greeks (educativo)</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          {[['Delta', delta, setDelta], ['Gamma', gamma, setGamma], ['Theta/dia', theta, setTheta], ['Vega', vega, setVega], ['Movimiento $', move, setMove]].map(([label, value, setter]) => (
            <label className="text-xs text-slate-400" key={label}>{label}<input className="input" type="number" step="0.01" value={value} onChange={(event) => setter(Number(event.target.value))} /></label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Value label="Cambio opcion est." value={`$${estimate.priceMove}`} />
          <Value label="Delta nuevo est." value={estimate.nextDelta} />
          <Value label="Pasa 1 dia" value={`$${estimate.dayDecay}`} />
          <Value label="IV +10 pts" value={`$${estimate.ivTen}`} />
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Aproximacion local con Greeks constantes; no sustituye valoracion ni contempla cambios simultaneos del mercado.</p>
      </div>
    </section>
  );
}

function Value({ label, value }) {
  return <div className="rounded-lg bg-sigma-soft p-2 text-xs"><p className="eyebrow">{label}</p><p className="mt-1 font-mono">{value}</p></div>;
}
