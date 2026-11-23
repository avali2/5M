import test from 'node:test';
import assert from 'node:assert/strict';
import { etWallToUtc, parseBlsIcs, parseBeaJson, daysUntilEt, baselineEvents } from '../server/lib/calendar.js';

test('convierte hora de pared ET a UTC respetando DST', () => {
  const winter = etWallToUtc(2026, 12, 10, 8, 30);
  assert.equal(winter.toISOString(), '2026-12-10T13:30:00.000Z');
  const summer = etWallToUtc(2026, 7, 14, 8, 30);
  assert.equal(summer.toISOString(), '2026-07-14T12:30:00.000Z');
});

test('parsea CPI y NFP del ICS de BLS', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;TZID=US-Eastern:20261210T083000', 'SUMMARY:Consumer Price Index', 'END:VEVENT', 'BEGIN:VEVENT', 'DTSTART;TZID=US-Eastern:20261204T083000', 'SUMMARY:Employment Situation', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const events = parseBlsIcs(ics);
  assert.equal(events.length, 2);
  assert.ok(events.some((event) => event.event_type === 'CPI' && event.scheduled_at_utc === '2026-12-10T13:30:00.000Z'));
  assert.ok(events.some((event) => event.event_type === 'NFP'));
});

test('parsea PCE del JSON de BEA', () => {
  const payload = { 'Personal Income and Outlays': { release_dates: ['2026-11-25T13:30:00+00:00'] } };
  const events = parseBeaJson(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'PCE');
  assert.equal(events[0].scheduled_at_utc, '2026-11-25T13:30:00.000Z');
});

test('calcula días hasta el evento en calendario ET', () => {
  const now = new Date('2026-11-23T15:00:00Z');
  assert.equal(daysUntilEt(now, '2026-11-25T13:30:00.000Z'), 2);
  assert.equal(daysUntilEt(now, '2026-11-23T13:30:00.000Z'), 0);
});

test('el baseline incluye FOMC y OPEX', () => {
  const events = baselineEvents(new Date('2026-11-22T12:00:00Z'));
  assert.ok(events.some((event) => event.event_type === 'FOMC_RATE_DECISION'));
  assert.ok(events.some((event) => event.event_type === 'OPEX_MONTHLY_STANDARD'));
});
