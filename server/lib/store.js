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

export function normalizeRiskProfile(profile, defaults) {
  return {
    ...defaults,
    accountSize: Math.max(100, Number(profile.accountSize ?? defaults.accountSize)),
    riskPct: Math.min(5, Math.max(0.5, Number(profile.riskPct ?? defaults.riskPct))),
    maxCollateralPct: Math.min(50, Math.max(5, Number(profile.maxCollateralPct ?? defaults.maxCollateralPct))),
    maxDailyLossPct: Math.min(10, Math.max(1, Number(profile.maxDailyLossPct ?? defaults.maxDailyLossPct))),
    maxWeeklyLossPct: Math.min(20, Math.max(1, Number(profile.maxWeeklyLossPct ?? defaults.maxWeeklyLossPct ?? 8))),
    maxOpenTrades: Math.min(10, Math.max(1, Number(profile.maxOpenTrades ?? defaults.maxOpenTrades))),
    dailyLossPct: Math.min(100, Math.max(0, Number(profile.dailyLossPct || 0))),
    weeklyLossPct: Math.min(100, Math.max(0, Number(profile.weeklyLossPct || 0))),
    collateralUsedPct: Math.min(100, Math.max(0, Number(profile.collateralUsedPct || 0))),
    riskMode: ['CONSERVADOR', 'NORMAL', 'AGRESIVO EDUCATIVO'].includes(profile.riskMode) ? profile.riskMode : (defaults.riskMode || 'CONSERVADOR'),
    allow1DteApproval: Boolean(profile.allow1DteApproval ?? defaults.allow1DteApproval),
    allow0Dte: Boolean(profile.allow0Dte ?? defaults.allow0Dte),
    allowEarnings: Boolean(profile.allowEarnings ?? defaults.allowEarnings),
    allowMargin: Boolean(profile.allowMargin ?? defaults.allowMargin),
    consecutiveDailyLosses: Math.min(20, Math.max(0, Number(profile.consecutiveDailyLosses || 0))),
    tradingPaused: Boolean(profile.tradingPaused),
    holdings: typeof profile.holdings === 'object' && profile.holdings ? profile.holdings : {},
    activeSymbols: Array.isArray(profile.activeSymbols) ? profile.activeSymbols.map((item) => String(item).toUpperCase()).slice(0, 20) : [],
    updatedAt: new Date().toISOString()
  };
}

export async function saveRiskProfile(profile, defaults) {
  const value = normalizeRiskProfile(profile, defaults);
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
    plannedEntry: String(entry.plannedEntry || ''),
    realEntry: String(entry.realEntry || ''),
    plannedExit: String(entry.plannedExit || ''),
    realExit: String(entry.realExit || ''),
    pnl: Number.isFinite(Number(entry.pnl)) ? Number(entry.pnl) : null,
    mentalState: String(entry.mentalState || ''),
    lesson: String(entry.lesson || ''),
    mae: Number.isFinite(Number(entry.mae)) ? Number(entry.mae) : null,
    mfe: Number.isFinite(Number(entry.mfe)) ? Number(entry.mfe) : null,
    error: String(entry.error || ''),
    ruleViolated: String(entry.ruleViolated || ''),
    ruleRespected: String(entry.ruleRespected || ''),
    signalOriginal: String(entry.signalOriginal || ''),
    createdAt: new Date().toISOString()
  };
  journal.unshift(item);
  await writeJson('trade-journal.json', journal.slice(0, 250));
  return item;
}

export async function getGuardianSettings(defaults) {
  const stored = await readJson('guardian-settings.json', null);
  return stored ? { ...defaults, ...stored, workMode: { ...defaults.workMode, ...(stored.workMode || {}) } } : defaults;
}

export async function saveGuardianSettings(settings) {
  const value = { ...settings, updatedAt: new Date().toISOString() };
  await writeJson('guardian-settings.json', value);
  return value;
}

export async function listGuardianEvents(limit = 100) {
  return (await readJson('guardian-events.json', [])).slice(0, limit);
}

export async function saveGuardianEvents(events) {
  const stored = await readJson('guardian-events.json', []);
  const existing = new Map(stored.map((item) => [item.id, item]));
  for (const event of events) existing.set(event.id, { ...(existing.get(event.id) || {}), ...event });
  const values = [...existing.values()].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 500);
  await writeJson('guardian-events.json', values);
  return events;
}

export async function updateGuardianEvent(id, patch) {
  const events = await readJson('guardian-events.json', []);
  const value = events.find((item) => item.id === id);
  if (!value) return null;
  Object.assign(value, patch);
  await writeJson('guardian-events.json', events);
  return value;
}

export async function getGuardianLearningProfile() {
  return readJson('guardian-learning-profile.json', null);
}

export async function saveGuardianLearningProfile(profile) {
  await writeJson('guardian-learning-profile.json', profile);
  return profile;
}

export async function listGuardianFeedback(limit = 200) {
  return (await readJson('guardian-feedback.json', [])).slice(0, limit);
}

export async function addGuardianFeedback(entry) {
  const values = await readJson('guardian-feedback.json', []);
  const item = { id: entry.id || `feedback-${Date.now()}`, ...entry, createdAt: entry.createdAt || new Date().toISOString() };
  values.unshift(item);
  await writeJson('guardian-feedback.json', values.slice(0, 500));
  return item;
}

export async function listGuardianPushSubscriptions() {
  return (await readJson('guardian-push-subscriptions.json', [])).filter((item) => item.isActive !== false);
}

export async function saveGuardianPushSubscription(subscription) {
  const values = await readJson('guardian-push-subscriptions.json', []);
  const existing = values.find((item) => item.endpointHash === subscription.endpointHash);
  const item = {
    ...existing,
    ...subscription,
    isActive: true,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (existing) Object.assign(existing, item);
  else values.push(item);
  await writeJson('guardian-push-subscriptions.json', values);
  return item;
}

export async function updateGuardianPushSubscription(endpointHash, patch) {
  const values = await readJson('guardian-push-subscriptions.json', []);
  const item = values.find((value) => value.endpointHash === endpointHash);
  if (!item) return null;
  Object.assign(item, patch, { updatedAt: new Date().toISOString() });
  await writeJson('guardian-push-subscriptions.json', values);
  return item;
}

export async function saveGuardianCooldown(item) {
  const values = await readJson('guardian-cooldowns.json', []);
  values.unshift(item);
  await writeJson('guardian-cooldowns.json', values.filter((value) => new Date(value.cooldownUntil) > new Date()).slice(0, 300));
  return item;
}

export async function saveGuardianScanRun(run) {
  const values = await readJson('guardian-scan-runs.json', []);
  values.unshift(run);
  await writeJson('guardian-scan-runs.json', values.slice(0, 300));
  return run;
}

export async function saveGuardianMarketSnapshot(snapshot) {
  const values = await readJson('guardian-market-snapshots.json', []);
  values.unshift(snapshot);
  await writeJson('guardian-market-snapshots.json', values.slice(0, 300));
  return snapshot;
}
