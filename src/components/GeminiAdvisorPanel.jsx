import React, { useState, useEffect } from 'react';
import { Sparkles, BrainCircuit, ShieldAlert, CheckCircle2, AlertTriangle, XCircle, TrendingUp, Cpu, Volume2, VolumeX, RefreshCw, ChevronRight, Zap, Target, Gauge, ArrowUpRight } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

export default function GeminiAdvisorPanel({ signals = [], scan = null, onSelectSignal = null }) {
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [modelSource, setModelSource] = useState('Gemini 2.5');

  // Auto-select first READY signal when list loads
  useEffect(() => {
    if (signals && signals.length > 0 && !selectedSignal) {
      const readySig = signals.find((s) => s.status === 'READY' || s.status === '0DTE_SCALP') || signals[0];
      setSelectedSignal(readySig);
    }
  }, [signals]);

  // Request real-time analysis whenever selectedSignal changes
  useEffect(() => {
    if (!selectedSignal) return;

    let isMounted = true;
    setLoading(true);

    const fetchAnalysis = async () => {
      try {
        const res = await fetch('/api/gemini/analyze-signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signal: selectedSignal,
            marketContext: {
              vix: scan?.results?.find((r) => r.symbol === 'VIX')?.quote?.price || '20',
              spyTrend: scan?.results?.find((r) => r.symbol === 'SPY')?.technicals?.trend || 'Alcista',
              timestamp: new Date().toISOString()
            }
          })
        });

        const data = await res.json();
        if (isMounted) {
          if (data.ok && data.analysis) {
            setAnalysis(data.analysis);
            setModelSource(data.source === 'gemini_2_5' ? 'Gemini 2.5 Engine' : 'Local Guardian');
          }
        }
      } catch (err) {
        console.error('Advisor analysis error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAnalysis();

    return () => {
      isMounted = false;
    };
  }, [selectedSignal]);

  const toggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    } else {
      const textToSpeak = analysis
        ? `Gemini 2.5 Recomienda: ${analysis.recommendation}. ${analysis.executiveSummary}. Puntos de riesgo: ${analysis.riskBreakdown?.join('. ')}`
        : 'Analizando riesgo con modelo Gemini 2.5...';
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'es-ES';
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setSpeaking(true);
    }
  };

  const getRecommendationBadge = (rec) => {
    switch (rec?.toUpperCase()) {
      case 'EJECUTAR':
        return (
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> EJECUTAR (Aprobado)
          </span>
        );
      case 'ESPERAR':
        return (
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/50 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> ESPERAR (Monitorear)
          </span>
        );
      case 'RECHAZAR':
        return (
          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/50 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
            <XCircle className="w-4 h-4 text-rose-400" /> RECHAZAR (Alto Riesgo)
          </span>
        );
      default:
        return (
          <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-indigo-400 animate-spin" /> Evaluando...
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-5 my-6 text-white shadow-2xl space-y-5 relative overflow-hidden">
      {/* Decorative Gradient Overlay */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-600/10 via-purple-600/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>

      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white shadow-lg shadow-purple-900/30">
            <BrainCircuit className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-black flex items-center gap-2">
              <span>Gemini 2.5 Real-Time Trading Advisor</span>
              <InfoTooltip explanation="Asistente cuantitativo basado en Gemini 2.5 que audita cada señal, evalúa la exposición de griegas, calcula reglas de salida y explica el riesgo institucional." />
            </h3>
            <p className="text-xs text-indigo-300 font-medium">
              Explicación Cuantitativa de Riesgo & Validación de Señales en Vivo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSpeech}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              speaking
                ? 'bg-purple-600 text-white border-purple-400 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-purple-500/30'
            }`}
            title="Escuchar audio resumen con voz"
          >
            {speaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
            <span>{speaking ? 'Silenciar' : 'Escuchar Asesor'}</span>
          </button>

          <span className="bg-indigo-950 text-indigo-300 border border-indigo-700/50 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400" /> {modelSource}
          </span>
        </div>
      </div>

      {/* Signal Selector Ribbon */}
      <div className="space-y-2 relative z-10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-indigo-400" /> Selecciona una Señal para Auditoría Gemini:
          </span>
          <span className="text-[11px] font-mono text-slate-400">{signals.length} señales activas</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {signals.map((sig) => {
            const isSelected = selectedSignal?.id === sig.id || selectedSignal?.symbol === sig.symbol;
            return (
              <button
                key={sig.id || sig.symbol + Math.random()}
                onClick={() => {
                  setSelectedSignal(sig);
                  if (onSelectSignal) onSelectSignal(sig);
                }}
                className={`shrink-0 px-3.5 py-2 rounded-2xl border text-xs font-bold transition flex items-center gap-2.5 ${
                  isSelected
                    ? 'bg-gradient-to-r from-indigo-900 to-slate-800 border-indigo-500 text-white shadow-lg'
                    : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <span className="font-black text-sm text-indigo-300">{sig.symbol}</span>
                <span className="text-[10px] font-semibold text-slate-300">{sig.strategyLabel || sig.strategy}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                  sig.status === 'READY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {sig.status || 'READY'}
                </span>
              </button>
            );
          })}

          {signals.length === 0 && (
            <p className="text-xs text-slate-500 italic py-2">Sin señales activas en el escaner actual.</p>
          )}
        </div>
      </div>

      {/* Analysis Output Body */}
      {selectedSignal && (
        <div className="space-y-5 relative z-10">
          
          {/* Signal Snapshot & Recommendation Header */}
          <div className="bg-slate-950/80 rounded-2xl p-4 border border-indigo-500/20 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-white">{selectedSignal.symbol}</span>
                <span className="bg-slate-800 text-indigo-300 text-xs px-2.5 py-0.5 rounded-lg border border-slate-700 font-bold">
                  {selectedSignal.strategyLabel || selectedSignal.strategy}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                POP Est.: <strong className="text-emerald-400">{selectedSignal.pop ? Math.round(selectedSignal.pop * 100) : '80'}%</strong> · DTE: <strong className="text-indigo-300">{selectedSignal.dte || 7} días</strong> · Max Risk: <strong className="text-rose-400">${selectedSignal.maxRiskUsd || selectedSignal.maxRisk || 400}</strong>
              </p>
            </div>

            <div className="flex items-center gap-3">
              {loading ? (
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Analizando con Gemini 2.5...
                </div>
              ) : (
                analysis && (
                  <div className="flex flex-col items-end gap-1">
                    {getRecommendationBadge(analysis.recommendation)}
                    <span className="text-[10px] font-bold text-slate-400">
                      Confianza Gemini: <strong className="text-indigo-300">{analysis.confidenceScore || 90}%</strong>
                    </span>
                  </div>
                )
              )}
            </div>
          </div>

          {!loading && analysis && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Executive Summary & Market Alignment */}
              <div className="md:col-span-2 bg-slate-800/50 rounded-2xl p-4 border border-slate-700/70 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                  <h4 className="text-xs font-black uppercase text-indigo-300 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-400" /> {analysis.verdictTitle || 'Veredicto Ejecutivo Gemini 2.5'}
                  </h4>
                  <span className="bg-purple-950 text-purple-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-700/40">
                    {analysis.riskRating || 'Riesgo Definido'}
                  </span>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed font-medium">
                  {analysis.executiveSummary}
                </p>

                {analysis.marketAlignment && (
                  <div className="bg-indigo-950/40 border border-indigo-700/30 p-2.5 rounded-xl text-xs text-indigo-200 space-y-1">
                    <strong className="text-[11px] font-bold text-indigo-300 block">Alineación con Régimen de Mercado:</strong>
                    <span>{analysis.marketAlignment}</span>
                  </div>
                )}
              </div>

              {/* Actionable Exit Rules */}
              <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/70 space-y-3">
                <h4 className="text-xs font-black uppercase text-emerald-400 flex items-center gap-1.5 border-b border-slate-700/60 pb-2">
                  <Gauge className="w-4 h-4 text-emerald-400" /> Reglas de Salida Obligatorias
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="bg-slate-900/80 p-2 rounded-xl border border-emerald-500/30">
                    <span className="text-[10px] font-black uppercase text-emerald-400 block">Take Profit</span>
                    <span className="text-slate-200 font-bold">{analysis.exitRules?.takeProfit || '50% del crédito capturado'}</span>
                  </div>

                  <div className="bg-slate-900/80 p-2 rounded-xl border border-rose-500/30">
                    <span className="text-[10px] font-black uppercase text-rose-400 block">Stop Loss Estricto</span>
                    <span className="text-slate-200 font-bold">{analysis.exitRules?.stopLoss || '200% del crédito recibido'}</span>
                  </div>

                  <div className="bg-slate-900/80 p-2 rounded-xl border border-indigo-500/30">
                    <span className="text-[10px] font-black uppercase text-indigo-300 block">Horizonte Temporal</span>
                    <span className="text-slate-200 font-bold">{analysis.exitRules?.maxDays || 'Cerrar a 21 DTE o 2 días pre-vencimiento'}</span>
                  </div>
                </div>
              </div>

              {/* Professional Risk Breakdown Points */}
              <div className="md:col-span-2 bg-slate-800/50 rounded-2xl p-4 border border-slate-700/70 space-y-3">
                <h4 className="text-xs font-black uppercase text-amber-300 flex items-center gap-1.5 border-b border-slate-700/60 pb-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" /> Desglose Profesional de Riesgos
                </h4>

                <ul className="space-y-2 text-xs text-slate-300">
                  {analysis.riskBreakdown?.map((riskPoint, idx) => (
                    <li key={idx} className="flex items-start gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-amber-400 font-black shrink-0">#{idx + 1}</span>
                      <span className="leading-snug">{riskPoint}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Greeks Exposure Card */}
              <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/70 space-y-3">
                <h4 className="text-xs font-black uppercase text-indigo-300 flex items-center gap-1.5 border-b border-slate-700/60 pb-2">
                  <TrendingUp className="w-4 h-4 text-indigo-400" /> Exposición a Griegas
                </h4>

                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between items-center bg-slate-900/60 p-2 rounded-xl">
                    <span className="font-bold text-slate-400">Δ Delta:</span>
                    <span className="text-indigo-200 font-mono font-bold">{analysis.greeksAnalysis?.delta || 'Neutral'}</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-900/60 p-2 rounded-xl">
                    <span className="font-bold text-slate-400">Θ Theta:</span>
                    <span className="text-emerald-400 font-mono font-bold">{analysis.greeksAnalysis?.theta || 'Positivo (Decay)'}</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-900/60 p-2 rounded-xl">
                    <span className="font-bold text-slate-400">ν Vega:</span>
                    <span className="text-purple-300 font-mono font-bold">{analysis.greeksAnalysis?.vega || 'Sensibilidad Implícita'}</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-900/60 p-2 rounded-xl">
                    <span className="font-bold text-slate-400">γ Gamma:</span>
                    <span className="text-amber-300 font-mono font-bold">{analysis.greeksAnalysis?.gamma || 'Controlado > 5 DTE'}</span>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      )}
    </div>
  );
}
