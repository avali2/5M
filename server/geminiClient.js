// Unified Gemini client with local defensive rate limiting.
// All Gemini API calls should route through this module.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Rate limit / cooldown state (in-memory, resets on restart)
let lastCallAt = 0;
let lastStatus = null;       // 'ok' | 'rate_limited' | 'error'
let lastError = null;        // e.g. 'HTTP 429'
let cooldownUntil = 0;       // ms timestamp until we can call again
let lastResponse = null;     // cached raw text
let lastResponseAt = 0;
const MIN_CALL_INTERVAL = 5 * 60 * 1000;   // 5 min between calls
const CACHE_TTL = 30 * 60 * 1000;          // 30 min cache
const COOLDOWN_429 = 10 * 60 * 1000;       // 10 min after 429
const COOLDOWN_503 = 5 * 60 * 1000;        // 5 min after 503

export function cleanAiText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  // Try to extract JSON object if text starts with { and ends with }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { const parsed = JSON.parse(jsonMatch[0]); return JSON.stringify(parsed); }
    catch { /* not valid JSON, return cleaned text */ }
  }
  return text;
}

export function sanitizeForJsonPayload(input) {
  if (!input) return '';
  let s = String(input);
  // Remove lone surrogates
  s = s.replace(/[\uD800-\uDFFF]/g, '');
  // Replace control chars except newline/tab
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Normalize line endings
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Limit to 32k
  if (s.length > 32000) s = s.slice(0, 32000);
  return s;
}

export function getGeminiStatus() {
  const now = Date.now();
  return {
    configured: Boolean(GEMINI_API_KEY),
    model: GEMINI_MODEL,
    lastStatus,
    lastError,
    lastCallAt: lastCallAt ? new Date(lastCallAt).toISOString() : null,
    nextRetryAt: cooldownUntil > now ? new Date(cooldownUntil).toISOString() : null,
    cacheAgeSeconds: lastResponseAt ? Math.round((now - lastResponseAt) / 1000) : null,
    inCooldown: cooldownUntil > now
  };
}

export async function callGemini(prompt, { maxTokens = 500, temperature = 0.7 } = {}) {
  const now = Date.now();

  if (!GEMINI_API_KEY) {
    lastStatus = 'error';
    lastError = 'GEMINI_API_KEY missing';
    throw new Error('Gemini API key not configured');
  }

  // Cooldown active?
  if (cooldownUntil > now) {
    // Try cache first
    if (lastResponse && (now - lastResponseAt < CACHE_TTL)) {
      return lastResponse;
    }
    throw new Error(`Gemini in cooldown until ${new Date(cooldownUntil).toISOString()}`);
  }

  // Minimum interval between calls
  if (now - lastCallAt < MIN_CALL_INTERVAL) {
    if (lastResponse && (now - lastResponseAt < CACHE_TTL)) {
      return lastResponse;
    }
    throw new Error('Gemini minimum call interval not reached');
  }

  lastCallAt = now;
  const url = `${GEMINI_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const statusCode = res.status;
      lastStatus = statusCode === 429 ? 'rate_limited' : 'error';
      lastError = `HTTP ${statusCode}`;

      if (statusCode === 429) {
        cooldownUntil = now + COOLDOWN_429;
        // Use cache if available
        if (lastResponse && (now - lastResponseAt < CACHE_TTL)) {
          console.warn(`Gemini 429 — cooldown ${COOLDOWN_429 / 60000}min, using cache`);
          return lastResponse;
        }
      }
      if (statusCode === 503 || statusCode >= 500) {
        cooldownUntil = now + COOLDOWN_503;
    }

      console.error(`Gemini API error ${statusCode}: ${text.slice(0, 200)}`);
      throw new Error(`Gemini API error ${statusCode}`);
    }

    const data = await res.json();
    const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error('Gemini returned empty response');

    // Clean and cache success
    const cleaned = cleanAiText(resultText);
    lastResponse = cleaned;
    lastResponseAt = now;
    lastStatus = 'ok';
    lastError = null;
    return cleaned;
  } catch (err) {
    if (err.message.startsWith('Gemini API error') || err.message.startsWith('Gemini in cooldown') || err.message.startsWith('Gemini minimum')) {
      throw err;
    }
    lastStatus = 'error';
    lastError = err.message;
    // Network/timeout errors: short cooldown
    if (!cooldownUntil || cooldownUntil <= now) {
      cooldownUntil = now + 2 * 60 * 1000; // 2 min for network errors
    }
    throw err;
  }
}

export function getCachedResponse() {
  if (lastResponse && (Date.now() - lastResponseAt < CACHE_TTL)) {
    return lastResponse;
  }
  return null;
}