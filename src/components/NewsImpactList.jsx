import { getNewsStars } from "../services/newsImpactClassifier";

export function NewsImpactList({ events = [] }) {
  const sorted = [...events].sort((a, b) => b.stars - a.stars).slice(0, 10);

  return (
    <section className="news-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-900">Noticias y eventos</h2>
        <span className="pill">Impacto primero</span>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-3">
          <p className="text-sm text-green-700">No hay eventos críticos detectados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(event => (
            <article key={event.id} className={`rounded-2xl border p-3 ${eventClass(event.color)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-slate-600">
                    {getNewsStars(event.stars)} {event.category}{event.symbol ? ` · ${event.symbol}` : ""}
                  </p>
                  <h3 className="text-sm font-black text-slate-900 mt-1">{event.title}</h3>
                </div>
                <span className="pill">{event.action.replaceAll("_", " ")}</span>
              </div>
              <p className="text-xs text-slate-600 mt-2">{event.whyItMatters}</p>
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