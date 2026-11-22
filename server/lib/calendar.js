/**
 * 5M · Calendario de eventos de alto impacto (aproximado, sin API de pago).
 * - FOMC: fechas oficiales publicadas por la Fed.
 * - CPI: publicación mensual (BLS), fechas aproximadas.
 * - NFP: primer viernes del mes.
 * - OPEX: tercer viernes del mes.
 * No reemplaza un calendario profesional: sirve para bloquear entradas y
 * cerrar posiciones antes de eventos con riesgo de gap.
 */
const FOMC = {
  2026: ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16'],
  2027: ['2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16', '2027-07-28', '2027-09-15', '2027-11-03', '2027-12-15']
};

const iso = (date) => date.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(a + 'T20:00:00Z') - Date.parse(b + 'T20:00:00Z')) / 86400000);

function nthWeekday(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (nth - 1) * 7));
}

function cpiDates(year) {
  const dates = [];
  for (let month = 0; month < 12; month += 1) {
    const tuesday = nthWeekday(year, month, 2, 2);
    const day = tuesday.getUTCDate();
    dates.push(iso(new Date(Date.UTC(year, month, Math.min(day, 14)))));
  }
  return dates;
}

export function highImpactEvents({ from = new Date(), months = 4 } = {}) {
  const events = [];
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const limit = new Date(start.getTime() + months * 31 * 86400000);
  const today = iso(start);
  for (let cursor = new Date(start); cursor <= limit; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = iso(cursor);
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    if ((FOMC[year] || []).includes(date)) events.push({ date, type: 'FOMC', label: 'Decisión de la Fed (FOMC)', impact: 'high' });
    if (cpiDates(year).includes(date)) events.push({ date, type: 'CPI', label: 'Inflación CPI (8:30 ET)', impact: 'high' });
    if (cursor.getUTCDay() === 5 && cursor.getUTCDate() <= 7) events.push({ date, type: 'NFP', label: 'Nóminas no agrícolas (8:30 ET)', impact: 'high' });
    if (cursor.getUTCDay() === 5 && cursor.getUTCDate() >= 15 && cursor.getUTCDate() <= 21) events.push({ date, type: 'OPEX', label: 'Vencimiento mensual (OPEX)', impact: 'medium' });
  }
  return events.filter((event) => daysBetween(event.date, today) >= 0);
}

export function eventRisk({ now = new Date(), dte = 0, entryBlockDays = 2, positionWarnDays = 1 } = {}) {
  const today = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  const events = highImpactEvents({ from: now, months: Math.max(2, Math.ceil((dte + 10) / 30)) });
  const upcoming = events.filter((event) => daysBetween(event.date, today) >= 0 && daysBetween(event.date, today) <= 60);
  const blocking = upcoming.filter((event) => event.impact === 'high' && daysBetween(event.date, today) <= entryBlockDays);
  const duringTrade = upcoming.filter((event) => event.impact === 'high' && daysBetween(event.date, today) <= dte);
  const soon = upcoming.filter((event) => event.impact === 'high' && daysBetween(event.date, today) <= positionWarnDays);
  return {
    today,
    upcoming: upcoming.slice(0, 8),
    blocking,
    duringTrade: duringTrade.slice(0, 6),
    soon,
    blockEntry: blocking.length > 0,
    note: blocking.length ? 'Evento de alto impacto en ' + blocking.map((event) => event.type + ' ' + event.date).join(', ') : null
  };
}
