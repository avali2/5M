import test from 'node:test';
import assert from 'node:assert/strict';
import { chartSymbol, chartPath, connectionState } from '../src/marketView.js';
test('TradingView mapping only admits the supported instruments',()=>{
 assert.equal(chartSymbol('SPY'),'AMEX:SPY');
 assert.equal(chartSymbol('NVDA'),'NASDAQ:NVDA');
 assert.equal(chartSymbol('SPX'),'SP:SPX');
 assert.equal(chartSymbol('bad'),null);
 assert.equal(chartPath('bad'),null);
 assert.equal(chartPath('AMD','5'),'/market-chart.html?tvwidgetsymbol=NASDAQ%3AAMD&interval=5');
 assert.equal(chartPath('AMD','"><script>'),'/market-chart.html?tvwidgetsymbol=NASDAQ%3AAMD&interval=5');
});
test('missing data credentials are not shown as a running scanner',()=>{
 const s=connectionState({integrations:{tradier:false,gemini:false}},{scanner:{enabled:true,startedAt:null}});
 assert.equal(s.canScan,false);assert.equal(s.schedulerRunning,false);assert.equal(s.missing.join(','),'Tradier,Gemini');
});
test('scheduler reports actual initialization and review is enabled with data',()=>{
 const s=connectionState({integrations:{tradier:true,gemini:true}},{scanner:{enabled:true,startedAt:'2026-11-21T12:00:00Z'}});
 assert.equal(s.canScan,true);assert.equal(s.schedulerRunning,true);assert.equal(s.missing.length,0);
});
