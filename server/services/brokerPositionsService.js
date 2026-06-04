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

export async function loadBrokerPositions({ repository, providers } = {}) {
  const manual = repository?.listJournal ? await repository.listJournal() : [];
  const positions = (manual || [])
    .filter((entry) => ['OPEN', 'OPEN / WATCHING', 'EJECUTADA', 'OBSERVADA'].includes(String(entry.outcome || '').toUpperCase()))
    .filter((entry) => journalSource(entry).toLowerCase() !== 'signal_taken')
    .map((entry) => ({
      ...entry,
      id: entry.id || `manual-${entry.symbol}-${entry.createdAt || Date.now()}`,
      source: 'manual'
    }));

  const tradierConfigured = Boolean(providers?.tradier?.configured);
  return {
    source: tradierConfigured ? 'tradier_not_yet_enabled_for_orders' : 'manual',
    brokerConfigured: tradierConfigured,
    positions,
    note: tradierConfigured
      ? 'Tradier market data is configured. Live broker position import is read-only and can be extended without enabling order execution.'
      : 'No broker configured; using manual/journal positions only.'
  };
}
