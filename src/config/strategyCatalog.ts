export type StrategyCategory =
  | "CREDIT" | "DEBIT" | "INCOME" | "PROTECTION" | "VOLATILITY"
  | "DIRECTIONAL" | "CALENDAR" | "DIAGONAL" | "SYNTHETIC" | "EDUCATIONAL";

export type StrategyPermission =
  | "REAL_SIGNAL" | "WATCHLIST_ONLY" | "PAPER_ONLY" | "EDUCATIONAL_ONLY" | "BLOCKED_UNDEFINED_RISK";

export type StrategyBias =
  | "BULLISH" | "BEARISH" | "NEUTRAL" | "VOLATILITY_EXPANSION" | "VOLATILITY_CRUSH" | "PROTECTION";

export type StrategyDefinition = {
  id: string;
  label: string;
  aliases: string[];
  category: StrategyCategory;
  bias: StrategyBias;
  priority: number;
  permission: StrategyPermission;
  riskType: "DEFINED_RISK" | "CASH_SECURED" | "COVERED" | "ASSIGNMENT_RISK" | "UNDEFINED_RISK";
  preferredIvRegime: "LOW" | "NORMAL" | "HIGH" | "ANY";
  preferredMarketRegime: "TRENDING" | "RANGE" | "BREAKOUT" | "REVERSAL" | "ANY";
  realSignalAllowed: boolean;
  notes: string;
};

export const STRATEGY_CATALOG: StrategyDefinition[] = [
  {
    id: "BULL_PUT_CREDIT_SPREAD", label: "Put Spread Alcista / Bull Put Credit Spread",
    aliases: ["Put Spread Alcista", "Bull Put Spread", "Credit Put Spread"],
    category: "CREDIT", bias: "BULLISH", priority: 100,
    permission: "REAL_SIGNAL", riskType: "DEFINED_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "TRENDING",
    realSignalAllowed: true,
    notes: "Estrategia núcleo. Vender put OTM y comprar put más abajo. Theta positiva, riesgo definido."
  },
  {
    id: "BEAR_CALL_CREDIT_SPREAD", label: "Call Spread Bajista / Bear Call Credit Spread",
    aliases: ["Call Spread Bajista", "Bear Call Spread", "Credit Call Spread"],
    category: "CREDIT", bias: "BEARISH", priority: 98,
    permission: "REAL_SIGNAL", riskType: "DEFINED_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "TRENDING",
    realSignalAllowed: true,
    notes: "Estrategia núcleo bajista/neutral. Vender call OTM y comprar call más arriba."
  },
  {
    id: "IRON_CONDOR", label: "Iron Condor",
    aliases: ["Iron Condor"], category: "CREDIT", bias: "NEUTRAL", priority: 94,
    permission: "REAL_SIGNAL", riskType: "DEFINED_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "RANGE",
    realSignalAllowed: true,
    notes: "Combina bull put credit spread + bear call credit spread. Ideal en rango y IV alta."
  },
  {
    id: "IRON_BUTTERFLY", label: "Iron Butterfly",
    aliases: ["Iron Butterfly"], category: "CREDIT", bias: "NEUTRAL", priority: 92,
    permission: "REAL_SIGNAL", riskType: "DEFINED_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "RANGE",
    realSignalAllowed: true,
    notes: "Crédito alto, pero gamma risk mayor. Requiere control estricto."
  },
  {
    id: "BROKEN_WING_CONDOR", label: "Broken Wing Condor",
    aliases: ["Broken Wing Condor"], category: "CREDIT", bias: "NEUTRAL", priority: 90,
    permission: "REAL_SIGNAL", riskType: "DEFINED_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "RANGE",
    realSignalAllowed: true,
    notes: "Estructura asimétrica con riesgo definido."
  },
  {
    id: "BROKEN_WING_BUTTERFLY", label: "Broken Wing Butterfly",
    aliases: ["Broken Wing Butterfly", "BWB"], category: "CREDIT", bias: "NEUTRAL", priority: 88,
    permission: "REAL_SIGNAL", riskType: "DEFINED_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "RANGE",
    realSignalAllowed: true,
    notes: "Útil para capturar prima con sesgo direccional limitado."
  },
  {
    id: "CASH_SECURED_PUT", label: "Put Corta Cash Secured",
    aliases: ["Cash Secured Put", "CSP", "Put Corta Cubierta por Cash"],
    category: "INCOME", bias: "BULLISH", priority: 86,
    permission: "REAL_SIGNAL", riskType: "CASH_SECURED",
    preferredIvRegime: "HIGH", preferredMarketRegime: "ANY",
    realSignalAllowed: true,
    notes: "Solo si se acepta comprar 100 acciones al strike."
  },
  {
    id: "COVERED_CALL", label: "Call Cubierta",
    aliases: ["Covered Call", "Buy Write", "Call Cubierta"],
    category: "INCOME", bias: "NEUTRAL", priority: 84,
    permission: "REAL_SIGNAL", riskType: "COVERED",
    preferredIvRegime: "HIGH", preferredMarketRegime: "RANGE",
    realSignalAllowed: true,
    notes: "Solo si existen 100 acciones o posición equivalente."
  },
  {
    id: "WHEEL", label: "Wheel",
    aliases: ["Rueda", "The Wheel"], category: "INCOME", bias: "BULLISH", priority: 82,
    permission: "REAL_SIGNAL", riskType: "ASSIGNMENT_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "ANY",
    realSignalAllowed: true,
    notes: "Secuencia CSP → assignment → covered call."
  },
  {
    id: "COLLAR", label: "Collar",
    aliases: ["Collar", "Protective Collar"], category: "PROTECTION", bias: "PROTECTION", priority: 78,
    permission: "REAL_SIGNAL", riskType: "DEFINED_RISK",
    preferredIvRegime: "ANY", preferredMarketRegime: "ANY",
    realSignalAllowed: true,
    notes: "Protección de acciones con put comprada y call vendida."
  },
  {
    id: "PROTECTIVE_PUT", label: "Put de Protección",
    aliases: ["Protective Put", "Put de Protección"], category: "PROTECTION", bias: "PROTECTION", priority: 76,
    permission: "REAL_SIGNAL", riskType: "DEFINED_RISK",
    preferredIvRegime: "LOW", preferredMarketRegime: "ANY",
    realSignalAllowed: true,
    notes: "Seguro contra caída en posición larga."
  },
  {
    id: "BULL_CALL_DEBIT_SPREAD", label: "Call Spread Alcista / Bull Call Debit Spread",
    aliases: ["Call Spread Alcista", "Bull Call Spread", "Debit Call Spread"],
    category: "DEBIT", bias: "BULLISH", priority: 72,
    permission: "REAL_SIGNAL", riskType: "DEFINED_RISK",
    preferredIvRegime: "LOW", preferredMarketRegime: "TRENDING",
    realSignalAllowed: true,
    notes: "Direccional alcista con riesgo definido. Mejor con IV baja o momentum fuerte."
  },
  {
    id: "BEAR_PUT_DEBIT_SPREAD", label: "Put Spread Bajista / Bear Put Debit Spread",
    aliases: ["Put Spread Bajista", "Bear Put Spread", "Debit Put Spread"],
    category: "DEBIT", bias: "BEARISH", priority: 70,
    permission: "REAL_SIGNAL", riskType: "DEFINED_RISK",
    preferredIvRegime: "LOW", preferredMarketRegime: "TRENDING",
    realSignalAllowed: true,
    notes: "Direccional bajista con riesgo definido."
  },
  {
    id: "LONG_CALL", label: "Call Larga",
    aliases: ["Long Call", "Call Larga"], category: "DIRECTIONAL", bias: "BULLISH", priority: 55,
    permission: "WATCHLIST_ONLY", riskType: "DEFINED_RISK",
    preferredIvRegime: "LOW", preferredMarketRegime: "BREAKOUT",
    realSignalAllowed: false,
    notes: "Solo con momentum fuerte, IV razonable y stop estricto."
  },
  {
    id: "LONG_PUT", label: "Put Larga",
    aliases: ["Long Put", "Put Larga"], category: "DIRECTIONAL", bias: "BEARISH", priority: 54,
    permission: "WATCHLIST_ONLY", riskType: "DEFINED_RISK",
    preferredIvRegime: "LOW", preferredMarketRegime: "BREAKOUT",
    realSignalAllowed: false,
    notes: "Solo con breakdown confirmado y spread líquido."
  },
  {
    id: "LONG_STRADDLE", label: "Straddle Largo",
    aliases: ["Long Straddle", "Straddle Largo"], category: "VOLATILITY", bias: "VOLATILITY_EXPANSION", priority: 50,
    permission: "WATCHLIST_ONLY", riskType: "DEFINED_RISK",
    preferredIvRegime: "LOW", preferredMarketRegime: "BREAKOUT",
    realSignalAllowed: false,
    notes: "Necesita expansión de volatilidad y movimiento fuerte."
  },
  {
    id: "LONG_STRANGLE", label: "Strangle Largo",
    aliases: ["Long Strangle", "Strangle Largo"], category: "VOLATILITY", bias: "VOLATILITY_EXPANSION", priority: 48,
    permission: "WATCHLIST_ONLY", riskType: "DEFINED_RISK",
    preferredIvRegime: "LOW", preferredMarketRegime: "BREAKOUT",
    realSignalAllowed: false,
    notes: "Más barato que straddle, pero requiere movimiento mayor."
  },
  {
    id: "REVERSE_IRON_CONDOR", label: "Iron Condor Inverso",
    aliases: ["Reverse Iron Condor", "Iron Condor Inverso"], category: "VOLATILITY", bias: "VOLATILITY_EXPANSION", priority: 46,
    permission: "WATCHLIST_ONLY", riskType: "DEFINED_RISK",
    preferredIvRegime: "LOW", preferredMarketRegime: "BREAKOUT",
    realSignalAllowed: false,
    notes: "Estrategia de débito para expansión de volatilidad."
  },
  {
    id: "SHORT_CALL", label: "Call Corta Naked",
    aliases: ["Short Call", "Call Corta"], category: "CREDIT", bias: "BEARISH", priority: 5,
    permission: "BLOCKED_UNDEFINED_RISK", riskType: "UNDEFINED_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "ANY",
    realSignalAllowed: false,
    notes: "Bloqueada. Riesgo indefinido."
  },
  {
    id: "SHORT_PUT", label: "Put Corta Naked",
    aliases: ["Short Put", "Put Corta"], category: "CREDIT", bias: "BULLISH", priority: 5,
    permission: "BLOCKED_UNDEFINED_RISK", riskType: "UNDEFINED_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "ANY",
    realSignalAllowed: false,
    notes: "Bloqueada salvo cash secured explícito."
  },
  {
    id: "SHORT_STRADDLE", label: "Straddle Corto",
    aliases: ["Short Straddle", "Straddle Corto"], category: "CREDIT", bias: "NEUTRAL", priority: 4,
    permission: "PAPER_ONLY", riskType: "UNDEFINED_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "RANGE",
    realSignalAllowed: false,
    notes: "Riesgo indefinido. Solo paper/educación."
  },
  {
    id: "SHORT_STRANGLE", label: "Strangle Corto",
    aliases: ["Short Strangle", "Strangle Corto"], category: "CREDIT", bias: "NEUTRAL", priority: 4,
    permission: "PAPER_ONLY", riskType: "UNDEFINED_RISK",
    preferredIvRegime: "HIGH", preferredMarketRegime: "RANGE",
    realSignalAllowed: false,
    notes: "Riesgo indefinido. Solo paper/educación."
  }
];

export function getRealSignalStrategies() {
  return STRATEGY_CATALOG.filter(s => s.realSignalAllowed);
}

export function getBlockedStrategies() {
  return STRATEGY_CATALOG.filter(s => !s.realSignalAllowed);
}

export function getStrategyById(id: string) {
  return STRATEGY_CATALOG.find(s => s.id === id);
}