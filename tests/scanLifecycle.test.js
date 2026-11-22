import test from 'node:test';
import assert from 'node:assert/strict';
import { safeScanSnapshot, createScanJob } from '../server/lib/scanLifecycle.js';
const now=Date.parse('2026-11-23T15:00:00Z');
const at=new Date(now-60000).toISOString();
const scan={id:'test',generatedAt:at,market:{marketOpen:true},marketRisk:{status:'CLEAR',coverageComplete:true,checkedAt:at},portfolio:{updatedAt:at},signals:[{id:'a',status:'READY',readiness:{final:true,reasons:[]},dataQuality:{fresh:true,quoteTimestamp:at,intradayTimestamp:at,optionChainFetchedAt:at}}],summary:{ready:1,watch:0}};
const opts={now,maxDataAgeMinutes:5,newsCacheMinutes:5,portfolioFreshHours:24};
test('fresh complete snapshot remains available, but expiry downgrades READY without mutation',()=>{
  assert.equal(safeScanSnapshot(scan,opts).summary.ready,1);
  const stale=safeScanSnapshot(scan,{...opts,now:now+600000});
  assert.equal(stale.summary.ready,0);
  assert.equal(stale.signals[0].status,'WATCH');
  assert.equal(stale.signals[0].readiness.final,false);
  assert.equal(scan.signals[0].status,'READY');
});
test('failed scan, closed market or unknown timestamp blocks previous READY',()=>{
  for(const input of [safeScanSnapshot(scan,{...opts,blocked:true}),safeScanSnapshot({...scan,market:{marketOpen:false}},opts),safeScanSnapshot({...scan,signals:[{...scan.signals[0],dataQuality:{fresh:true}}]},opts)])assert.equal(input.summary.ready,0);
});
test('old news or old collateral cannot remain READY',()=>{
  assert.equal(safeScanSnapshot({...scan,marketRisk:{...scan.marketRisk,checkedAt:'2026-11-20T15:00:00Z'}},opts).summary.ready,0);
  assert.equal(safeScanSnapshot({...scan,portfolio:{updatedAt:'2026-11-20T15:00:00Z'}},opts).summary.ready,0);
});
test('manual request acknowledges immediately, deduplicates and exposes completion',async()=>{
  let finish,calls=0;
  const job=createScanJob(()=>{calls++;return new Promise(resolve=>finish=resolve);});
  const first=job.start();assert.equal(first.state,'running');assert.equal(job.start().id,first.id);
  await Promise.resolve();assert.equal(calls,1);
  finish(scan);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(job.status().state,'done');assert.equal(job.status().result.id,'test');
});
test('job failure never returns a previous result',async()=>{
  const job=createScanJob(async()=>{throw new Error('provider unavailable');});job.start();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(job.status().state,'failed');assert.equal(job.status().result,null);
});
