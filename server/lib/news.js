/**
 * 5M · Noticias: estado real del feed y titulares para el panel de alertas.
 * Usa feeds RSS públicos (Yahoo Finance) y reporta Gemini como auditor.
 */
import { config } from '../config.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', Accept: 'application/rss+xml, application/xml, text/xml' };
const CACHE_MS = 5 * 60000;
let cache = { at: 0, value: null };

const NOISE = /(my (husband|wife|brother|sister|son|daughter|mom|dad|parents|friend|neighbor)|retir(e|ed|ement)|pension|social security|401\(k\)|student loan|credit card debt|should i|how can i|is he being fair|dear moneyist)/i;
const SOURCE_PRIORITY = { 'google': 0, 'cnbc': 1, 'nasdaq': 2, 'marketwatch': 3 };
function sourceRank(source) {
  const key = Object.keys(SOURCE_PRIORITY).find((name) => String(source).toLowerCase().includes(name));
  return key ? SOURCE_PRIORITY[key] : 5;
}
const MARKET_WORDS = /(market|stock|stocks|equity|equities|fed|federal reserve|rate|rates|inflation|cpi|gdp|jobs|payroll|earnings|revenue|guidance|s&p|sp500|nasdaq|dow|treasury|bond|yield|oil|opec|dollar|euro|bitcoin|crypto|tariff|trade|china|war|sanction|volatility|vix|options|futures|spy|qqq|iwm|tech|semiconductor|nvidia|apple|microsoft|tesla|amazon|meta|google|alphabet|amd|intel|boeing|bank|credit|debt|recession|rally|selloff|crash|jobless|retail sales|housing|mortgage)/i;
function cleanEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)));
}
function decode(text) {
  return cleanEntities(String(text || ''))
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const FEEDS = [
  { name: 'CNBC · Top', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { name: 'CNBC · Mercados', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258' },
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name: 'Nasdaq · Mercados', url: 'https://www.nasdaq.com/feed/rssoutbound?category=Markets' }
];

function parseFeed(xml, limit) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  return items.map((item) => {
    const title = decode((item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const publishedAt = decode((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
    const link = decode((item.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
    return { title, publishedAt, link };
  }).filter((row) => row.title && !/^CNBC|^MarketWatch|^Nasdaq/i.test(row.title)).slice(0, limit);
}

export async function fetchHeadlines(symbol = 'SPY', limit = 6, { fetchImpl = globalThis.fetch } = {}) {
  const feeds = [
    { name: 'Google News · ' + symbol, url: `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock market')}&hl=en-US&gl=US&ceid=US:en` },
    ...FEEDS
  ];
  const results = await Promise.allSettled(feeds.map(async (feed) => {
    const response = await fetchImpl(feed.url, { headers: UA, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const rows = parseFeed(await response.text(), limit);
    if (!rows.length) throw new Error('Feed vacío');
    return rows.map((row) => ({ ...row, source: feed.name }));
  }));
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  if (!fulfilled.length) throw new Error('Ningún feed de noticias respondió.');
  const headlines = fulfilled.flatMap((result) => result.value);
  const unique = [];
  for (const row of headlines) {
    if (!unique.some((existing) => existing.title === row.title)) unique.push(row);
  }
  return unique.slice(0, limit * 2);
}

export async function newsStatus({ symbol = 'SPY', force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const headlines = [];
  const sources = [];
  const gemini = Boolean(config.gemini.apiKey);
  const feedList = [
    { name: 'Google News · ' + symbol, url: `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock market')}&hl=en-US&gl=US&ceid=US:en` },
    ...FEEDS
  ];
  await Promise.allSettled(feedList.map(async (feed) => {
    try {
      const response = await fetch(feed.url, { headers: UA, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const rows = parseFeed(await response.text(), 4);
      if (!rows.length) throw new Error('Feed vacío');
      sources.push({ name: feed.name, ok: true });
      rows.forEach((row) => { if (!headlines.some((existing) => existing.title === row.title)) headlines.push({ ...row, source: feed.name }); });
    } catch (error) {
      sources.push({ name: feed.name, ok: false, error: error.message });
    }
  }));
  const relevant = headlines
    .filter((row) => !NOISE.test(row.title))
    .filter((row) => row.source?.startsWith('Google News') || MARKET_WORDS.test(row.title))
    .sort((left, right) => sourceRank(left.source) - sourceRank(right.source) || String(right.publishedAt).localeCompare(String(left.publishedAt)))
    .slice(0, 8);
  const okSources = sources.filter((source) => source.ok).length;
  const status = okSources >= 2 ? 'OK' : okSources === 1 ? 'PARTIAL' : 'DEGRADED';
  const value = {
    at: new Date().toISOString(),
    status,
    green: status === 'OK' && gemini,
    gemini,
    sources,
    headlines: relevant.length ? relevant : headlines.slice(0, 8),
    note: status === 'DEGRADED' ? 'Sin feed de noticias disponible.' : !gemini ? 'Feed activo, Gemini sin clave (auditoría limitada).' : okSources >= 2 ? 'Feeds activos + Gemini configurado para auditar.' : 'Un feed activo + Gemini configurado.'
  };
  cache = { at: Date.now(), value };
  return value;
}

export function resetNewsCache() { cache = { at: 0, value: null }; }