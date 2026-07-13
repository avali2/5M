function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePop(value) {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeBias(value, strategy = '') {
  const text = String(value || strategy || '').toLowerCase();
  if (text.includes('bear') || text.includes('put debit')) return 'bearish';
  if (text.includes('bull') || text.includes('call debit')) return 'bullish';
  if (text.includes('iron') || text.includes('condor') || text.includes('calendar')) return 'neutral';
  return 'neutral';
}

function strategyType(strategy = '') {
  if (/Bull Put|Put Credit/i.test(strategy)) return 'BULL_PUT_CREDIT_SPREAD';
  if (/Bear Call|Call Credit/i.test(strategy)) return 'BEAR_CALL_CREDIT_SPREAD';
  if (/Call Debit/i.test(strategy)) return 'BULL_CALL_DEBIT_SPREAD';
  if (/Put Debit/i.test(strategy)) return 'BEAR_PUT_DEBIT_SPREAD';
  if (/Iron Fly|Butterfly/i.test(strategy)) return 'IRON_FLY';
  if (/Iron Condor/i.test(strategy)) return 'IRON_CONDOR';
  if (/Calendar/i.test(strategy)) return 'CALENDAR';
  if (/Diagonal/i.test(strategy)) return 'DIAGONAL';
  if (/PMCC/i.test(strategy)) return 'PMCC';
  if (/Covered Call/i.test(strategy)) return 'COVERED_CALL';
  if (/Cash Secured/i.test(strategy)) return 'CASH_SECURED_PUT';
  if (/Long Call|Call Scalp/i.test(strategy)) return 'LONG_CALL_SCALP';
  if (/Long Put|Put Scalp/i.test(strategy)) return 'LONG_PUT_SCALP';
  return 'BULL_PUT_CREDIT_SPREAD';
}

function mapStatus(item = {}, source = 'candidate') {
  const classification = String(item.classification || item.status || '').toUpperCase();
  const sourceStatus = String(item.sourceSetup?.status || item.sourceSetup?.signalStatus || '').toUpperCase();
  const dte = toNumber(item.dte, 99);
  if (/kill switch|daily loss|risk limit|limite/i.test(String(item.blockedReason || item.warnings?.join(' ') || ''))) return 'LOCKED_BY_RISK';
  if (/READY_GREEN/.test(classification) || /READY_GREEN/.test(sourceStatus)) return dte === 0 ? '0DTE_SCALP' : 'READY';
  if (/DATA_ERROR|NO_CHAIN|NO_QUOTE|NO_GREEKS/.test(classification)) return 'NO_DATA';
  if (/CANDIDATE|WATCHLIST|WAIT_TRIGGER/.test(classification)) return 'WATCH';
  if (/BLOCKED/.test(classification)) return 'AVOID';
  if (/NO_DATA|NO_READY/.test(classification)) return 'NO_DATA';
  if (/NO_TRADE|REJECTED|AVOID|BLOCK/.test(classification)) return 'AVOID';
  if (/WAIT|TRIGGER|WATCH|TRADE_CANDIDATE/.test(classification)) return 'WATCH';
  if (/EDGE_READY|READY|APPROVE|AGGRESSIVE|CAPITAL|HIGH_POP/.test(classification)) return 'WATCH';
  return source === 'rejected' ? 'AVOID' : 'WATCH';
}

function mapLeg(leg = {}, fallbackExpiration = '') {
  const bid = toNumber(leg.bid);
  const ask = toNumber(leg.ask);
  const mid = toNumber(leg.mid, bid !== null && ask !== null ? (bid + ask) / 2 : null);
  return {
    side: /sell/i.test(String(leg.side || leg.action || '')) ? 'SELL' : 'BUY',
    optionType: /put|p$/i.test(String(leg.type || leg.optionType || '')) ? 'PUT' : 'CALL',
    strike: toNumber(leg.strike, 0),
    expiration: leg.expiration || fallbackExpiration || '',
    qty: toNumber(leg.quantity || leg.qty, 1),
    bid,
    ask,
    mid,
    delta: toNumber(leg.delta),
    gamma: toNumber(leg.gamma),
    theta: toNumber(leg.theta),
    vega: toNumber(leg.vega),
    iv: toNumber(leg.iv),
    volume: toNumber(leg.volume),
    openInterest: toNumber(leg.openInterest || leg.open_interest)
  };
}

function sourceQuality(item = {}, scan = {}) {
  const dataSource = String(item.dataSource || item.sourceSetup?.dataSource || scan.marketDataMode || '').toLowerCase();
  const hasLiveOption = /tradier|live|real/i.test(dataSource);
  const hasMock = /mock/i.test(dataSource);
  return {
    marketDataSource: hasMock ? 'mock' : hasLiveOption ? 'tradier' : 'fallback',
    optionDataSource: hasMock ? 'mock' : hasLiveOption ? 'tradier' : item.legs?.length ? 'fallback' : 'unavailable',
    latency: hasMock ? 'mock' : /delayed/i.test(dataSource) ? 'delayed' : hasLiveOption ? 'realtime' : 'realtime_proxy',
    greeksFreshness: item.legs?.some((leg) => Number.isFinite(Number(leg.delta))) ? 'live' : 'missing',
    warnings: item.warnings || item.blocks || []
  };
}

function gammaRisk(item = {}) {
  const dte = toNumber(item.dte, 99);
  if (dte > 1) return null;
  return {
    level: dte === 0 ? 'EXTREME' : 'HIGH',
    reason: dte === 0 ? '0DTE: gamma puede acelerar P/L y el stop es obligatorio.' : '1DTE: movimiento pequeno puede cambiar delta rapido.',
    stopRequired: true,
    maxHoldMinutes: dte === 0 ? 45 : 180,
    avoidAfterTime: dte === 0 ? '15:30 ET' : null
  };
}

function executionPlan(item = {}) {
  return {
    entryTrigger: item.entryLimit || item.activationRules?.[0] || 'Limit order solo si bid/ask y precio siguen dentro del plan.',
    entryType: item.classification === 'WAIT_TRIGGER' ? 'WAIT_BREAKOUT' : 'LIMIT_ONLY',
    limitPrice: toNumber(item.entryLimitValue ?? item.credit ?? item.debit),
    stopLoss: item.stopLoss || 'Stop por invalidacion tecnica o si el spread alcanza perdida planificada.',
    takeProfit: item.takeProfit || 'Tomar profit parcial/total segun plan del ticket.',
    timeStop: item.dte === 0 ? 'Cerrar si no avanza rapido; no sostener 0DTE sin motivo.' : 'Revisar cada scan.',
    invalidationLevel: toNumber(item.invalidationLevel),
    maxHoldMinutes: item.dte === 0 ? 45 : null
  };
}

function coachFromReview(item = {}) {
  const review = item.geminiGuardian || item.geminiReview;
  if (!review) return null;
  const decision = review.decision === 'APPROVE' ? 'takeable' : review.decision === 'BLOCK' ? 'avoid' : 'watch';
  return {
    decision,
    confidence: toNumber(review.confidence, 50),
    summary: review.summary || 'Gemini requiere revision manual.',
    traderAction: decision === 'takeable' ? 'COPY_TICKET' : decision === 'avoid' ? 'AVOID' : 'WAIT_CONFIRMATION',
    whyMoneyCanBeMadeHere: review.why?.join(' ') || 'Edge estimado sujeto a datos, liquidez y ejecucion.',
    mainRisk: review.risks?.[0] || review.summary || 'Riesgo no especificado.',
    doNotEnterIf: review.invalidation || 'No entrar si cambia el precio, bid/ask o macro/news.',
    bestEntryCondition: item.entryLimit || 'Solo limit order.',
    exitPlan: review.position_management || item.takeProfit || 'Usar stop y target definidos.',
    emotionalWarning: 'No perseguir precio. Si cambio el credito/debito, reescanear.',
    checklist: ['Confirmar bid/ask', 'Confirmar max loss', 'Confirmar stop', 'Confirmar macro/news']
  };
}

function buildTicketText(item = {}) {
  if (item.robinhoodTicket) return item.robinhoodTicket;
  const legs = (item.legs || []).map((leg) => `${/sell/i.test(leg.side || '') ? 'Sell to Open' : 'Buy to Open'} 1 ${item.symbol} ${item.expiration || ''} ${leg.strike}${/put/i.test(leg.type || '') ? 'P' : 'C'}`);
  return [
    `VALIDO 1M Ticket: ${item.symbol} ${item.strategy}`,
    `Expiration: ${item.expiration || 'Confirmar'}`,
    ...legs,
    `Limit: ${item.entryLimit || 'Confirmar chain'}`,
    `Max Risk: ${item.maxRisk ?? 'N/D'}`,
    `Max Profit: ${item.maxProfit ?? 'N/D'}`,
    `Stop: ${item.stopLoss || 'Definir antes de entrar'}`,
    `Target: ${item.takeProfit || 'Definir antes de entrar'}`
  ].join('\n');
}

function fromTicket(item = {}, scan = {}, source = 'candidate', origin = source) {
  const setup = item.sourceSetup || item;
  const legs = (item.legs || setup.legs || []).map((leg) => mapLeg(leg, item.expiration || setup.expiration));
  const status = mapStatus(item, source);
  const dte = toNumber(item.dte ?? setup.dte, 0);
  const pop = normalizePop(item.popEstimated ?? setup.pop ?? setup.edge?.probabilityOfProfit);
  const expiration = item.expiration || setup.expiration || '';
  return {
    id: item.id || `${item.symbol || setup.symbol}-${item.strategy || setup.strategy}-${expiration}-${source}`,
    createdAt: scan.asOf || new Date().toISOString(),
    expiresAt: expiration ? new Date(`${expiration}T20:00:00-04:00`).toISOString() : null,
    symbol: item.symbol || setup.symbol,
    underlyingPrice: toNumber(setup.underlyingPrice ?? setup.currentPrice),
    status,
    strategy: strategyType(item.strategy || setup.strategy),
    strategyLabel: item.strategy || setup.strategy || 'Options setup',
    bias: normalizeBias(item.bias || setup.bias, item.strategy || setup.strategy),
    expiration,
    dte,
    score: Math.round(toNumber(item.edgeScore ?? setup.confidenceScore ?? setup.score, 0)),
    pop,
    profitProbabilityPct: pop === null ? null : Math.round(pop * 100),
    credit: toNumber(setup.credit ?? (String(item.entryLimit || '').includes('Credit') ? item.entryLimitValue : null)),
    debit: toNumber(setup.debit ?? (String(item.entryLimit || '').includes('Debit') ? item.entryLimitValue : null)),
    maxRiskUsd: toNumber(item.maxRisk ?? setup.maxRisk),
    maxProfitUsd: toNumber(item.maxProfit ?? setup.maxProfit),
    breakevens: String(item.breakEven || setup.breakEven || '').split('/').map((value) => toNumber(value.trim())).filter((value) => value !== null),
    rewardRisk: toNumber(item.riskReward ?? setup.riskReward),
    collateralRequired: toNumber(item.collateralRequired ?? setup.collateralRequired),
    positionSizeContracts: toNumber(item.positionSizeContracts ?? setup.positionSizeContracts),
    accountRiskPercent: toNumber(item.accountRiskPercent ?? setup.accountRiskPercent),
    capitalSource: setup.capitalSource || item.capitalSource || scan.profile?.capitalSource || 'configured_fallback',
    gammaRisk: gammaRisk({ ...setup, ...item }),
    executionPlan: executionPlan({ ...setup, ...item }),
    legs,
    sourceQuality: sourceQuality({ ...setup, ...item }, scan),
    technicalSummary: setup.technicalSummary || setup.reasoning?.[0] || 'Tecnico pendiente de confirmar.',
    macroSummary: scan.macro?.highImpactEvents?.length ? 'Macro hard block activo.' : scan.macro?.softImpactEvents?.length ? 'Macro soft warning.' : 'Macro sin bloqueo reportado.',
    newsSummary: scan.macro?.breakingRisk?.[0]?.headline || 'Sin noticia critica reportada.',
    ticketText: buildTicketText({ ...setup, ...item }),
    geminiCoach: coachFromReview(setup),
    blockedReason: item.warnings?.[0] || setup.blocks?.[0] || null,
    origin
  };
}

function fromRejected(item = {}, scan = {}) {
  const signal = fromTicket(item, scan, 'rejected');
  const classification = String(item.classification || item.status || '').toUpperCase();
  return {
    ...signal,
    status: /NO_DATA|DATA_ERROR|NO_CHAIN|NO_QUOTE|NO_GREEKS/.test(classification)
      ? 'NO_DATA'
      : item.blocks?.length || item.riskGovernor?.blocks?.length ? 'AVOID' : 'NO_DATA',
    blockedReason: item.blocks?.[0] || item.riskGovernor?.blocks?.[0] || 'No paso filtros de datos/riesgo.'
  };
}

export function professionalSignalsFromScan(scan = {}) {
  const directReady = (scan.opportunities || []).map((item) => fromTicket(item, scan, 'approved', 'scanner_ready'));
  const approvedFromAgent = (scan.agent?.approvedSignals || []).map((item) => fromTicket(item, scan, 'approved', 'agent'));
  const actionable = (scan.guardianEdge?.actionableTickets || []).map((item) => fromTicket(item, scan, 'candidate', 'guardian'));
  const candidates = (scan.guardianEdge?.candidateTickets || scan.guardianEdge?.tickets || []).map((item) => fromTicket(item, scan, 'candidate', 'candidate'));
  const conditional = (scan.conditionalIdeas || []).map((item) => fromTicket(item, scan, 'candidate', 'scenario'));
  const rejected = (scan.rejected || [])
    .filter((item) => /NO_DATA|DATA_ERROR/i.test(String(item.classification || item.status || '')))
    .slice(0, 5)
    .map((item) => fromRejected(item, scan));
  const all = [...directReady, ...approvedFromAgent, ...actionable, ...candidates, ...conditional, ...rejected]
    .filter((signal) => signal.status !== 'AVOID');
  const statusRank = { READY: 60, '0DTE_SCALP': 60, WATCH: 35, NO_DATA: 10, LOCKED_BY_RISK: 5 };
  const originRank = { scanner_ready: 50, agent: 40, guardian: 30, candidate: 20, scenario: 10, rejected: 0 };
  const regime = String(scan.market?.regime || '').toLowerCase();
  const groups = new Map();
  for (const signal of all) {
    if (!signal.symbol) continue;
    if (!groups.has(signal.symbol)) groups.set(signal.symbol, []);
    groups.get(signal.symbol).push(signal);
  }
  return [...groups.values()].map((signals) => signals.sort((left, right) => {
    const trend = String(scan.market?.technicals?.[left.symbol]?.trend || regime).toLowerCase();
    const alignment = (signal) => {
      if (signal.bias === 'neutral') return trend.includes('range') || trend.includes('chop') ? 5 : 0;
      if (trend.includes('bull') && signal.bias === 'bullish') return 10;
      if (trend.includes('bear') && signal.bias === 'bearish') return 10;
      if ((trend.includes('bull') && signal.bias === 'bearish') || (trend.includes('bear') && signal.bias === 'bullish')) return -15;
      return 0;
    };
    return (statusRank[right.status] || 0) - (statusRank[left.status] || 0)
      || (originRank[right.origin] || 0) - (originRank[left.origin] || 0)
      || alignment(right) - alignment(left)
      || right.score - left.score
      || (right.pop || 0) - (left.pop || 0);
  })[0]).sort((left, right) =>
    (statusRank[right.status] || 0) - (statusRank[left.status] || 0) || right.score - left.score
  );
}

export function marketPulseFromScan(scan = {}) {
  const quotes = scan.market?.quotes || [];
  const quoteFor = (symbol) => quotes.find((quote) => quote.symbol === symbol);
  const spy = quoteFor('SPY');
  const qqq = quoteFor('QQQ');
  const macroStatus = scan.macro?.highImpactEvents?.length ? 'BLOCKED' : scan.macro?.softImpactEvents?.length ? 'CAUTION' : 'CLEAR';
  const newsRisk = scan.macro?.breakingRisk?.length ? 'CAUTION' : 'CLEAR';
  const providersOk = (scan.providers || []).some((provider) => provider.configured && provider.required !== false);
  return {
    marketStatus: scan.market?.status === 'open' ? 'OPEN' : 'CLOSED',
    mode: scan.profile?.riskMode || 'AGGRESSIVE_OPPORTUNITIES',
    apiStatus: providersOk ? 'OK' : 'DEGRADED',
    lastScan: scan.asOf ? new Intl.DateTimeFormat('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).format(new Date(scan.asOf)) : '--',
    spyBias: spy?.trend || scan.market?.regime || 'N/D',
    qqqBias: qqq?.trend || scan.market?.regime || 'N/D',
    vixStatus: scan.market?.vix ? String(scan.market.vix) : scan.market?.regime || 'N/D',
    macroStatus,
    newsRisk,
    dataQuality: scan.decision?.status === 'configuration_required' ? 'FAIL' : scan.decision?.status === 'no_trade' ? 'DEGRADED' : 'OK',
    bestStrategyToday: scan.guardianEdge?.dailyBest?.strategy || scan.agent?.approvedSignals?.[0]?.strategy || 'Esperar credit/debit spread con chain limpia'
  };
}

export function geminiBriefFromScan(scan = {}, signals = []) {
  const actionable = signals.find((signal) => ['READY', 'AGGRESSIVE', '0DTE_SCALP'].includes(signal.status));
  const watch = signals.find((signal) => signal.status === 'WATCH');
  const avoid = signals.find((signal) => ['AVOID', 'NO_DATA', 'LOCKED_BY_RISK'].includes(signal.status));
  const review = scan.aiGuardian?.reviews?.[0] || scan.agent?.aiGuardian?.reviews?.[0];
  const macro = scan.macro?.highImpactEvents?.length ? 'hay bloqueo macro' : scan.macro?.softImpactEvents?.length ? 'hay cautela macro' : 'macro esta clear';
  return [
    `Veo ${scan.market?.regime || 'regimen no confirmado'} y ${macro}.`,
    actionable ? `Mejor oportunidad: ${actionable.symbol} ${actionable.strategyLabel}; revisar ticket, stop y max risk.` : watch ? `Buscar confirmacion en ${watch.symbol}; todavia es WATCH, no entrada.` : 'No veo entrada limpia ahora.',
    avoid ? `Evitar: ${avoid.symbol} por ${avoid.blockedReason || avoid.status}.` : 'Evitar perseguir precio sin bid/ask fresco.',
    review?.summary ? `Gemini: ${review.summary}` : 'Gemini audita candidatos, pero si faltan datos la decision correcta es NO_DATA o AVOID.'
  ].join(' ');
}
