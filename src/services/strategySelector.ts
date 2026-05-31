import type { StrategyType } from "../types/guardian";

export interface StrategySelectorInput {
  symbol: string;
  dte: number;
  trend: "BULL_TREND" | "BEAR_TREND" | "RANGE" | "NO_DATA";
  ivRank?: number | null;
  ivPercentile?: number | null;
  vix?: number | null;
  tapeFlow: "BUYING" | "SELLING" | "MIXED" | "NO_DATA";
  earningsWithinDays?: number | null;
  macroDanger?: boolean;
  pdtProtected?: boolean;
}

export interface StrategySelectorOutput {
  preferred: StrategyType[];
  blocked: StrategyType[];
  reason: string;
  dteBucket: "0DTE_PROTECTED" | "1_7DTE" | "8_21DTE" | "22_45DTE" | "45_PLUS";
}

export function selectStrategies(input: StrategySelectorInput): StrategySelectorOutput {
  const dteBucket = getDteBucket(input.dte);

  if (input.macroDanger) {
    return {
      preferred: [],
      blocked: ["BULL_PUT_SPREAD", "BEAR_CALL_SPREAD", "IRON_CONDOR", "IRON_BUTTERFLY", "CALL_DEBIT_SPREAD", "PUT_DEBIT_SPREAD"],
      reason: "Macro/evento critico activo. No abrir senales nuevas.",
      dteBucket
    };
  }

  if (input.earningsWithinDays != null && input.earningsWithinDays <= 2) {
    return {
      preferred: ["CALL_DEBIT_SPREAD", "PUT_DEBIT_SPREAD", "CALENDAR"],
      blocked: ["BULL_PUT_SPREAD", "BEAR_CALL_SPREAD", "IRON_CONDOR", "CASH_SECURED_PUT"],
      reason: "Earnings cercano: evitar vender prima normal por riesgo de gap/IV crush.",
      dteBucket
    };
  }

  if (input.dte === 0) {
    return {
      preferred:
        input.trend === "BULL_TREND" && input.tapeFlow === "BUYING"
          ? ["CALL_DEBIT_SPREAD", "BULL_PUT_SPREAD"]
          : input.trend === "BEAR_TREND" && input.tapeFlow === "SELLING"
            ? ["PUT_DEBIT_SPREAD", "BEAR_CALL_SPREAD"]
            : ["IRON_CONDOR"],
      blocked: input.pdtProtected ? ["IRON_BUTTERFLY"] : [],
      reason: "0DTE protegido: solo con liquidez, stop, salida por tiempo y control PDT.",
      dteBucket
    };
  }

  const highIv = (input.ivRank ?? 0) >= 50;
  const lowIv = (input.ivRank ?? 50) <= 20;

  if (input.trend === "BULL_TREND" && input.tapeFlow === "BUYING") {
    return {
      preferred: highIv ? ["BULL_PUT_SPREAD", "BROKEN_WING_BUTTERFLY"] : ["CALL_DEBIT_SPREAD", "DIAGONAL"],
      blocked: lowIv ? (["LOW_CREDIT_FAR_OTM"] as unknown as StrategyType[]) : [],
      reason: highIv
        ? "Tendencia alcista + IV alta: preferir credito definido."
        : "Tendencia alcista + IV baja/normal: preferir debit spread/diagonal.",
      dteBucket
    };
  }

  if (input.trend === "BEAR_TREND" && input.tapeFlow === "SELLING") {
    return {
      preferred: highIv ? ["BEAR_CALL_SPREAD", "BROKEN_WING_BUTTERFLY"] : ["PUT_DEBIT_SPREAD", "DIAGONAL"],
      blocked: lowIv ? (["LOW_CREDIT_FAR_OTM"] as unknown as StrategyType[]) : [],
      reason: highIv
        ? "Tendencia bajista + IV alta: preferir credito definido."
        : "Tendencia bajista + IV baja/normal: preferir debit spread/diagonal.",
      dteBucket
    };
  }

  if (input.trend === "RANGE") {
    return {
      preferred: highIv ? ["IRON_CONDOR", "IRON_BUTTERFLY", "BROKEN_WING_BUTTERFLY"] : ["CALENDAR"],
      blocked: [],
      reason: "Mercado lateral: preferir estrategias de rango, siempre con riesgo definido.",
      dteBucket
    };
  }

  return {
    preferred: [],
    blocked: [],
    reason: "No hay estructura clara. Watch only.",
    dteBucket
  };
}

function getDteBucket(dte: number): StrategySelectorOutput["dteBucket"] {
  if (dte === 0) return "0DTE_PROTECTED";
  if (dte <= 7) return "1_7DTE";
  if (dte <= 21) return "8_21DTE";
  if (dte <= 45) return "22_45DTE";
  return "45_PLUS";
}