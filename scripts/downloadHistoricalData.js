import yahooFinance from 'yahoo-finance2';
import { insertPriceHistory } from '../server/db/historyRepository.js';
import { CORE_UNIVERSE } from '../src/config/marketUniverse.js';

const endDate = new Date();
const startDate = new Date();
startDate.setMonth(startDate.getMonth() - 12);

console.log(`Descargando históricos para ${CORE_UNIVERSE.length} símbolos...`);

for (const symbol of CORE_UNIVERSE) {
  try {
    console.log(`  ${symbol}...`);
    const query = { symbol, from: startDate, to: endDate, interval: '1d' };
    const result = await yahooFinance.historical(query);
    for (const bar of result) {
      await insertPriceHistory(symbol, bar.date.toISOString().split('T')[0], {
        open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume
      });
    }
    console.log(`    ✅ ${symbol}: ${result.length} registros`);
  } catch (err) {
    console.error(`    ❌ ${symbol}: ${err.message}`);
  }
}

console.log('Históricos completados.');
process.exit(0);