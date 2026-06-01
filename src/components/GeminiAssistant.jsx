import React, { useEffect, useState } from 'react';
import InfoTooltip from './InfoTooltip';

export default function GeminiAssistant() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

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

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅 Buenos días';
    if (hour < 18) return '☀️ Buenas tardes';
    return '🌙 Buenas noches';
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-sm p-4 mb-4 border border-blue-200">
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg flex items-center text-slate-900">
          🤖 Gemini Guardian – Asistente de Opciones
          <InfoTooltip explanation="Gemini analiza el mercado 3 veces al día y te da consejos según tu perfil de riesgo." />
        </h3>
        {lastUpdate && <span className="text-xs text-slate-400">{lastUpdate.toLocaleTimeString()}</span>}
      </div>

      {loading && <div className="animate-pulse h-20 bg-gray-200 rounded mt-2"></div>}

      {summary && (
        <>
          <div className="mt-2">
            <p className="text-sm italic text-slate-700">
              {getTimeOfDay()}, soy Gemini Guardian. Hoy el mercado muestra:
            </p>
            <div className="bg-white/70 rounded-lg p-3 mt-2">
              <p className="text-sm text-slate-700">{summary.marketOverview}</p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-900">💡 Consejo del día:</span>
              <InfoTooltip explanation="Basado en tu riesgo y condiciones actuales. No es recomendación financiera." />
            </div>
            <p className="text-sm bg-amber-50 p-2 rounded mt-1 text-amber-800">{summary.tip}</p>
          </div>

          <button onClick={fetchSummary} className="mt-3 text-xs text-blue-600 underline">
            ↻ Pedir nuevo análisis
          </button>
        </>
      )}
    </div>
  );
}