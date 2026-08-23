import { finite, round } from './http.js';

function average(values = []) {
  const clean = values.map((value) => finite(value, null)).filter((value) => value !== null && value >= 0);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function sessionProgress(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: Number(part.value) }), {});
  const minute = (parts.hour * 60) + parts.minute;
  return Math.max(0.15, Math.min(1, (minute - 570) / 390));
}

function priceLocation(option) {
  const bid = finite(option?.bid, null);
  const ask = finite(option?.ask, null);
  const last = finite(option?.last, null);
  if (bid === null || ask === null || last === null || ask <= bid) return null;
  return Math.max(-1, Math.min(1, (((last - bid) / (ask - bid)) - 0.5) * 2));
}

function activity(option) {
  const volume = Math.max(0, finite(option?.volume, 0));
  const openInterest = Math.max(0, finite(option?.openInterest, 0));
  const mid = Math.max(0, finite(option?.mid, finite(option?.last, 0)));
  return {
    volume,
    openInterest,
    volumeOiRatio: openInterest > 0 ? volume / openInterest : volume > 0 ? 5 : 0,
    premiumNotional: volume * mid * 100
  };
}

export function analyzeInstitutionalFlow({ chain = [], quote = {}, history = [], technical = {}, now = new Date(), settings = {} } = {}) {
  const minimumVolume = Math.max(1, finite(settings.minimumUnusualVolume, 100));
  const minimumVolumeOi = Math.max(0.05, finite(settings.minimumVolumeOiRatio, 0.5));
  let callVolume = 0;
  let putVolume = 0;
  let callOpenInterest = 0;
  let putOpenInterest = 0;
  let pressureNumerator = 0;
  let pressureWeight = 0;
  let locatedVolume = 0;
  const unusual = [];

  for (const option of chain) {
    const stats = activity(option);
    const isCall = option?.type === 'call';
    if (isCall) {
      callVolume += stats.volume;
      callOpenInterest += stats.openInterest;
    } else {
      putVolume += stats.volume;
      putOpenInterest += stats.openInterest;
    }
    const location = priceLocation(option);
    if (location !== null && stats.volume > 0) {
      const weight = Math.log10(stats.premiumNotional + 10) * Math.sqrt(stats.volume);
      const directional = isCall ? location : -location;
      pressureNumerator += directional * weight;
      pressureWeight += weight;
      locatedVolume += stats.volume;
    }
    if (stats.volume >= minimumVolume && stats.volumeOiRatio >= minimumVolumeOi) {
      unusual.push({
        contractSymbol: option.symbol,
        type: String(option.type || '').toUpperCase(),
        strike: option.strike,
        volume: stats.volume,
        openInterest: stats.openInterest,
        volumeOiRatio: round(stats.volumeOiRatio, 2),
        premiumNotionalUsd: round(stats.premiumNotional, 0),
        tradeLocation: location === null ? 'UNKNOWN' : location >= 0.35 ? 'ASK_SIDE_PROXY' : location <= -0.35 ? 'BID_SIDE_PROXY' : 'MID'
      });
    }
  }

  const optionPressure = pressureWeight ? pressureNumerator / pressureWeight : 0;
  const trendVote = technical?.trend === 'bullish' ? 1 : technical?.trend === 'bearish' ? -1 : 0;
  const changePct = finite(quote?.changePct, 0);
  const changeVote = Math.max(-1, Math.min(1, changePct / 2));
  const directionalScore = round(Math.max(-100, Math.min(100, (optionPressure * 65) + (trendVote * 25) + (changeVote * 10))), 0);
  const averageDailyVolume = average(history.slice(-20).map((bar) => bar?.volume));
  const expectedVolume = averageDailyVolume === null ? null : averageDailyVolume * sessionProgress(now);
  const relativeVolume = expectedVolume && expectedVolume > 0 ? finite(quote?.volume, 0) / expectedVolume : null;
  const totalVolume = callVolume + putVolume;
  const coverage = totalVolume > 0 ? locatedVolume / totalVolume : 0;
  const unusualTop = unusual.sort((left, right) => right.premiumNotionalUsd - left.premiumNotionalUsd).slice(0, 8);
  const confidence = Math.round(Math.max(0, Math.min(95,
    20 + (coverage * 30) + Math.min(20, Math.abs(directionalScore) * 0.25) +
    Math.min(15, unusualTop.length * 2.5) + (relativeVolume !== null && relativeVolume >= 1.25 ? 10 : 0)
  )));
  const direction = directionalScore >= 18 ? 'BULLISH' : directionalScore <= -18 ? 'BEARISH' : 'MIXED';

  return {
    label: 'INFERRED_FLOW',
    direction,
    directionalScore,
    confidence,
    callPutVolumeRatio: putVolume > 0 ? round(callVolume / putVolume, 2) : callVolume > 0 ? null : 0,
    callVolume,
    putVolume,
    callOpenInterest,
    putOpenInterest,
    relativeUnderlyingVolume: round(relativeVolume, 2),
    unusualContracts: unusualTop,
    methodology: 'Inferencia por volumen/OI, prima nocional, último precio respecto a bid/ask, volumen relativo y tendencia. No identifica bancos ni confirma apertura/cierre.',
    limitations: 'Una cadena snapshot no revela la identidad, intención ni lado real de cada participante; el último precio puede corresponder a una operación anterior.'
  };
}

export function flowForStrategy(flow, strategy, minimumConfidence = 55) {
  const expected = strategy === 'BULL_PUT_CREDIT_SPREAD' ? 'BULLISH' : 'BEARISH';
  const aligned = flow?.direction === expected;
  const opposed = flow?.direction !== 'MIXED' && flow?.direction !== expected;
  return {
    ...flow,
    expectedDirection: expected,
    alignment: aligned ? 'ALIGNED' : opposed ? 'OPPOSED' : 'MIXED',
    aligned,
    qualified: aligned && finite(flow?.confidence, 0) >= minimumConfidence
  };
}
