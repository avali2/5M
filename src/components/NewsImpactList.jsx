import { getNewsStars } from "../services/newsImpactClassifier";

export function NewsImpactList({ events = [] }) {
  const sorted = [...events].sort((a, b) => b.stars - a.stars).slice(0, 10);

  return (
    <section className="news-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">Noticias y eventos</h2>
        <span className="pill">Impacto primero</span>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 p-3">
          <p className="text-sm text-emerald-200">No hay eventos criticos detectados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(event => (
            <article key={event.id} className={`rounded-2xl border p-3 ${eventClass(event.color)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-slate-300">
                    {getNewsStars(event.stars)} {event.category}{event.symbol ? ` · ${event.symbol}` : ""}
                  </p>
                  <h3 className="text-sm font-black text-white mt-1">{event.title}</h3>
                </div>
                <span className="pill">{event.action.replaceAll("_", " ")}</span>
              </div>
              <p className="text-xs text-slate-300 mt-2">{event.whyItMatters}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function eventClass(color) {
  if (color === "RED") return "bg-red-500/10 border-red-400/25";
  if (color === "ORANGE") return "bg-orange-500/10 border-orange-400/25";
  if (color === "YELLOW") return "bg-yellow-500/10 border-yellow-400/25";
  return "bg-emerald-500/10 border-emerald-400/20";
}