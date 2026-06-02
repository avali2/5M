import React, { useEffect, useState } from 'react';

export function DailyTradingWorkflow() {
  const [lesson, setLesson] = useState(null);
  useEffect(() => {
    fetch('/api/gemini/daily-lesson').then((response) => response.json()).then(setLesson).catch(() => {});
  }, []);
  if (!lesson) return null;
  return <section className="gemini-card gemini-gradient p-4 space-y-2">
    <p className="eyebrow">🎯 Proceso educativo diario</p>
    <h2 className="text-lg font-black">Cómo preparar una operación de opciones</h2>
    <p className="text-sm text-slate-800">{lesson.motivation}</p>
    <ol className="space-y-2">{(lesson.workflow || []).map((step, index) => <li className="rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900" key={step}><strong>{index + 1}.</strong> {step}</li>)}</ol>
    <p className="text-[11px] text-slate-700">Ejemplo educativo del día · Fuente: {lesson.source}</p>
  </section>;
}
