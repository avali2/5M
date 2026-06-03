export const WATCHED_POSITIONS_KEY = 'valido-broker-positions-v2';
export const TAKEN_SIGNALS_KEY = 'valido-taken-signals-v1';
export const LOCAL_JOURNAL_KEY = 'valido-local-journal-v1';
export const DELETED_JOURNAL_KEY = 'valido-deleted-journal-v1';

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

export function loadTakenSignals() {
  return readJson(TAKEN_SIGNALS_KEY, []);
}

export function markSignalTaken(signalId) {
  const current = new Set(loadTakenSignals());
  current.add(signalId);
  return writeJson(TAKEN_SIGNALS_KEY, [...current]);
}

export function loadWatchedPositions() {
  return readJson(WATCHED_POSITIONS_KEY, []);
}

export function saveWatchedPositions(positions) {
  return writeJson(WATCHED_POSITIONS_KEY, positions);
}

export function loadLocalJournalEntries() {
  return pruneExpiredJournalEntries(readJson(LOCAL_JOURNAL_KEY, []));
}

export function saveLocalJournalEntry(entry) {
  const current = loadLocalJournalEntries();
  const normalized = {
    ...entry,
    id: entry.id || `local-journal-${Date.now()}`,
    createdAt: entry.createdAt || entry.timestamp || new Date().toISOString(),
    storage: 'local_fallback'
  };
  writeJson(LOCAL_JOURNAL_KEY, [normalized, ...current.filter((item) => item.id !== normalized.id)]);
  window.dispatchEvent(new Event('journal-updated'));
  return normalized;
}

export function loadDeletedJournalIds() {
  return readJson(DELETED_JOURNAL_KEY, []);
}

export function deleteJournalEntry(entryId) {
  if (!entryId) return [];
  const localEntries = readJson(LOCAL_JOURNAL_KEY, []);
  writeJson(LOCAL_JOURNAL_KEY, localEntries.filter((entry) => entry.id !== entryId));
  const deleted = new Set(loadDeletedJournalIds());
  deleted.add(entryId);
  writeJson(DELETED_JOURNAL_KEY, [...deleted]);
  window.dispatchEvent(new Event('journal-updated'));
  return [...deleted];
}

export function pruneExpiredJournalEntries(entries = []) {
  const today = Date.now();
  const kept = entries.filter((entry) => {
    const expiration = entry.expiration || entry.signalOriginal?.expiration;
    const status = String(entry.outcome || entry.status || '').toUpperCase();
    if (!expiration || status.includes('CLOSED')) return true;
    const expiry = new Date(`${expiration}T23:59:59`).getTime();
    return !Number.isFinite(expiry) || expiry + 7 * 86400000 >= today;
  });
  if (kept.length !== entries.length) writeJson(LOCAL_JOURNAL_KEY, kept);
  return kept;
}

export function createOrUpdateWatchedPositionFromSignal(signal, journalEntry = {}) {
  const positions = loadWatchedPositions();
  const id = `signal-${signal.id}`;
  const legs = signal.legs || [];
  const strikes = legs.length
    ? legs.map((leg) => `${leg.side || leg.action || 'WATCH'} ${leg.strike}${leg.optionType || leg.type || ''}`).join(' / ')
    : signal.strikes || '';
  const position = {
    id,
    source: 'signal_taken',
    sourceSignalId: signal.id,
    journalId: journalEntry.id || journalEntry.createdAt || null,
    symbol: signal.symbol,
    strategy: signal.strategyLabel || signal.strategy,
    expiration: signal.expiration,
    quantity: 1,
    entryMark: signal.credit ?? signal.debit ?? signal.executionPlan?.limitPrice ?? '',
    currentMark: signal.credit ?? signal.debit ?? signal.executionPlan?.limitPrice ?? '',
    strikes,
    targetMark: signal.executionPlan?.takeProfit || '',
    stopMark: signal.executionPlan?.stopLoss || '',
    notes: signal.executionPlan?.invalidationLevel
      ? `Invalidacion ${signal.executionPlan.invalidationLevel}`
      : signal.geminiCoach?.summary || signal.technicalSummary || '',
    status: 'WATCHING',
    health: 'GREEN',
    maxRiskUsd: signal.maxRiskUsd,
    maxProfitUsd: signal.maxProfitUsd,
    pop: signal.pop,
    score: signal.score,
    geminiReview: signal.geminiCoach,
    snapshot: signal,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const next = [position, ...positions.filter((item) => item.id !== id)];
  saveWatchedPositions(next);
  window.dispatchEvent(new Event('positions-updated'));
  return position;
}
