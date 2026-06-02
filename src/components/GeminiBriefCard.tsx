import type { GeminiGuardianReview } from "../services/geminiGuardian";

interface Props {
  mood: "RISK_ON" | "RISK_OFF" | "CHOP" | "EVENT_RISK" | "NO_DATA";
  mode: "BUSCAR_ENTRADAS" | "GESTIONAR_SALIDAS" | "ESPERAR" | "NO_TRADE";
  summary: string;
  bullets: string[];
  bestSymbols: string[];
  blockedSymbols: string[];
  education?: GeminiGuardianReview["education"];
  motivation?: string;
}

export function GeminiBriefCard(props: Props) {
  const moodIcon = { RISK_ON: "🟢", RISK_OFF: "🔴", CHOP: "🟡", EVENT_RISK: "🟠", NO_DATA: "⚪" }[props.mood];

  return (
    <section className="gemini-card gemini-gradient p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 font-bold tracking-wide">GEMINI GUARDIAN</p>
          <h2 className="text-xl font-black text-slate-900">Resumen operativo</h2>
        </div>
        <div className="pill">{moodIcon} {props.mood}</div>
      </div>

      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
        <p className="text-sm text-slate-700 leading-relaxed">{props.summary}</p>
        {props.motivation && <p className="text-sm font-bold text-violet-800 mt-2">✨ {props.motivation}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500 font-bold mb-2">Modo actual</p>
          <p className="text-base font-black text-slate-900">{props.mode.replaceAll("_", " ")}</p>
        </div>

        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500 font-bold mb-2">Estoy vigilando</p>
          <ul className="space-y-1">
            {props.bullets.slice(0, 5).map((b, i) => (
              <li key={i} className="text-sm text-slate-700">• {b}</li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-green-50 border border-green-200 p-3">
            <p className="text-xs text-green-700 font-bold mb-2">Mejores símbolos</p>
            <p className="text-sm text-green-900 font-bold">{props.bestSymbols.length ? props.bestSymbols.join(", ") : "Ninguno limpio"}</p>
          </div>
          <div className="rounded-2xl bg-red-50 border border-red-200 p-3">
            <p className="text-xs text-red-700 font-bold mb-2">Bloqueados</p>
            <p className="text-sm text-red-900 font-bold">{props.blockedSymbols.length ? props.blockedSymbols.join(", ") : "Ninguno"}</p>
          </div>
        </div>
      </div>

      {props.education && (
        <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3">
          <p className="text-xs text-blue-700 font-bold mb-1">Lección pro</p>
          <h3 className="font-black text-blue-900">{props.education.title}</h3>
          <p className="text-sm text-slate-700 mt-1">{props.education.lesson}</p>
          <p className="text-sm text-blue-600 mt-2">{props.education.proTip}</p>
        </div>
      )}
    </section>
  );
}
