const symbols=Object.freeze({SPY:'AMEX:SPY',QQQ:'NASDAQ:QQQ',DIA:'AMEX:DIA',IWM:'AMEX:IWM',AMD:'NASDAQ:AMD',AAPL:'NASDAQ:AAPL',MSFT:'NASDAQ:MSFT',NVDA:'NASDAQ:NVDA',AMZN:'NASDAQ:AMZN',GOOGL:'NASDAQ:GOOGL',META:'NASDAQ:META',TSLA:'NASDAQ:TSLA',SPX:'SP:SPX',NDX:'NASDAQ:NDX',RUT:'TVC:RUT',VIX:'TVC:VIX',XSP:'CBOE:XSP'});
export const CHART_SYMBOLS=Object.keys(symbols);
export const NITO_URL='https://valido-1m.onrender.com/nito';
export const AMD_URL='https://valido-1m.onrender.com';
export const CONFIG_URL='https://dashboard.render.com/web/srv-dbkeeq0m7kps738k7ee0/env';
export function chartSymbol(symbol){return Object.hasOwn(symbols,symbol)?symbols[symbol]:null;}
export function chartPath(symbol,interval='5'){
 const id=chartSymbol(symbol);if(!id)return null;
 const period=['5','15','60','D'].includes(interval)?interval:'5';
 return '/market-chart.html?tvwidgetsymbol='+encodeURIComponent(id)+'&interval='+period;
}
export function connectionState(cfg,status){
 const integrations=cfg?.integrations||{};
 const missing=[!integrations.tradier?'Tradier':null,!integrations.gemini?'Gemini':null].filter(Boolean);
 return {missing,canScan:Boolean(integrations.tradier),schedulerRunning:Boolean(integrations.tradier&&status?.scanner?.enabled&&status?.scanner?.startedAt)};
}
