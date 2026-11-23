/**
 * 5M · Calendario de eventos con fuentes oficiales.
 * - BLS ICS: CPI y Employment Situation (NFP) con hora exacta ET.
 * - BEA release_dates.json: Personal Income and Outlays (PCE).
 * - Federal Reserve: FOMC (fechas oficiales hardcodeadas, decisión 14:00 ET).
 * - OCC/Cboe: OPEX mensual estándar (tercer viernes, 16:00 ET).
 * Impacto asignado por regla del bot (impact_source = BOT_RULE).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const FOMC = {
  2026: ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16'],
  2027: ['2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16', '2027-07-28', '2027-09-15', '2027-11-03', '2027-12-15']
};
const BLS_ICS = 'https://www.bls.gov/schedule/news_release/bls.ics';
const BEA_JSON = 'https://apps.bea.gov/API/signup/release_dates.json';

let cache = null;

function etOffsetMs(utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(utcMs)).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return wall - utcMs;
}

export function etWallToUtc(year, month, day, hour, minute) {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let index = 0; index < 3; index += 1) guess = Date.UTC(year, month - 1, day, hour, minute) - etOffsetMs(guess);
  return new Date(guess);
}

function isoUtc(date) { return new Date(date).toISOString(); }
function isoEt(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date(date)).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute + ':00';
}

function makeEvent({ id, type, title, source, sourceUrl, impact, scheduledAt, reliability }) {
  return {
    event_id: id, event_type: type, title, source, source_url: sourceUrl,
    country: 'US', impact, impact_source: 'BOT_RULE',
    scheduled_at_utc: isoUtc(scheduledAt), scheduled_at_et: isoEt(scheduledAt),
    timezone: 'America/New_York', schedule_status: 'CONFIRMED', reliability,
    metadata: { date_span_estimated: false }
  };
}

export function parseBlsIcs(text) {
  const events = [];
  const blocks = String(text || '').split('BEGIN:VEVENT').slice(1);
  for (const block of blocks) {
    const summary = (block.match(/SUMMARY:(.+)/) || [])[1]?.trim() || '';
    const dtLine = (block.match(/DTSTART([^\n]*)\n?/) || [])[0] || '';
    const dt = (dtLine.match(/:(\d{8}(?:T\d{6})?Z?)/) || [])[1] || null;
    if (!dt) continue;
    let scheduledAt = null;
    if (dt.length === 8) {
      const year = Number(dt.slice(0, 4)); const month = Number(dt.slice(4, 6)); const day = Number(dt.slice(6, 8));
      scheduledAt = etWallToUtc(year, month, day, 8, 30);
    } else {
      const year = Number(dt.slice(0, 4)); const month = Number(dt.slice(4, 6)); const day = Number(dt.slice(6, 8));
      const hour = Number(dt.slice(9, 11)); const minute = Number(dt.slice(11, 13));
      scheduledAt = dt.endsWith('Z') ? new Date(Date.UTC(year, month - 1, day, hour, minute)) : etWallToUtc(year, month, day, hour, minute);
    }
    const isCpi = /consumer price index/i.test(summary);
    const isNfp = /employment situation/i.test(summary);
    if (!isCpi && !isNfp) continue;
    const type = isCpi ? 'CPI' : 'NFP';
    const dateKey = isoUtc(scheduledAt).slice(0, 10);
    events.push(makeEvent({ id: 'BLS:' + type + ':' + dateKey, type, title: summary, source: 'BLS', sourceUrl: BLS_ICS, impact: 'HIGH', scheduledAt, reliability: 'PRIMARY_OFFICIAL' }));
  }
  return events;
}

export function parseBeaJson(payload) {
  const events = [];
  const key = Object.keys(payload || {}).find((name) => /personal income and outlays/i.test(name));
  if (!key) return events;
  for (const iso of payload[key].release_dates || []) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    events.push(makeEvent({ id: 'BEA:PCE:' + iso.slice(0, 10), type: 'PCE', title: key, source: 'BEA', sourceUrl: BEA_JSON, impact: 'HIGH', scheduledAt: date, reliability: 'PRIMARY_OFFICIAL' }));
  }
  return events;
}

function thirdFriday(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (5 - first.getUTCDay() + 7) % 7;
  return 1 + offset + 14;
}

export function baselineEvents(now = new Date()) {
  const events = [];
  const year = now.getUTCFullYear();
  for (const yearKey of [year - 1, year, year + 1]) {
    for (const date of FOMC[yearKey] || []) {
      const [y, m, d] = date.split('-').map(Number);
      events.push(makeEvent({ id: 'FED:FOMC:' + date, type: 'FOMC_RATE_DECISION', title: 'FOMC rate decision', source: 'Federal Reserve', sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', impact: 'HIGH', scheduledAt: etWallToUtc(y, m, d, 14, 0), reliability: 'PRIMARY_OFFICIAL' }));
    }
  }
  for (let offset = -2; offset <= 15; offset += 1) {
    const base = new Date(Date.UTC(year, now.getUTCMonth() + offset, 1));
    const y = base.getUTCFullYear(); const m = base.getUTCMonth() + 1;
    const day = thirdFriday(y, m);
    events.push(makeEvent({ id: 'OCC:OPEX:' + y + '-' + String(m).padStart(2, '0'), type: 'OPEX_MONTHLY_STANDARD', title: 'Monthly standard options expiration', source: 'OCC/Cboe', sourceUrl: 'https://www.theocc.com/company-information/expiration-calendars', impact: 'MEDIUM', scheduledAt: etWallToUtc(y, m, day, 16, 0), reliability: 'PRIMARY_OFFICIAL' }));
  }
  return events;
}

function cachePath() { return path.join(config.dataDir, 'calendar.json'); }

export function loadCalendar() {
  if (cache) return cache;
  try { const json = JSON.parse(fs.readFileSync(cachePath(), 'utf8')); cache = json; return cache; }
  catch { cache = { fetchedAt: null, sources: {}, events: baselineEvents() }; return cache; }
}

export function saveCalendar(data) {
  cache = data;
  try {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(cachePath(), JSON.stringify(data, null, 1), { mode: 0o600 });
  } catch { /* sin disco */ }
  return data;
}

export async function refreshCalendar(options = {}) {
  const fetchImpl = options.fetch || fetch;
  const now = options.now ? options.now() : new Date();
  const sources = {};
  const events = new Map();
  for (const event of baselineEvents(now)) events.set(event.event_id, event);
  try {
    const res = await fetchImpl(BLS_ICS, { headers: { 'User-Agent': '5M/1.0' }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const parsed = parseBlsIcs(text);
    for (const event of parsed) events.set(event.event_id, event);
    sources.bls = { ok: true, events: parsed.length };
  } catch (error) { sources.bls = { ok: false, error: error.message.slice(0, 120) }; }
  try {
    const res = await fetchImpl(BEA_JSON, { headers: { 'User-Agent': '5M/1.0' }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const payload = await res.json();
    const parsed = parseBeaJson(payload);
    for (const event of parsed) events.set(event.event_id, event);
    sources.bea = { ok: true, events: parsed.length };
  } catch (error) { sources.bea = { ok: false, error: error.message.slice(0, 120) }; }
  sources.fed = { ok: true, events: baselineEvents(now).filter((event) => event.source === 'Federal Reserve').length };
  sources.occ = { ok: true, events: baselineEvents(now).filter((event) => event.source === 'OCC/Cboe').length };
  const data = {
    fetchedAt: now.toISOString(),
    sources,
    events: [...events.values()].sort((left, right) => Date.parse(left.scheduled_at_utc) - Date.parse(right.scheduled_at_utc))
  };
  return saveCalendar(data);
}

function etDateKey(iso) { return isoEt(iso).slice(0, 10); }

export function daysUntilEt(now, iso) {
  const today = etDateKey(now.toISOString());
  const target = etDateKey(iso);
  return Math.round((Date.parse(target + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

export function highImpactEvents({ from = new Date(), months = 4 } = {}) {
  const data = loadCalendar();
  const limit = new Date(from).getTime() + months * 31 * 86400000;
  return (data.events || []).filter((event) => event.impact === 'HIGH' && Date.parse(event.scheduled_at_utc) >= new Date(from).getTime() && Date.parse(event.scheduled_at_utc) <= limit);
}

export function eventRisk({ now = new Date(), dte = 0, entryBlockDays = 2, positionWarnDays = 1 } = {}) {
  const data = loadCalendar();
  const events = (data.events || []).filter((event) => event.impact === 'HIGH').map((event) => ({ ...event, days: daysUntilEt(now, event.scheduled_at_utc) }));
  const upcoming = events.filter((event) => event.days >= 0).sort((left, right) => left.days - right.days);
  const blocking = upcoming.filter((event) => event.days <= entryBlockDays);
  const duringTrade = upcoming.filter((event) => event.days <= dte);
  const soon = upcoming.filter((event) => event.days <= positionWarnDays);
  return {
    today: etDateKey(now.toISOString()),
    upcoming: upcoming.slice(0, 10),
    blocking,
    duringTrade: duringTrade.slice(0, 8),
    soon,
    blockEntry: blocking.length > 0,
    note: blocking.length ? 'Evento de alto impacto en ' + blocking.map((event) => event.event_type + ' ' + event.scheduled_at_et).join(', ') : null
  };
}

export function calendarStatus() {
  const data = loadCalendar();
  const now = new Date();
  const upcoming = (data.events || []).filter((event) => Date.parse(event.scheduled_at_utc) >= now.getTime()).slice(0, 12);
  return { fetchedAt: data.fetchedAt, sources: data.sources, total: (data.events || []).length, upcoming };
}
