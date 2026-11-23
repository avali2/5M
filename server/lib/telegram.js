/**
 * 5M · Telegram: avisos importantes al chat del usuario.
 * Configuración: TELEGRAM_BOT_TOKEN (obligatorio) y TELEGRAM_CHAT_ID (opcional;
 * si falta se detecta con getUpdates después de que el usuario escriba /start).
 */
const API = (token) => 'https://api.telegram.org/bot' + token;
let cachedChat = null;
const sentKeys = new Map();

function token() { return String(process.env.TELEGRAM_BOT_TOKEN || '').trim(); }
function configuredChat() { return String(process.env.TELEGRAM_CHAT_ID || '').trim(); }
export function isTelegramConfigured() { return Boolean(token()); }

async function detectChatId() {
  if (!token()) return null;
  try {
    const response = await fetch(API(token()) + '/getUpdates?limit=10&timeout=0', { signal: AbortSignal.timeout(10000) });
    const payload = await response.json();
    const chats = (payload?.result || []).map((update) => update.message?.chat || update.channel_post?.chat).filter(Boolean);
    const chat = chats[chats.length - 1];
    if (chat?.id) { cachedChat = String(chat.id); return cachedChat; }
  } catch { /* sin red */ }
  return null;
}

export async function telegramStatus() {
  const chatId = configuredChat() || cachedChat || (isTelegramConfigured() ? await detectChatId() : null);
  return { configured: isTelegramConfigured(), chatId, ready: Boolean(isTelegramConfigured() && chatId), instructions: isTelegramConfigured() ? (chatId ? null : 'Abrí el bot en Telegram y mandá /start para detectar el chat.') : 'Falta TELEGRAM_BOT_TOKEN: creá un bot con @BotFather y pegá el token en Render.' };
}

export async function sendTelegram(text) {
  if (!token()) return { ok: false, error: 'Telegram no configurado: falta TELEGRAM_BOT_TOKEN.' };
  const chatId = configuredChat() || cachedChat || (await detectChatId());
  if (!chatId) return { ok: false, error: 'Falta el chat: mandá /start al bot y reintentá.' };
  try {
    const response = await fetch(API(token()) + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json();
    if (!payload?.ok) return { ok: false, error: payload?.description || 'Telegram rechazó el mensaje.' };
    return { ok: true, messageId: payload.result?.message_id, chatId };
  } catch (error) { return { ok: false, error: error.message }; }
}

export async function notifyImportant(title, lines = [], key = null) {
  if (!isTelegramConfigured()) return { ok: false, error: 'no configurado' };
  const dedupe = key || (title + ':' + new Date().toISOString().slice(0, 10));
  if (sentKeys.get(dedupe) && Date.now() - sentKeys.get(dedupe) < 6 * 3600000) return { ok: true, skipped: true };
  const body = '<b>' + title + '</b>' + (lines.length ? '\n' + lines.map((line) => '• ' + line).join('\n') : '');
  const result = await sendTelegram(body);
  if (result.ok) sentKeys.set(dedupe, Date.now());
  return result;
}
