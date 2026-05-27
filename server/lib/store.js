import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.SIGMA_DATA_DIR || 'data');

async function ensureStore() {
  await mkdir(root, { recursive: true });
}

async function readJson(name, fallback) {
  await ensureStore();
  try {
    return JSON.parse(await readFile(path.join(root, name), 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(name, value) {
  await ensureStore();
  await writeFile(path.join(root, name), JSON.stringify(value, null, 2), 'utf8');
}

export async function getWatchlist(defaultSymbols) {
  const stored = await readJson('watchlist.json', null);
  return stored && Array.isArray(stored.symbols) ? stored : { symbols: defaultSymbols, updatedAt: null };
}

export async function saveWatchlist(symbols) {
  const clean = [...new Set(symbols.map((symbol) => String(symbol).toUpperCase().trim()).filter(Boolean))].slice(0, 40);
  const value = { symbols: clean, updatedAt: new Date().toISOString() };
  await writeJson('watchlist.json', value);
  return value;
}

export async function getRiskProfile(defaults) {
  const stored = await readJson('risk-profile.json', null);
  return stored ? { ...defaults, ...stored } : defaults;
}

export async function saveRiskProfile(profile, defaults) {
  const value = {
    ...defaults,
    accountSize: Math.max(100, Number(profile.accountSize ?? defaults.accountSize)),
    riskPct: Math.min(5, Math.max(0.5, Number(profile.riskPct ?? defaults.riskPct))),
    maxCollateralPct: Math.min(50, Math.max(5, Number(profile.maxCollateralPct ?? defaults.maxCollateralPct))),
    maxDailyLossPct: Math.min(10, Math.max(1, Number(profile.maxDailyLossPct ?? defaults.maxDailyLossPct))),
    maxOpenTrades: Math.min(10, Math.max(1, Number(profile.maxOpenTrades ?? defaults.maxOpenTrades))),
    dailyLossPct: Math.min(100, Math.max(0, Number(profile.dailyLossPct || 0))),
    allow1DteApproval: Boolean(profile.allow1DteApproval ?? defaults.allow1DteApproval),
    tradingPaused: Boolean(profile.tradingPaused),
    holdings: typeof profile.holdings === 'object' && profile.holdings ? profile.holdings : {},
    activeSymbols: Array.isArray(profile.activeSymbols) ? profile.activeSymbols.map((item) => String(item).toUpperCase()).slice(0, 20) : [],
    updatedAt: new Date().toISOString()
  };
  await writeJson('risk-profile.json', value);
  return value;
}

export async function recordIvObservation(symbol, iv) {
  if (!Number.isFinite(iv)) return [];
  const data = await readJson('iv-observations.json', {});
  const date = new Date().toISOString().slice(0, 10);
  data[symbol] = Array.isArray(data[symbol]) ? data[symbol] : [];
  const existing = data[symbol].find((sample) => sample.date === date);
  if (existing) existing.iv = iv;
  else data[symbol].push({ date, iv });
  data[symbol] = data[symbol].slice(-260);
  await writeJson('iv-observations.json', data);
  return data[symbol];
}

export async function appendAlert(alert) {
  const alerts = await readJson('alerts.json', []);
  const key = `${alert.kind}:${alert.symbol || 'market'}:${alert.message}`;
  if (!alerts.some((item) => item.key === key && item.date === new Date().toISOString().slice(0, 10))) {
    alerts.unshift({ ...alert, key, date: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString() });
    await writeJson('alerts.json', alerts.slice(0, 100));
  }
  return alerts.slice(0, 20);
}

export async function getAlerts() {
  return (await readJson('alerts.json', [])).slice(0, 20);
}

export async function saveLatestOptionsSnapshot(snapshot) {
  const values = await readJson('options-latest.json', {});
  values[`${snapshot.symbol}:${snapshot.expiration}`] = snapshot;
  await writeJson('options-latest.json', values);
}

export async function getCollectionStats() {
  const snapshots = await readJson('options-latest.json', {});
  const ivHistory = await readJson('iv-observations.json', {});
  return {
    backend: 'local-file-fallback',
    snapshots: Object.keys(snapshots).length,
    ivSymbols: Object.keys(ivHistory).length,
    latestSnapshotAt: Object.values(snapshots).map((item) => item.collectedAt).sort().at(-1) || null
  };
}

export async function listTradeJournal() {
  return (await readJson('trade-journal.json', [])).slice(0, 100);
}

export async function addTradeJournal(entry) {
  const journal = await readJson('trade-journal.json', []);
  const item = {
    id: `journal-${Date.now()}`,
    symbol: String(entry.symbol || '').toUpperCase(),
    strategy: String(entry.strategy || ''),
    reason: String(entry.reason || ''),
    regime: String(entry.regime || ''),
    confidence: Number(entry.confidence || 0),
    outcome: String(entry.outcome || 'OPEN'),
    notes: String(entry.notes || ''),
    createdAt: new Date().toISOString()
  };
  journal.unshift(item);
  await writeJson('trade-journal.json', journal.slice(0, 250));
  return item;
}
