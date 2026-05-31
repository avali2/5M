import type { OptionSignal, ClassifiedNewsEvent, MarketPulse } from "../types/guardian";

export interface GeminiGuardianReview {
  decision: "APPROVE" | "REJECT" | "WATCH_ONLY" | "NEEDS_MORE_DATA";
  confidence: number;
  summary: string;
  checklist: string[];
  mainRisk: string;
  whatWouldInvalidate: string;
  userAction: string;
  education: {
    title: string;
    lesson: string;
    proTip: string;
  };
}

export function buildGeminiSignalPrompt(input: {
  candidate: Partial<OptionSignal>;
  marketPulse: MarketPulse;
  criticalNews: ClassifiedNewsEvent[];
  accountValue: number;
}) {
  return `
Eres Gemini Guardian de VALIDO 1M.
Actuas como auditor institucional de senales de opciones.

Tu trabajo:
- Revisar la senal antes de que llegue al usuario.
- Confirmar si hay edge real.
- Rechazar senales incompletas.
- Proteger la cuenta.
- Explicar de forma clara y profesional.
- Dar una mini leccion educativa de opciones al final.

Reglas duras:
- No prometas ganancias.
- No inventes datos.
- No apruebes si no hay riesgo maximo.
- No apruebes si no hay plan de salida.
- No apruebes si no hay liquidez.
- No apruebes naked options.
- 0DTE solo si hay timing, liquidez, stop y salida por tiempo.
- Si hay earnings hoy en el simbolo, bloquear venta de prima.
- Si hay noticia critic, bloquear o reducir tamano.
- Si falta dato importante, responde NEEDS_MORE_DATA.
- Si el precio esta extendido de VWAP, responde WATCH_ONLY o REJECT con NO CHASE.

Contexto de cuenta:
${JSON.stringify({ accountValue: input.accountValue }, null, 2)}

Market Pulse:
${JSON.stringify(input.marketPulse, null, 2)}

Noticias criticas:
${JSON.stringify(input.criticalNews, null, 2)}

Candidato:
${JSON.stringify(input.candidate, null, 2)}

Devuelve SOLO JSON valido con esta estructura:
{
  "decision": "APPROVE | REJECT | WATCH_ONLY | NEEDS_MORE_DATA",
  "confidence": 0,
  "summary": "string",
  "checklist": ["string"],
  "mainRisk": "string",
  "whatWouldInvalidate": "string",
  "userAction": "string",
  "education": {
    "title": "string",
    "lesson": "string",
    "proTip": "string"
  }
}
`;
}

export function fallbackGeminiReview(reason: string): GeminiGuardianReview {
  return {
    decision: "NEEDS_MORE_DATA",
    confidence: 0,
    summary: "Gemini no pudo validar la senal con datos suficientes.",
    checklist: ["Validar datos de mercado", "Validar liquidez", "Validar riesgo maximo", "Validar salida"],
    mainRisk: reason,
    whatWouldInvalidate: "Falta de datos reales o riesgo no cuantificado.",
    userAction: "No tomar la operacion hasta tener confirmacion.",
    education: {
      title: "Regla institucional",
      lesson: "Una senal incompleta no es una senal; es una hipotesis.",
      proTip: "En opciones, primero se controla el riesgo maximo y despues se piensa en ganancia."
    }
  };
}