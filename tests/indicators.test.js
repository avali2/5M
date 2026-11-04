import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateBars, aggregateWeekly, buildMultiTimeframeContext } from '../server/lib/indicators.js';

function bars(count, start, minutes, first = 50, step = 0.05) {
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(start.getTime() + index * minutes * 60000).toISOString();
    const close = first + index * step;
    return { time: timestamp, timestamp, open: close - 0.02, high: close + 0.08, low: close - 0.08, close, volume: 100 + index };
  });
}

test('agrega barras intradía sin mezclar el orden y conserva OHLC', () => {
  const input = bars(12, new Date('2026-08-21T13:30:00Z'), 5);
  const result = aggregateBars(input, 3);
  assert.equal(result.length, 4);
  assert.equal(result[0].open, input[0].open);
  assert.equal(result[0].close, input[2].close);
  assert.equal(result[0].high, Math.max(input[0].high, input[1].high, input[2].high));
});

test('construye contexto 5m, 15m, 1h, diario y semanal', () => {
  const intraday = bars(420, new Date('2026-08-20T13:30:00Z'), 5, 70, 0.04);
  const daily = bars(320, new Date('2025-10-01T00:00:00Z'), 1440, 45, 0.12).map((bar) => ({ ...bar, date: bar.time.slice(0, 10) }));
  const context = buildMultiTimeframeContext({ daily, intraday5m: intraday, price: 84 });
  assert.deepEqual(Object.keys(context.timeframes), ['m5', 'm15', 'h1', 'd1', 'w1']);
  assert.ok(context.timeframeSummary.available >= 4);
  assert.ok(context.timeframes.m5.bars > context.timeframes.m15.bars);
  assert.ok(context.timeframes.d1.sufficient);
  assert.ok(aggregateWeekly(daily).length > 40);
});

test('una corrección de proveedor y un hueco no completan una vela de 15 minutos', () => {
  const rows = bars(6, new Date('2026-08-21T13:30:00Z'), 5);
  const corrected = { ...rows[5], close: 55, time: 'hora local ambigua' };
  const input = [rows[0], rows[0], rows[2], ...rows.slice(3), corrected];
  assert.equal(aggregateBars(input, 1).length, 5);
  const groups = aggregateBars(input, 3);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].close, 55);
  assert.equal(groups[0].time, rows[5].timestamp);
});
