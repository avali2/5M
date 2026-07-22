import React, { useEffect, useState } from 'react';
import { Sparkles, BrainCircuit, RefreshCw, Send, ShieldCheck, Zap } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

export default function GeminiAssistant() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [customReply, setCustomReply] = useState('');
  const [customLoading, setCustomLoading] = useState(false);

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
      }
    } catch (err) {
      setCustomReply('🤖 Gemini Guardian Local: Mantén siempre riesgo definido con stop loss en 200% del crédito recibido.');
    } finally {
      setCustomLoading(false);
    }
  };

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅 Buenos días';
    if (hour < 18) return '☀️ Buenas tardes';
    return '🌙 Buenas noches';
  };

  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl shadow-xl p-5 mb-5 border border-indigo-500/30 space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2 border-b border-indigo-500/20 pb-3">
        <h3 className="font-black text-lg flex items-center gap-2 text-white">
          <BrainCircuit className="w-5 h-5 text-purple-400 animate-pulse" />
          <span>Gemini Guardian AI – Asistente Avanzado de Opciones</span>
          <InfoTooltip explanation="Gemini analiza el mercado en tiempo real, audita tus posiciones y te orienta con modelos cuantitativos de opciones." />
        </h3>
        <div className="flex items-center gap-3">
          <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400" /> Gemini API Pro Active
          </span>
          {lastUpdate && <span className="text-[10px] font-bold text-slate-400">{lastUpdate.toLocaleTimeString()}</span>}
        </div>
      </div>

      {loading && <div className="animate-pulse h-20 bg-indigo-900/30 rounded-xl"></div>}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/60 rounded-xl p-3.5 border border-indigo-500/20 space-y-2">
            <p className="text-xs font-bold text-indigo-300 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> {getTimeOfDay()} · Perspectiva Cuantitativa
            </p>
            <p className="text-xs text-slate-200 leading-relaxed">{summary.marketOverview}</p>
          </div>

          <div className="bg-amber-950/30 rounded-xl p-3.5 border border-amber-500/30 space-y-2">
            <p className="text-xs font-bold text-amber-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Consejo de Gestión de Riesgo
            </p>
            <p className="text-xs text-amber-100 leading-relaxed">{summary.tip}</p>
          </div>
        </div>
      )}

      {/* Quick Interactive Prompt Bar */}
      <div className="bg-slate-900/90 rounded-xl p-3 border border-indigo-500/20 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-slate-300">Consulta en vivo a Gemini API:</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => handleCustomAsk('¿Cómo está el mercado SPY y VIX hoy?')}
              className="bg-indigo-900/50 hover:bg-indigo-800 text-indigo-200 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-indigo-700/50 transition"
            >
              Análisis SPY
            </button>
            <button
              onClick={() => handleCustomAsk('Dame la mejor estrategia de Credit Spread para hoy.')}
              className="bg-indigo-900/50 hover:bg-indigo-800 text-indigo-200 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-indigo-700/50 transition"
            >
              Credit Spread
            </button>
            <button
              onClick={() => handleCustomAsk('¿Cómo gestionar una posición en pérdida antes de vencimiento?')}
              className="bg-indigo-900/50 hover:bg-indigo-800 text-indigo-200 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-indigo-700/50 transition"
            >
              Gestión Stop Loss
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomAsk()}
            placeholder="Escribe tu duda sobre opciones o analiza un ticker (e.g. NVDA, QQQ)..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-purple-500"
          />
          <button
            onClick={() => handleCustomAsk()}
            disabled={customLoading}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1 disabled:opacity-50"
          >
            <Send className="w-3 h-3" /> Ask
          </button>
          <button
            onClick={fetchSummary}
            title="Refrescar resumen"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg border border-slate-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {customReply && (
          <div className="mt-2 bg-purple-950/40 p-3 rounded-lg border border-purple-500/30 text-xs text-purple-100 leading-relaxed">
            <strong className="text-purple-300 block mb-1">🤖 Gemini Guardian:</strong>
            {customReply}
          </div>
        )}
      </div>
    </div>
  );
}