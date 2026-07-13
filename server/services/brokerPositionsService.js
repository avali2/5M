function journalSource(entry = {}) {
  if (entry.source) return String(entry.source);
  if (entry.signalOriginal?.source) return String(entry.signalOriginal.source);
  if (typeof entry.signal_original === 'string') {
    try {
      return String(JSON.parse(entry.signal_original)?.source || '');
    } catch {
      return '';
    }
  }
  return String(entry.signal_original?.source || '');
}

function signalOriginal(entry = {}) {
  const value = entry.signalOriginal ?? entry.signal_original;
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isGeneratedSignalEntry(entry = {}) {
  const source = journalSource(entry).toLowerCase();
  const original = signalOriginal(entry);
  if (source === 'signal_taken' || source === 'scanner' || source === 'guardian') return true;
  return Boolean(original?.id && (original?.status || original?.strategyLabel || original?.legs));
}

function effectiveExpiration(entry = {}) {
  return entry.expiration || signalOriginal(entry)?.expiration || null;
}

function isExpired(entry = {}) {
  const expiration = effectiveExpiration(entry);
  if (!expiration) return false;
  const timestamp = new Date(`${expiration}T23:59:59-04:00`).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function manualPosition(entry = {}) {
  return {
    ...entry,
    id: entry.id || `manual-${entry.symbol}-${entry.createdAt || entry.created_at || Date.now()}`,
    symbol: String(entry.symbol || '').toUpperCase(),
    expiration: effectiveExpiration(entry),
    entryMark: entry.entryMark ?? entry.entry_mark ?? entry.realEntry ?? entry.real_entry ?? null,
    currentMark: entry.currentMark ?? entry.current_mark ?? null,
    openPnL: entry.openPnL ?? entry.open_pnl ?? entry.pnl ?? null,
    source: 'manual'
  };
}

function uniqueManualPositions(entries = []) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const position = manualPosition(entry);
    const key = [position.symbol, position.strategy, position.expiration || '', position.strikes || '', position.entryMark ?? ''].join('|');
    if (!position.symbol || ['TEST', 'DEMO', 'SAMPLE'].includes(position.symbol) || seen.has(key)) continue;
    seen.add(key);
    result.push(position);
  }
  return result;
}

export async function loadBrokerPositions({ repository, providers } = {}) {
  const manual = repository?.listJournal ? await repository.listJournal() : [];
  const manualPositions = uniqueManualPositions((manual || [])
    .filter((entry) => ['OPEN', 'OPEN / WATCHING', 'EJECUTADA', 'OBSERVADA'].includes(String(entry.outcome || '').toUpperCase()))
    .filter((entry) => !isGeneratedSignalEntry(entry))
    .filter((entry) => !isExpired(entry)));

  const tradierConfigured = Boolean(providers?.tradier?.configured);
  const account = typeof providers?.tradier?.getAccountSnapshot === 'function'
    ? await providers.tradier.getAccountSnapshot()
    : null;
  const brokerPositions = account?.status === 'ONLINE' ? account.positions : [];
  const positions = [...brokerPositions, ...manualPositions];
  return {
    source: brokerPositions.length || account?.status === 'ONLINE' ? 'tradier_read_only' : 'manual',
    brokerConfigured: tradierConfigured,
    brokerConnected: account?.status === 'ONLINE',
    account,
    brokerPositions,
    manualPositions,
    positions,
    note: account?.status === 'ONLINE'
      ? 'Tradier balances and positions are synchronized read-only. Order execution is disabled.'
      : tradierConfigured
        ? `Tradier market data is configured, but account sync is unavailable: ${account?.error || 'account not resolved'}`
      : 'No broker configured; using manual/journal positions only.'
  };
}
