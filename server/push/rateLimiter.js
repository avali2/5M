const store = new Map();

export function canSend(endpoint) {
  const now = Date.now();
  const entry = store.get(endpoint) || { timestamps: [] };
  const recent = entry.timestamps.filter(ts => now - ts < 3600_000);
  if (recent.length >= 5) return false;
  const recentDay = entry.timestamps.filter(ts => now - ts < 86400_000);
  if (recentDay.length >= 12) return false;
  return true;
}

export function recordSend(endpoint) {
  const entry = store.get(endpoint) || { timestamps: [] };
  entry.timestamps.push(Date.now());
  entry.timestamps = entry.timestamps.filter(ts => Date.now() - ts < 86400_000);
  store.set(endpoint, entry);
}

export function getStats(endpoint) {
  const entry = store.get(endpoint);
  if (!entry) return { hour: 0, day: 0 };
  const now = Date.now();
  return {
    hour: entry.timestamps.filter(ts => now - ts < 3600_000).length,
    day: entry.timestamps.filter(ts => now - ts < 86400_000).length
  };
}