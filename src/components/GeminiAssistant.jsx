import React, { useEffect, useState } from 'react';
import { Sparkles, BrainCircuit, RefreshCw, Send, ShieldCheck, Zap, Volume2, VolumeX, Bot, ArrowRight } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

export default function GeminiAssistant({ scan = null, signals = [] }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [customReply, setCustomReply] = useState('');
  const [customLoading, setCustomLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/gemini/daily-summary');
      const data = await res.json();
      setSummary(data);
      setLastUpdate(new Date());
      localStorage.setItem('lastGeminiSummary', JSON.stringify(data));
    } catch (err) {
      console.error('Error fetching Gemini summary:', err);
      const cached = localStorage.getItem('lastGeminiSummary');
      if (cached) setSummary(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 8 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCustomAsk = async (question) => {
    const q = question || customPrompt;
    if (!q.trim() || customLoading) return;
    setCustomLoading(true);
    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q })
      });
      const data = await res.json();
      if (data.ok && data.reply) {
        setCustomReply(data.reply);
      } else {
        setCustomReply('🤖 Gemini Guardian: Mantiene siempre el control del riesgo definido. Evalúa el POP, IV Rank y asegura tu Stop Loss antes de entrar.');
      }
    } catch (err) {
      setCustomReply('🤖 Gemini Guardian Local: Mantén siempre riesgo definido con stop loss en 200% del crédito recibido.');
    } finally {
      setCustomLoading(false);
    }
  };

  const toggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    } else {
      const textToSpeak = customReply || summary?.marketOverview || 'Gemini Guardian está listo para ayudarte con tus estrategias de opciones.';
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'es-ES';
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setSpeaking(true);
    }
  };

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅 Buenos días';
    if (hour < 18) return '☀️ Buenas tardes';
    return '🌙 Buenas noches';
  };

  return (
    <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white rounded-3xl shadow-2xl p-5 mb-6 border border-purple-500/30 space-y-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-purple-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 border-b border-indigo-500/20 pb-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/40">
            <Bot className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="font-black text-lg flex items-center gap-2 text-white">
              <span>Gemini AI Personal Broker & Guardian</span>
              <InfoTooltip explanation="Gemini lidera el análisis cuantitativo en tiempo real, audita tus operaciones y genera recomendaciones de opciones personalizadas." />
            </h3>
            <p className="text-xs text-purple-300 font-semibold">Inteligencia Artificial de Nivel Institucional</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSpeech}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              speaking
                ? 'bg-purple-600 text-white border-purple-400 animate-pulse'
                : 'bg-slate-900/80 hover:bg-slate-800 text-purple-300 border-purple-500/30'
            }`}
            title="Escuchar audio resumen de Gemini"
          >
            {speaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>{speaking ? 'Detener Voz' : 'Audio Broker'}</span>
          </button>

          <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Gemini Pro Active
          </span>
          {lastUpdate && <span className="text-[10px] font-mono text-slate-400">{lastUpdate.toLocaleTimeString()}</span>}
        </div>
      </div>

      {loading && <div className="animate-pulse h-20 bg-indigo-900/30 rounded-2xl"></div>}

      {/* Primary Gemini Insights */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
          <div className="bg-slate-900/80 rounded-2xl p-4 border border-indigo-500/20 space-y-2">
            <p className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" /> {getTimeOfDay()} · Diagnóstico de Mercado
            </p>
            <p className="text-xs text-slate-200 leading-relaxed font-medium">{summary.marketOverview}</p>
          </div>

          <div className="bg-purple-950/30 rounded-2xl p-4 border border-purple-500/30 space-y-2">
            <p className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Gestión de Riesgo por Gemini
            </p>
            <p className="text-xs text-purple-100 leading-relaxed font-medium">{summary.tip}</p>
          </div>
        </div>
      )}

      {/* Interactive Quick Prompts */}
      <div className="bg-slate-950/80 rounded-2xl p-3.5 border border-indigo-500/20 space-y-2.5 relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold text-slate-300 flex items-center gap-1">
            <BrainCircuit className="w-3.5 h-3.5 text-purple-400" /> Consultar en vivo a tu Broker Gemini:
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => handleCustomAsk('¿Cuál es la mejor estrategia de opciones para el entorno actual del mercado?')}
              className="bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-indigo-700/50 transition"
            >
              🎯 Mejor Estrategia
            </button>
            <button
              onClick={() => handleCustomAsk('¿Cómo está el SPY, VIX y la Volatilidad Implícita hoy?')}
              className="bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-indigo-700/50 transition"
            >
              📊 SPY & VIX
            </button>
            <button
              onClick={() => handleCustomAsk('Compara Iron Condor vs Bull Put Spread en términos de riesgo/beneficio.')}
              className="bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-indigo-700/50 transition"
            >
              ⚖️ Iron Condor vs Put Spread
            </button>
            <button
              onClick={() => handleCustomAsk('¿Cuándo debo cerrar o hacer roll a un Credit Spread en pérdida?')}
              className="bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-indigo-700/50 transition"
            >
              🛡️ Reglas de Stop Loss
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomAsk()}
            placeholder="Pregunta a tu Personal Broker AI sobre tickers, opciones, griegas o estrategias..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
          />
          <button
            onClick={() => handleCustomAsk()}
            disabled={customLoading}
            className="bg-purple-600 hover:bg-purple-500 text-white font-black text-xs px-4 py-2 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-purple-900/50"
          >
            <Send className="w-3.5 h-3.5" /> {customLoading ? 'Consultando...' : 'Preguntar'}
          </button>
          <button
            onClick={fetchSummary}
            title="Refrescar recomendación de Gemini"
            className="bg-slate-900 hover:bg-slate-800 text-slate-300 p-2 rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {customReply && (
          <div className="mt-3 bg-gradient-to-r from-purple-950/60 to-slate-900 p-3.5 rounded-2xl border border-purple-500/40 text-xs text-purple-100 leading-relaxed shadow-lg">
            <div className="flex items-center justify-between mb-1.5">
              <strong className="text-purple-300 text-xs font-black flex items-center gap-1">
                🤖 Gemini Personal Broker:
              </strong>
              <button
                onClick={toggleSpeech}
                className="text-[10px] font-bold text-purple-300 hover:text-white flex items-center gap-1"
              >
                <Volume2 className="w-3 h-3 text-amber-400" /> Escuchar
              </button>
            </div>
            {customReply}
          </div>
        )}
      </div>
    </div>
  );
}
