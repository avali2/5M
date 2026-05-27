import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

export default function AiStatusPanel({ scan }) {
  const [status, setStatus] = useState(scan?.aiStatus || null);
  const [narrative, setNarrative] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [savingMode, setSavingMode] = useState(() => window.localStorage.getItem('valido-ai-saving-mode') !== 'false');
  const [disabledLocally, setDisabledLocally] = useState(() => window.localStorage.getItem('valido-ai-disabled') === 'true');

  useEffect(() => {
    api.aiStatus().then(setStatus).catch((requestError) => setError(requestError.message));
  }, []);
  useEffect(() => {
    if (scan?.aiStatus) setStatus(scan.aiStatus);
  }, [scan?.aiStatus]);

  async function explain() {
    if (disabledLocally) {
      setError('IA desactivada en este dispositivo. Activa el boton antes de solicitar una explicacion.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const result = await api.explainWithAi();
      setNarrative(result.narrative || 'Sin narrativa devuelta.');
      setStatus(result.status);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setWorking(false);
    }
  }

  function toggleSavings() {
    const next = !savingMode;
    setSavingMode(next);
    window.localStorage.setItem('valido-ai-saving-mode', String(next));
  }

  function toggleDisabled() {
    const next = !disabledLocally;
    setDisabledLocally(next);
    window.localStorage.setItem('valido-ai-disabled', String(next));
    setError('');
  }

  return (
    <section id="ai-status" className="panel scroll-mt-24 p-4">
      <p className="eyebrow">Estado de IA opcional</p>
      <h3 className="mt-1 text-lg font-semibold">Explicaciones solo bajo tu solicitud</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Cell label="Habilitada" value={status?.enabled ? 'Si' : 'No'} />
        <Cell label="Configurada" value={status?.configured ? 'Si' : 'No'} />
        <Cell label="Modelo" value={status?.model || 'No disponible'} />
        <Cell label="Uso hoy" value={`${status?.callsToday ?? 0} / ${status?.dailyLimit ?? '--'}`} />
        <Cell label="Ultimo uso" value={status?.lastUsedAt ? new Date(status.lastUsedAt).toLocaleString() : 'Nunca'} />
        <Cell label="Costo" value={status?.costEstimate || 'No disponible'} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">OpenAI no calcula precios, Greeks, riesgo, payoff ni score. El scanner completo funciona con IA apagada.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" onClick={explain} disabled={working || !status?.enabled || disabledLocally}>{working ? 'Consultando...' : 'Explicar mercado con IA'}</button>
        <button className="btn" onClick={toggleDisabled}>{disabledLocally ? 'Activar IA local' : 'Desactivar IA'}</button>
        <button className="btn" onClick={toggleSavings}>Modo ahorro: {savingMode ? 'Activo' : 'Inactivo'}</button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-sigma-amber">{error}</p>}
      {narrative && <p className="mt-3 rounded-lg border border-sigma-blue/30 bg-blue-500/10 p-3 text-sm leading-6 text-slate-200"><strong>Explicado por IA:</strong> {narrative}</p>}
    </section>
  );
}

function Cell({ label, value }) {
  return <div className="rounded-lg border border-sigma-line bg-sigma-soft p-2"><p className="eyebrow">{label}</p><p className="mt-1 text-xs text-slate-100">{value}</p></div>;
}
