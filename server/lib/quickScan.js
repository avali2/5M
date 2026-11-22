/**
 * 5M · Modo Rápido: convierte las señales ya calculadas en una lista accionable
 * de posiciones para revisar en segundos, con jerarquía clara.
 */
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const round2 = (value) => (isNum(value) ? Math.round(value * 100) / 100 : null);

function urgencyOf(score, dte) {
  if (!isNum(score)) return 'VIGILAR';
  if (score >= 74) return 'AHORA';
  if (score >= 62) return 'HOY';
  if (isNum(dte) && dte <= 10) return 'HOY';
  return 'VIGILAR';
}

function firstSentence(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const match = clean.match(/^(.{20,?}[.!?])\s/);
  const sentence = match ? match[1] : clean;
  return sentence.length > 150 ? sentence.slice(0, 147) + '…' : sentence;
}

function ranking(item) {
  let score = isNum(item.score) ? item.score : 0;
  if (isNum(item.pop) && item.pop >= 0.6) score += 4;
  if (isNum(item.dte) && item.dte >= 7 && item.dte <= 21) score += 3;
  if (item.kind === 'SPREAD') score += 2;
  if (item.meta?.operable === false) score -= 5;
  return score;
}

export function buildQuickScan({ items = [], limit = 5, now = new Date() } = {}) {
  const opportunities = [];
  const bySymbol = [];
  for (const item of items) {
    const { symbol, snapshot, nito, spreads } = item;
    const price = snapshot?.quote?.price;
    const symbolInfo = {
      symbol,
      price: isNum(price) ? round2(price) : null,
      gate: nito?.gate?.status || (snapshot?.simulated ? 'DEMO' : 'NO_DATA'),
      tradeable: Boolean(nito?.gate?.tradeable),
      bias: nito?.meta?.bias ?? null,
      signals: (nito?.signals || []).length,
      spreads: (spreads?.ideas || []).length,
      reasons: nito?.gate?.reasons || []
    };
    bySymbol.push(symbolInfo);
    if (!isNum(price)) continue;

    for (const signal of nito?.signals || []) {
      const tags = [signal.setup || 'SETUP', 'Grado ' + (signal.grade || 'C')];
      if (signal.meta?.operable === false) tags.push('Solo plan');
      if (isNum(signal.ivContext?.rvRatio) && signal.ivContext.rvRatio < 0.95) tags.push('IV barata');
      opportunities.push({
        id: signal.id,
        kind: signal.side,
        symbol,
        action: 'COMPRAR',
        score: signal.score,
        grade: signal.grade,
        urgency: urgencyOf(signal.score, signal.contract?.dte),
        spot: round2(price),
        contract: signal.contract,
        entry: signal.plan?.entryLimit,
        maxEntry: signal.plan?.maxEntry,
        stop: signal.plan?.stopPrice,
        target1: signal.plan?.targets?.[0]?.price ?? null,
        targetUnderlying: signal.plan?.targets?.[0]?.underlying ?? null,
        pop: signal.probabilities?.pop ?? null,
        expiry: signal.contract?.expiration ?? null,
        dte: signal.contract?.dte ?? null,
        riskUsd: signal.plan?.maxLossUsd ?? null,
        sizingNote: signal.plan?.sizingNote || '',
        thesis: firstSentence(signal.narrative?.thesis) || `${signal.setup} ${signal.side} en ${symbol}.`,
        copy: signal.copy || '',
        tags,
        meta: { operable: Boolean(signal.meta?.operable), simulated: Boolean(signal.meta?.simulated), asOf: signal.meta?.asOf }
      });
    }

    for (const idea of spreads?.ideas || []) {
      const debit = idea.pricing?.credit < 0;
      const tags = [idea.label, idea.aggression];
      if (idea.symbol && idea.dte <= 12) tags.push('Corto plazo');
      opportunities.push({
        id: idea.id,
        kind: 'SPREAD',
        strategy: idea.strategy,
        symbol,
        action: debit ? 'ABRIR DÉBITO' : 'ABRIR CRÉDITO',
        score: idea.score,
        grade: idea.grade,
        urgency: urgencyOf(idea.score, idea.dte),
        spot: idea.meta?.spot ?? round2(price),
        credit: idea.pricing?.credit ?? null,
        width: idea.pricing?.width ?? null,
        maxProfitUsd: idea.pricing?.maxProfitUsd ?? null,
        maxLossUsd: idea.pricing?.maxLossUsd ?? null,
        pop: idea.risk?.pop ?? null,
        expiry: idea.expiration,
        dte: idea.dte,
        legs: idea.legs || [],
        thesis: firstSentence(idea.why?.map((row) => `${row.label} ${row.value}`).join('. ')) || idea.label,
        copy: idea.copy || '',
        tags,
        meta: { operable: !Boolean(idea.meta?.simulated), simulated: Boolean(idea.meta?.simulated), asOf: idea.meta?.asOf }
      });
    }
  }

  opportunities.sort((left, right) => ranking(right) - ranking(left));
  const top = opportunities.slice(0, Math.max(1, limit));
  const marketOpen = items.some((item) => item.snapshot?.marketOpen === true);
  const simulated = items.some((item) => item.snapshot?.simulated);
  const eventsToday = [];
  for (const item of items) {
    for (const event of item.snapshot?.events || []) {
      if (String(event.date).slice(0, 10) === now.toISOString().slice(0, 10)) eventsToday.push({ symbol: item.symbol, ...event });
    }
  }
  const best = top[0] || null;
  const calls = top.filter((item) => item.kind === 'CALL').length;
  const puts = top.filter((item) => item.kind === 'PUT').length;
  const spreads = top.filter((item) => item.kind === 'SPREAD').length;
  const alerts = [];
  if (simulated) alerts.push({ tone: 'warn', text: 'Datos simulados: no operar.' });
  if (!marketOpen) alerts.push({ tone: 'info', text: 'Mercado cerrado: dejá las órdenes preparadas para la apertura.' });
  if (eventsToday.length) alerts.push({ tone: 'warn', text: 'Eventos hoy: ' + eventsToday.map((event) => `${event.symbol} ${event.label}`).join(' · ') });
  const summary = best
    ? `${best.kind === 'SPREAD' ? best.strategy + ' en ' : best.kind + ' en '}${best.symbol} (score ${Math.round(best.score)}): ${best.action.toLowerCase()} con riesgo ${best.riskUsd ? '$' + Math.round(best.riskUsd) : 'definido'}. ${marketOpen ? 'Mercado abierto.' : 'Mercado cerrado, solo planificación.'}`
    : 'Sin oportunidades que superen el filtro de calidad. Esperar también es una posición.';

  return {
    generatedAt: now.toISOString(),
    marketOpen,
    simulated,
    opportunities: top,
    counts: { total: opportunities.length, calls, puts, spreads },
    bySymbol,
    alerts,
    summary,
    empty: top.length === 0
  };
}
