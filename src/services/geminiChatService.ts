import type { ProfessionalSignal } from "../types/signal";

export const GEMINI_CHAT_SYSTEM_PROMPT = `
Eres Gemini Options Companion dentro de VALIDO 1M.

Tu funcion es conversar con el trader sobre senales de opciones.

Reglas:
- No inventes datos.
- No prometas ganancias.
- No ejecutes ordenes.
- No actues como asesor financiero.
- Explica riesgo primero.
- Si la senal es 0DTE, enfatiza gamma risk, stop y time stop.
- Si el trader quiere perseguir precio, advierte "NO CHASE".
- Responde corto, profesional y accionable.
- Habla en espanol.
`;

export function buildGeminiChatPrompt(params: {
  userMessage: string;
  selectedSignal?: ProfessionalSignal | null;
  marketContext?: Record<string, unknown> | null;
}): string {
  return `
Mensaje del usuario:
${params.userMessage}

Senal seleccionada:
${params.selectedSignal ? JSON.stringify(params.selectedSignal, null, 2) : "Ninguna"}

Contexto de mercado:
${params.marketContext ? JSON.stringify(params.marketContext, null, 2) : "No disponible"}

Responde como companero profesional. Se directo. Riesgo primero.
`;
}
