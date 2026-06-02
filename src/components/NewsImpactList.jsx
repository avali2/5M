import { getNewsStars } from '../services/newsImpactClassifier';

export function NewsImpactList({ news = [] }) {
  const safeNews = Array.isArray(news) ? news : [];
  const linkedNews = safeNews.filter((event) => event.url).slice(0, 6);
  return <section className="news-card p-4 space-y-3">
    <div className="flex items-center justify-between"><h2 className="text-xl font-black text-slate-900">📰 Noticias y eventos</h2><span className="pill">Impacto primero</span></div>
    {linkedNews.length > 0 && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 space-y-2"><p className="text-sm font-black text-blue-900">🔗 Titulares relevantes con enlace</p>{linkedNews.map((event) => <a className="block text-xs font-bold text-blue-800 underline" href={event.url} target="_blank" rel="noreferrer" key={`link-${event.id}`}>{event.title} ↗</a>)}</div>}
    {safeNews.length === 0 ? <div className="rounded-2xl bg-green-50 border border-green-200 p-3 space-y-2">
      <p className="text-sm text-green-800">No hay eventos críticos detectados ni titulares enlazados en el feed actual.</p>
      <p className="text-xs font-black text-slate-800">Fuentes para revisar el mercado:</p>
      <a className="block text-xs font-bold text-blue-800 underline" href="https://www.reuters.com/markets/us/" target="_blank" rel="noreferrer">Reuters · Mercados de EE. UU. ↗</a>
      <a className="block text-xs font-bold text-blue-800 underline" href="https://finance.yahoo.com/topic/stock-market-news/" target="_blank" rel="noreferrer">Yahoo Finance · Noticias del mercado ↗</a>
      <a className="block text-xs font-bold text-blue-800 underline" href="https://www.federalreserve.gov/newsevents/calendar.htm" target="_blank" rel="noreferrer">Federal Reserve · Calendario oficial ↗</a>
    </div> : <div className="space-y-3">{safeNews.map((event) => <article key={event.id || `${event.title}-${event.eventDate || ''}`} className={`rounded-2xl border p-3 ${eventClass(event.color)}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-slate-700">{getNewsStars(event.stars)} {event.category}{event.symbol ? ` · ${event.symbol}` : ''}{event.eventDate ? ` · ${formatEventDate(event.eventDate)}` : ''}</p><h3 className="text-sm font-black text-slate-900 mt-1">{event.title}</h3>{event.url && <a className="text-xs font-black text-blue-700 underline mt-1 inline-block" href={event.url} target="_blank" rel="noreferrer">Abrir noticia ↗</a>}{event.eventDate && <p className="text-[11px] text-slate-700 mt-1">{formatEventDate(event.eventDate)} {isToday(event.eventDate) ? '— HOY' : isTomorrow(event.eventDate) ? '— MAÑANA' : isWithinDays(event.eventDate, 3) ? '— PRÓXIMO' : ''}</p>}</div>{event.action && <span className="pill">{event.action.replaceAll('_', ' ')}</span>}</div>
      {event.whyItMatters && <p className="text-xs text-slate-700 mt-2">{event.whyItMatters}</p>}
    </article>)}</div>}
  </section>;
}
function eventClass(color) { if (color === 'RED') return 'bg-red-50 border-red-200'; if (color === 'ORANGE') return 'bg-orange-50 border-orange-200'; if (color === 'YELLOW') return 'bg-amber-50 border-amber-200'; return 'bg-green-50 border-green-200'; }
function dateString(value) { try { return new Date(value).toISOString().slice(0, 10); } catch { return ''; } }
function formatEventDate(value) { try { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return value; } }
function isToday(value) { return dateString(value) === new Date().toISOString().slice(0, 10); }
function isTomorrow(value) { return dateString(value) === new Date(Date.now() + 86400000).toISOString().slice(0, 10); }
function isWithinDays(value, days) { const diff = new Date(value).getTime() - Date.now(); return Number.isFinite(diff) && diff >= 0 && diff <= days * 86400000; }
