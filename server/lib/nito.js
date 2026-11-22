import { createHash } from 'node:crypto';
import { buildMultiTimeframeContext } from './indicators.js';
const greetings = [
  '¡Buenos días, NiTo, chico! Primero el plan, después el mercado.',
  '¡Qué vuelta, NiTo, chico! La paciencia también es una posición.',
  '¡Vamos, NiTo, chico! Hoy buscamos calidad, no cantidad.',
  '¡Saludos, NiTo, chico! Protege el capital y deja que el precio confirme.',
  '¡Hey, NiTo, chico! La disciplina vale más que una entrada apresurada.',
  '¡Bienvenido, NiTo, chico! Observa el mercado antes de decidir.',
  '¡Arriba, NiTo, chico! No perseguimos velas; esperamos confirmación.'
];
const day = (d) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function dailyGreeting(now = new Date()) {
  const index = createHash('sha256').update(day(now)).digest().readUInt32BE(0) % greetings.length;
  return greetings[index];
}
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const fresh = (time, now, max=120000) => {
  const age = now.getTime() - Date.parse(time);
  return Number.isFinite(age) && age >= 0 && age <= max;
};
const r = (v) => Math.round(v*100)/100;
export function marketGate({now,clock,entitled,quote}) {
  if (String(clock?.state).toLowerCase() !== 'open') return 'Mercado cerrado o estado desconocido.';
  if (!entitled) return 'Tiempo real no confirmado por configuración.';
  if (!num(quote?.price) || quote.price <= 0 || !fresh(quote.tradeDate,now)) return 'Cotización del subyacente ausente o vencida.';
  return null;
}
export function analyzeContract(option, quote, now) {
  if (!option || quote?.symbol !== option.symbol || option.contractSize !== 100 || !['call','put'].includes(option.type)) return null;
  if (!num(option.strike) || option.strike <= 0 || ![option.delta,option.gamma,option.theta,option.vega,option.iv].every(num) || !fresh(option.greeksAt,now,7200000)) return null;
  if (!num(option.volume) || option.volume<50 || !num(option.openInterest) || option.openInterest<100) return null;
  if (!num(quote.bid) || !num(quote.ask) || quote.bid<=0 || quote.ask<quote.bid || !fresh(quote.bidAt,now) || !fresh(quote.askAt,now)) return null;
  const mid=(quote.ask+quote.bid)/2;
  if ((quote.ask-quote.bid)/mid>0.12 || Math.abs(option.delta)<0.4 || Math.abs(option.delta)>0.7 || (option.type==='call'?option.delta<=0:option.delta>=0)) return null;
  const call=option.type==='call';
  const breakEven=r(option.strike+(call?quote.ask:-quote.ask));
  return {symbol:option.symbol,type:option.type,strike:option.strike,expiration:option.expiration,bid:quote.bid,ask:quote.ask,mid:r(mid),quoteAt:quote.askAt,greeksAt:option.greeksAt,volume:option.volume,openInterest:option.openInterest,delta:option.delta,gamma:option.gamma,theta:option.theta,vega:option.vega,iv:option.iv,breakEven,maxLossUsd:r(quote.ask*100),maxProfitUsd:call?null:r(Math.max(0,option.strike-quote.ask)*100),probability:null};
}
export const NITO_SYMBOLS=['AMD','SPY','QQQ','NVDA','MSFT'];
export async function buildNito({tradier,entitled,symbol,now=new Date(),newsRisk=null}) {
  const base={greeting:dailyGreeting(now),date:day(now),symbol,generatedAt:now.toISOString(),source:'Tradier',mode:'research-only',candidates:[]};
  const block=(reason,extra={})=>({...base,status:'NO_TRADE',reason,...extra});
  if (!NITO_SYMBOLS.includes(symbol)) return block('Símbolo no admitido.');
  const clock=await tradier.getMarketClock();
  if (String(clock?.state).toLowerCase()!=='open') return block('Mercado cerrado. Próxima revisión durante la sesión regular.');
  if (!entitled) return block('Tiempo real no confirmado.');
  const [quotes,daily,intraday,expirations]=await Promise.all([tradier.getQuotes([symbol]),tradier.getHistory(symbol,420,'daily',now),tradier.getTimeSales(symbol,{interval:'5min',lookbackDays:5,now}),tradier.getExpirations(symbol)]);
  const quote=quotes.find(q=>q.symbol===symbol);
  const gate=marketGate({now:new Date(),clock,entitled,quote});
  if(gate) return block(gate);
  const ctx=buildMultiTimeframeContext({daily,intraday5m:intraday,price:quote.price});
  const m5=ctx.timeframes.m5,m15=ctx.timeframes.m15;
  const extra={price:quote.price,priceAt:quote.tradeDate,trend:ctx.trend,context:{m5,m15,daily:ctx.timeframes.d1}};
  if(!fresh(m5.asOf,new Date(),12*60000)||!m5.sufficient||!m15.sufficient||!ctx.timeframes.d1.sufficient) return block('Histórico intradía insuficiente o antiguo.',extra);
  const type=m5.trend==='bullish'&&m15.trend==='bullish'&&ctx.timeframes.d1.trend==='bullish'?'call':m5.trend==='bearish'&&m15.trend==='bearish'&&ctx.timeframes.d1.trend==='bearish'?'put':null;
  if(!type) return block('Sin alineación entre 5m, 15m y diario.',extra);
  const expiry=expirations.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e)).map(e=>({e,d:(Date.parse(e+'T00:00:00Z')-Date.parse(day(now)+'T00:00:00Z'))/86400000})).filter(x=>x.d>=7&&x.d<=21).sort((a,b)=>Math.abs(a.d-14)-Math.abs(b.d-14))[0];
  if(!expiry) return block('No hay vencimiento entre 7 y 21 días.',extra);
  const chain=await tradier.getOptionChain(symbol,expiry.e);
  const options=chain.filter(o=>o.type===type&&o.rootSymbol===symbol&&o.contractSize===100&&num(o.delta)&&Math.abs(o.delta)>=0.4&&Math.abs(o.delta)<=0.7&&o.volume>=50&&o.openInterest>=100&&o.symbol).sort((a,b)=>Math.abs(Math.abs(a.delta)-0.55)-Math.abs(Math.abs(b.delta)-0.55)).slice(0,8);
  if(!options.length) return block('Sin contratos líquidos en el rango de delta.',extra);
  const live=await tradier.getQuotes(options.map(o=>o.symbol));
  const end=new Date();
  const candidates=options.map(o=>analyzeContract(o,live.find(q=>q.symbol===o.symbol),end)).filter(Boolean).slice(0,2);
  if(!candidates.length) return block('Ningún contrato pasó validación de cotizaciones y Greeks.',extra);
  const support=m5.support20,resistance=m5.resistance20;
  if(!num(support)||!num(resistance)||support>=resistance) return block('Niveles técnicos insuficientes.',extra);
  return {...base,...extra,generatedAt:end.toISOString(),status:'WATCH',reason:'Hipótesis direccional para investigación manual; sin probabilidad calibrada ni validación de resultados. Revisar noticias y eventos del ticker.',newsStatus:newsRisk?.status||'UNKNOWN',type,levels:{support,resistance},candidates};
}
