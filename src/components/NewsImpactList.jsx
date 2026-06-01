import { getNewsStars } from "../services/newsImpactClassifier";

export function NewsImpactList({ news = [] }) {
  const safeNews = Array.isArray(news) ? news : [];

  return (
    <section className="news-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-900">Noticias y eventos</h2>
        <span className="pill">Impacto primero</span>
      </div>

      {safeNews.length === 0 ? (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-3">
          <p className="text-sm text-green-700">No hay eventos críticos detectados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {safeNews.map(event => (
            <article key={event.id || Math.random()} className={`rounded-2xl border p-3 ${eventClass(event.color)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-slate-600">
                    {getNewsStars(event.stars)} {event.category}{event.symbol ? ` · ${event.symbol}` : ""}
                    {event.eventDate ? ` · ${formatEventDate(event.eventDate)}` : ""}
                  </p>
                  <h3 className="text-sm font-black text-slate-900 mt-1">{event.title}</h3>
                  {event.eventDate && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      {formatEventDate(event.eventDate)}{" "}
                      {isEarningsToday(event.eventDate) ? "— HOY" :
                       isEarningsTomorrow(event.eventDate) ? "— MAÑANA" :
                       isWithinDays(event.eventDate, 3) ? "— PRÓXIMO" : ""}
                    </p>
                  )}
                </div>
                {event.action && <span className="pill">{event.action.replaceAll("_", " ")}</span>}
              </div>
              {event.whyItMatters && <p className="text-xs text-slate-600 mt-2">{event.whyItMatters}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function eventClass(color) {
  if (color === "RED") return "bg-red-50 border-red-200";
  if (color === "ORANGE") return "bg-orange-50 border-orange-200";
  if (color === "YELLOW") return "bg-amber-50 border-amber-200";
  return "bg-green-50 border-green-200";
}

function formatEventDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  } catch { return dateStr; }
}

function isEarningsToday(dateStr) {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return getDateString(dateStr) === today;
}

function isEarningsTomorrow(dateStr) {
  if (!dateStr) return false;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return getDateString(dateStr) === tomorrow;
}

function isWithinDays(dateStr, days) {
  if (!dateStr) return false;
  const now = new Date();
  const eventDate = new Date(dateStr);
  if (isNaN(eventDate.getTime())) return false;
  const diffMs = eventDate.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= days * 86400000;
}

function getDateString(dateStr) {
  try { return new Date(dateStr).toISOString().slice(0, 10); }
  catch { return ""; }
}