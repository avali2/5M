import { round } from '../lib/math.js';

function sessionStatus(date) {
  const pieces = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const minute = Number(pieces.hour) * 60 + Number(pieces.minute);
  if (['Sat', 'Sun'].includes(pieces.weekday)) return 'Mercado cerrado por fin de semana';
  if (minute < 570) return 'Pre-market: prepara el plan, no persigas precios';
  if (minute < 600) return 'Apertura: espera que spreads y direccion se estabilicen';
  if (minute < 690) return 'Ventana de evaluacion: liquidez normalmente mas clara';
  if (minute < 870) return 'Sesion media: vigila eventos programados y theta';
  if (minute < 945) return 'Ventana de revision: confirma riesgo antes del cierre';
  if (minute <= 975) return 'Cierre: gamma y asignacion requieren cautela';
  return 'Mercado cerrado: analiza, no ejecutes con precios antiguos';
}

function volatilityReading(vix) {
  if (!Number.isFinite(vix)) return 'VIX no disponible: no aprobar estructuras de volatilidad.';
  if (vix >= 35) return `VIX ${vix}: volatilidad extrema; prioridad absoluta a preservar capital.`;
  if (vix >= 25) return `VIX ${vix}: primas elevadas con riesgo de movimiento; spreads mas prudentes.`;
  if (vix >= 15) return `VIX ${vix}: volatilidad intermedia; exige IV, GEX y liquidez alineados.`;
  return `VIX ${vix}: primas comprimidas; no vendas riesgo solo por cobrar theta.`;
}

export function createExecutionPlan(setup, profile) {
  const riskBudget = profile.accountSize * profile.riskPct / 100;
  const collateralBudget = profile.accountSize * profile.maxCollateralPct / 100;
  const riskCapacity = setup.maxRisk > 0 ? Math.floor(riskBudget / setup.maxRisk) : 0;
  const collateralCapacity = setup.collateralRequired > 0 ? Math.floor(collateralBudget / setup.collateralRequired) : riskCapacity;
  const maximumContracts = Math.max(1, Math.min(riskCapacity, collateralCapacity));
  const orderType = Number.isFinite(setup.credit)
    ? `Orden LIMIT por credito neto, objetivo inicial >= $${setup.credit.toFixed(2)}`
    : `Orden LIMIT por debito neto, no pagar mas de $${setup.debit.toFixed(2)}`;
  return {
    label: 'PLAN APROBADO PARA REVISION EN BROKER',
    contracts: 1,
    maximumContracts,
    orderType,
    entryRules: [
      'Revalidar bid/ask, volumen y open interest justo antes de enviar.',
      'Confirmar que no aparecio evento macro o earnings nuevo.',
      'No ejecutar si el credito/debito real empeora el max risk mostrado.'
    ],
    management: [setup.takeProfit, setup.stopLoss],
    note: 'La senal identifica una estructura filtrada; la orden final requiere confirmacion del precio real en Tradier.'
  };
}

export function createDailyAssistant(scan) {
  const events = (scan.macro?.highImpactEvents || []).slice().sort((left, right) => new Date(left.date) - new Date(right.date));
  const approved = scan.opportunities?.[0] || null;
  const conditionalTicket = scan.guardianEdge?.dailyBest || null;
  const blocked = scan.decision.status !== 'eligible' && scan.decision.status !== 'conditional_edge';
  return {
    marketSession: sessionStatus(new Date(scan.asOf)),
    action: approved ? 'REVISAR PLAN APROBADO' : conditionalTicket ? 'REVISAR EDGE CONDICIONAL' : 'ESPERAR / NO ABRIR POSICION NUEVA',
    actionReason: approved
      ? `${approved.symbol} ${approved.strategy} supero score, riesgo, gamma, liquidez y eventos.`
      : conditionalTicket
        ? `${conditionalTicket.symbol} ${conditionalTicket.strategy} esta clasificado como ${conditionalTicket.classification}; requiere gatillo y revision manual.`
      : scan.decision.reasons.join(' '),
    volatility: volatilityReading(scan.market?.vix),
    nextEvent: events[0] || null,
    timingTips: [
      '9:30-10:00 ET: apertura; evita forzar entradas mientras se amplian spreads y se define direccion.',
      '10:00-11:30 ET: suele ser una ventana mas ordenada para evaluar income trades liquidos.',
      'Antes de Fed, CPI o empleo USA: espera el evento y vuelve a escanear.',
      'Ultima hora y expiraciones cortas: gamma puede cambiar el riesgo muy rapido.'
    ],
    greekTargets: [
      { name: 'Delta corto', target: '0.12 a 0.30', meaning: 'Zona objetivo para spreads de prima; menor delta no elimina riesgo.' },
      { name: 'Theta', target: 'Positivo', meaning: 'El paso del tiempo debe favorecer la estructura vendida.' },
      { name: 'Gamma', target: 'Bajo / GEX positivo', meaning: 'Reduce riesgo de aceleracion; no es garantia de estabilidad.' },
      { name: 'Vega', target: 'Controlado', meaning: 'La caida de IV ayuda al vendedor; expansion de IV lo perjudica.' },
      { name: 'Liquidez', target: 'Score >= 7/10', meaning: 'Evita pagar de mas al abrir o cerrar posiciones.' }
    ],
    checklist: [
      blocked ? 'El motor esta en NO TRADE: no conviertas candidatos rechazados en senales.' : 'Usa una orden limite y comienza con 1 contrato.',
      `Riesgo maximo por operacion: $${round(scan.profile.accountSize * scan.profile.riskPct / 100, 0)}.`,
      'Confirma margen, buying power y riesgo definido dentro del broker antes de enviar.'
    ]
  };
}
