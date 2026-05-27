export class ProviderError extends Error {
  constructor(provider, message, status = null) {
    super(`${provider}: ${message}`);
    this.provider = provider;
    this.status = status;
  }
}

export async function requestJson(provider, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new ProviderError(provider, `HTTP ${response.status}`, response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const reason = error.name === 'AbortError' ? 'request timed out' : error.message;
    throw new ProviderError(provider, reason);
  } finally {
    clearTimeout(timer);
  }
}

export const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

export const isoDate = (date) => new Date(date).toISOString().slice(0, 10);

export function daysFromNow(days) {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + days);
  return isoDate(next);
}
