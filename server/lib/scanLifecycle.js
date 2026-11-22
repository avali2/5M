import { randomUUID } from 'node:crypto';

function ageValid(timestamp,now,maxMinutes){
  const age=now-Date.parse(timestamp);
  return Number.isFinite(age)&&age>=0&&age<=maxMinutes*60000;
}
export function safeScanSnapshot(scan,{now=Date.now(),maxDataAgeMinutes=5,newsCacheMinutes=5,portfolioFreshHours=24,blocked=false}={}){
  if(!scan)return null;
  const common=[];
  if(blocked)common.push('Actualización pendiente o fallida.');
  if(scan.market?.marketOpen!==true)common.push('Mercado cerrado o no confirmado.');
  if(!ageValid(scan.generatedAt,now,maxDataAgeMinutes))common.push('Exploración vencida.');
  if(scan.marketRisk?.status!=='CLEAR'||!scan.marketRisk?.coverageComplete||!ageValid(scan.marketRisk.checkedAt,now,newsCacheMinutes))common.push('Noticias sin vigencia o sin cobertura.');
  if(!ageValid(scan.portfolio?.updatedAt,now,portfolioFreshHours*60))common.push('Colateral manual sin vigencia.');
  const signals=(scan.signals||[]).map(signal=>{
    if(signal.status!=='READY')return signal;
    const reasons=[...common];
    const q=signal.dataQuality;
    if(!q?.fresh||![q.quoteTimestamp,q.intradayTimestamp,q.optionChainFetchedAt].every(t=>ageValid(t,now,maxDataAgeMinutes)))reasons.push('Cotizaciones o velas vencidas.');
    if(!reasons.length)return signal;
    return {...signal,status:'WATCH',readiness:{...signal.readiness,final:false,reasons:[...(signal.readiness?.reasons||[]),...reasons]}};
  });
  return {...scan,market:{...scan.market,marketOpen:scan.market?.marketOpen===true&&ageValid(scan.generatedAt,now,maxDataAgeMinutes)&&!blocked},signals,summary:{...scan.summary,ready:signals.filter(s=>s.status==='READY').length,watch:signals.filter(s=>s.status==='WATCH').length,rejected:signals.filter(s=>s.status==='REJECTED').length},snapshotState:common.length?'REVIEW_ONLY':'CURRENT',snapshotWarnings:common};
}
export function createScanJob(run,{cooldownMs=60000}={}){
  let value={id:null,state:'idle',startedAt:null,finishedAt:null,result:null,error:null};
  return {
    start(){
      if(value.state==='running'||(value.startedAt&&Date.now()-Date.parse(value.startedAt)<cooldownMs))return value;
      value={id:randomUUID(),state:'running',startedAt:new Date().toISOString(),finishedAt:null,result:null,error:null};
      Promise.resolve().then(run).then(result=>{
        if(!result)throw Error('Sin exploración');
        value={...value,state:'done',finishedAt:new Date().toISOString(),result};
      }).catch(()=>{value={...value,state:'failed',finishedAt:new Date().toISOString(),result:null,error:'No se completó la exploración. Verifica las integraciones y vuelve a intentarlo.'};});
      return value;
    },
    status(){return value;}
  };
}
