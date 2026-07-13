import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function probability(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((parsed <= 1 ? parsed * 100 : parsed) * 10) / 10;
}

function tone(value) {
  if (/VALE|READY|APPROV|GREEN/i.test(String(value || ''))) return 'border-green-200 bg-green-50 text-green-800';
  if (/NO_TOMAR|BLOCK|REJECT|VETO|ERROR/i.test(String(value || ''))) return 'border-red-200 bg-red-50 text-red-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function sourceLabel(study, embedded) {
  if (study?.source === 'gemini') return 'RESPUESTA GEMINI';
  if (study) return 'FALLBACK VERIFICABLE';
  if (embedded) return 'AUDITORIA DEL CICLO';
  return 'ESPERANDO SETUP';
}

function studySignal(target = {}) {
  return {
    symbol: target.symbol,
    strategy: target.strategy,
    expiration: target.expiration,
    dte: target.dte,
    strikes: target.strikes,
    status: target.status,
    classification: target.classification,
    score: target.score ?? target.confidenceScore ?? target.tradeQualityScore,
    pop: target.pop ?? target.probabilityOfProfit ?? target.edge?.probabilityOfProfit,
    liquidityScore: target.liquidityScore,
    maxRisk: target.maxRisk ?? target.maxRiskUsd ?? target.totalMaxRisk,
    maxProfit: target.maxProfit ?? target.maxProfitUsd,
    credit: target.credit,
    debit: target.debit,
    legs: asArray(target.legs).slice(0, 4).map((leg) => ({
      side: leg.side,
      type: leg.type || leg.optionType,
      strike: leg.strike,
      bid: leg.bid,
      ask: leg.ask,
      delta: leg.delta,
      openInterest: leg.openInterest,
      volume: leg.volume
    })),
    blocks: asArray(target.blocks).slice(0, 8),
    warnings: asArray(target.warnings).slice(0, 8),
    reasons: asArray(target.reasons).slice(0, 8),
    riskGovernor: { blocks: asArray(target.riskGovernor?.blocks).slice(0, 8) }
  };
}

export function GeminiBrokerCoach({ target, environment = 'paper' }) {
  const [study, setStudy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const targetKey = useMemo(() => [target?.symbol, target?.strategy, target?.expiration, target?.strikes].join('|'), [target]);

  useEffect(() => {
    setStudy(null);
    setError('');
  }, [targetKey]);

  const embedded = target?.gemini || target?.geminiReview || target?.geminiGuardian || null;
  const targetRisks = asArray(target?.blocks).length
    ? asArray(target.blocks)
    : asArray(target?.warnings).length ? asArray(target.warnings) : asArray(target?.riskGovernor?.blocks);
  const verdict = study?.verdict || embedded?.verdict || embedded?.decision || target?.aiVerificationStatus || target?.status || target?.classification || 'ESPERANDO_SETUP';
  const probabilityPct = probability(study?.probabilityPct ?? target?.pop ?? target?.probabilityOfProfit ?? target?.edge?.probabilityOfProfit);
  const summary = study?.summary || embedded?.summary || (target
    ? targetRisks.length
      ? `${target.symbol} no debe operarse ahora: ${targetRisks[0]}.`
      : `${target.symbol} ${target.strategy || ''} espera una explicacion ampliada de Gemini.`
    : 'Gemini espera una senal verificable antes de emitir criterio.');
  const why = asArray(study?.why).length ? asArray(study.why) : asArray(target?.reasons);
  const risks = asArray(study?.risks).length
    ? asArray(study.risks)
    : targetRisks;
  const nextAction = study?.nextAction || (target
    ? environment === 'paper'
      ? 'Esperar el siguiente ciclo autonomo o pedir una auditoria detallada.'
      : 'Validar datos y preview; la orden real sigue bajo decision humana.'
    : 'Esperar una oportunidad READY_GREEN completa.');

  async function analyze() {
    if (!target?.symbol || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.symbolStudy(target.symbol, { signal: studySignal(target) });
      setStudy(result.study || null);
      if (!result.ok) setError(result.study?.summary || 'Gemini no pudo completar el estudio.');
    } catch (studyError) {
      setError(studyError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="risk-card overflow-hidden">
      <div className="border-b border-violet-100 bg-violet-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-violet-700 text-lg font-black text-white">G</span>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-950">Gemini Broker Coach</h2>
              <p className="text-xs leading-5 text-slate-600">Audita el setup, explica el riesgo y propone el siguiente paso sin inventar datos.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${tone(verdict)}`}>{verdict}</span>
            <span className="inline-flex rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-black text-violet-800">{sourceLabel(study, embedded)}</span>
          </div>
        </div>
      </div>

      <div className="p-4">
        <p className="text-sm font-bold leading-6 text-slate-800">{summary}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="border-l-2 border-violet-300 pl-3"><p className="text-[11px] font-black uppercase text-slate-500">Setup</p><p className="break-words text-sm font-black text-slate-950">{target ? `${target.symbol} | ${target.strategy || 'Sin estrategia'}` : 'Sin setup elegible'}</p></div>
          <div className="border-l-2 border-blue-300 pl-3"><p className="text-[11px] font-black uppercase text-slate-500">Probabilidad modelada</p><p className="text-lg font-black text-slate-950">{probabilityPct === null ? 'N/D' : `${probabilityPct}%`}</p></div>
          <div className="border-l-2 border-green-300 pl-3"><p className="text-[11px] font-black uppercase text-slate-500">Siguiente accion</p><p className="text-sm font-bold leading-5 text-slate-800">{nextAction}</p></div>
        </div>

        {(why.length > 0 || risks.length > 0) && (
          <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
            <div><p className="text-xs font-black uppercase text-slate-600">Por que</p><ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">{why.slice(0, 4).map((item) => <li key={item}>- {item}</li>)}</ul></div>
            <div><p className="text-xs font-black uppercase text-slate-600">Riesgos que vigila</p><ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">{risks.slice(0, 4).map((item) => <li key={item}>- {item}</li>)}</ul></div>
          </div>
        )}

        {error && <p className="mt-3 border-l-4 border-red-400 bg-red-50 p-3 text-xs font-bold text-red-800">{error}</p>}
        {study?.geminiError && <p className="mt-3 border-l-4 border-amber-400 bg-amber-50 p-3 text-xs font-bold text-amber-900">Gemini no respondio; se muestra el analisis deterministico verificable.</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="max-w-2xl text-[11px] leading-5 text-slate-500">Gemini puede explicar o vetar, pero no sustituye cotizaciones, bid/ask, riesgo maximo ni controles del servidor.</p>
          <button className="secondary-button small-action" disabled={!target?.symbol || busy} onClick={analyze} type="button">{busy ? 'Gemini analizando...' : 'Pedir criterio a Gemini'}</button>
        </div>
      </div>
    </section>
  );
}
