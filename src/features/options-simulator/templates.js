const leg = (side, type, strike, price = 0.5) => ({ side, type, strike, quantity: 1, price, bid: '', ask: '', delta: '', gamma: '', theta: '', vega: '', volume: '', openInterest: '' });

export const STRATEGIES = [
  'Long Call', 'Long Put', 'Bull Put Credit Spread', 'Bear Call Credit Spread',
  'Bull Call Debit Spread', 'Bear Put Debit Spread', 'Iron Condor', 'Iron Butterfly',
  'Calendar Spread', 'Diagonal Spread', 'Covered Call', 'Cash Secured Put', 'PMCC',
  'Broken Wing Butterfly'
];

export function templateLegs(strategy, spot) {
  const step = spot >= 100 ? 5 : 1;
  const low = Math.round((spot - step) * 100) / 100;
  const lower = Math.round((spot - step * 2) * 100) / 100;
  const high = Math.round((spot + step) * 100) / 100;
  const higher = Math.round((spot + step * 2) * 100) / 100;
  switch (strategy) {
    case 'Long Call': return [leg('BUY', 'CALL', high, 1)];
    case 'Long Put': return [leg('BUY', 'PUT', low, 1)];
    case 'Bull Put Credit Spread': return [leg('SELL', 'PUT', low, 0.8), leg('BUY', 'PUT', lower, 0.3)];
    case 'Bear Call Credit Spread': return [leg('SELL', 'CALL', high, 0.8), leg('BUY', 'CALL', higher, 0.3)];
    case 'Bull Call Debit Spread': return [leg('BUY', 'CALL', low, 1.5), leg('SELL', 'CALL', high, 0.5)];
    case 'Bear Put Debit Spread': return [leg('BUY', 'PUT', high, 1.5), leg('SELL', 'PUT', low, 0.5)];
    case 'Iron Condor': return [leg('BUY', 'PUT', lower, 0.2), leg('SELL', 'PUT', low, 0.6), leg('SELL', 'CALL', high, 0.6), leg('BUY', 'CALL', higher, 0.2)];
    case 'Iron Butterfly': return [leg('BUY', 'PUT', low, 0.3), leg('SELL', 'PUT', spot, 1), leg('SELL', 'CALL', spot, 1), leg('BUY', 'CALL', high, 0.3)];
    case 'Covered Call': return [{ side: 'BUY', type: 'STOCK', strike: spot, entryPrice: spot, quantity: 1 }, leg('SELL', 'CALL', high, 0.7)];
    case 'Cash Secured Put': return [leg('SELL', 'PUT', low, 0.8)];
    case 'PMCC': return [leg('BUY', 'CALL', low, 4), leg('SELL', 'CALL', high, 0.7)];
    case 'Broken Wing Butterfly': return [leg('BUY', 'PUT', lower - step, 0.1), leg('SELL', 'PUT', low, 0.7), leg('SELL', 'PUT', low, 0.7), leg('BUY', 'PUT', spot, 1)];
    default: return [leg('BUY', 'CALL', low, 2), leg('SELL', 'CALL', high, 0.5)];
  }
}

export function legsFromSignal(setup) {
  return (setup?.legs || []).map((item) => ({
    side: item.side,
    type: item.type,
    strike: item.strike,
    quantity: 1,
    price: item.mid,
    bid: item.bid,
    ask: item.ask,
    delta: item.delta,
    gamma: item.gamma,
    theta: item.theta,
    vega: item.vega,
    volume: item.volume,
    openInterest: item.openInterest
  }));
}
