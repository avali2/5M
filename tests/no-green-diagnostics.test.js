import test from 'node:test';
import assert from 'node:assert/strict';
import { ScanPersistence } from '../server/services/scanPersistence.js';

test('diagnostics explains why no green signal exists', async () => {
  const persistence = new ScanPersistence({});
  const scan = {
    asOf: '2026-06-04T14:00:00.000Z',
    collection: { scannedSymbols: 10, chainsCollected: 3 },
    opportunities: [],
    rejected: [
      { status: 'BLOCKED', blocks: ['Liquidez debajo del umbral institucional'] },
      { status: 'BLOCKED', blocks: ['Riesgo mayor al presupuesto por operacion'] },
      { status: 'CANDIDATE', greenPolicy: { reasons: ['Score 66 is candidate range'] } }
    ],
    conditionalIdeas: [],
    providers: [],
    decision: { status: 'no_trade', reasons: ['No ready green'] }
  };
  const diagnostics = await persistence.diagnostics(scan);
  assert.equal(diagnostics.readyGreen, 0);
  assert.ok(diagnostics.topRejectionReasons.length >= 2);
  assert.ok(diagnostics.whatMustChange.some((item) => /Liquidez|Riesgo|Score/.test(item)));
});
