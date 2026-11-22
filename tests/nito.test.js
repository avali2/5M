import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyGreeting, analyzeContract, marketGate } from '../server/lib/nito.js';
const now = new Date('2026-11-23T15:30:00Z');
test('daily greeting is stable within the same New York trading date', () => {
  assert.equal(dailyGreeting(now), dailyGreeting(new Date('2026-11-23T20:00:00Z')));
  assert.match(dailyGreeting(now), /NiTo/);
});
test('market gate refuses closed, unverified, or stale data', () => {
  const base = { now, clock: {state:'open'}, entitled:true, quote:{price:100,tradeDate:now.toISOString()} };
  assert.equal(marketGate(base), null);
  assert.ok(marketGate({...base,clock:{state:'closed'}}));
  assert.ok(marketGate({...base,entitled:false}));
  assert.ok(marketGate({...base,quote:{price:100,tradeDate:'2026-11-20T20:00:00Z'}}));
});
const option = {symbol:'TEST261204C00100000',expiration:'2026-12-04',strike:100,type:'call',contractSize:100,bid:2,ask:2.1,volume:100,openInterest:500,delta:0.55,gamma:0.03,theta:-0.07,vega:0.18,iv:0.32,greeksAt:now.toISOString()};
const q = {symbol:option.symbol,bid:2,ask:2.1,bidAt:now.toISOString(),askAt:now.toISOString()};
test('call scenario reports premium at ask, full risk and expiry breakeven, not a probability', () => {
  const out=analyzeContract(option,q,now);
  assert.equal(out.maxLossUsd,210);
  assert.equal(out.breakEven,102.1);
  assert.equal(out.maxProfitUsd,null);
  assert.equal(out.probability,null);
});
test('option analysis rejects stale and crossed quotes, nonstandard contracts and missing Greeks', () => {
  assert.equal(analyzeContract(option,{...q,askAt:'2026-11-20T20:00:00Z'},now),null);
  assert.equal(analyzeContract(option,{...q,bid:3},now),null);
  assert.equal(analyzeContract({...option,contractSize:10},q,now),null);
  assert.equal(analyzeContract({...option,delta:null},q,now),null);
});
test('put scenario has finite payoff at zero, never a guaranteed objective', () => {
  const out=analyzeContract({...option,type:'put',delta:-0.55},q,now);
  assert.equal(out.breakEven,97.9);
  assert.equal(out.maxProfitUsd,9790);
});
