/**
 * 5M · NiTo direccional: señales de compra de CALL y PUT.
 *
 * Motor explicable y determinista. Combina tendencia multitemporal, momentum,
 * flujo inferido, liquidez e IV para elegir un contrato concreto y publicar un
 * plan completo. Las probabilidades son modelo lognormal neutral al riesgo:
 * sirven para comparar, no para prometer.
 */
import { createHash } from 'node:crypto';
import { optionChainFor, dteFor } from './marketData.js';
import { buildIvProfile } from './positioning.js';
import {
  bsPrice, expectedMove, probAbove, probBelow, optionScenarios, clamp, round2, CONTRACT_SIZE
} from './optionsMath.js';

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const hashId = (...parts) => createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
const gradeFor = (score) => (score >= 86 ? 'A+' : score >= 76 ? 'A' : score >= 62 ? 'B' : 'C');
const DAY = 86400000;

function daysUntil(date, now) {
  const parsed = Date.parse(`${date}T20:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((parsed - now) / DAY);
}

function realizedVol(history = [], window = 20) {
  const closes = history.map((bar) => bar?.close).filter(isNum);
  if (closes.length < window + 2) return null;
  const returns = [];
  for (let index = closes.length - window; index < closes.length; index += 1) returns.push(Math.log(closes[index] / closes[index - 1]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function atrPercentile(history = [], length = 14) {
  const closes = history.map((bar) => bar?.close).filter(isNum);
  const highs = history.map((bar) => bar?.high);
  const lows = history.map((bar) => bar?.low);
  if (closes.length < length + 40) return null;
  const ranges = [];
  for (let index = 1; index < closes.length; index += 1) {
    const high = isNum(highs[index]) ? highs[index] : closes[index];
    const low = isNum(lows[index]) ? lows[index] : closes[index];
    ranges.push(Math.max(high - low, Math.abs(high - closes[index - 1]), Math.abs(low - closes[index - 1])));
  }
  const atrSeries = [];
  for (let index = length; index < ranges.length; index += 1) {
    atrSeries.push(ranges.slice(index - length, index).reduce((sum, value) => sum + value, 0) / length);
  }
  if (atrSeries.length < 20) return null;
  const current = atrSeries[atrSeries.length - 1];
  return (atrSeries.filter((value) => value < current).length / atrSeries.length) * 100;
}

/* ---------------------------------- Gate ---------------------------------- */
export function buildGate(snapshot, now = Date.now()) {
  const reasons = [];
  const warnings = [...(snapshot.warnings || [])];
  const asOf = Date.parse(snapshot.asOf);
  const dataAgeMinutes = Number.isFinite(asOf) ? Math.round((now - asOf) / 60000) : null;
  let status = 'OPEN';
  if (snapshot.simulated) {
    status = 'DEMO';
    reasons.push('Datos simulados: practicá el plan, no operes con esto.');
  } else if (dataAgeMinutes !== null && dataAgeMinutes > 10) {
    status = 'STALE';
    reasons.push(`La lectura tiene ${dataAgeMinutes} minutos; demasiado vieja para operar.`);
  } else if (snapshot.marketOpen !== true) {
    status = 'CLOSED';
    reasons.push('Mercado cerrado: planificá la entrada y revalidá al abrir.');
  }
  const nextHighImpact = (snapshot.events || [])
    .map((event) => ({ ...event, days: daysUntil(event.date, now) }))
    .filter((event) => isNum(event.days) && event.days >= 0 && event.days <= 3 && event.impact === 'high')
    .sort((left, right) => left.days - right.days)[0];
  if (nextHighImpact && status === 'OPEN') {
    status = 'PRE_EVENT';
    reasons.push(`${nextHighImpact.label} en ${nextHighImpact.days === 0 ? 'hoy' : `${nextHighImpact.days} día(s)`}: la prima ya paga ese evento.`);
  }
  return { tradeable: status === 'OPEN', status, reasons, warnings, asOf: snapshot.asOf, dataAgeMinutes };
}

/* ------------------------------ Sesgo direccional -------------------------- */
function directionalBias(snapshot) {
  const technical = snapshot.technical || {};
  const tf = technical.timeframes || {};
  const vote = (trend) => (trend === 'bullish' ? 1 : trend === 'bearish' ? -1 : 0);
  const spot = snapshot.quote?.price;
  const components = [];
  const add = (key, label, points, detail) => {
    components.push({ key, label, points: round2(points), detail });
  };
  const d1 = vote(tf.d1?.trend); const m15 = vote(tf.m15?.trend); const m5 = vote(tf.m5?.trend);
  add('trend_d1', 'Tendencia diaria', d1 * 35, tf.d1?.trend || 'sin datos');
  add('trend_m15', 'Tendencia 15m', m15 * 20, tf.m15?.trend || 'sin datos');
  add('trend_m5', 'Tendencia 5m', m5 * 10, tf.m5?.trend || 'sin datos');
  const slope = tf.d1?.slopePct;
  add('slope', 'Pendiente D1', isNum(slope) ? clamp(slope / 2, -1, 1) * 10 : 0, isNum(slope) ? `${round2(slope)}% en 5 velas` : 'sin pendiente');
  const rsi = technical.rsi14 ?? tf.d1?.rsi14;
  add('rsi', 'RSI 14', isNum(rsi) ? clamp((rsi - 50) / 25, -1, 1) * 10 : 0, isNum(rsi) ? round2(rsi).toString() : 'sin RSI');
  const ema20 = technical.ema20 ?? tf.d1?.ema20;
  const ema50 = technical.ema50 ?? tf.d1?.ema50;
  add('ema', 'Precio vs EMAs', (isNum(spot) && isNum(ema20) ? (spot > ema20 ? 5 : -5) : 0) + (isNum(spot) && isNum(ema50) ? (spot > ema50 ? 5 : -5) : 0), 'EMA20/EMA50');
  const flowScore = snapshot.flow?.directionalScore;
  add('flow', 'Flujo institucional', isNum(flowScore) ? clamp(flowScore / 100, -1, 1) * 10 : 0, snapshot.flow?.direction || 'sin flujo');
  const total = components.reduce((sum, component) => sum + component.points, 0);
  const score = clamp((total / 105) * 100, -100, 100);
  return { score: round2(score), components };
}

/* ------------------------------- Setups ----------------------------------- */
function classifySetup({ side, bias, snapshot, atrPct }) {
  const technical = snapshot.technical || {};
  const tf = technical.timeframes || {};
  const spot = snapshot.quote?.price;
  const atr = technical.atr ?? tf.d1?.atr14 ?? 0;
  const bull = side === 'CALL';
  const wantTrend = bull ? 'bullish' : 'bearish';
  const aligned = tf.d1?.trend === wantTrend && tf.m15?.trend === wantTrend;
  if (isNum(atrPct) && atrPct <= 35 && Math.abs(bias) < 45) return 'SQUEEZE';
  if (aligned && Math.abs(bias) >= 45) return 'TREND';
  if (bull && tf.d1?.trend === 'bullish' && (technical.rsi14 ?? 50) >= 38 && (technical.rsi14 ?? 50) <= 58 && isNum(spot) && isNum(technical.ema20) && Math.abs(spot - technical.ema20) <= atr * 0.9) return 'PULLBACK';
  if (!bull && tf.d1?.trend === 'bearish' && (technical.rsi14 ?? 50) <= 62 && (technical.rsi14 ?? 50) >= 42 && isNum(spot) && isNum(technical.ema20) && Math.abs(spot - technical.ema20) <= atr * 0.9) return 'PULLBACK';
  const level = bull ? (technical.resistance ?? tf.d1?.resistance20) : (technical.support ?? tf.d1?.support20);
  if (isNum(level) && isNum(spot) && isNum(atr) && atr > 0 && Math.abs(spot - level) <= Math.max(atr * 0.8, spot * 0.006) && Math.abs(bias) >= 25) return 'BREAKOUT';
  if (Math.sign(bias) !== (bull ? 1 : -1) && Math.abs(bias) >= 20 && ((bull && (technical.rsi14 ?? 50) <= 35) || (!bull && (technical.rsi14 ?? 50) >= 65))) return 'REVERSAL';
  return Math.abs(bias) >= 35 ? 'TREND' : null;
}

/* --------------------------- Selección de contrato ------------------------ */
function buildCandidatePool({ snapshot, side, settings }) {
  const type = side === 'CALL' ? 'call' : 'put';
  const spot = snapshot.quote?.price;
  if (!isNum(spot)) return [];
  const pool = [];
  for (const expiration of snapshot.expirations || []) {
    const dte = dteFor(snapshot, expiration);
    if (!isNum(dte) || dte < settings.dteMin || dte > settings.dteMax) continue;
    const chain = optionChainFor(snapshot, expiration);
    const atm = (() => {
      const near = chain.filter((option) => isNum(option.strike)).map((option) => ({ ...option, distance: Math.abs(option.strike - spot) })).sort((left, right) => left.distance - right.distance).slice(0, 4);
      const ivs = near.map((option) => option.iv).filter((iv) => isNum(iv) && iv > 0.02);
      return ivs.length ? ivs.reduce((sum, iv) => sum + iv, 0) / ivs.length : null;
    })();
    for (const option of chain) {
      if (option.type !== type) continue;
      const bid = option.bid; const ask = option.ask;
      const mid = isNum(option.mid) ? option.mid : isNum(bid) && isNum(ask) ? (bid + ask) / 2 : null;
      if (!isNum(mid) || mid <= 0.03 || !isNum(bid) || !isNum(ask) || ask <= 0 || bid <= 0) continue;
      const spreadPct = ((ask - bid) / mid) * 100;
      const delta = Math.abs(option.delta ?? NaN);
      if (!isNum(delta) || delta < settings.deltaMin || delta > settings.deltaMax) continue;
      if ((option.openInterest ?? 0) < settings.minOpenInterest) continue;
      if ((option.volume ?? 0) < settings.minVolume) continue;
      if (spreadPct > settings.maxSpreadPct * 100) continue;
      const iv = isNum(option.iv) && option.iv > 0.02 && option.iv < 4 ? option.iv : atm;
      if (!isNum(iv)) continue;
      pool.push({ option, expiration, dte, mid, bid, ask, spreadPct, delta, iv, atm });
    }
  }
  return pool;
}

function pickCandidate(pool, { side, setup }) {
  const target = side === 'CALL' ? 0.55 : 0.5;
  const setupTarget = setup === 'PULLBACK' ? 0.45 : setup === 'SQUEEZE' ? 0.6 : setup === 'BREAKOUT' ? 0.58 : target;
  return [...pool].sort((left, right) => {
    const score = (candidate) => {
      const deltaPenalty = Math.abs(candidate.delta - setupTarget) * 40;
      const spreadPenalty = candidate.spreadPct * 1.6;
      const liquidityBonus = Math.min(10, Math.log10(1 + (candidate.option.openInterest || 0)) * 2.4);
      const dtePenalty = Math.abs(candidate.dte - (setup === 'SQUEEZE' ? 21 : 14)) * 0.8;
      return deltaPenalty + spreadPenalty + dtePenalty - liquidityBonus;
    };
    return score(left) - score(right);
  })[0];
}

/* ------------------------------ Construcción ------------------------------ */
function buildSignal({ snapshot, side, setup, bias, gate, candidate, ivProfile, settings, account, now }) {
  const spot = snapshot.quote.price;
  const { option, expiration, dte, mid, ask, spreadPct, delta, iv } = candidate;
  const type = side === 'CALL' ? 'call' : 'put';
  const dir = side === 'CALL' ? 1 : -1;
  const technical = snapshot.technical || {};
  const atr = isNum(technical.atr) ? technical.atr : isNum(snapshot.technical?.timeframes?.d1?.atr14) ? snapshot.technical.timeframes.d1.atr14 : spot * 0.02;
  const support = technical.support ?? technical.timeframes?.d1?.support20 ?? spot - atr * 2;
  const resistance = technical.resistance ?? technical.timeframes?.d1?.resistance20 ?? spot + atr * 2;
  const trigger = side === 'CALL' ? Math.min(resistance, spot + atr * 0.5) : Math.max(support, spot - atr * 0.5);
  const invalidate = side === 'CALL' ? Math.min(support, trigger - atr * 1.1) : Math.max(resistance, trigger + atr * 1.1);
  const target1 = trigger + dir * atr * 1.0;
  const target2 = trigger + dir * atr * 2.1;
  const breakeven = side === 'CALL' ? option.strike + mid : option.strike - mid;
  const breakevenPct = ((breakeven - spot) / spot) * 100;
  const atmIvValue = candidate.atm ?? iv;
  const expected = expectedMove({ S: spot, sigma: atmIvValue ?? iv, dte });
  const dteAtTarget = Math.max(1, dte - 5);
  const priceAt = (underlying, remaining) => bsPrice({ type, S: underlying, K: option.strike, T: Math.max(1 / 365, remaining / 365), sigma: iv });
  const target1Price = priceAt(target1, dteAtTarget);
  const target2Price = priceAt(target2, dteAtTarget);
  const stopPrice = Math.max(0.01, round2(Math.max(mid * 0.62, Math.min(mid * 0.8, priceAt(invalidate, Math.max(1, dte - 2)) ?? mid * 0.62))));
  const rr = isNum(target1Price) ? (target1Price - mid) / Math.max(0.01, mid - stopPrice) : null;
  const pop = side === 'CALL'
    ? probAbove({ S: spot, threshold: breakeven, T: dte / 365, sigma: iv })
    : probBelow({ S: spot, threshold: breakeven, T: dte / 365, sigma: iv });
  const probTouch = pop === null ? null : clamp(pop * 1.85, 0, 0.97);
  const probTarget2 = side === 'CALL'
    ? probAbove({ S: spot, threshold: target2, T: dte / 365, sigma: iv })
    : probBelow({ S: spot, threshold: target2, T: dte / 365, sigma: iv });
  const riskPct = isNum(account?.riskPct) ? account.riskPct : settings.riskPct ?? 1.5;
  const equity = isNum(account?.sizeUsd) && account.sizeUsd > 0 ? account.sizeUsd : 0;
  const riskBudget = equity * (riskPct / 100);
  const costPerContract = mid * CONTRACT_SIZE;
  const fitsRisk = equity > 0 && riskBudget >= costPerContract;
  const contracts = equity > 0 ? (fitsRisk ? Math.floor(riskBudget / costPerContract) : 0) : 1;
  const maxLossUsd = round2(costPerContract * Math.max(1, contracts));
  const sizingNote = equity <= 0
    ? `Sin capital declarado. 1 contrato = ${round2(costPerContract)}.`
    : fitsRisk
      ? `${contracts} contrato(s) = ${round2(costPerContract * contracts)} de riesgo (${riskPct}% de ${Math.round(equity)}).`
      : `No entra en tu riesgo: 1 contrato cuesta ${round2(costPerContract)} y tu presupuesto es ${round2(riskBudget)}.`;

  const catalysts = (snapshot.events || [])
    .map((event) => ({ ...event, days: daysUntil(event.date, now) }))
    .filter((event) => isNum(event.days) && event.days >= 0 && event.days <= dte)
    .map(({ days, ...event }) => ({ ...event, days }));

  const ivVerdict = ivProfile?.verdict || 'SIN_REFERENCIA';
  const ivRatio = ivProfile?.rvRatio;
  const liquidityPoints = clamp((option.openInterest || 0) / 1200, 0, 1) * 8 + clamp((option.volume || 0) / 700, 0, 1) * 4 + (spreadPct <= 3 ? 3 : spreadPct <= 6 ? 1.5 : 0);
  const trendPoints = Math.sign(bias.score) === dir ? clamp((Math.abs(bias.score) - 25) / 40, 0, 1) * 25 : 0;
  const momentumPoints = (() => {
    const rsi = technical.rsi14 ?? 50;
    if (side === 'CALL') return clamp((rsi - 45) / 20, 0, 1) * 15;
    return clamp((55 - rsi) / 20, 0, 1) * 15;
  })();
  const rrPoints = isNum(rr) ? clamp((rr - 0.9) / 2.2, 0, 1) * 20 : 6;
  const ivPoints = ivVerdict === 'FAVORABLE' ? 10 : ivVerdict === 'NEUTRO' ? 6 : ivVerdict === 'CARO' ? 2 : 5;
  const flowPoints = snapshot.flow?.direction === (side === 'CALL' ? 'BULLISH' : 'BEARISH')
    ? clamp((snapshot.flow?.confidence ?? 40) / 100, 0, 1) * 8 : 0;
  const setupBonus = setup === 'TREND' ? 4 : setup === 'BREAKOUT' ? 3 : setup === 'SQUEEZE' ? 3 : setup === 'PULLBACK' ? 2 : -2;
  const eventPenalty = catalysts.some((event) => event.impact === 'high' && event.type === 'EARNINGS') ? 10
    : catalysts.some((event) => event.impact === 'high') ? 6 : catalysts.some((event) => event.impact === 'medium') ? 2 : 0;
  const score = Math.round(clamp(trendPoints + momentumPoints + rrPoints + liquidityPoints + ivPoints + flowPoints + setupBonus - eventPenalty, 0, 100));
  const grade = gradeFor(score);

  const why = [
    { key: 'trend', label: 'Alineación de tendencia', value: `${Math.round(bias.score)}/100`, status: Math.sign(bias.score) === dir && Math.abs(bias.score) >= 30 ? 'pos' : 'neutral', detail: `D1 ${snapshot.technical?.timeframes?.d1?.trend || '—'} · 15m ${snapshot.technical?.timeframes?.m15?.trend || '—'} · 5m ${snapshot.technical?.timeframes?.m5?.trend || '—'}` },
    { key: 'momentum', label: 'Momentum', value: `RSI ${round2(technical.rsi14 ?? 0)}`, status: side === 'CALL' ? (technical.rsi14 ?? 50) >= 52 ? 'pos' : 'neutral' : (technical.rsi14 ?? 50) <= 48 ? 'pos' : 'neutral', detail: `Pendiente D1 ${round2(snapshot.technical?.timeframes?.d1?.slopePct ?? 0)}%` },
    { key: 'rr', label: 'Riesgo / beneficio', value: isNum(rr) ? `${round2(rr)} : 1` : '—', status: isNum(rr) && rr >= 1.5 ? 'pos' : isNum(rr) && rr >= 1 ? 'neutral' : 'neg', detail: `objetivo ${round2(target1Price)} vs stop ${stopPrice}` },
    { key: 'liquidity', label: 'Liquidez', value: `OI ${Math.round(option.openInterest || 0)} · vol ${Math.round(option.volume || 0)}`, status: (option.openInterest || 0) >= 500 && spreadPct <= 6 ? 'pos' : (option.openInterest || 0) >= 150 ? 'neutral' : 'neg', detail: `spread ${round2(spreadPct)}%` },
    { key: 'iv', label: 'Volatilidad implícita', value: `IV ${round2(iv * 100)}% · ${ivVerdict}`, status: ivVerdict === 'FAVORABLE' ? 'pos' : ivVerdict === 'CARO' ? 'neg' : 'neutral', detail: isNum(ivRatio) ? `${round2(ivRatio)}x la realizada 20d` : 'sin referencia realizada' },
    { key: 'flow', label: 'Flujo inferido', value: `${snapshot.flow?.direction || '—'} (${snapshot.flow?.confidence ?? 0}%)`, status: flowPoints > 0 ? 'pos' : snapshot.flow?.direction === 'MIXED' ? 'neutral' : 'neg', detail: 'Volumen/OI, prima nocional y lado del último precio' },
    { key: 'events', label: 'Catalizadores', value: catalysts.length ? catalysts.map((event) => `${event.label} (${event.days}d)`).join(' · ') : 'sin eventos en el vencimiento', status: eventPenalty >= 10 ? 'neg' : eventPenalty > 0 ? 'warn' : 'pos', detail: 'Earnings y macro dentro del vencimiento' }
  ];

  const risks = [];
  if (catalysts.some((event) => event.type === 'EARNINGS')) risks.push('Hay earnings dentro del vencimiento: la IV puede colapsar después del reporte y la opción perder valor aunque el precio se mueva.');
  if (ivVerdict === 'CARO') risks.push('La prima está cara contra la volatilidad realizada: hace falta un movimiento grande solo para recuperar el costo.');
  if (spreadPct > 5) risks.push(`Spread de ${round2(spreadPct)}%: pagar el ask completo puede complicar la salida.`);
  if (gate.status === 'CLOSED') risks.push('Mercado cerrado: el precio de apertura puede cambiar por completo la entrada.');
  if (gate.status === 'DEMO') risks.push('Datos simulados: no operar.');
  risks.push('Opción comprada: podés perder el 100% de la prima. El theta (débito diario de valor tiempo) juega en contra.');

  const scenarioExpiry = [-10, -5, -2, 0, 2, 5, 10].map((movePct) => {
    const underlying = spot * (1 + movePct / 100);
    const intrinsic = type === 'call' ? Math.max(0, underlying - option.strike) : Math.max(0, option.strike - underlying);
    const pnl = (intrinsic - mid) * CONTRACT_SIZE;
    return { movePct, spot: round2(underlying), pnlUsd: round2(pnl), pnlPct: round2((pnl / costPerContract) * 100) };
  });
  const scenarioNow = optionScenarios({ type, strike: option.strike, entry: mid, spot, dte, iv });

  const ivContext = {
    atmIv: round2(atmIvValue ?? iv),
    rvRatio: isNum(ivRatio) ? round2(ivRatio) : null,
    verdict: ivVerdict,
    note: ivProfile?.label || 'Sin referencia de volatilidad realizada.',
    term: (ivProfile?.term || []).map((row) => ({ dte: row.dte, expiration: row.expiration, iv: round2(row.iv) })),
    skew25d: ivProfile?.skew25d?.value ?? null
  };

  const contractLine = `${snapshot.symbol} ${expiration} ${side === 'CALL' ? 'C' : 'P'} ${option.strike}`;
  const planTargets = [
    { label: 'Objetivo 1', price: round2(target1Price), exitPct: 50, underlying: round2(target1) },
    { label: 'Objetivo 2', price: round2(target2Price), exitPct: 100, underlying: round2(target2) }
  ];
  const copy = [
    `🎯 ${snapshot.symbol} ${side} · ${setup} · ${grade} (${score}/100)`,
    contractLine + ` · ${dte}d`,
    `Prima: $${round2(mid)} (mid) · entrada máx $${round2(ask)}`,
    `Breakeven: $${round2(breakeven)} (${breakevenPct >= 0 ? '+' : ''}${round2(breakevenPct)}% del spot)`,
    `Objetivos: $${round2(target1Price)} / $${round2(target2Price)} (subyacente $${round2(target1)} / $${round2(target2)})`,
    `Stop: $${stopPrice} · invalida si el subyacente pierde $${round2(invalidate)}`,
    `POP modelo: ${round2((pop ?? 0) * 100)}% · tocar breakeven: ${round2((probTouch ?? 0) * 100)}%`,
    `Tamaño: ${sizingNote}`,
    `Plan: entrada limit $${round2(mid)}; vender 50% en objetivo 1; salir a los ${settings.timeStopDays} días si no avanza; stop ${round2((1 - stopPrice / mid) * 100)}% de la prima.`,
    gate.tradeable ? '' : `⚠️ ${gate.reasons[0]}`,
    '⚠️ Probabilidad de modelo, no garantía. Verificá precio, spread y noticias en tu bróker.'
  ].filter(Boolean).join('\n');

  return {
    id: hashId(snapshot.symbol, side, expiration, option.strike, snapshot.asOf?.slice(0, 10) ?? ''),
    kind: 'NITO_CP',
    symbol: snapshot.symbol,
    side,
    setup,
    asOf: snapshot.asOf,
    score,
    grade,
    confidence: score,
    contract: {
      occ: option.symbol || null,
      expiration,
      dte,
      strike: option.strike,
      type,
      bid: round2(option.bid),
      ask: round2(option.ask),
      mid: round2(mid),
      entry: round2(mid),
      spreadPct: round2(spreadPct),
      delta: round2(option.delta ?? delta * (side === 'CALL' ? 1 : -1)),
      gamma: round2(option.gamma),
      theta: round2(option.theta),
      vega: round2(option.vega),
      iv: round2(iv),
      ivPct: round2(iv * 100),
      intrinsic: round2(Math.max(0, side === 'CALL' ? spot - option.strike : option.strike - spot)),
      extrinsic: round2(Math.max(0, mid - Math.max(0, side === 'CALL' ? spot - option.strike : option.strike - spot))),
      oi: Math.round(option.openInterest || 0),
      volume: Math.round(option.volume || 0),
      volOiRatio: round2((option.volume || 0) / Math.max(1, option.openInterest || 1)),
      breakeven: round2(breakeven),
      breakevenPct: round2(breakevenPct),
      moneyness: Math.abs(option.strike - spot) / spot < 0.005 ? 'ATM' : (side === 'CALL' ? option.strike < spot : option.strike > spot) ? 'ITM' : 'OTM'
    },
    levels: {
      trigger: round2(trigger),
      invalidate: round2(invalidate),
      target1: round2(target1),
      target2: round2(target2),
      stopOption: stopPrice,
      support: round2(support),
      resistance: round2(resistance),
      atr: round2(atr),
      em1sd: expected ? round2(expected.sigmaUsd) : null
    },
    probabilities: {
      pop: pop === null ? null : round2(pop),
      probTouch: probTouch === null ? null : round2(probTouch),
      probTarget2: probTarget2 === null ? null : round2(probTarget2),
      probStop: pop === null ? null : round2(clamp(1 - pop, 0, 1)),
      basis: 'lognormal-risk-neutral'
    },
    scenario: { now: scenarioNow, expiry: scenarioExpiry },
    plan: {
      entryLimit: round2(mid),
      maxEntry: round2(ask),
      stopPrice,
      targets: planTargets,
      timeStopDays: settings.timeStopDays,
      contracts: equity > 0 ? contracts : null,
      maxLossUsd,
      riskPct,
      sizingNote,
      rr: isNum(rr) ? round2(rr) : null,
      management: [
        `Entrar solo con precio ≤ $${round2(ask)}; si abre con gap, revalidar.`,
        `Vender la mitad en objetivo 1 ($${round2(target1Price)}) y subir el stop a costo.`,
        `Cerrar todo en objetivo 2 o en el stop ($${stopPrice}).`,
        `Cierre por tiempo: ${settings.timeStopDays} días sin avance.`,
        'Si el subyacente cruza el nivel de invalidación, salir aunque la prima no toque el stop.'
      ]
    },
    why,
    risks,
    catalysts,
    ivContext,
    levelsForChart: [round2(trigger), round2(target1), round2(target2), round2(invalidate)],
    copy,
    narrative: {
      thesis: `${snapshot.symbol} muestra un sesgo ${side === 'CALL' ? 'alcista' : 'bajista'} de ${Math.round(Math.abs(bias.score))}/100 con setup ${setup}. Se compra ${side} ${option.strike} a ${dte} días buscando que el subyacente alcance $${round2(target1)}.`,
      entry: `Entrada limitada a $${round2(mid)} (mid); no perseguir por encima de $${round2(ask)}. La confirmación es cerrar la vela de 15m del lado del sesgo.`,
      risk: `La idea se invalida si el subyacente pierde $${round2(invalidate)}. En ese caso el stop de prima es $${stopPrice} y el riesgo máximo por contrato es $${round2(costPerContract)}.`,
      management: `Tomar 50% en $${round2(target1Price)}, el resto en $${round2(target2Price)} o al vencer. Con ${settings.timeStopDays} días sin movimiento, cerrar para no pagar theta.`
    },
    meta: {
      method: 'Black-Scholes + lognormal neutral al riesgo; sesgo por tendencias/momentum/flujo; contrato elegido por delta, liquidez y spread.',
      warnings: gate.reasons,
      stale: gate.status === 'STALE',
      simulated: Boolean(snapshot.simulated),
      asOf: snapshot.asOf,
      dataAgeMinutes: gate.dataAgeMinutes,
      operable: gate.tradeable,
      spot: round2(spot)
    }
  };
}

/* --------------------------------- API ------------------------------------ */
export function buildDirectionalSignals({ snapshot, settings = {}, account = {} } = {}) {
  const resolved = {
    dteMin: settings.dteMin ?? 7,
    dteMax: settings.dteMax ?? 35,
    deltaMin: settings.deltaMin ?? 0.33,
    deltaMax: settings.deltaMax ?? 0.72,
    minOpenInterest: settings.minOpenInterest ?? 100,
    minVolume: settings.minVolume ?? 10,
    maxSpreadPct: settings.maxSpreadPct ?? 0.18,
    maxSignals: settings.maxSignals ?? 3,
    riskPct: settings.riskPct ?? 1.5,
    timeStopDays: settings.timeStopDays ?? 5,
    side: ['call', 'put', 'both'].includes(settings.side) ? settings.side : 'both'
  };
  if (!snapshot?.quote?.price) {
    return { gate: { tradeable: false, status: 'NO_DATA', reasons: ['Sin cotización.'], warnings: [], asOf: snapshot?.asOf ?? null, dataAgeMinutes: null }, signals: [] };
  }
  const now = Date.now();
  const gate = buildGate(snapshot, now);
  const bias = directionalBias(snapshot);
  const atrPct = atrPercentile(snapshot.history);
  const ivProfile = buildIvProfile(snapshot);
  const sides = resolved.side === 'both' ? ['CALL', 'PUT'] : [resolved.side === 'call' ? 'CALL' : 'PUT'];
  const signals = [];
  const notes = [];

  for (const side of sides) {
    const dir = side === 'CALL' ? 1 : -1;
    if (Math.sign(bias.score) !== dir || Math.abs(bias.score) < 30) {
      notes.push(`${side}: el sesgo no alcanza (${Math.round(bias.score)}/100).`);
      continue;
    }
    const setup = classifySetup({ side, bias: bias.score, snapshot, atrPct });
    if (!setup) { notes.push(`${side}: sin setup claro.`); continue; }
    const pool = buildCandidatePool({ snapshot, side, settings: resolved });
    if (!pool.length) { notes.push(`${side}: ningún contrato pasó liquidez/delta/spread.`); continue; }
    const candidate = pickCandidate(pool, { side, setup });
    if (!candidate) continue;
    const signal = buildSignal({ snapshot, side, setup, bias, gate, candidate, ivProfile, settings: resolved, account, now });
    if (!Number.isFinite(signal.plan.rr) || signal.plan.rr < 1) {
      notes.push(`${side}: relación riesgo/beneficio insuficiente (${Number.isFinite(signal.plan.rr) ? signal.plan.rr.toFixed(2) : '—'}).`);
      continue;
    }
    if (signal.score >= 45) signals.push(signal);
    else notes.push(`${side}: score ${signal.score} por debajo del mínimo.`);
  }

  signals.sort((left, right) => right.score - left.score);
  const limited = signals.slice(0, resolved.maxSignals);
  return {
    gate: { ...gate, notes },
    signals: limited,
    meta: {
      bias: bias.score,
      components: bias.components,
      atrPercentile: atrPct === null ? null : round2(atrPct),
      iv: ivProfile,
      evaluated: sides.length,
      accepted: limited.length,
      skipped: notes
    }
  };
}