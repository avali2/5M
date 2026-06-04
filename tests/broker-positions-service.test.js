import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrokerPositions } from '../server/services/brokerPositionsService.js';

test('broker positions only returns manual open positions', async () => {
  const repository = {
    async listJournal() {
      return [
        { id: 'manual-1', symbol: 'SOFI', outcome: 'OPEN', source: 'manual' },
        { id: 'signal-1', symbol: 'TSLA', outcome: 'OPEN / WATCHING', source: 'signal_taken' },
        { id: 'signal-2', symbol: 'AAPL', outcome: 'OPEN', signal_original: JSON.stringify({ source: 'signal_taken' }) }
      ];
    }
  };

  const result = await loadBrokerPositions({ repository, providers: {} });
  assert.deepEqual(result.positions.map((position) => position.symbol), ['SOFI']);
});
