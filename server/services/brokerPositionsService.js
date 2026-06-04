export async function loadBrokerPositions({ repository, providers } = {}) {
  const manual = repository?.listJournal ? await repository.listJournal() : [];
  const positions = (manual || [])
    .filter((entry) => ['OPEN', 'OPEN / WATCHING', 'EJECUTADA', 'OBSERVADA'].includes(String(entry.outcome || '').toUpperCase()))
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
