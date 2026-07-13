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

test('broker positions prefers Tradier and removes legacy signal-generated journal rows', async () => {
  const repository = {
    async listJournal() {
      return [
        { id: 'legacy', symbol: 'TSLA', strategy: 'Bull Put Spread', outcome: 'EJECUTADA', signal_original: JSON.stringify({ id: 'scanner-ticket', status: 'WATCH', legs: [{}] }) },
        { id: 'test', symbol: 'TEST', strategy: 'Bull Put Spread', outcome: 'OPEN' },
        { id: 'manual', symbol: 'NU', strategy: 'Long Call', outcome: 'OPEN', source: 'manual' }
      ];
    }
  };
  const tradierPosition = { id: 'tradier-sofi', symbol: 'SOFI', strategy: 'Long Call', source: 'tradier' };
  const providers = {
    tradier: {
      configured: true,
      async getAccountSnapshot() {
        return { status: 'ONLINE', positions: [tradierPosition], balances: {}, source: 'tradier_read_only' };
      }
    }
  };

  const result = await loadBrokerPositions({ repository, providers });
  assert.equal(result.source, 'tradier_read_only');
  assert.equal(result.brokerConnected, true);
  assert.deepEqual(result.positions.map((position) => position.symbol), ['SOFI', 'NU']);
});
