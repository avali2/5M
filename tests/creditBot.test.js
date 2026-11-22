import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditBot } from '../server/trading/creditBot.js';

const NOW = new Date('2026-11-24T16:00:00Z'); // martes 11:00 ET

function risingHistory(last = 100, count = 240) {
  const bars = [];
  let price = last * 0.62;
  // Tendencia alcista con días de retroceso intercalados: EMA50 > EMA200 y RSI sano (~55-65).
  for (let index = 0; index < count; index += 1) {
    const change = index % 3 === 0 ? -0.0021 : 0.0031;
    price *= 1 + change;
    bars.push({ date: '2026-01-01', open: price, high: price * 1.004, low: price * 0.996, close: price, volume: 1e6 });
  }
  const scale = last / bars[bars.length - 1].close;
  for (const bar of bars) {
    bar.open *= scale; bar.high *= scale; bar.low *= scale; bar.close *= scale;
  }
  return bars;
}

function fallingHistory(last = 100, count = 240) {
  const bars = [];
  let price = last * 1.55;
  for (let index = 0; index < count; index += 1) {
    const change = index % 3 === 0 ? 0.0021 : -0.0031;
    price *= 1 + change;
    bars.push({ date: '2026-01-01', open: price, high: price * 1.004, low: price * 0.996, close: price, volume: 1e6 });
  }
  const scale = last / bars[bars.length - 1].close;
  for (const bar of bars) { bar.open *= scale; bar.high *= scale; bar.low *= scale; bar.close *= scale; }
  return bars;
}

function flatHistory(last = 100, count = 240) {
  const bars = [];
  let price = last;
  for (let index = 0; index < count; index += 1) {
    // Alterna subas y bajas parecidas: RSI cerca de 50 y EMA planas.
    price *= index % 2 === 0 ? 1.0015 : 0.9985;
    bars.push({ date: '2026-01-01', open: price, high: price * 1.002, low: price * 0.998, close: price, volume: 1e6 });
  }
  const scale = last / bars[bars.length - 1].close;
  for (const bar of bars) { bar.open *= scale; bar.high *= scale; bar.low *= scale; bar.close *= scale; }
  return bars;
}

function snapshotWithChain({ spot = 100, credit = 1.1, direction = 'up' } = {}) {
  const expiration = '2026-12-29';
  const dte = 35;
  const put = (strike, delta, mid, oi = 900) => ({
    symbol: 'SPY' + strike + 'P', type: 'put', strike, delta, iv: 0.25,
    bid: mid - 0.01, ask: mid + 0.01, mid, openInterest: oi, volume: 100, expiration
  });
  const call = (strike, delta, mid, oi = 900) => ({
    symbol: 'SPY' + strike + 'C', type: 'call', strike, delta, iv: 0.25,
    bid: mid - 0.01, ask: mid + 0.01, mid, openInterest: oi, volume: 100, expiration
  });
  const shortMid = 1.0 + credit * 0.5;
  const longMid = shortMid - credit;
  return {
    symbol: 'SPY', asOf: NOW.toISOString(), simulated: false, marketOpen: true,
    quote: { price: spot },
    history: direction === 'up' ? risingHistory(spot) : direction === 'down' ? fallingHistory(spot) : flatHistory(spot),
    expirations: [expiration],
    dteByExpiration: { [expiration]: dte },
    chains: { [expiration]: [put(95, -0.18, shortMid), put(90, -0.1, longMid), call(105, 0.18, shortMid), call(110, 0.1, longMid)] },
    events: [], warnings: []
  };
}

test('arma un bull put con reglas de riesgo cuando la tendencia acompaña', () => {
  const bot = new CreditBot({ env: { CREDIT_BOT_MAX_RISK_USD: '500' }, now: () => NOW });
  const { plan, notes } = bot.playbook(snapshotWithChain());
  assert.deepEqual(notes, []);
  assert.ok(plan);
  assert.equal(plan.strategy, 'BULL_PUT_CREDIT');
  assert.equal(plan.legs[0].action, 'SELL');
  assert.equal(plan.legs[1].action, 'BUY');
  assert.ok(plan.legs[1].strike < plan.legs[0].strike);
  assert.ok(plan.credit > 0);
  assert.ok(plan.creditWidth >= 0.2);
  assert.ok(plan.maxLossPerContract > 0);
  assert.ok(plan.contracts >= 1 && plan.contracts <= 10);
  assert.ok(plan.riskUsd <= 500);
  assert.ok(plan.exits.profitTargetUsd > 0);
  assert.ok(plan.exits.stopLossUsd < 0);
  assert.equal(plan.exits.timeExitDte, 21);
});

test('en tendencia bajista vende un bear call spread', () => {
  const bot = new CreditBot({ env: { CREDIT_BOT_MAX_RISK_USD: '500' }, now: () => NOW });
  const { plan, notes } = bot.playbook(snapshotWithChain({ direction: 'down' }));
  assert.deepEqual(notes, []);
  assert.ok(plan);
  assert.equal(plan.strategy, 'BEAR_CALL_CREDIT');
  assert.equal(plan.direction, 'BEARISH');
  assert.equal(plan.legs[0].type, 'call');
  assert.ok(plan.legs[0].strike < plan.legs[1].strike, 'en un bear call se vende el strike más bajo');
  assert.ok(plan.credit > 0);
  assert.ok(plan.riskUsd <= 500);
});

test('en rango arma un iron condor con riesgo acotado', () => {
  const bot = new CreditBot({ env: { CREDIT_BOT_MAX_RISK_USD: '500' }, now: () => NOW });
  const snapshot = snapshotWithChain({ direction: 'flat' });
  const { plan, notes } = bot.condorPlan(snapshot, bot.readContext(snapshot));
  assert.deepEqual(notes, []);
  assert.ok(plan);
  assert.equal(plan.strategy, 'IRON_CONDOR');
  assert.equal(plan.direction, 'NEUTRAL');
  assert.equal(plan.legs.length, 4);
  assert.ok(plan.credit > 0);
  assert.ok(plan.riskUsd <= 500);
  assert.ok(plan.exits.stopLossUsd < 0);
  assert.ok(plan.shortPut < plan.spot && plan.shortCall > plan.spot);
});

test('rechaza crédito insuficiente para el ancho', () => {
  const bot = new CreditBot({ env: {}, now: () => NOW });
  const { plan, notes } = bot.playbook(snapshotWithChain({ credit: 0.3 }));
  assert.equal(plan, null);
  assert.ok(notes.some((note) => /Crédito\/ancho/i.test(note)));
});

test('bloquea live sin confirmación explícita y permite paper con sandbox', () => {
  const baseEnv = { APP_ACCESS_KEY: 'x', TRADIER_SANDBOX_TOKEN: 't', BOT_SANDBOX_ACCOUNT_ID: 'VA1234567', CREDIT_BOT_MAX_RISK_USD: '500' };
  const paper = new CreditBot({ env: baseEnv, now: () => NOW });
  paper.mode = 'paper';
  const paperGates = paper.gates();
  assert.equal(paperGates.checks.find((check) => check.name === 'Token sandbox')?.ok, true);
  const live = new CreditBot({ env: baseEnv, now: () => NOW });
  live.mode = 'live';
  const liveGates = live.gates();
  assert.equal(liveGates.ok, false);
  assert.equal(liveGates.checks.find((check) => check.name === 'Confirmación explícita')?.ok, false);
  const arm = live.arm('live');
  assert.equal(arm.ok, false);
});

test('estado: armar, pausar y desarmar sin red', () => {
  const bot = new CreditBot({ env: { APP_ACCESS_KEY: 'x', TRADIER_SANDBOX_TOKEN: 't', BOT_SANDBOX_ACCOUNT_ID: 'VA1234567' }, now: () => NOW });
  bot.mode = 'paper';
  bot.state.armed = true;
  bot.state.paused = false;
  assert.equal(bot.pause(true).paused, true);
  assert.equal(bot.pause(false).paused, false);
  assert.equal(bot.disarm().armed, false);
  const status = bot.status();
  assert.equal(status.mode, 'paper');
  assert.ok(Array.isArray(status.gates.checks));
  assert.equal(status.history.length, 0);
});
test('auto-armado solo con requisitos completos', () => {
  const bot = new CreditBot({ env: { CREDIT_BOT_AUTO_ARM: 'true' }, now: () => NOW });
  bot.gates = () => ({ ok: true, checks: [] });
  assert.equal(bot.maybeAutoArm(), true);
  assert.equal(bot.state.armed, true);
  const blocked = new CreditBot({ env: { CREDIT_BOT_AUTO_ARM: 'true' }, now: () => NOW });
  blocked.state.armed = false;
  blocked.gates = () => ({ ok: false, checks: [] });
  assert.equal(blocked.maybeAutoArm(), false);
});

test('DeepSeek puede rechazar el plan y el bot no opera', async () => {
  const bot = new CreditBot({
    env: { CREDIT_BOT_AI_REVIEW: 'required', CREDIT_BOT_MAX_RISK_USD: '500' },
    now: () => NOW,
    reviewer: async () => ({ decision: 'REJECT', confidence: 81, reasons: ['Evento macro cercano'], risks: ['gap'] })
  });
  assert.equal(bot.aiReview, 'required');
  const review = await bot.reviewPlan({ symbol: 'SPY' }, { spot: 100 });
  assert.equal(review.decision, 'REJECT');
  assert.equal(review.confidence, 81);
  assert.ok(review.reasons[0].includes('Evento'));
});

test('si la IA falla se devuelve WAIT y no se aprueba', async () => {
  const bot = new CreditBot({ env: {}, now: () => NOW, reviewer: async () => { throw new Error('sin cuota'); } });
  const review = await bot.reviewPlan({ symbol: 'SPY' }, {});
  assert.equal(review.decision, 'WAIT');
  assert.ok(review.reasons.some((reason) => /IA no disponible/.test(reason)));
});