import React from 'react';
import InfoTooltip from './InfoTooltip';

export default function LearningHub() {
  const lessons = [
    { title: "¿Qué es un Bull Put Credit Spread?", content: "Vendes una put OTM y compras una put más lejana. Ganas si el precio sube o se mantiene. Riesgo definido, theta positiva." },
    { title: "Gestión de riesgo en 0DTE", content: "No arriesgues más del 0.5% de tu cuenta. Cierra antes de las 15:20 ET. Gamma risk es extremo." },
    { title: "Uso del VIX", content: "VIX > 20 favorece credit spreads (venta de prima). VIX < 15 favorece debit spreads (compra direccional)." },
    { title: "¿Por qué credit spreads primero?", content: "Son la estrategia núcleo: riesgo definido, theta positiva, alta probabilidad de éxito con gestión adecuada." },
    { title: "Take Profit y Stop Loss", content: "Credit spreads: TP al 40-60% del crédito. SL al 1.8-2.0x del crédito. No esperes expiración." }
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
      <h3 className="font-bold text-lg flex items-center text-slate-900">
        📚 Aprende opciones
        <InfoTooltip explanation="Mini lecciones para mejorar tu trading de opciones con riesgo definido" />
      </h3>
      <div className="mt-2 space-y-3">
        {lessons.map((lesson, i) => (
          <details key={i} className="bg-slate-50 p-2 rounded">
            <summary className="cursor-pointer font-medium text-slate-900 text-sm">{lesson.title}</summary>
            <p className="text-sm mt-1 text-slate-600">{lesson.content}</p>
          </details>
        ))}
        <p className="text-xs text-slate-400 mt-2">¿Quieres profundizar? <a href="https://www.optionseducation.org/" target="_blank" rel="noreferrer" className="text-blue-500">OIC →</a></p>
      </div>
    </div>
  );
}