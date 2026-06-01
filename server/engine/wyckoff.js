import { mean, round } from './math.js';

export function detectWyckoff(bars, technicals) {
  const recent = bars.slice(-80);
  if (recent.length < 30) return { phase: "NO_DATA", bias: "NEUTRAL", score: 0, evidence: ["No hay barras suficientes."] };

  const highs = recent.map(b => Number(b.high || b.close));
  const lows = recent.map(b => Number(b.low || b.close));
  const closes = recent.map(b => Number(b.close));
  const vols = recent.map(b => Number(b.volume || 0));

  const rangeHigh = Math.max(...highs), rangeLow = Math.min(...lows);
  const rangePct = (rangeHigh - rangeLow) / closes.at(-1);
  const avgVol = mean(vols.slice(0, -5)) || 1;
  const lastVol = mean(vols.slice(-5)) || 0;
  const volExpansion = lastVol / avgVol;
  const lastClose = closes.at(-1);

  const spring = lows.at(-1) < rangeLow * 1.01 && lastClose > rangeLow * 1.015 && volExpansion > 1.2;
  const upthrust = highs.at(-1) > rangeHigh * 0.99 && lastClose < rangeHigh * 0.985 && volExpansion > 1.2;
  const sos = technicals?.structure === "HH_HL" && volExpansion > 1.15 && lastClose > technicals?.vwap;
  const sow = technicals?.structure === "LH_LL" && volExpansion > 1.15 && lastClose < technicals?.vwap;

  let phase = "RANGE", bias = "NEUTRAL";
  const evidence = [];

  if (rangePct < 0.08) evidence.push("Rango compacto.");
  if (spring) { phase = "SPRING"; bias = "BULLISH"; evidence.push("Spring: barrida bajo soporte y recuperación con volumen."); }
  else if (upthrust) { phase = "UPTHRUST"; bias = "BEARISH"; evidence.push("Upthrust: ruptura falsa sobre resistencia con rechazo."); }
  else if (sos) { phase = "SIGN_OF_STRENGTH"; bias = "BULLISH"; evidence.push("SOS: estructura HH/HL con volumen y precio sobre VWAP."); }
  else if (sow) { phase = "SIGN_OF_WEAKNESS"; bias = "BEARISH"; evidence.push("SOW: estructura LH/LL con volumen y precio bajo VWAP."); }
  else if (technicals?.trend === "BULL_TREND") { phase = "ACCUMULATION_OR_MARKUP"; bias = "BULLISH"; }
  else if (technicals?.trend === "BEAR_TREND") { phase = "DISTRIBUTION_OR_MARKDOWN"; bias = "BEARISH"; }

  const score = bias === "BULLISH" || bias === "BEARISH" ? 72 : 52;
  return { phase, bias, score, evidence, volumeExpansion: round(volExpansion, 2) };
}