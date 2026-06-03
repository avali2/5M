import {
  AGENT_ACTIONS,
  AGENT_CHANNELS,
  AGENT_EVENT_TYPES,
  AGENT_SEVERITIES,
  createGuardianEvent,
  mergeGuardianSettings
} from './agentTypes.js';

const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const list = (value) => Array.isArray(value) ? value : [];
const notifyChannels = [AGENT_CHANNELS.IN_APP, AGENT_CHANNELS.PWA_NOTIFICATION, AGENT_CHANNELS.WEB_PUSH];

function remainingDte(expiration, now) {
  if (!expiration) return null;
  const milliseconds = new Date(expiration).getTime() - new Date(now).getTime();
  return Number.isFinite(milliseconds) ? Math.ceil(milliseconds / 86400000) : null;
}

function event(events, payload, now) {
  events.push(createGuardianEvent({ ...payload, createdAt: new Date(now).toISOString() }));
}

function setupData(setup, scan) {
  return {
    strategy: setup.strategy,
    strikes: setup.strikes,
    expiration: setup.expiration,
    score: setup.confidenceScore,
    maxRisk: setup.maxRisk,
    maxProfit: setup.maxProfit,
    popEstimated: setup.pop ?? setup.edge?.probabilityOfProfit,
    classification: setup.classification,
    dataMode: scan.marketDataMode || scan.dataHealth?.mode || 'No disponible',
    timestamp: scan.asOf || null,
    setup
  };
}

function ticketSeverity(ticket) {
  if (ticket.classification === 'EDGE_READY') return AGENT_SEVERITIES.OPPORTUNITY;
  if (ticket.classification === 'AGGRESSIVE_EDGE' || ticket.classification === 'CAPITAL_HEAVY') return AGENT_SEVERITIES.WARNING;
  if (ticket.classification === 'TRADE_CANDIDATE' || ticket.classification === 'WAIT_TRIGGER') return AGENT_SEVERITIES.EDUCATIONAL;
  return AGENT_SEVERITIES.WARNING;
}

function liquidityProblems(setup, thresholds) {
  const reasons = [];
  for (const leg of list(setup.legs)) {
    const bid = Number(leg.bid);
    const ask = Number(leg.ask);
    const mark = finite(bid) && finite(ask) ? (bid + ask) / 2 : null;
    const width = finite(bid) && finite(ask) ? ask - bid : null;
    if (finite(width) && width > thresholds.maxBidAskSpreadDollars) reasons.push(`Bid/ask ${width.toFixed(2)} supera $${thresholds.maxBidAskSpreadDollars.toFixed(2)}.`);
    if (finite(width) && finite(mark) && mark > 0 && (width / mark) * 100 > thresholds.maxBidAskSpreadPct) reasons.push('Bid/ask supera el porcentaje maximo permitido.');
    if (finite(leg.openInterest) && Number(leg.openInterest) < thresholds.minOpenInterest) reasons.push(`OI ${leg.openInterest} inferior a ${thresholds.minOpenInterest}.`);
    if (finite(leg.volume) && Number(leg.volume) < thresholds.minVolume) reasons.push(`Volumen ${leg.volume} inferior a ${thresholds.minVolume}.`);
  }
  return [...new Set(reasons)];
}

function chainMissing(setup) {
  const missing = [];
  if (!setup.expiration) missing.push('expiracion');
  if (!list(setup.legs).length) missing.push('legs');
  const contracts = list(setup.legs);
  if (contracts.length && contracts.some((leg) => !finite(leg.bid) || !finite(leg.ask))) missing.push('bid/ask');
  if (contracts.length && contracts.some((leg) => !finite(leg.delta))) missing.push('Delta');
  if (contracts.length && contracts.some((leg) => !finite(leg.gamma))) missing.push('Gamma');
  if (contracts.length && contracts.some((leg) => !finite(leg.openInterest))) missing.push('OI');
  if (contracts.length && contracts.some((leg) => !finite(leg.volume))) missing.push('volumen');
  return missing;
}

export function evaluateGuardianRules(context = {}) {
  const scan = context.scanner || context.scan || {};
  const settings = mergeGuardianSettings(context.settings);
  const now = context.now || new Date().toISOString();
  const events = [];
  const dedupe = new Set();
  const setups = [...list(scan.opportunities), ...list(scan.conditionalIdeas).filter((idea) => idea.strategy)];
  const edgeTickets = list(scan.guardianEdge?.notifyableTickets);

  for (const ticket of edgeTickets) {
    event(events, {
      type: AGENT_EVENT_TYPES.EDGE_TICKET,
      severity: ticketSeverity(ticket),
      symbol: ticket.symbol,
      title: ticket.notificationTitle || `${ticket.symbol} - ${ticket.classification}`,
      message: ticket.notificationBody || `${ticket.strategy} | POP ${ticket.popEstimated ?? 'No disponible'}% | ${ticket.riskClass}`,
      recommendation: 'No es orden automatica. Abre el ticket, revisa tu broker, max loss, bid/ask, invalidacion y tu estado mental antes de decidir.',
      source: 'Options Guardian Edge Ticket Mode',
      data: {
        ticket,
        classification: ticket.classification,
        popEstimated: ticket.popEstimated,
        evEstimated: ticket.evEstimated,
        edgeScore: ticket.edgeScore,
        riskClass: ticket.riskClass,
        timestamp: ticket.timestamp
      },
      channels: notifyChannels,
      actions: [
        AGENT_ACTIONS.OPEN_TRADE_TICKET,
        AGENT_ACTIONS.OPEN_CHAIN_CHECKLIST,
        AGENT_ACTIONS.OPEN_SIMULATOR,
        AGENT_ACTIONS.CREATE_PAPER_TRADE,
        AGENT_ACTIONS.OPEN_JOURNAL,
        AGENT_ACTIONS.EXPLAIN_WITH_AI_MANUAL,
        AGENT_ACTIONS.MARK_TAKEN,
        AGENT_ACTIONS.MARK_IGNORED,
        AGENT_ACTIONS.MARK_INVALID
      ]
    }, now);
  }

  for (const setup of setups) {
    const key = `${setup.symbol}:${setup.strategy}:${setup.expiration}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    const score = Number(setup.confidenceScore || 0);
    const allowed = setup.riskGovernor?.allowedReal === true;
    const data = setupData(setup, scan);
    if (score >= settings.thresholds.validatedScore && allowed) {
      event(events, {
        type: AGENT_EVENT_TYPES.SIGNAL_VALIDATED,
        severity: AGENT_SEVERITIES.OPPORTUNITY,
        symbol: setup.symbol,
        title: `${setup.symbol} - Senal validada`,
        message: `${setup.strategy} | Score ${score}/100. No es una orden automatica.`,
        recommendation: 'Revisa Delta, IV, bid/ask, OI, riesgo maximo e invalidacion antes de considerar entrada.',
        source: 'Scanner + Risk Governor',
        data,
        channels: notifyChannels,
        actions: [AGENT_ACTIONS.OPEN_SIGNAL, AGENT_ACTIONS.OPEN_SIMULATOR, AGENT_ACTIONS.CREATE_PAPER_TRADE, AGENT_ACTIONS.OPEN_CHAIN_CHECKLIST, AGENT_ACTIONS.EXPLAIN_WITH_AI_MANUAL]
      }, now);
    } else if (score >= settings.thresholds.conditionalScore && settings.workMode.includeConditional) {
      event(events, {
        type: AGENT_EVENT_TYPES.SIGNAL_CONDITIONAL,
        severity: AGENT_SEVERITIES.OPPORTUNITY,
        symbol: setup.symbol,
        title: `${setup.symbol} - Plan condicional`,
        message: `${setup.strategy} | Score ${score}/100. Falta confirmacion o aprobacion de riesgo.`,
        recommendation: 'No entrar todavia; valida gatillo tecnico, liquidez y Risk Governor.',
        source: 'Scanner condicional',
        data,
        channels: notifyChannels,
        actions: [AGENT_ACTIONS.OPEN_SIGNAL, AGENT_ACTIONS.OPEN_SIMULATOR, AGENT_ACTIONS.CREATE_PAPER_TRADE, AGENT_ACTIONS.OPEN_CHAIN_CHECKLIST]
      }, now);
    } else if (score >= settings.thresholds.paperScore) {
      event(events, {
        type: AGENT_EVENT_TYPES.SIGNAL_PAPER_ONLY,
        severity: AGENT_SEVERITIES.EDUCATIONAL,
        symbol: setup.symbol,
        title: `${setup.symbol} - Solo practica`,
        message: `${setup.strategy} | Score ${score}/100. Idea educativa, no trade real.`,
        recommendation: 'Usa el simulador o paper trading para revisar payoff, Greeks y ejecucion.',
        source: 'Scanner educativo',
        data,
        actions: [AGENT_ACTIONS.OPEN_SIMULATOR, AGENT_ACTIONS.CREATE_PAPER_TRADE, AGENT_ACTIONS.OPEN_CHAIN_CHECKLIST]
      }, now);
    }

    const blocks = list(setup.riskGovernor?.blocks || setup.blocks);
    if (blocks.length) {
      event(events, {
        type: AGENT_EVENT_TYPES.RISK_BLOCKED,
        severity: AGENT_SEVERITIES.WARNING,
        symbol: setup.symbol,
        title: `${setup.symbol} - Riesgo bloqueado`,
        message: blocks.join(' '),
        recommendation: 'Mantener esta estructura en paper hasta corregir cada bloqueo.',
        source: 'Risk Governor',
        data: { ...data, blocks },
        channels: [AGENT_CHANNELS.IN_APP, AGENT_CHANNELS.PWA_NOTIFICATION],
        actions: [AGENT_ACTIONS.OPEN_TRADING_PLAN, AGENT_ACTIONS.CREATE_PAPER_TRADE, AGENT_ACTIONS.MARK_REVIEWED]
      }, now);
    }

    const missing = chainMissing(setup);
    if (missing.length) {
      event(events, {
        type: AGENT_EVENT_TYPES.CHAIN_WARNING,
        severity: AGENT_SEVERITIES.WARNING,
        symbol: setup.symbol,
        title: `${setup.symbol} - Cadena incompleta`,
        message: `Datos insuficientes: ${missing.join(', ')}.`,
        recommendation: 'No considerar operacion real sin cadena, precios y Greeks verificables.',
        source: 'Options chain validation',
        data: { ...data, missing },
        actions: [AGENT_ACTIONS.OPEN_CHAIN_CHECKLIST, AGENT_ACTIONS.OPEN_DATA_HEALTH]
      }, now);
    }

    const liquidity = liquidityProblems(setup, settings.thresholds);
    if (liquidity.length) {
      event(events, {
        type: AGENT_EVENT_TYPES.LIQUIDITY_WARNING,
        severity: AGENT_SEVERITIES.WARNING,
        symbol: setup.symbol,
        title: `${setup.symbol} - Liquidez debil`,
        message: liquidity.join(' '),
        recommendation: 'Evita market orders; revisa otro strike o mantenlo solo como practica.',
        source: 'Cadena de opciones',
        data: { ...data, liquidity },
        channels: [AGENT_CHANNELS.IN_APP, AGENT_CHANNELS.PWA_NOTIFICATION],
        actions: [AGENT_ACTIONS.OPEN_CHAIN_CHECKLIST, AGENT_ACTIONS.CREATE_PAPER_TRADE]
      }, now);
    }

    const dte = setup.dte ?? remainingDte(setup.expiration, now);
    if (finite(dte) && Number(dte) <= settings.thresholds.highGammaDte) {
      event(events, {
        type: AGENT_EVENT_TYPES.GAMMA_RISK,
        severity: AGENT_SEVERITIES.WARNING,
        symbol: setup.symbol,
        title: `${setup.symbol} ${dte === 0 ? '0DTE' : '1DTE'} - Gamma alto`,
        message: 'El P/L puede cambiar violentamente cerca del strike corto y vencimiento.',
        recommendation: 'Si no puedes monitorear, reduce riesgo o usa paper trading con riesgo definido.',
        source: 'DTE + Greeks de cadena',
        data: { ...data, dte },
        channels: notifyChannels,
        actions: [AGENT_ACTIONS.OPEN_SIMULATOR, AGENT_ACTIONS.CREATE_PAPER_TRADE, AGENT_ACTIONS.OPEN_CHAIN_CHECKLIST]
      }, now);
    }
  }

  if (list(scan.dataHealth?.endpointErrors).length || scan.decision?.status === 'configuration_required') {
    event(events, {
      type: AGENT_EVENT_TYPES.DATA_HEALTH_ERROR,
      severity: AGENT_SEVERITIES.WARNING,
      title: 'Datos criticos no disponibles',
      message: list(scan.dataHealth?.endpointErrors).join(' | ') || 'Falta configurar un proveedor esencial para validar senales.',
      recommendation: 'Revisa Estado de Datos. Solo practica educativa mientras no haya datos completos.',
      source: 'Data Health',
      data: { endpointErrors: scan.dataHealth?.endpointErrors || [], decision: scan.decision?.status },
      actions: [AGENT_ACTIONS.OPEN_DATA_HEALTH]
    }, now);
  }

  const highImpact = list(context.macroEvents || scan.macro?.highImpactEvents || scan.macro?.blockingEvents);
  if (highImpact.length) {
    event(events, {
      type: AGENT_EVENT_TYPES.MACRO_RISK,
      severity: AGENT_SEVERITIES.CRITICAL,
      title: 'Evento macro de alto impacto',
      message: `Riesgo cercano: ${highImpact[0].title || highImpact[0].event || 'evento macro'}.`,
      recommendation: 'Silenciar ventas agresivas de prima y revalidar la estructura tras el evento.',
      source: 'Calendario macro configurado',
      data: { events: highImpact.slice(0, 3), timestamp: scan.asOf || null },
      channels: notifyChannels,
      actions: [AGENT_ACTIONS.OPEN_NEWS, AGENT_ACTIONS.OPEN_TRADING_PLAN]
    }, now);
  }
  const softMacro = list(scan.macro?.softImpactEvents);
  if (!highImpact.length && softMacro.length) {
    event(events, {
      type: AGENT_EVENT_TYPES.MACRO_RISK,
      severity: AGENT_SEVERITIES.EDUCATIONAL,
      title: 'Macro risk proximo - soft warning',
      message: `Evento en las proximas 48h: ${softMacro[0].title || softMacro[0].event || 'evento macro'}. No bloquea por si solo.`,
      recommendation: 'Reduce agresividad cerca de la ventana critica y revalida la cadena antes de entrar.',
      source: 'Calendario macro configurado',
      data: { events: softMacro.slice(0, 3), timestamp: scan.asOf || null, criticalWindow: false },
      actions: [AGENT_ACTIONS.OPEN_NEWS, AGENT_ACTIONS.OPEN_TRADING_PLAN]
    }, now);
  }

  const breakingNews = list(scan.macro?.breakingRisk);
  if (breakingNews.length) {
    event(events, {
      type: AGENT_EVENT_TYPES.NEWS_RISK,
      severity: AGENT_SEVERITIES.WARNING,
      title: 'Noticias sensibles requieren revision',
      message: breakingNews[0].headline || breakingNews[0].title || 'Titular de riesgo detectado por el proveedor configurado.',
      recommendation: 'Abre la fuente y revalida gap risk, volatilidad y strikes antes de cualquier decision.',
      source: breakingNews[0].source || 'News provider configurado',
      data: { news: breakingNews.slice(0, 3), url: breakingNews[0].url || null },
      channels: [AGENT_CHANNELS.IN_APP, AGENT_CHANNELS.PWA_NOTIFICATION],
      actions: [AGENT_ACTIONS.OPEN_NEWS, AGENT_ACTIONS.MARK_REVIEWED]
    }, now);
  }

  const earningsBlocked = [...setups, ...list(scan.rejected)].find((setup) =>
    list(setup.blocks || setup.riskGovernor?.blocks).some((block) => /resultados|earnings/i.test(block))
  );
  if (earningsBlocked) {
    event(events, {
      type: AGENT_EVENT_TYPES.EARNINGS_RISK,
      severity: AGENT_SEVERITIES.WARNING,
      symbol: earningsBlocked.symbol,
      title: `${earningsBlocked.symbol} - Earnings antes del vencimiento`,
      message: 'Riesgo de gap y cambio brusco de IV detectado antes de la expiracion planeada.',
      recommendation: 'No vendas prima sin revisar fecha, expected move y vol crush; mantenlo educativo si no hay plan.',
      source: 'Calendario de earnings configurado',
      data: setupData(earningsBlocked, scan),
      channels: [AGENT_CHANNELS.IN_APP, AGENT_CHANNELS.PWA_NOTIFICATION],
      actions: [AGENT_ACTIONS.OPEN_NEWS, AGENT_ACTIONS.OPEN_SIMULATOR]
    }, now);
  }

  const priorRegime = context.previousScan?.market?.regime;
  const regime = scan.market?.regime;
  if (priorRegime && regime && priorRegime !== regime) {
    event(events, {
      type: AGENT_EVENT_TYPES.MARKET_REGIME_CHANGED,
      severity: AGENT_SEVERITIES.WARNING,
      title: `Regimen cambio: ${priorRegime} a ${regime}`,
      message: 'Las estrategias favorecidas pueden haber cambiado por volatilidad, tendencia o gamma.',
      recommendation: 'Cancela supuestos anteriores y reevalua cada estructura con el Risk Governor.',
      source: 'Market Regime Engine',
      data: { priorRegime, regime, timestamp: scan.asOf || null },
      channels: notifyChannels,
      actions: [AGENT_ACTIONS.OPEN_SIGNAL, AGENT_ACTIONS.OPEN_TRADING_PLAN]
    }, now);
  }

  const priorVolatility = context.previousScan?.market?.volatility;
  const volatility = scan.market?.volatility;
  if (priorVolatility && volatility && priorVolatility !== volatility) {
    event(events, {
      type: AGENT_EVENT_TYPES.VOLATILITY_REGIME_CHANGED,
      severity: AGENT_SEVERITIES.WARNING,
      title: `Volatilidad cambio: ${priorVolatility} a ${volatility}`,
      message: 'La ventaja entre vender o comprar prima debe revisarse con IV y liquidez reales.',
      recommendation: 'Compara credit spreads contra debit spreads o calendars; no actues solo por VIX.',
      source: 'Volatility Engine',
      data: { priorVolatility, volatility, vix: scan.market?.vix },
      actions: [AGENT_ACTIONS.OPEN_SIMULATOR, AGENT_ACTIONS.OPEN_TRADING_PLAN]
    }, now);
  }

  const spyQuote = list(scan.market?.quotes).find((quote) => quote.symbol === 'SPY');
  const spyTechnical = scan.market?.technicals?.SPY;
  if (finite(spyQuote?.price) && finite(spyTechnical?.vwap20)) {
    const reclaimed = Number(spyQuote.price) > Number(spyTechnical.vwap20) && spyTechnical.trend === 'bullish';
    event(events, {
      type: reclaimed ? AGENT_EVENT_TYPES.VWAP_BREAK : AGENT_EVENT_TYPES.VWAP_REJECTION,
      severity: AGENT_SEVERITIES.EDUCATIONAL,
      symbol: 'SPY',
      title: reclaimed ? 'SPY sobre VWAP proxy' : 'SPY bajo VWAP proxy',
      message: `Precio ${spyQuote.price}; VWAP rolling diario ${spyTechnical.vwap20}. No es VWAP intradia.`,
      recommendation: 'Usa esta lectura como confirmacion secundaria; exige cadena y gatillo intradia antes de entrada.',
      source: spyTechnical.source || 'Daily OHLCV technical engine',
      data: { price: spyQuote.price, vwap: spyTechnical.vwap20, limitation: 'VWAP rolling diario, no tape intradia.' },
      actions: [AGENT_ACTIONS.OPEN_SIGNAL, AGENT_ACTIONS.OPEN_SIMULATOR]
    }, now);
  }

  const spyGex = list(scan.gammaSurfaces).find((surface) => surface.symbol === 'SPY');
  const levels = [spyGex?.walls?.call, spyGex?.walls?.put, spyGex?.gammaFlipLevel].filter(finite);
  if (finite(spyQuote?.price) && levels.some((level) => Math.abs(Number(level) - Number(spyQuote.price)) / Number(spyQuote.price) <= 0.005)) {
    event(events, {
      type: AGENT_EVENT_TYPES.GEX_LEVEL_APPROACHED,
      severity: AGENT_SEVERITIES.EDUCATIONAL,
      symbol: 'SPY',
      title: 'SPY cerca de nivel GEX aproximado',
      message: 'El precio esta cerca de call wall, put wall o gamma flip derivados de OI y Greeks.',
      recommendation: 'Usar como contexto, no como gatillo unico. No es posicionamiento dealer confirmado.',
      source: spyGex.label || 'GEX aproximado de cadena',
      data: { price: spyQuote.price, walls: spyGex.walls, gammaFlipLevel: spyGex.gammaFlipLevel },
      actions: [AGENT_ACTIONS.OPEN_SIGNAL, AGENT_ACTIONS.OPEN_SIMULATOR]
    }, now);
  }

  if (context.marketStatus === 'closed' && settings.workMode.includePaperPractice) {
    event(events, {
      type: AGENT_EVENT_TYPES.PAPER_PRACTICE_SUGGESTED,
      severity: AGENT_SEVERITIES.EDUCATIONAL,
      title: 'Mercado cerrado: practica deliberada',
      message: 'Practica un Iron Condor o credit spread y revisa expected move, Delta e IV.',
      recommendation: 'Usa snapshot o datos manuales marcados como educativos; no son cotizaciones live.',
      source: 'Guardian Scheduler',
      data: { marketStatus: 'closed', dataMode: 'snapshot/manual/educativo' },
      actions: [AGENT_ACTIONS.CREATE_PAPER_TRADE, AGENT_ACTIONS.OPEN_CHAIN_CHECKLIST, AGENT_ACTIONS.OPEN_JOURNAL]
    }, now);
  }

  const journal = context.journalSummary || {};
  if (Number(journal.consecutiveLosses || 0) >= 2) {
    event(events, {
      type: AGENT_EVENT_TYPES.JOURNAL_REVIEW,
      severity: AGENT_SEVERITIES.WARNING,
      title: 'Cooling-off por dos perdidas consecutivas',
      message: 'El proceso requiere pausa y revision antes de una nueva operacion real.',
      recommendation: 'Revisa stop, tamano y regla violada. Continua solo en paper por ahora.',
      source: 'Journal Analyst',
      data: journal,
      channels: notifyChannels,
      actions: [AGENT_ACTIONS.OPEN_JOURNAL, AGENT_ACTIONS.OPEN_TRADING_PLAN]
    }, now);
    if (settings.workMode.allowMotivation) {
      event(events, {
        type: AGENT_EVENT_TYPES.MOTIVATION_REMINDER,
        severity: AGENT_SEVERITIES.EDUCATIONAL,
        title: 'Disciplina antes que revancha',
        message: 'Revisa proceso, no te vengues. Una perdida correcta es costo operativo.',
        recommendation: 'Usa cooling-off y registra la leccion antes de considerar otra practica.',
        source: 'Discipline Coach',
        data: journal,
        channels: notifyChannels,
        actions: [AGENT_ACTIONS.OPEN_JOURNAL, AGENT_ACTIONS.OPEN_TRADING_PLAN]
      }, now);
    }
  }

  if (!setups.some((setup) => setup.riskGovernor?.allowedReal === true && Number(setup.confidenceScore) >= settings.thresholds.validatedScore)) {
    event(events, {
      type: AGENT_EVENT_TYPES.NO_TRADE_PROFESSIONAL,
      severity: AGENT_SEVERITIES.INFO,
      title: 'Sin trade validado ahora',
      message: 'No trade tambien es una decision profesional.',
      recommendation: 'Revisa ideas condicionales o practica; no fuerces una entrada sin edge validado.',
      source: 'Options Guardian Agent Pro',
      data: { decision: scan.decision?.status || 'Datos insuficientes' },
      actions: [AGENT_ACTIONS.CREATE_PAPER_TRADE, AGENT_ACTIONS.OPEN_TRADING_PLAN]
    }, now);
  }

  return events;
}
