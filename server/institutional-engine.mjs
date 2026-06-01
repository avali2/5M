import fs from "node:fs/promises";
import path from "node:path";
import { round, mean } from './engine/math.js';
import { computeTechnicals } from './engine/technicals.js';
import { detectWyckoff } from './engine/wyckoff.js';
import { getPolygonTape } from './engine/tape-polygon.js';
import { getQuote, getTimesales, getExpirations, getOptionChain } from './engine/tradier-api.js';
import { updateIvHistory } from './engine/iv-history.js';
import { buildCreditVerticals, buildIronCondors, buildDebitSpreads } from './engine/strategy-builders.js';
import { createTicket, classifyTicket, makeLeg, dte, optionQuality } from './engine/ticket-creator.js';
import { volatilityRegimeScore } from './engine/scoring.js';

const DATA_DIR = path.resolve(process.cwd(), ".data");

const DEFAULT_UNIVERSE = ["SPY", "QQQ", "IWM", "DIA", "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "SOFI"];

const DEFAULT_SETTINGS = {
  accountSize: Number(process.env.ACCOUNT_SIZE || 2500),
  maxRiskPct: Number(process.env.MAX_RISK_PCT || 0.02),
  maxCollateralPct: Number(process.env.MAX_COLLATERAL_PCT || 0.35),
  minPopReady: 70,
  minPopCandidate: 65,
  maxBidAskPct: 18,
  minOpenInterest: 100,
  minOptionVolume: 5,
  maxSignalsPerScan: 12,
  creditDeltaMin: 0.14,
  creditDeltaMax: 0.32,
  ironCondorDeltaMin: 0.10,
  ironCondorDeltaMax: 0.22,
  preferDteMin: 7,
  preferDteMax: 45,
  idealDte: 21,
  zeroDteMaxRiskPct: 0.005
};

function chooseExpirations(expirations) {
  return expirations.map(exp => ({ exp, dte: dte(exp) }))
    .filter(x => x.dte >= 0 && x.dte <= 365)
    .sort((a, b) => Math.abs(a.dte - DEFAULT_SETTINGS.idealDte) - Math.abs(b.dte - DEFAULT_SETTINGS.idealDte));
}

function avgIv(options) {
  const ivs = options.map(o => Number(o.iv)).filter(v => Number.isFinite(v) && v > 0);
  return mean(ivs);
}

export { DEFAULT_SETTINGS, DEFAULT_UNIVERSE };

async function scanSymbol(symbol, settings = DEFAULT_SETTINGS) {
  const warnings = [];
  const quote = await getQuote(symbol);
  const bars = await getTimesales(symbol);
  if (!bars.length) throw new Error(`${symbol}: sin OHLCV intradía.`);
  const technicals = computeTechnicals(symbol, quote, bars);
  const wyckoff = detectWyckoff(bars, technicals);
  const tape = await getPolygonTape(symbol);
  const expirations = chooseExpirations(await getExpirations(symbol));
  if (!expirations.length) throw new Error(`${symbol}: sin expiraciones.`);
  const primaryExp = expirations.find(x => x.dte >= settings.preferDteMin && x.dte <= settings.preferDteMax) || expirations[0];
  const chain = await getOptionChain(symbol, primaryExp.exp);
  if (!chain.length) throw new Error(`${symbol}: option chain vacía.`);
  if (!chain.some(o => Number.isFinite(o.delta) && Number.isFinite(o.gamma) && Number.isFinite(o.theta) && Number.isFinite(o.vega)))
    throw new Error(`${symbol}: sin Greeks reales.`);
  const avgIvValue = avgIv(chain);
  const ivHistory = await updateIvHistory(symbol, avgIvValue);
  let vix = null;
  try { vix = (await getQuote("VIX")).price; } catch { warnings.push("VIX no disponible."); }
  const volatility = volatilityRegimeScore({ avgIvValue, ivRank: ivHistory.ivRank, ivPercentile: ivHistory.ivPercentile, realizedVolValue: technicals.realizedVol, vix });
  volatility.avgIv = round(avgIvValue, 4); volatility.ivRank = ivHistory.ivRank; volatility.ivPercentile = ivHistory.ivPercentile; volatility.realizedVol = technicals.realizedVol; volatility.vix = vix;

  const ctx = { symbol, spot: quote.price, chain, technicals, wyckoff, tape, volatility, settings, createTicket };

  const tickets = [
    ...buildCreditVerticals(ctx),
    ...buildIronCondors(ctx),
    ...buildDebitSpreads(ctx)
  ];

  const priority = { BULL_PUT_CREDIT_SPREAD: 100, BEAR_CALL_CREDIT_SPREAD: 98, IRON_CONDOR: 94, CALL_DEBIT_SPREAD: 70, PUT_DEBIT_SPREAD: 68 };
  tickets.sort((a, b) => {
    const rank = { ENTRAR_AHORA: 4, ESPERAR_CONFIRMACION: 3, WATCHLIST: 2, NO_TRADE: 1, EDUCATIONAL_ONLY: 0 };
    return (rank[b.classification] || 0) - (rank[a.classification] || 0) || (priority[b.strategy] || 0) - (priority[a.strategy] || 0) || (b.score || 0) - (a.score || 0) || (b.pop || 0) - (a.pop || 0);
  });
  return { symbol, quote, technicals, wyckoff, tape, volatility, warnings, bestTicket: tickets.find(t => ["ENTRAR_AHORA", "ESPERAR_CONFIRMACION", "WATCHLIST"].includes(t.classification)) || null, tickets: tickets.slice(0, settings.maxSignalsPerScan), scannedAt: new Date().toISOString() };
}

export async function runInstitutionalScan({ symbols = DEFAULT_UNIVERSE, settings = {} } = {}) {
  const finalSettings = { ...DEFAULT_SETTINGS, ...settings };
  const results = []; const errors = [];
  for (const symbol of symbols) {
    try { results.push(await scanSymbol(symbol.trim().toUpperCase(), finalSettings)); }
    catch (e) { errors.push({ symbol, classification: "NO_TRADE", reason: e.message, scannedAt: new Date().toISOString() }); }
  }
  const tickets = results.flatMap(r => r.tickets || []);
  const ready = tickets.filter(t => t.classification === "ENTRAR_AHORA");
  const confirm = tickets.filter(t => t.classification === "ESPERAR_CONFIRMACION");
  const watch = tickets.filter(t => t.classification === "WATCHLIST");
  return {
    status: ready.length ? "ENTRAR_AHORA" : confirm.length ? "ESPERAR_CONFIRMACION" : watch.length ? "WATCHLIST" : "NO_TRADE",
    summary: { scannedSymbols: symbols.length, ready: ready.length, confirm: confirm.length, watch: watch.length, noTradeErrors: errors.length },
    geminiInput: { instruction: "Audita estos tickets.", tickets: [...ready, ...confirm, ...watch].slice(0, 8) },
    results, errors, generatedAt: new Date().toISOString()
  };
}