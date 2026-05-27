import { useEffect, useState } from 'react';

const STORAGE_KEY = 'valido-practice-replay';
function load() {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export default function PracticeReplay({ importedTrade }) {
  const [records, setRecords] = useState(load);
  const [note, setNote] = useState('');
  useEffect(() => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)), [records]);
  useEffect(() => {
    if (!importedTrade) return;
    setRecords((current) => current.some((record) => record.id === importedTrade.id) ? current : [{ ...importedTrade, checkpoints: {} }, ...current]);
  }, [importedTrade]);
  function update(id, field, value) {
    setRecords((current) => current.map((record) => record.id === id ? { ...record, checkpoints: { ...record.checkpoints, [field]: value } } : record));
  }
  return (
    <section id="replay" className="panel scroll-mt-24 p-4 md:p-5">
      <p className="eyebrow text-sigma-blue">Practice & Replay</p>
      <h2 className="mt-1 text-xl font-bold">Comparar plan contra resultado</h2>
      <p className="mt-2 rounded-lg bg-amber-500/10 p-3 text-xs text-sigma-amber">Replay limitado por falta de datos historicos intradia automatizados. Registra checkpoints manuales o usa snapshots disponibles.</p>
      <textarea className="input mt-4 min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Leccion general de la sesion..." />
      <div className="mt-4 space-y-3">
        {records.length ? records.slice(0, 8).map((record) => (
          <article className="rounded-xl border border-sigma-line bg-sigma-soft p-3 text-xs" key={record.id}>
            <h3 className="font-semibold">{record.symbol} {record.strategy} <span className="text-sigma-gold">({record.sourceMode})</span></h3>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
              {['+15 min', '+30 min', '+1 hora', 'Cierre', 'Vencimiento'].map((label) => <input className="input" key={label} placeholder={label} value={record.checkpoints?.[label] || ''} onChange={(event) => update(record.id, label, event.target.value)} />)}
            </div>
            <p className="mt-2 text-slate-400">Anota spot/P-L simulado y si stop o take profit habria sido tocado.</p>
          </article>
        )) : <p className="rounded-lg border border-dashed border-sigma-line p-4 text-xs text-slate-400">Envia una practica desde Paper Trading para comenzar replay.</p>}
      </div>
    </section>
  );
}
