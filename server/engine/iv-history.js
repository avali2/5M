import fs from "node:fs/promises";
import path from "node:path";
import { round } from './math.js';

const DATA_DIR = path.resolve(process.cwd(), ".data");
const IV_HISTORY_FILE = path.join(DATA_DIR, "iv-history.json");

/**
 * Update IV history — tries PostgreSQL first, falls back to JSON file.
 * Returns { ivRank, ivPercentile }.
 */
export async function updateIvHistory(symbol, currentIv) {
  if (!Number.isFinite(currentIv) || currentIv <= 0) return { ivRank: null, ivPercentile: null };

  // Try PostgreSQL first
  try {
    const { insertIvHistory, getIvHistory } = await import('../db/historyRepository.js');
    await insertIvHistory(symbol, new Date().toISOString().slice(0, 10), currentIv);
    const hist = await getIvHistory(symbol, 252);
    const ivs = hist.map(r => Number(r.iv_atm || r.iv || 0)).filter(v => v > 0);
    if (ivs.length >= 20) {
      const minIv = Math.min(...ivs), maxIv = Math.max(...ivs);
      const ivRank = maxIv > minIv ? ((currentIv - minIv) / (maxIv - minIv)) * 100 : null;
      const ivPercentile = ivs.filter(v => v <= currentIv).length / ivs.length * 100;
      return { ivRank: round(ivRank, 1), ivPercentile: round(ivPercentile, 1), source: 'postgresql', observations: ivs.length };
    }
    return { ivRank: null, ivPercentile: null, note: "IV history insuficiente en PostgreSQL.", source: 'postgresql', observations: ivs.length };
  } catch { /* fallback to JSON file */ }

  // Fallback to JSON file
  await fs.mkdir(DATA_DIR, { recursive: true });
  let db = {};
  try { db = JSON.parse(await fs.readFile(IV_HISTORY_FILE, "utf8")); } catch { db = {}; }
  const today = new Date().toISOString().slice(0, 10);
  const rows = db[symbol] || [];
  const filtered = rows.filter(r => r.date !== today);
  filtered.push({ date: today, iv: currentIv });
  db[symbol] = filtered.slice(-252);
  await fs.writeFile(IV_HISTORY_FILE, JSON.stringify(db, null, 2));
  const hist = db[symbol].map(r => Number(r.iv)).filter(Number.isFinite);
  if (hist.length < 20) return { ivRank: null, ivPercentile: null, note: "IV history insuficiente.", source: 'json' };
  const minIv = Math.min(...hist), maxIv = Math.max(...hist);
  const ivRank = maxIv > minIv ? ((currentIv - minIv) / (maxIv - minIv)) * 100 : null;
  const ivPercentile = hist.filter(v => v <= currentIv).length / hist.length * 100;
  return { ivRank: round(ivRank, 1), ivPercentile: round(ivPercentile, 1), source: 'json', observations: hist.length };
}

export { DATA_DIR, IV_HISTORY_FILE };