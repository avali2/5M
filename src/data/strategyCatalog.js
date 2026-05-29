export const STRATEGY_TIERS = {
  CORE_DEFINED_RISK: 'CORE_DEFINED_RISK',
  ADVANCED_DEFINED_RISK: 'ADVANCED_DEFINED_RISK',
  INCOME_STOCK_BASED: 'INCOME_STOCK_BASED',
  PAPER_ONLY: 'PAPER_ONLY',
  EDUCATIONAL_ONLY: 'EDUCATIONAL_ONLY',
  BLOCKED_UNDEFINED_RISK: 'BLOCKED_UNDEFINED_RISK'
};

export const STRATEGY_CATALOG = [
  strategy('bull_put_credit_spread', 'Bull Put Spread / Put Credit Spread', 'CORE_DEFINED_RISK', true, ['BULLISH', 'HIGH_IV'], 'Venta de put spread para capturar prima con riesgo definido.', 'Short put bajo soporte, delta 0.15-0.35, POP objetivo >= 70%.', 'Cerrar 40%-60% del credito o stop 1.5x-2x credito.'),
  strategy('bear_call_credit_spread', 'Bear Call Spread / Call Credit Spread', 'CORE_DEFINED_RISK', true, ['BEARISH', 'HIGH_IV'], 'Venta de call spread para capturar prima con riesgo definido.', 'Short call sobre resistencia, delta 0.15-0.35, POP objetivo >= 70%.', 'Cerrar 40%-60% del credito o stop 1.5x-2x credito.'),
  strategy('bull_call_debit_spread', 'Bull Call Debit Spread', 'CORE_DEFINED_RISK', true, ['BULLISH', 'LOW_IV'], 'Compra de call spread para sesgo alcista con perdida limitada.', 'Momentum alcista, target claro, IV no excesiva.', 'Tomar profit 50%-100% del debito; stop 40%-50%.'),
  strategy('bear_put_debit_spread', 'Bear Put Debit Spread', 'CORE_DEFINED_RISK', true, ['BEARISH', 'LOW_IV'], 'Compra de put spread para sesgo bajista con perdida limitada.', 'Momentum bajista, breakdown o rechazo de resistencia.', 'Tomar profit 50%-100% del debito; stop 40%-50%.'),
  strategy('iron_condor', 'Iron Condor', 'CORE_DEFINED_RISK', true, ['NEUTRAL', 'HIGH_IV'], 'Put credit spread + call credit spread para rango.', 'Rango claro, IV favorable, sin evento macro/earnings cerca.', 'Cerrar al 40%-60% del credito; vigilar short strikes.'),
  strategy('iron_butterfly', 'Iron Butterfly', 'ADVANCED_DEFINED_RISK', true, ['NEUTRAL', 'HIGH_IV'], 'Iron fly de riesgo definido para rango estrecho/pinning.', 'Usar solo con liquidez fuerte y payoff claro.', 'Cerrar temprano; gamma puede acelerar perdida.'),
  strategy('calendar_spread', 'Calendar Spread', 'ADVANCED_DEFINED_RISK', true, ['NEUTRAL', 'LOW_IV'], 'Venta vencimiento corto + compra vencimiento largo mismo strike.', 'Rango, term structure favorable y asignacion entendida.', 'Gestion activa de la pata corta.'),
  strategy('diagonal_spread', 'Diagonal Spread', 'ADVANCED_DEFINED_RISK', true, ['BULLISH', 'BEARISH', 'LOW_IV'], 'Spread con expiraciones y strikes distintos.', 'Sesgo direccional con venta de theta.', 'Gestion activa; no dejar assignment sin plan.'),
  strategy('pmcc', "Poor Man's Covered Call / PMCC", 'INCOME_STOCK_BASED', true, ['BULLISH'], 'LEAPS largo + call corta para ingreso.', 'LEAPS delta 0.70-0.85 y call corta 0.15-0.30.', 'No vender calls debajo del costo base ajustado.'),
  strategy('covered_call', 'Covered Call', 'INCOME_STOCK_BASED', true, ['BULLISH', 'NEUTRAL', 'HIGH_IV'], 'Venta de call cubierta por 100 acciones.', 'Usuario debe tener acciones; upside queda limitado.', 'Cerrar/rolar si amenaza strike y no quieres assignment.'),
  strategy('cash_secured_put', 'Cash Secured Put', 'INCOME_STOCK_BASED', true, ['BULLISH', 'HIGH_IV'], 'Venta de put respaldada por efectivo.', 'Solo si aceptas comprar acciones al strike.', 'Assignment es parte del plan; no usar si no quieres acciones.'),
  strategy('collar', 'Collar', 'CORE_DEFINED_RISK', true, ['BULLISH', 'NEUTRAL'], 'Acciones + put protectora + call vendida.', 'Proteccion de cartera con cap de upside.', 'Revisar dividendos y assignment.'),
  strategy('protective_put', 'Protective Put', 'CORE_DEFINED_RISK', true, ['BEARISH', 'VOLATILITY'], 'Put como seguro para acciones.', 'Cuando quieres limitar downside de shares.', 'Costo de seguro reduce rendimiento.'),
  strategy('long_call', 'Long Call', 'PAPER_ONLY', false, ['BULLISH', 'LOW_IV'], 'Compra directa de call; riesgo limitado a prima.', 'Solo con momentum fuerte y theta entendido.', 'Paper/watchlist por defecto: theta castiga.'),
  strategy('long_put', 'Long Put', 'PAPER_ONLY', false, ['BEARISH', 'LOW_IV'], 'Compra directa de put; riesgo limitado a prima.', 'Solo con breakdown claro y IV razonable.', 'Paper/watchlist por defecto: theta castiga.'),
  strategy('long_straddle', 'Long Straddle', 'PAPER_ONLY', false, ['VOLATILITY', 'EARNINGS'], 'Compra call + put ATM buscando movimiento grande.', 'Necesita movimiento que supere prima total.', 'Paper por defecto; riesgo de vol crush.'),
  strategy('long_strangle', 'Long Strangle', 'PAPER_ONLY', false, ['VOLATILITY', 'EARNINGS'], 'Compra call + put OTM buscando expansion.', 'Catalizador real y prima razonable.', 'Paper por defecto; puede perder por theta.'),
  strategy('butterfly', 'Butterfly', 'ADVANCED_DEFINED_RISK', false, ['NEUTRAL'], 'Butterfly debit/credit con riesgo definido.', 'Pin/rango y payoff claro.', 'Advanced/paper hasta validar liquidez.'),
  strategy('broken_wing_butterfly', 'Broken Wing Butterfly', 'ADVANCED_DEFINED_RISK', false, ['BULLISH', 'BEARISH', 'NEUTRAL'], 'Butterfly asimetrica con riesgo definido.', 'Payoff completo y max loss claro por ambos lados.', 'Advanced/paper por defecto.'),
  strategy('broken_wing_iron_condor', 'Broken Wing Iron Condor', 'ADVANCED_DEFINED_RISK', false, ['NEUTRAL', 'HIGH_IV'], 'Iron condor asimetrico.', 'Solo si payoff y liquidez estan 100% claros.', 'Advanced/paper por defecto.'),
  strategy('ratio_call_spread', 'Ratio Call Spread', 'PAPER_ONLY', false, ['BULLISH'], 'Ratio con calls; puede tener cola compleja.', 'Solo con cobertura clara y max loss calculado.', 'Paper por defecto.'),
  strategy('ratio_put_spread', 'Ratio Put Spread', 'PAPER_ONLY', false, ['BEARISH'], 'Ratio con puts; puede tener cola compleja.', 'Solo con cobertura clara y max loss calculado.', 'Paper por defecto.'),
  strategy('call_backspread', 'Call Backspread', 'PAPER_ONLY', false, ['BULLISH', 'VOLATILITY'], 'Backspread de calls para expansion alcista.', 'Necesita movimiento fuerte.', 'Paper por defecto.'),
  strategy('put_backspread', 'Put Backspread', 'PAPER_ONLY', false, ['BEARISH', 'VOLATILITY'], 'Backspread de puts para expansion bajista.', 'Necesita movimiento fuerte.', 'Paper por defecto.'),
  strategy('jade_lizard', 'Jade Lizard', 'PAPER_ONLY', false, ['BULLISH', 'HIGH_IV'], 'Put vendida + call credit spread.', 'Riesgo de assignment/capital; cuenta pequena debe evitarlo.', 'Paper por defecto.'),
  strategy('twisted_sister', 'Twisted Sister', 'PAPER_ONLY', false, ['BEARISH', 'HIGH_IV'], 'Estructura avanzada de credito.', 'Solo educacion hasta validar riesgo.', 'Paper por defecto.'),
  strategy('double_diagonal', 'Double Diagonal', 'PAPER_ONLY', false, ['NEUTRAL', 'LOW_IV'], 'Dos diagonales para rango/volatilidad.', 'Term structure y assignment entendidos.', 'Paper por defecto.'),
  strategy('double_calendar', 'Double Calendar', 'PAPER_ONLY', false, ['NEUTRAL', 'LOW_IV'], 'Dos calendars alrededor de rango.', 'Requiere gestion de term structure.', 'Paper por defecto.'),
  strategy('christmas_tree', 'Christmas Tree Spread', 'PAPER_ONLY', false, ['BULLISH', 'BEARISH'], 'Spread asimetrico avanzado.', 'Solo si payoff esta validado.', 'Paper por defecto.'),
  strategy('condor_debit_spread', 'Condor Debit Spread', 'PAPER_ONLY', false, ['NEUTRAL'], 'Condor debit de riesgo limitado.', 'Rango esperado y debito razonable.', 'Paper por defecto.'),
  strategy('box_spread', 'Box Spread', 'EDUCATIONAL_ONLY', false, ['NEUTRAL'], 'Estructura de paridad; educativa.', 'Riesgo operacional/asignacion y tasas.', 'No usar como senal.'),
  strategy('synthetic_covered_call', 'Synthetic Covered Call', 'EDUCATIONAL_ONLY', false, ['BULLISH'], 'Replica cubierta con opciones.', 'Entender sinteticos, margen y assignment.', 'Educativo.'),
  strategy('stock_replacement_leaps', 'Stock Replacement with LEAPS', 'PAPER_ONLY', false, ['BULLISH'], 'LEAPS como sustituto parcial de acciones.', 'Delta alto, liquidez y theta entendidos.', 'Paper/watchlist.'),
  strategy('covered_strangle', 'Covered Strangle', 'INCOME_STOCK_BASED', false, ['BULLISH', 'NEUTRAL', 'HIGH_IV'], 'Covered call + cash secured put.', 'Solo con 100 shares y cash suficiente.', 'No READY por defecto en cuenta pequena.'),
  strategy('naked_call', 'Naked Call', 'BLOCKED_UNDEFINED_RISK', false, ['BEARISH'], 'Bloqueada por riesgo indefinido.', 'No usar.', 'No permitido.'),
  strategy('naked_put', 'Naked Put', 'BLOCKED_UNDEFINED_RISK', false, ['BULLISH'], 'Bloqueada salvo cash secured.', 'No usar sin efectivo completo.', 'No permitido.'),
  strategy('short_straddle', 'Short Straddle', 'BLOCKED_UNDEFINED_RISK', false, ['NEUTRAL', 'HIGH_IV'], 'Bloqueada por riesgo indefinido.', 'No usar.', 'No permitido.'),
  strategy('short_strangle', 'Short Strangle', 'BLOCKED_UNDEFINED_RISK', false, ['NEUTRAL', 'HIGH_IV'], 'Bloqueada por riesgo indefinido.', 'No usar.', 'No permitido.')
];

function strategy(id, name, tier, allowedAsReady, preferredBias, description, whenToUse, management) {
  return {
    id,
    name,
    tier,
    allowedAsReady,
    allowedAsPaperOnly: !allowedAsReady || ['PAPER_ONLY', 'ADVANCED_DEFINED_RISK', 'EDUCATIONAL_ONLY'].includes(tier),
    preferredBias,
    description,
    whenToUse,
    management,
    noAutoExecution: true,
    requiresDefinedRisk: !['INCOME_STOCK_BASED', 'EDUCATIONAL_ONLY', 'BLOCKED_UNDEFINED_RISK'].includes(tier),
    blockedByDefault: tier === 'BLOCKED_UNDEFINED_RISK',
    readyLabel: allowedAsReady ? 'READY permitido si pasa risk engine' : tier === 'BLOCKED_UNDEFINED_RISK' ? 'BLOQUEADA' : 'PAPER / WATCHLIST'
  };
}

export function getAllowedReadyStrategies() {
  return STRATEGY_CATALOG.filter((item) => item.allowedAsReady && !item.blockedByDefault);
}

export function getPaperOnlyStrategies() {
  return STRATEGY_CATALOG.filter((item) => item.allowedAsPaperOnly && !item.allowedAsReady);
}

export function getBlockedStrategies() {
  return STRATEGY_CATALOG.filter((item) => item.blockedByDefault);
}
