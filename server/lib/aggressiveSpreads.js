/**
 * 5M · Spreads agresivos.
 *
 * Construye estructuras con prima real de la cadena, calcula resultado numérico
 * al vencimiento, POP, EV, stress de precio e IV, y publica un plan de gestión.
 * "Agresivo" = más delta vendido, menos días y más crédito por ancho.
 */
import { createHash } from 'node:crypto';
import { optionChainFor, dteFor } from './marketData.js';
import {
  probabilityOfProfit, breakevens, stressTest, atmIvFor, round2, clamp, CONTRACT_SIZE
} from './optionsMath.js';

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const hashId = (...parts) => createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
const gradeFor = (score) => (score >= 86 ? 'A+' : score >= 76 ? 'A' : score >= 62 ? 'B' : 'C');

const LABELS = {
  BULL_PUT_CREDIT: 'Bull put spread',
  BEAR_CALL_CREDIT: 'Bear call spread',
  IRON_CONDOR: 'Iron condor',
  IRON_FLY: 'Iron fly',
  JADE_LIZARD: 'Jade lizard',
  BROKEN_WING_PUT: 'Broken wing put',
  CALL_DEBIT: 'Debit call spread',
  PUT_DEBIT: 'Debit put spread'
};

const PROFILE_FALLBACK = {
  standard: { dteMin: 21, dteMax: 45, shortDeltaMin: 0.16, shortDeltaMax: 0.3, minCreditWidth: 0.18, maxWidthPct: 0.05, minOpenInterest: 150, maxSpreadPct: 0.22 },
  aggressive: { dteMin: 9, dteMax: 28, shortDeltaMin: 0.26, shortDeltaMax: 0.42, minCreditWidth: 0.24, maxWidthPct: 0.065, minOpenInterest: 100, maxSpreadPct: 0.3 },
  max: { dteMin: 5, dteMax: 16, shortDeltaMin: 0.36, shortDeltaMax: 0.55, minCreditWidth: 0.3, maxWidthPct: 0.08, minOpenInterest: 60, maxSpreadPct: 0.4 }
};

function resolveProfile(profile, settings) {
  const key = String(profile || 'aggressive').toLowerCase();
  const fromSettings = settings?.profiles?.[key];
  const base = fromSettings || PROFILE_FALLBACK[key] || PROFILE_FALLBACK.aggressive;
  return { key, ...PROFILE_FALLBACK[key], ...base };
}

function liquid(option, profile) {
  if (!option) return false;
  if (!isNum(option.bid) || !isNum(option.ask) || option.bid <= 0 || option.ask <= 0) return false;
  if ((option.openInterest || 0) < profile.minOpenInterest) return false;
  const mid = (option.bid + option.ask) / 2;
  if (!(mid > 0)) return false;
  return ((option.ask - option.bid) / mid) <= profile.maxSpreadPct;
}

function midOf(option) { return option ? round2((option.bid + option.ask) / 2) : null; }

function pickByDelta(chain, type, targetDelta, band = 0.12) {
  const candidates = chain.filter((option) => option.type === type && isNum(option.delta) && isNum(option.strike))
    .map((option) => ({ option, delta: Math.abs(option.delta) }))
    .filter((entry) => Math.abs(entry.delta - targetDelta) <= band)
    .sort((left, right) => Math.abs(left.delta - targetDelta) - Math.abs(right.delta - targetDelta));
  return candidates[0]?.option || null;
}

function pickStrikeNear(chain, type, strike) {
  return chain.filter((option) => option.type === type && isNum(option.strike))
    .sort((left, right) => Math.abs(left.strike - strike) - Math.abs(right.strike - strike))[0] || null;
}

function payoffAt(legs, spot) {
  return legs.reduce((total, leg) => {
    const intrinsic = leg.type === 'call' ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
    return total + (leg.action === 'SELL' ? -1 : 1) * (intrinsic - leg.price) * CONTRACT_SIZE * (leg.quantity ?? 1);
  }, 0);
}

function payoffRange(legs, spot) {
  const low = spot * 0.6; const high = spot * 1.4; const step = (high - low) / 300;
  let maxProfit = -Infinity; let maxLoss = Infinity;
  for (let price = low; price <= high; price += step) {
    const pnl = payoffAt(legs, price);
    maxProfit = Math.max(maxProfit, pnl);
    maxLoss = Math.min(maxLoss, pnl);
  }
  return { maxProfit: round2(maxProfit), maxLoss: round2(maxLoss), low: round2(low), high: round2(high) };
}

function legOf(option, action) {
  return {
    action, type: option.type, strike: option.strike,
    price: midOf(option), delta: round2(option.delta), iv: round2(option.iv),
    oi: Math.round(option.openInterest || 0), volume: Math.round(option.volume || 0), symbol: option.symbol || null
  };
}

function widthsFor(spot) {
  const steps = [0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06];
  return steps.map((pct) => Math.max(0.5, Math.round(spot * pct * 2) / 2));
}

/* -------------------------------- estrategias ----------------------------- */
function buildCreditVertical({ snapshot, expiration, dte, profile, chain, spot, type, side }) {
  const calls = type === 'call';
  const targetDelta = calls ? (profile.shortDeltaMin + profile.shortDeltaMax) / 2 + 0.02 : (profile.shortDeltaMin + profile.shortDeltaMax) / 2;
  const shortOption = pickByDelta(chain, type, targetDelta);
  if (!shortOption || !liquid(shortOption, profile)) return [];
  const ideas = [];
  const seen = new Set();
  for (const width of widthsFor(spot)) {
    const longStrike = calls ? shortOption.strike + width : shortOption.strike - width;
    if (longStrike <= 0) continue;
    const longOption = pickStrikeNear(chain, type, longStrike);
    if (!longOption || longOption.strike === shortOption.strike || !liquid(longOption, profile)) continue;
    if (seen.has(longOption.strike)) continue;
    seen.add(longOption.strike);
    const actualWidth = Math.abs(longOption.strike - shortOption.strike);
    const credit = round2(midOf(shortOption) - midOf(longOption));
    if (!isNum(credit) || credit < Math.max(0.05, profile.minCreditWidth * actualWidth)) continue;
    const legs = [legOf(shortOption, 'SELL'), legOf(longOption, 'BUY')];
    const payoff = payoffRange(legs, spot);
    const pop = probabilityOfProfit({ legs, spot, dte, atmIv: atmIvFor({ chain, spot }) ?? 0.3, low: payoff.low, high: payoff.high });
    if (!isNum(pop) || pop < 0.4) continue;
    ideas.push({ legs, credit, width: actualWidth, payoff, pop, shortOption, longOption });
  }
  return ideas.slice(0, 2);
}

function buildIronCondor({ chain, spot, dte, profile, withBody = false }) {
  const putShort = pickByDelta(chain, 'put', (profile.shortDeltaMin + profile.shortDeltaMax) / 2);
  const callShort = pickByDelta(chain, 'call', (profile.shortDeltaMin + profile.shortDeltaMax) / 2);
  if (!putShort || !callShort || !liquid(putShort, profile) || !liquid(callShort, profile)) return [];
  const results = [];
  for (const width of widthsFor(spot).slice(0, 5)) {
    const putLong = pickStrikeNear(chain, 'put', putShort.strike - width);
    const callLong = pickStrikeNear(chain, 'call', callShort.strike + width);
    if (!putLong || !callLong || putLong.strike >= putShort.strike || callLong.strike <= callShort.strike) continue;
    const legs = [legOf(putShort, 'SELL'), legOf(putLong, 'BUY'), legOf(callShort, 'SELL'), legOf(callLong, 'BUY')];
    const credit = round2(midOf(putShort) + midOf(callShort) - midOf(putLong) - midOf(callLong));
    if (!isNum(credit) || credit <= 0.05) continue;
    const payoff = payoffRange(legs, spot);
    const pop = probabilityOfProfit({ legs, spot, dte, atmIv: atmIvFor({ chain, spot }) ?? 0.3, low: payoff.low, high: payoff.high });
    if (!isNum(pop) || pop < 0.45) continue;
    results.push({ legs, credit, width: Math.abs(putLong.strike - putShort.strike), payoff, pop, strategy: 'IRON_CONDOR' });
    if (results.length >= 2) break;
  }
  void withBody;
  return results;
}

function buildIronFly({ chain, spot, dte, profile }) {
  const callShort = pickStrikeNear(chain, 'call', spot);
  const putShort = pickStrikeNear(chain, 'put', spot);
  if (!callShort || !putShort || !liquid(callShort, profile) || !liquid(putShort, profile)) return [];
  const results = [];
  for (const width of widthsFor(spot).slice(0, 4)) {
    const callLong = pickStrikeNear(chain, 'call', callShort.strike + width);
    const putLong = pickStrikeNear(chain, 'put', putShort.strike - width);
    if (!callLong || !putLong) continue;
    const legs = [legOf(callShort, 'SELL'), legOf(putShort, 'SELL'), legOf(callLong, 'BUY'), legOf(putLong, 'BUY')];
    const credit = round2(midOf(callShort) + midOf(putShort) - midOf(callLong) - midOf(putLong));
    if (!isNum(credit) || credit <= 0.1) continue;
    const payoff = payoffRange(legs, spot);
    const pop = probabilityOfProfit({ legs, spot, dte, atmIv: atmIvFor({ chain, spot }) ?? 0.3, low: payoff.low, high: payoff.high });
    if (!isNum(pop) || pop < 0.4) continue;
    results.push({ legs, credit, width: Math.abs(callLong.strike - callShort.strike), payoff, pop, strategy: 'IRON_FLY' });
    if (results.length >= 2) break;
  }
  return results;
}

function buildJadeLizard({ chain, spot, dte, profile }) {
  const putShort = pickByDelta(chain, 'put', (profile.shortDeltaMin + profile.shortDeltaMax) / 2);
  const callShort = pickByDelta(chain, 'call', profile.shortDeltaMin);
  if (!putShort || !callShort || !liquid(putShort, profile) || !liquid(callShort, profile)) return [];
  const results = [];
  for (const width of widthsFor(spot).slice(0, 4)) {
    const callLong = pickStrikeNear(chain, 'call', callShort.strike + width);
    if (!callLong) continue;
    const legs = [legOf(putShort, 'SELL'), legOf(callShort, 'SELL'), legOf(callLong, 'BUY')];
    const credit = round2(midOf(putShort) + midOf(callShort) - midOf(callLong));
    const callWidth = Math.abs(callLong.strike - callShort.strike);
    if (!isNum(credit) || credit <= callWidth) continue; // sin riesgo en el ala superior
    const payoff = payoffRange(legs, spot);
    const pop = probabilityOfProfit({ legs, spot, dte, atmIv: atmIvFor({ chain, spot }) ?? 0.3, low: payoff.low, high: payoff.high });
    if (!isNum(pop) || pop < 0.5) continue;
    results.push({ legs, credit, width: callWidth, payoff, pop, strategy: 'JADE_LIZARD' });
  }
  return results.slice(0, 2);
}

function buildBrokenWing({ chain, spot, dte, profile }) {
  const putShort = pickByDelta(chain, 'put', (profile.shortDeltaMin + profile.shortDeltaMax) / 2);
  if (!putShort || !liquid(putShort, profile)) return [];
  const results = [];
  for (const width of widthsFor(spot).slice(0, 4)) {
    const putLong = pickStrikeNear(chain, 'put', putShort.strike - width * 2);
    if (!putLong || putLong.strike >= putShort.strike) continue;
    const legs = [legOf(putShort, 'SELL'), legOf(putLong, 'BUY')];
    const credit = round2(midOf(putShort) - midOf(putLong));
    if (!isNum(credit) || credit <= 0.2) continue;
    const payoff = payoffRange(legs, spot);
    const pop = probabilityOfProfit({ legs, spot, dte, atmIv: atmIvFor({ chain, spot }) ?? 0.3, low: payoff.low, high: payoff.high });
    if (!isNum(pop) || pop < 0.45) continue;
    results.push({ legs, credit, width: Math.abs(putLong.strike - putShort.strike), payoff, pop, strategy: 'BROKEN_WING_PUT' });
  }
  return results.slice(0, 2);
}

function buildDebitVertical({ chain, spot, dte, profile, calls }) {
  const target = calls ? 0.55 : 0.55;
  const longOption = pickByDelta(chain, calls ? 'call' : 'put', target, 0.15);
  if (!longOption || !liquid(longOption, profile)) return [];
  const results = [];
  for (const width of widthsFor(spot).slice(0, 4)) {
    const shortStrike = calls ? longOption.strike + width : longOption.strike - width;
    const shortOption = pickStrikeNear(chain, calls ? 'call' : 'put', shortStrike);
    if (!shortOption || shortOption.strike === longOption.strike || shortOption.strike <= 0) continue;
    const legs = [legOf(longOption, 'BUY'), legOf(shortOption, 'SELL')];
    const debit = round2(midOf(longOption) - midOf(shortOption));
    if (!isNum(debit) || debit <= 0.05) continue;
    const payoff = payoffRange(legs, spot);
    const pop = probabilityOfProfit({ legs, spot, dte, atmIv: atmIvFor({ chain, spot }) ?? 0.3, low: payoff.low, high: payoff.high });
    if (!isNum(pop) || pop < 0.35) continue;
    results.push({ legs, credit: -debit, width: Math.abs(shortOption.strike - longOption.strike), payoff, pop, strategy: calls ? 'CALL_DEBIT' : 'PUT_DEBIT' });
    break;
  }
  return results;
}

/* ------------------------------ ensamblado -------------------------------- */
function assemble({ snapshot, expiration, dte, profile, entry, spot, chain }) {
  const { legs, payoff, pop, strategy } = entry;
  const credit = entry.credit;
  const isDebit = credit < 0;
  const debit = Math.abs(credit);
  const maxProfit = payoff.maxProfit;
  const maxLoss = Math.abs(Math.min(0, payoff.maxLoss));
  if (!isNum(maxProfit) || !isNum(maxLoss) || maxLoss < 1) return null;
  const bes = breakevens({ legs, low: payoff.low, high: payoff.high });
  const evUsd = isNum(pop) ? round2(pop * maxProfit - (1 - pop) * maxLoss) : null;
  const atmIv = atmIvFor({ chain, spot }) ?? 0.3;
  const stress = [-0.1, -0.05, -0.02, 0, 0.02, 0.05, 0.1].map((move) => {
    const underlying = spot * (1 + move);
    return { label: `${Math.round(move * 100)}%`, movePct: Math.round(move * 100), spot: round2(underlying), pnlUsd: round2(payoffAt(legs, underlying)) };
  });
  const ivCrush = stressTest({ legs, spot, dte, atmIv, moves: [0], ivShift: -0.2 })?.[0]?.pnlUsd ?? null;
  void stressTest;
  const widthDollars = Math.abs((legs.find((leg) => leg.action === 'SELL')?.strike ?? 0) - (legs.find((leg) => leg.action === 'BUY')?.strike ?? 0));
  const creditWidthPct = widthDollars > 0 ? ((isDebit ? debit : credit) / widthDollars) * 100 : null;
  const liquidityScore = Math.min(15, Math.log10(1 + legs.reduce((sum, leg) => sum + (leg.oi || 0), 0)) * 3);
  const popPoints = clamp((pop - 0.35) / 0.45, 0, 1) * 28;
  const creditPoints = clamp((creditWidthPct ?? 0) / 45, 0, 1) * 22;
  const rrPoints = clamp((maxProfit / Math.max(1, maxLoss)) / 0.9, 0, 1) * 15;
  const trendAligned = strategy.includes('BULL') ? snapshot.technical?.trend === 'bullish' : strategy.includes('BEAR') ? snapshot.technical?.trend === 'bearish' : true;
  const trendPoints = trendAligned ? 10 : 3;
  const ivPoints = atmIv > 0.65 ? 2 : atmIv > 0.45 ? 6 : 9;
  const score = Math.round(clamp(popPoints + creditPoints + rrPoints + liquidityScore + trendPoints + ivPoints, 0, 100));
  const aggressive = profile.key === 'max' ? 'MAXIMO' : profile.key === 'aggressive' ? 'AGRESIVO' : 'ESTANDAR';
  const stopCreditMultiple = isDebit ? null : 2;
  const planExits = isDebit
    ? [
      { label: 'Objetivo', when: '50% del débito ganado', price: round2(debit * 1.5) },
      { label: 'Stop', when: 'débito pierde 45%', price: round2(debit * 0.55) },
      { label: 'Tiempo', when: `cierre si dte ≤ ${Math.max(2, profile.dteMin)}`, price: null }
    ]
    : [
      { label: 'Ganancia', when: '50% del crédito', price: round2(credit * 0.5) },
      { label: 'Stop', when: 'crédito se duplica', price: round2(credit * 2) },
      { label: 'Tiempo', when: 'cierre si dte ≤ 7', price: null }
    ];
  const why = [
    { label: 'POP modelo', value: `${round2(pop * 100)}%`, status: pop >= 0.6 ? 'pos' : pop >= 0.5 ? 'neutral' : 'neg' },
    { label: 'Crédito / ancho', value: creditWidthPct === null ? '—' : `${round2(creditWidthPct)}%`, status: creditWidthPct >= 30 ? 'pos' : creditWidthPct >= 20 ? 'neutral' : 'neg' },
    { label: 'Riesgo / beneficio', value: `${round2(maxLoss)} / ${round2(maxProfit)}`, status: maxProfit >= maxLoss ? 'pos' : 'neutral' },
    { label: 'Tendencia', value: snapshot.technical?.trend || '—', status: trendAligned ? 'pos' : 'warn' },
    { label: 'IV ATM', value: `${round2(atmIv * 100)}%`, status: atmIv > 0.6 ? 'warn' : 'pos' }
  ];
  const label = LABELS[strategy] || strategy;
  const copy = [
    `⚡ ${snapshot.symbol} · ${label} · ${aggressive} · ${gradeFor(score)}`,
    `Vencimiento ${expiration} (${dte}d) · ${legs.length} patas`,
    legs.map((leg) => `${leg.action === 'SELL' ? 'VENDE' : 'COMPRA'} ${leg.type.toUpperCase()} ${leg.strike} @ ${leg.price}`).join('\n'),
    isDebit ? `Débito: $${round2(debit)} · máx ganancia $${round2(maxProfit)} · máx pérdida $${round2(maxLoss)}`
      : `Crédito: $${round2(credit)} · máx ganancia $${round2(maxProfit)} · máx pérdida $${round2(maxLoss)}`,
    bes.length ? `Breakevens: ${bes.map((value) => `$${value}`).join(' / ')}` : 'Sin breakeven en el rango',
    `POP modelo: ${round2(pop * 100)}% · EV $${round2(evUsd)}`,
    `Plan: ${planExits.map((exit) => `${exit.label}: ${exit.when}`).join(' · ')}`,
    '⚠️ Spread agresivo: riesgo de asignación y de ampliación. Verificá liquidez y márgenes en el bróker.'
  ].join('\n');
  return {
    id: hashId(snapshot.symbol, strategy, expiration, legs.map((leg) => leg.strike).join('-'), snapshot.asOf?.slice(0, 10) ?? ''),
    symbol: snapshot.symbol,
    strategy,
    label,
    direction: ({ BULL_PUT_CREDIT: 'BULLISH', BEAR_CALL_CREDIT: 'BEARISH', CALL_DEBIT: 'BULLISH', PUT_DEBIT: 'BEARISH', BROKEN_WING_PUT: 'BULLISH', JADE_LIZARD: 'BULLISH' })[strategy] || 'NEUTRAL',
    aggression: aggressive,
    score,
    grade: gradeFor(score),
    expiration,
    dte,
    legs,
    pricing: {
      credit: round2(credit),
      debit: isDebit ? round2(debit) : null,
      width: round2(widthDollars),
      creditWidthPct: creditWidthPct === null ? null : round2(creditWidthPct),
      maxProfitUsd: round2(maxProfit),
      maxLossUsd: round2(maxLoss),
      evUsd,
      evPerRisk: maxLoss > 0 && isNum(evUsd) ? round2(evUsd / maxLoss) : null,
      marginUsd: round2(maxLoss),
      commissionEst: round2(legs.length * 1.3)
    },
    risk: {
      beLow: bes[0] ?? null,
      beHigh: bes[1] ?? null,
      pop: round2(pop),
      probTouchShort: round2(Math.min(0.99, 1 - pop + 0.15)),
      stress,
      ivCrushPnlUsd: ivCrush,
      stopCreditMultiple
    },
    plan: { entryCredit: round2(credit), minCredit: round2(Math.abs(credit) * 0.9), exits: planExits, timeStopDte: 7, management: [
      `Entrar solo si el crédito es ≥ $${round2(Math.abs(credit) * 0.9)}.`,
      isDebit ? 'Salir al 50% de ganancia del débito o si pierde 45%.' : 'Cerrar al 50% del crédito máximo; stop si el crédito se duplica.',
      'Cerrar antes del último día para evitar asignación y gamma de vencimiento.',
      strategy === 'IRON_CONDOR' ? 'Si un ala se acerca, rolar el lado no probado para cobrar más crédito.' : 'Si el subyacente cruza el strike corto con volumen, evaluar cierre total.'
    ] },
    why,
    warnings: [
      'El POP es probabilidad de modelo, no certeza.',
      atmIv > 0.6 ? 'IV muy alta: el crédito es atractivo pero el movimiento en contra puede ser violento.' : '',
      'Verificá márgenes y asignación temprana en tu bróker.'
    ].filter(Boolean),
    copy,
    meta: { method: 'Payoff numérico al vencimiento + POP lognormal neutral al riesgo + stress de IV.', simulated: Boolean(snapshot.simulated), asOf: snapshot.asOf, profile: profile.key, spot: round2(spot), atmIv: round2(atmIv), expirations: snapshot.expirations || [] }
  };
}

export function buildSpreadIdeas({ snapshot, profile = 'aggressive', strategies = null, settings = {} } = {}) {
  if (!snapshot?.quote?.price) return { ideas: [], meta: { profile, warnings: ['Sin cotización.'] } };
  const spot = snapshot.quote.price;
  const resolved = resolveProfile(profile, settings);
  const wanted = Array.isArray(strategies) && strategies.length ? new Set(strategies) : null;
  const ideas = [];
  const warnings = [];
  let dteEvaluated = 0;
  for (const expiration of snapshot.expirations || []) {
    const dte = dteFor(snapshot, expiration);
    if (!isNum(dte) || dte < resolved.dteMin || dte > resolved.dteMax) continue;
    const chain = optionChainFor(snapshot, expiration);
    if (chain.length < 8) continue;
    dteEvaluated += 1;
    const push = (entries) => {
      for (const entry of entries) {
        if (wanted && !wanted.has(entry.strategy)) continue;
        const idea = assemble({ snapshot, expiration, dte, profile: resolved, entry, spot, chain });
        if (idea && idea.pricing.creditWidthPct !== null) {
          if (!(idea.pricing.maxLossUsd > 0)) continue;
          ideas.push(idea);
        }
      }
    };
    if (!wanted || wanted.has('BULL_PUT_CREDIT')) push(buildCreditVertical({ snapshot, expiration, dte, profile: resolved, chain, spot, type: 'put', side: 'bull' }).map((entry) => ({ ...entry, strategy: 'BULL_PUT_CREDIT' })));
    if (!wanted || wanted.has('BEAR_CALL_CREDIT')) push(buildCreditVertical({ snapshot, expiration, dte, profile: resolved, chain, spot, type: 'call', side: 'bear' }).map((entry) => ({ ...entry, strategy: 'BEAR_CALL_CREDIT' })));
    if (!wanted || wanted.has('IRON_CONDOR')) push(buildIronCondor({ chain, spot, dte, profile: resolved }));
    if (!wanted || wanted.has('IRON_FLY')) push(buildIronFly({ chain, spot, dte, profile: resolved }));
    if (!wanted || wanted.has('JADE_LIZARD')) push(buildJadeLizard({ chain, spot, dte, profile: resolved }));
    if (!wanted || wanted.has('BROKEN_WING_PUT')) push(buildBrokenWing({ chain, spot, dte, profile: resolved }));
    if (!wanted || wanted.has('CALL_DEBIT')) push(buildDebitVertical({ chain, spot, dte, profile: resolved, calls: true }));
    if (!wanted || wanted.has('PUT_DEBIT')) push(buildDebitVertical({ chain, spot, dte, profile: resolved, calls: false }));
  }
  if (!dteEvaluated) warnings.push(`No hay vencimientos entre ${resolved.dteMin} y ${resolved.dteMax} días.`);
  if (!ideas.length) warnings.push('Ninguna estructura superó los filtros de crédito, liquidez y POP.');
  const maxPerSymbol = Math.max(1, settings?.maxIdeasPerSymbol ?? 3);
  const bySymbol = new Map();
  for (const idea of ideas) {
    const list = bySymbol.get(idea.symbol) || [];
    list.push(idea);
    bySymbol.set(idea.symbol, list);
  }
  const selected = [...bySymbol.values()].flatMap((list) => list
    .sort((left, right) => right.score - left.score)
    .filter((idea, index, array) => array.findIndex((item) => item.strategy === idea.strategy) === index)
    .slice(0, maxPerSymbol))
    .sort((left, right) => right.score - left.score);
  return { ideas: selected, meta: { profile: resolved.key, simulated: Boolean(snapshot.simulated), asOf: snapshot.asOf, warnings, evaluated: ideas.length } };
}