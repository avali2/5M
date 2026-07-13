function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value, fallback = 1) {
  const parsed = Math.floor(finite(value) ?? fallback);
  return Math.max(1, parsed);
}

function normalizeOptionSymbol(value) {
  const symbol = String(value || '').toUpperCase().replaceAll(' ', '').trim();
  if (!/^[A-Z0-9./-]{1,6}\d{6}[CP]\d{8}$/.test(symbol)) {
    throw new Error(`Invalid OCC option symbol: ${symbol || 'missing'}`);
  }
  return symbol;
}

function premiumFromSetup(setup = {}) {
  const credit = finite(setup.credit ?? setup.netCredit);
  if (credit !== null && credit > 0) return { type: 'credit', price: credit };
  const debit = finite(setup.debit ?? setup.netDebit);
  if (debit !== null && debit > 0) return { type: 'debit', price: debit };
  const structured = setup.creditDebit || {};
  const value = finite(structured.value ?? setup.limitPrice);
  if (value !== null && value > 0 && ['credit', 'debit'].includes(structured.type)) {
    return { type: structured.type, price: value };
  }
  throw new Error('A positive limit credit or debit is required.');
}

function openingSide(side) {
  return /sell|short/i.test(String(side || '')) ? 'sell_to_open' : 'buy_to_open';
}

function closingSide(side) {
  return /sell|short/i.test(String(side || '')) ? 'buy_to_close' : 'sell_to_close';
}

export function setupSignalKey(setup = {}) {
  return [
    setup.symbol,
    setup.strategy,
    setup.expiration,
    setup.strikes || (setup.legs || []).map((leg) => leg.strike).join('/')
  ].map((value) => String(value || '')).join('|');
}

export function buildTradierOptionOrder(setup = {}, contracts = 1, { closing = false, tagPrefix = 'valido-paper' } = {}) {
  const legs = Array.isArray(setup.legs) ? setup.legs : [];
  if (!setup.symbol || !legs.length || legs.length > 4) throw new Error('Option ticket requires one to four legs.');
  const quantity = positiveInteger(contracts);
  const premium = premiumFromSetup(setup);
  const normalizedLegs = legs.map((leg) => ({
    optionSymbol: normalizeOptionSymbol(leg.symbol || leg.optionSymbol || leg.option_symbol),
    side: closing ? closingSide(leg.side) : openingSide(leg.side),
    quantity: positiveInteger(leg.ratio || leg.quantity || 1) * quantity
  }));
  const tag = `${tagPrefix}-${Date.now()}`.slice(0, 64);

  if (normalizedLegs.length === 1) {
    return {
      class: 'option',
      symbol: String(setup.symbol).toUpperCase(),
      option_symbol: normalizedLegs[0].optionSymbol,
      side: normalizedLegs[0].side,
      quantity: normalizedLegs[0].quantity,
      type: 'limit',
      duration: 'day',
      price: Number(premium.price.toFixed(2)),
      tag
    };
  }

  const order = {
    class: 'multileg',
    symbol: String(setup.symbol).toUpperCase(),
    type: closing ? (premium.type === 'credit' ? 'debit' : 'credit') : premium.type,
    duration: 'day',
    price: Number(premium.price.toFixed(2)),
    tag
  };
  normalizedLegs.forEach((leg, index) => {
    order[`option_symbol[${index}]`] = leg.optionSymbol;
    order[`side[${index}]`] = leg.side;
    order[`quantity[${index}]`] = leg.quantity;
  });
  return order;
}

export function encodeTradierOrder(order = {}, preview = true) {
  const form = new URLSearchParams();
  Object.entries({ ...order, preview: preview ? 'true' : 'false' }).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') form.set(key, String(value));
  });
  return form.toString();
}
