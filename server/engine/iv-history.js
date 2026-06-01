import fs from "node:fs/promises";
import path from "node:path";
import { round } from './math.js';

const DATA_DIR = path.resolve(process.cwd(), ".data");
const IV_HISTORY_FILE = path.join(DATA_DIR, "iv-history.json");

export async function updateIvHistory(symbol, currentIv) {
  if (!Number.isFinite(currentIv) || currentIv <= 0) return { ivRank: null, ivPercentile: null };
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
  if (hist.length < 20) return { ivRank: null, ivPercentile: null, note: "IV history insuficiente." };

  const minIv = Math.min(...hist), maxIv = Math.max(...hist);
  const ivRank = maxIv > minIv ? ((currentIv - minIv) / (maxIv - minIv)) * 100 : null;
  const ivPercentile = hist.filter(v => v <= currentIv).length / hist.length * 100;

  return { ivRank: round(ivRank, 1), ivPercentile: round(ivPercentile, 1) };
}

export { DATA_DIR, IV_HISTORY_FILE };