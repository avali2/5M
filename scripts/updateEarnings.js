import { insertEarnings } from '../server/db/historyRepository.js';
import { CORE_UNIVERSE } from '../src/config/marketUniverse.js';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY;
if (!ALPHA_VANTAGE_KEY) throw new Error('Falta ALPHA_VANTAGE_API_KEY');

async function fetchEarnings(symbol) {
  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.earningsCalendar || !data.earningsCalendar.length) return [];
  return data.earningsCalendar.map(e => ({
    date: e.reportDate,
    estimated: e.estimatedEPS ? parseFloat(e.estimatedEPS) : null,
    actual: e.actualEPS ? parseFloat(e.actualEPS) : null,
    fiscalQuarter: e.fiscalQuarter
  }));
}

console.log(`Actualizando earnings para ${CORE_UNIVERSE.length} símbolos...`);
for (const symbol of CORE_UNIVERSE) {
  try {
    const earnings = await fetchEarnings(symbol);
    for (const e of earnings) {
      await insertEarnings(symbol, e.date, e.estimated, e.actual, e.fiscalQuarter);
    }
    console.log(`  ✅ ${symbol}: ${earnings.length} earnings`);
    await new Promise(resolve => setTimeout(resolve, 15000));
  } catch (err) {
    console.error(`  ❌ ${symbol}: ${err.message}`);
  }
}
console.log('Earnings actualizados.');
process.exit(0);