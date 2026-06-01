export type GeminiAuditInput = {
  instruction: string;
  tickets: any[];
};

export type GeminiAuditResult = {
  approve: boolean;
  finalDecision: "ENTRAR_AHORA" | "ESPERAR_CONFIRMACION" | "WATCHLIST" | "NO_TRADE";
  downgradeReason?: string;
  riskNotes: string[];
  simpleExplanation: string;
};

export async function auditTicketsWithGemini(input: GeminiAuditInput): Promise<GeminiAuditResult[]> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return input.tickets.map((ticket) => ({
      approve: false,
      finalDecision: "WATCHLIST" as const,
      downgradeReason: "Gemini no configurado. Se muestra solo auditoría cuantitativa.",
      riskNotes: ["Falta VITE_GEMINI_API_KEY."],
      simpleExplanation: `El motor encontró ${ticket.strategy} en ${ticket.symbol}, pero Gemini Guardian no está configurado.`
    }));
  }

  const prompt = `
Eres Gemini Guardian de VALIDO 1M.

Reglas:
- No inventes precios.
- No inventes strikes.
- No inventes Greeks.
- No inventes POP.
- No inventes EV.
- Solo audita tickets ya calculados por el motor.
- Si faltan datos, baja la clasificación.
- Si el riesgo no cabe en cuenta pequeña, baja la clasificación.
- Si hay riesgo de gamma/0DTE, advierte.
- Responde únicamente con JSON válido.

INPUT:
${JSON.stringify(input, null, 2)}
`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                approve: { type: "BOOLEAN" },
                finalDecision: {
                  type: "STRING",
                  enum: ["ENTRAR_AHORA", "ESPERAR_CONFIRMACION", "WATCHLIST", "NO_TRADE"]
                },
                downgradeReason: { type: "STRING" },
                riskNotes: {
                  type: "ARRAY",
                  items: { type: "STRING" }
                },
                simpleExplanation: { type: "STRING" }
              },
              required: ["approve", "finalDecision", "riskNotes", "simpleExplanation"]
            }
          }
        }
      })
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini Guardian error: ${text}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini devolvió JSON inválido.");
  }
}