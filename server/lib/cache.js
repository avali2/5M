export class MemoryCache {
  constructor() {
    this.entries = new Map();
  }

  async remember(key, ttlMs, loader) {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) return await cached.value;
    const pending = Promise.resolve().then(loader);
    const entry = { value: pending, expiresAt: Date.now() + ttlMs };
    this.entries.set(key, entry);
    try {
      const value = await pending;
      if (this.entries.get(key) === entry) this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch (error) {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    }
  }

  clear(prefix = '') {
    for (const key of this.entries.keys()) {
      if (!prefix || key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}

export const cache = new MemoryCache();
