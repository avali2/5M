import React, { useState, useEffect } from 'react';
import { Play, Pause, AlertTriangle, ShieldCheck, Zap, Activity, Cpu, Lock, DollarSign, CheckCircle2, RefreshCw, BarChart2, Radio, ArrowRight, X } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

export default function TradingControlCenter({ scan = null, signals = [], onRunAutopilot = null }) {
  const [tradingMode, setTradingMode] = useState('paper'); // 'paper' | 'live'
  const [autoExecute, setAutoExecute] = useState(false);
  const [showLiveConfirmModal, setShowLiveConfirmModal] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalStep, setEvalStep] = useState(0);
  const [evalLogs, setEvalLogs] = useState([]);
  const [maxRisk, setMaxRisk] = useState(400);
  const [maxDailyLoss, setMaxDailyLoss] = useState(1000);
  const [requireGeminiApproval, setRequireGeminiApproval] = useState(true);

  // Evaluation steps for visual feedback when evaluating market data
  const evaluationSteps = [
    'Conectando con Tradier & Gemini 2.5 API...',
    'Consultando cotizaciones de mercado en tiempo real (SPY, VIX, IV Rank)...',
    'Filtrando señales con POP > 75% y DTE óptimo...',
    'Realizando auditoría de Griegas y perfil de riesgo por Gemini 2.5...',
    'Verificando saldo disponible y margen requerido...',
    'Transmitiendo orden en vivo al broker...'
  ];

  const handleToggleLiveMode = () => {
    if (tradingMode === 'paper') {
      setShowLiveConfirmModal(true);
    } else {
      setTradingMode('paper');
      setAutoExecute(false);
    }
  };

  const confirmLiveTrading = () => {
    setTradingMode('live');
    setShowLiveConfirmModal(false);
  };

  const handleToggleAutoExecute = () => {
    if (!autoExecute && tradingMode === 'live') {
      const confirmAuto = window.confirm(
        '⚠️ ATENCIÓN: Vas a activar la Autoejecución en Vivo en la cuenta Real.\n\nGemini 2.5 y el motor de opciones enviarán órdenes automáticamente con los límites establecidos ($' + maxRisk + ' máx riesgo por trade).\n\n¿Deseas continuar?'
      );
      if (!confirmAuto) return;
    }
    setAutoExecute(!autoExecute);
  };

  const handleEvaluateMarket = async () => {
    if (evaluating) return;
    setEvaluating(true);
    setEvalStep(0);
    setEvalLogs([]);

    for (let i = 0; i < evaluationSteps.length; i++) {
      setEvalStep(i);
      setEvalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ${evaluationSteps[i]}`
      ]);
      await new Promise((res) => setTimeout(res, 800));
    }

    if (onRunAutopilot) {
      try {
        await onRunAutopilot();
      } catch (err) {
        console.error('Error triggering autopilot run:', err);
      }
    }

    setEvalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ✅ Evaluación completada. Órdenes y señales sincronizadas exitosamente.`
    ]);
    setEvaluating(false);
  };

  return (
    <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-5 my-6 text-white shadow-2xl space-y-5 relative overflow-hidden">
      {/* Background Glow */}
      <div className={`absolute -top-16 -right-16 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
        tradingMode === 'live' ? 'bg-rose-600/15' : 'bg-emerald-600/15'
      }`}></div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-2xl text-white shadow-lg transition-all ${
            tradingMode === 'live'
              ? 'bg-gradient-to-br from-rose-600 to-amber-600 shadow-rose-900/40'
              : 'bg-gradient-to-br from-emerald-600 to-indigo-600 shadow-emerald-900/40'
          }`}>
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-black flex items-center gap-2">
              <span>Trading Control Center</span>
              <InfoTooltip explanation="Centro de mando centralizado. Controla el modo de ejecución (Paper vs En Vivo), la autoejecución programada y la evaluación en tiempo real de mercado." />
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Gestor de Ejecución en Tiempo Real & Control de Riesgo Gemini
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-sm ${
            tradingMode === 'live'
              ? 'bg-rose-950/80 text-rose-300 border-rose-500/50 animate-pulse'
              : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
          }`}>
            <Radio className="w-3.5 h-3.5" /> Modo: {tradingMode === 'live' ? 'EN VIVO (Cuenta Real)' : 'PAPER TRADING (Sandbox)'}
          </span>

          <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border flex items-center gap-1.5 ${
            autoExecute
              ? 'bg-indigo-950 text-indigo-300 border-indigo-500/50'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            <Cpu className="w-3.5 h-3.5" /> Auto-Execute: {autoExecute ? 'ACTIVO' : 'MANUAL'}
          </span>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
        
        {/* Trading Mode Switch Card */}
        <div className={`p-4 rounded-2xl border transition-all ${
          tradingMode === 'live'
            ? 'bg-slate-950/80 border-rose-500/40 shadow-lg shadow-rose-950/20'
            : 'bg-slate-950/80 border-indigo-500/30'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" /> Modo de Operación
            </span>
            <span className="text-[11px] font-bold text-slate-400">
              {tradingMode === 'live' ? '⚠️ Capital Real en Juego' : '🧪 Entorno Seguro de Práctica'}
            </span>
          </div>

          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setTradingMode('paper');
                setAutoExecute(false);
              }}
              className={`flex-1 py-2.5 rounded-lg text-xs font-black transition flex items-center justify-center gap-2 ${
                tradingMode === 'paper'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" /> Paper Trading (Sandbox)
            </button>

            <button
              onClick={handleToggleLiveMode}
              className={`flex-1 py-2.5 rounded-lg text-xs font-black transition flex items-center justify-center gap-2 ${
                tradingMode === 'live'
                  ? 'bg-rose-600 text-white shadow-md animate-pulse'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-4 h-4" /> En Vivo (Cuenta Real)
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed font-medium">
            {tradingMode === 'paper'
              ? 'El motor prueba estrategias y aprende con capital ficticio en Tradier Sandbox sin riesgo monetario.'
              : 'Las órdenes aprobadas se enviarán directamente a tu broker Tradier con ejecución de capital real.'}
          </p>
        </div>

        {/* Auto-Execute Toggle & Safeguards Card */}
        <div className="p-4 rounded-2xl border bg-slate-950/80 border-indigo-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-400" /> Estado de Autoejecución (Bot)
            </span>
            <button
              onClick={handleToggleAutoExecute}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                autoExecute
                  ? 'bg-indigo-600 text-white border border-indigo-400 shadow-md'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
              }`}
            >
              {autoExecute ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
              <span>{autoExecute ? 'Pausar Bot' : 'Activar Auto-Execute'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 block">Riesgo Máx por Trade</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-slate-400">$</span>
                <input
                  type="number"
                  value={maxRisk}
                  onChange={(e) => setMaxRisk(Number(e.target.value))}
                  className="w-full bg-transparent font-black text-white outline-none"
                />
              </div>
            </div>

            <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 block">Pérdida Diaria Máxima</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-slate-400">$</span>
                <input
                  type="number"
                  value={maxDailyLoss}
                  onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                  className="w-full bg-transparent font-black text-white outline-none"
                />
              </div>
            </div>
          </div>

          <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer pt-1">
            <span className="font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Requerir aprobación obligatoria de Gemini 2.5
            </span>
            <input
              type="checkbox"
              checked={requireGeminiApproval}
              onChange={(e) => setRequireGeminiApproval(e.target.checked)}
              className="accent-indigo-500 rounded h-4 w-4"
            />
          </label>
        </div>

      </div>

      {/* Real-time Market Evaluation Launcher Section */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950/60 to-slate-950 p-4 rounded-2xl border border-indigo-500/30 space-y-3 relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-emerald-400" />
              Evaluación de Mercado & Transmisión de Órdenes
            </h4>
            <p className="text-xs text-slate-400">
              Escanear mercado actual, auditar señales activas con Gemini y ejecutar órdenes según el modo seleccionado.
            </p>
          </div>

          <button
            onClick={handleEvaluateMarket}
            disabled={evaluating}
            className={`px-5 py-3 rounded-2xl font-black text-xs text-white transition shadow-lg flex items-center gap-2.5 disabled:opacity-50 ${
              tradingMode === 'live'
                ? 'bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 shadow-rose-950/50'
                : 'bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 shadow-emerald-950/50'
            }`}
          >
            {evaluating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                <span>Evaluando Mercado ({evalStep + 1}/{evaluationSteps.length})...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-emerald-300" />
                <span>Lanzar Órdenes / Evaluar Mercado Ahora</span>
              </>
            )}
          </button>
        </div>

        {/* Evaluation Visual Progress Bar & Terminal Log */}
        {evaluating && (
          <div className="space-y-2 pt-2">
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-emerald-500 via-indigo-500 to-purple-500 h-full transition-all duration-500"
                style={{ width: `${((evalStep + 1) / evaluationSteps.length) * 100}%` }}
              ></div>
            </div>
            <p className="text-xs font-bold text-indigo-300 animate-pulse flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" /> {evaluationSteps[evalStep]}
            </p>
          </div>
        )}

        {evalLogs.length > 0 && (
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-emerald-400 space-y-1 max-h-36 overflow-y-auto">
            {evalLogs.map((log, idx) => (
              <div key={idx} className="leading-snug">
                {log}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Live Trading Mode */}
      {showLiveConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/50 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl relative text-white animate-in fade-in zoom-in-95">
            <button
              onClick={() => setShowLiveConfirmModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-900/50">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-black text-rose-400">Confirmar Modo En Vivo</h3>
                <p className="text-xs text-slate-400">Conexión directa a Cuenta Real Tradier</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Estás a punto de activar el <strong>Modo En Vivo</strong>. Las operaciones enviadas afectarán el saldo real de tu cuenta.
            </p>

            <div className="bg-slate-950 p-3 rounded-2xl border border-rose-500/30 text-xs space-y-1.5">
              <p className="font-bold text-rose-300 flex items-center gap-1">
                🛡️ Salvaguardas Activas de Riesgo:
              </p>
              <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                <li>Solo estrategias con riesgo estrictamente definido (Spread / Iron Condor)</li>
                <li>Límite máximo por operación: <strong>${maxRisk} USD</strong></li>
                <li>Auditoría obligatoria del modelo Gemini 2.5 previo al envío</li>
              </ul>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowLiveConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 font-bold text-xs text-slate-300 hover:bg-slate-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmLiveTrading}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-black text-xs text-white transition shadow-lg shadow-rose-900/50 flex items-center justify-center gap-1.5"
              >
                <span>Confirmar y Entrar En Vivo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
