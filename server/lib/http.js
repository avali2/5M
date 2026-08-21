export async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!response.ok) {
      const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${detail.slice(0, 400)}`);
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round(value, digits = 4) {
  const parsed = finite(value);
  if (parsed === null) return null;
  const multiplier = 10 ** digits;
  return Math.round(parsed * multiplier) / multiplier;
}
