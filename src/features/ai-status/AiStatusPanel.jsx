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

  async function testGemini() {
    if (disabledLocally) {
      setError('IA desactivada en este dispositivo. Activa el boton antes de probar Gemini.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const result = await api.testGemini();
      setNarrative(result.narrative || 'Gemini no devolvio narrativa. Se mantiene fallback deterministico.');
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
        <Cell label="Proveedor" value={status?.activeProvider || status?.primaryProvider || 'deterministic'} />
        <Cell label="Gemini" value={status?.gemini?.configured ? 'Configurado' : 'No configurado'} />
        <Cell label="OpenAI" value={status?.openai?.enabled ? 'Manual activo' : 'Manual apagado'} />
        <Cell label="Uso hoy" value={`${status?.budget?.requestsUsed ?? 0} req / ${status?.budget?.dailyRequestBudget ?? '--'}`} />
        <Cell label="Tokens" value={`${status?.budget?.tokensUsed ?? 0} / ${status?.budget?.dailyTokenBudget ?? '--'}`} />
        <Cell label="Cooldown" value={Object.values(status?.budget?.cooldowns || {}).filter(Boolean)[0] || 'No'} />
        <Cell label="Costo" value={status?.costEstimate || 'No disponible'} />
        <Cell label="Modo" value={status?.manualOnly ? 'Manual only' : 'Revisar'} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">Gemini/OpenAI no calculan precios, Greeks, riesgo, payoff, strikes, POP ni score. Si la IA falla o llega a 429, el tutor deterministico sigue explicando y el scanner no se bloquea.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" onClick={explain} disabled={working || disabledLocally}>{working ? 'Consultando...' : 'Explicar mercado con IA'}</button>
        <button className="btn" onClick={testGemini} disabled={working || disabledLocally}>{working ? 'Probando...' : 'Probar Gemini'}</button>
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
