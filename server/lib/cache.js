export class MemoryCache {
  constructor() {
    this.entries = new Map();
  }

  async remember(key, ttlMs, loader) {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await loader();
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  clear(prefix = '') {
    for (const key of this.entries.keys()) {
      if (!prefix || key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}

export const cache = new MemoryCache();
