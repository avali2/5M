/**
 * 5M · Investigación profunda para capitulación: noticias, niveles, estadística
 * condicional de rebotes y veredicto de estrategia.
 */
const newsCache = new Map();

function isNum(value) { return typeof value === 'number' && Number.isFinite(value); }
function round2(value) { return Math.round(value * 100) / 100; }

function sma(values, length) {
  const clean = values.filter(isNum);
  if (clean.length < length) return null;
  return clean.slice(-length).reduce((sum, value) => sum + value, 0) / length;
}

export async function getNews(symbol) {
  const key = 'news:' + symbol;
  const hit = newsCache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60000) return hit.value;
  try {
    const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(symbol + ' stock') + '&hl=en-US&gl=US&ceid=US:en';
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 5M/1.0' }, signal: AbortSignal.timeout(12000) });
    const text = await response.text();
    const items = text.split('<item>').slice(1, 6).map((block) => {
      const title = (block.match(/<title>(?:<!\[CDATA\[)?([^<]+)/) || [])[1];
      const date = (block.match(/<pubDate>([^<]+)/) || [])[1];
      return title ? { title: title.replace(/&amp;/g, '&').trim(), date: date || null } : null;
    }).filter(Boolean);
    newsCache.set(key, { at: Date.now(), value: items });
    return items;
  } catch { return []; }
}

export function conditionalStats(history) {
  const closes = (history || []).map((bar) => bar?.close).filter(isNum);
  if (closes.length < 80) return null;
  const samples = [];
  for (let index = 3; index < closes.length - 11; index += 1) {
    const dayDrop = (closes[index] / closes[index - 1] - 1) * 100;
    const twoDayDrop = (closes[index] / closes[index - 3] - 1) * 100;
    if (dayDrop <= -3.5 || twoDayDrop <= -7) {
      const fwd5 = (closes[index + 5] / closes[index] - 1) * 100;
      const fwd10 = (closes[index + 10] / closes[index] - 1) * 100;
      samples.push({ fwd5, fwd10 });
    }
  }
  if (samples.length < 3) return { samples: samples.length, probabilityUp5: null, median5: null, p25_5: null, probabilityUp10: null, median10: null, p25_10: null };
  const sorted5 = samples.map((sample) => sample.fwd5).sort((a, b) => a - b);
  const sorted10 = samples.map((sample) => sample.fwd10).sort((a, b) => a - b);
  const pct = (list, q) => list[Math.min(list.length - 1, Math.max(0, Math.floor(q * list.length)))];
  return {
    samples: samples.length,
    probabilityUp5: round2((samples.filter((sample) => sample.fwd5 > 0).length / samples.length) * 100),
    median5: round2(pct(sorted5, 0.5)), p25_5: round2(pct(sorted5, 0.25)),
    probabilityUp10: round2((samples.filter((sample) => sample.fwd10 > 0).length / samples.length) * 100),
    median10: round2(pct(sorted10, 0.5)), p25_10: round2(pct(sorted10, 0.25))
  };
}

export function priceLevels(snapshot) {
  const spot = snapshot?.quote?.price;
  const history = snapshot?.history || [];
  const closes = history.map((bar) => bar?.close).filter(isNum);
  const bars = history.filter((bar) => isNum(bar?.low) && isNum(bar?.high) && isNum(bar?.close));
  if (!isNum(spot) || closes.length < 30) return null;
  let atr = null;
  if (bars.length > 15) {
    const ranges = [];
    for (let index = 1; index < bars.length; index += 1) ranges.push(Math.max(bars[index].high - bars[index].low, Math.abs(bars[index].high - bars[index - 1].close), Math.abs(bars[index].low - bars[index - 1].close)));
    atr = ranges.slice(-14).reduce((sum, value) => sum + value, 0) / 14;
  }
  const lows20 = bars.slice(-20).map((bar) => bar.low);
  const lows60 = bars.slice(-60).map((bar) => bar.low);
  const low52 = bars.slice(-252).map((bar) => bar.low);
  const level = (label, value) => isNum(value) && value < spot ? { label, value: round2(value), distancePct: round2(((value / spot) - 1) * 100) } : null;
  const levels = [
    level('Mínimo 20d', Math.min(...lows20)),
    level('Mínimo 60d', Math.min(...lows60)),
    level('Mínimo 52s', low52.length ? Math.min(...low52) : null),
    level('SMA50', sma(closes, 50)),
    level('SMA200', sma(closes, 200)),
    level('2 ATR abajo', isNum(atr) ? spot - atr * 2 : null),
    level('3 ATR abajo', isNum(atr) ? spot - atr * 3 : null)
  ].filter(Boolean).sort((a, b) => b.value - a.value);
  return { spot: round2(spot), atr: isNum(atr) ? round2(atr) : null, sma20: round2(sma(closes, 20)), sma50: round2(sma(closes, 50)), sma200: round2(sma(closes, 200)), high52: bars.slice(-252).length ? round2(Math.max(...bars.slice(-252).map((bar) => bar.high))) : null, levels };
}

export async function researchCandidate(snapshot, candidate) {
  const [news] = await Promise.all([getNews(candidate.symbol)]);
  const stats = conditionalStats(snapshot?.history);
  const levels = priceLevels(snapshot);
  const ivRatio = candidate.ivRatio;
  let verdict = 'Vender el put spread con gestión';
  let tradeable = true;
  if (isNum(ivRatio) && ivRatio < 1) { verdict = 'Esperar: la IV no paga la prima (IV/RV < 1)'; tradeable = false; }
  else if (isNum(stats?.probabilityUp5) && stats.probabilityUp5 < 55) { verdict = 'Esperar: el rebote histórico es débil'; tradeable = false; }
  else if (isNum(candidate.rsi14) && candidate.rsi14 > 35) { verdict = 'Esperar a que el RSI baje de 35'; tradeable = false; }
  if (isNum(levels?.atr) && isNum(candidate.spot) && candidate.shortStrike > candidate.spot - levels.atr) { verdict = 'Strike corto demasiado cerca del dinero'; tradeable = false; }
  return { news: news.slice(0, 4), stats, levels, verdict, tradeable, expectedMovePct: isNum(candidate.atmIv) && candidate.dte ? round2(candidate.atmIv * Math.sqrt(candidate.dte / 365) * 100) : null };
}