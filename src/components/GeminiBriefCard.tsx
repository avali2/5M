import type { GeminiGuardianReview } from "../services/geminiGuardian";

interface Props {
  mood: "RISK_ON" | "RISK_OFF" | "CHOP" | "EVENT_RISK" | "NO_DATA";
  mode: "BUSCAR_ENTRADAS" | "GESTIONAR_SALIDAS" | "ESPERAR" | "NO_TRADE";
  summary: string;
  bullets: string[];
  bestSymbols: string[];
  blockedSymbols: string[];
  education?: GeminiGuardianReview["education"];
}

export function GeminiBriefCard(props: Props) {
  const moodIcon = { RISK_ON: "🟢", RISK_OFF: "🔴", CHOP: "🟡", EVENT_RISK: "🟠", NO_DATA: "⚪" }[props.mood];

  return (
    <section className="gemini-card gemini-gradient p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400 font-bold tracking-wide">GEMINI GUARDIAN</p>
          <h2 className="text-xl font-black text-white">Brief institucional</h2>
        </div>
        <div className="pill">{moodIcon} {props.mood}</div>
      </div>

      <div className="rounded-2xl bg-slate-950/35 border border-white/10 p-3">
        <p className="text-sm text-slate-200 leading-relaxed">{props.summary}</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
          <p className="text-xs text-slate-400 font-bold mb-2">Modo actual</p>
          <p className="text-base font-black text-white">{props.mode.replaceAll("_", " ")}</p>
        </div>

        <div className="rounded-2xl bg-slate-950/30 border border-white/10 p-3">
          <p className="text-xs text-slate-400 font-bold mb-2">Estoy vigilando</p>
          <ul className="space-y-1">
            {props.bullets.slice(0, 5).map((b, i) => (
              <li key={i} className="text-sm text-slate-200">• {b}</li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 p-3">
            <p className="text-xs text-emerald-300 font-bold mb-2">Mejores simbolos</p>
            <p className="text-sm text-white font-bold">{props.bestSymbols.length ? props.bestSymbols.join(", ") : "Ninguno limpio"}</p>
          </div>
          <div className="rounded-2xl bg-red-500/10 border border-red-400/20 p-3">
            <p className="text-xs text-red-300 font-bold mb-2">Bloqueados</p>
            <p className="text-sm text-white font-bold">{props.blockedSymbols.length ? props.blockedSymbols.join(", ") : "Ninguno"}</p>
          </div>
        </div>
      </div>

      {props.education && (
        <div className="rounded-2xl bg-blue-500/10 border border-blue-400/20 p-3">
          <p className="text-xs text-blue-300 font-bold mb-1">Leccion pro</p>
          <h3 className="font-black text-white">{props.education.title}</h3>
          <p className="text-sm text-slate-200 mt-1">{props.education.lesson}</p>
          <p className="text-sm text-blue-200 mt-2">{props.education.proTip}</p>
        </div>
      )}
    </section>
  );
}