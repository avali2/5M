import React, { useEffect, useState } from 'react';

export function DailyGeminiLesson() {
  const [lesson, setLesson] = useState(null);

  useEffect(() => {
    const day = new Date().toISOString().slice(0, 10);
    const key = `valido-daily-lesson-${day}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (cached) setLesson(cached);
    } catch { /* Fetch the current lesson below. */ }
    fetch('/api/gemini/daily-lesson')
      .then((response) => response.json())
      .then((data) => { setLesson(data); localStorage.setItem(key, JSON.stringify(data)); })
      .catch(() => {});
  }, []);

  if (!lesson) return null;
  return (
    <section className="gemini-card gemini-gradient p-4 space-y-2">
      <p className="eyebrow">🎓 Microlección Gemini del día</p>
      <h2 className="text-lg font-black text-slate-900">{lesson.title}</h2>
      <p className="text-sm text-slate-700">{lesson.concept}</p>
      <div className="rounded-xl border border-violet-200 bg-white p-3 text-sm">{lesson.example}</div>
      {(lesson.checklist || []).map((item) => <p className="text-xs text-slate-700" key={item}>✓ {item}</p>)}
      <p className="text-[11px] text-slate-500">{lesson.caution} · Fuente: {lesson.source}</p>
    </section>
  );
}
