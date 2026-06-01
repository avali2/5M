const cache = new Map();
const TTL = (process.env.GEMINI_CACHE_TTL_MINUTES || 10) * 60_000;

export function getCacheKey(symbol, strategy) {
  const hour = new Date().getHours();
  return `${symbol}-${strategy}-${hour}`;
}

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + TTL });
}

export function clearCache() {
  cache.clear();
}