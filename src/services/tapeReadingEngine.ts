import type { TapeReadingState } from "../types/guardian";

export interface TapeReadingInputs {
  symbol: string;
  priceChangePct?: number;
  relativeVolume?: number;
  vwapDistancePct?: number;
  volumeTrend?: "RISING" | "FALLING" | "FLAT" | "NO_DATA";
  candlePressure?: "BUYERS" | "SELLERS" | "MIXED" | "NO_DATA";
  optionCallVolume?: number;
  optionPutVolume?: number;
  optionCallOi?: number;
  optionPutOi?: number;
  darkPoolBias?: "BUYING" | "SELLING" | "MIXED" | "NO_DATA";
}

export function evaluateTapeReading(input: TapeReadingInputs): TapeReadingState {
  const signals: string[] = [];
  let score = 0;

  if ((input.relativeVolume ?? 0) >= 1.5) {
    score += 18;
    signals.push("Volumen relativo alto");
  }

  if (input.volumeTrend === "RISING") {
    score += 12;
    signals.push("Volumen acelerando");
  }

  if (input.candlePressure === "BUYERS") {
    score += 18;
    signals.push("Presion de compra en velas");
  }

  if (input.candlePressure === "SELLERS") {
    score -= 18;
    signals.push("Presion de venta en velas");
  }

  const vwapDist = input.vwapDistancePct ?? 0;
  if (vwapDist > 0.15 && vwapDist < 1.2) {
    score += 12;
    signals.push("Precio sobre VWAP sin estar demasiado extendido");
  }

  if (vwapDist < -0.15 && vwapDist > -1.2) {
    score -= 12;
    signals.push("Precio bajo VWAP con presion bajista");
  }

  const callPutRatio = safeRatio(input.optionCallVolume, input.optionPutVolume);

  if (callPutRatio != null && callPutRatio >= 1.5) {
    score += 10;
    signals.push("Flujo de calls superior a puts");
  }

  if (callPutRatio != null && callPutRatio <= 0.7) {
    score -= 10;
    signals.push("Flujo de puts superior a calls");
  }

  if (input.darkPoolBias === "BUYING") {
    score += 15;
    signals.push("Proxy institucional comprador");
  }

  if (input.darkPoolBias === "SELLING") {
    score -= 15;
    signals.push("Proxy institucional vendedor");
  }

  if (score >= 25) {
    return {
      institutionalFlow: "BUYING",
      arrow: "⬆️",
      label: "Instituciones comprando / acumulando",
      explanation: "Tape proxy alcista: volumen, VWAP y presion favorecen compras.",
      confidence: clamp(score, 0, 100),
      signals
    };
  }

  if (score <= -25) {
    return {
      institutionalFlow: "SELLING",
      arrow: "⬇️",
      label: "Instituciones vendiendo / distribuyendo",
      explanation: "Tape proxy bajista: presion de venta, bajo VWAP o flujo defensivo.",
      confidence: clamp(Math.abs(score), 0, 100),
      signals
    };
  }

  return {
    institutionalFlow: "MIXED",
    arrow: "↔️",
    label: "Flujo mixto / sin lectura limpia",
    explanation: "No hay suficiente evidencia institucional para confirmar direccion.",
    confidence: clamp(Math.abs(score), 0, 100),
    signals: signals.length ? signals : ["Sin confirmacion fuerte de tape"]
  };
}

function safeRatio(a?: number, b?: number) {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}