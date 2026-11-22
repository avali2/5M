import MarketChart from './MarketChart.jsx';
import { useEffect,useRef,useState } from 'react';
const symbols=['AMD','SPY','QQQ','NVDA','MSFT'];
const fmt=(v)=>typeof v==='number'?v.toFixed(2):'—';
const time=(v)=>v?new Date(v).toLocaleString('es-US',{timeZone:'America/New_York',dateStyle:'short',timeStyle:'short'}):'—';
export default function NitoPanel(){
  const [manual,setManual]=useState({side:'call',support:'',resistance:'',atr:''});
  const [initialGreeting,setInitialGreeting]=useState('¡Bienvenido, NiTo, chico!');
  const [symbol,setSymbol]=useState('AMD');
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const controller=useRef(null);
  const runId=useRef(0);
  async function refresh(){
    controller.current?.abort();
    const id=++runId.current;
    const c=new AbortController();controller.current=c;
    setBusy(true);setError('');setData(null);
    const timer=setTimeout(()=>c.abort(),90000);
    try{
      const res=await fetch('/api/nito?symbol='+encodeURIComponent(symbol),{headers:{},signal:c.signal,cache:'no-store'});
      const payload=await res.json().catch(()=>null);
      if(!res.ok||!payload) throw new Error(payload?.error||'Servicio no disponible (HTTP '+res.status+').');
      if(id===runId.current){setData(payload);if(payload.greeting)setInitialGreeting(payload.greeting);}
    }catch(e){
      if(id===runId.current)setError(e.name==='AbortError'?'La consulta excedió el tiempo de espera. Reintenta.':e instanceof TypeError?'Sin conexión con 5M. Verifica internet o espera el arranque del servidor.':e.message);
    }finally{
      clearTimeout(timer);if(id===runId.current)setBusy(false);
    }
  }
  useEffect(()=>{document.title='NiTo Market Pulse | 5 Millions';refresh();return()=>{controller.current?.abort();++runId.current;};},[]);
  useEffect(()=>{if(!data)return;const t=setTimeout(()=>{setData(null);setError('Lectura caducada. Actualiza antes de consultar contratos.');},60000);return()=>clearTimeout(t);},[data]);
  function changeSymbol(s){++runId.current;controller.current?.abort();setSymbol(s);setData(null);setError('');setBusy(false);}
  const s=Number(manual.support), r=Number(manual.resistance), a=Number(manual.atr);
  const valid=manual.support!==''&&manual.resistance!==''&&manual.atr!==''&&[s,r,a].every(Number.isFinite)&&s>0&&r>s&&a>0;
  const dir=manual.side==='call'?1:-1,trigger=dir===1?r:s;
  const manualPlan=valid&&trigger-dir*a>0&&trigger+dir*2*a>0?{trigger,stop:trigger-dir*a,t1:trigger+dir*a,t2:trigger+dir*2*a}:null;
  return <div className="app-shell nito-shell"><header className="topbar"><div className="topbar-inner"><div className="brand"><div className="brand-mark nito-mark">N<span>↗</span></div><div><p className="eyebrow">5 MILLIONS · MARKET INTELLIGENCE</p><h1>NiTo <span className="nito-accent">Market Pulse</span></h1></div></div></div></header>
    <main className="main-content"><section className="hero nito-hero"><div><p className="eyebrow blue">CALL · PUT · M5 / M15 · INVESTIGACIÓN</p><h2>{data?.greeting||initialGreeting}</h2><p className="hero-copy">Tu mesa direccional de opciones. M5 · confirmación M15 y D1. Sin registro ni contraseña. Aprende a planificar antes de actuar.</p></div></section>
    <section className="nito-direction-grid"><div className="side-card nito-call"><span>↗ LONG CALL</span><strong>Escenario alcista</strong><small>Confirmación antes de la entrada</small></div><div className="side-card nito-put"><span>↘ LONG PUT</span><strong>Escenario bajista</strong><small>Invalidación antes del objetivo</small></div></section>
    <section className="side-card nito-controls"><label>Activo<select className="text-input" value={symbol} onChange={e=>changeSymbol(e.target.value)}>{symbols.map(s=><option key={s}>{s}</option>)}</select></label><button className="primary-btn full" disabled={busy} onClick={refresh}>{busy?'Consultando…':'Actualizar panel'}</button></section>
    <MarketChart symbol={symbol} followSymbol />
    <section className="side-card nito-planner"><p className="eyebrow blue">LABORATORIO M5 · DATOS MANUALES</p><h2>Planifica tu escenario</h2><p>Introduce niveles y ATR de tu propio gráfico. Esta herramienta calcula niveles hipotéticos, no analiza cotizaciones ni genera alertas en vivo.</p><div className="nito-input-grid"><label>Dirección<select value={manual.side} onChange={e=>setManual({...manual,side:e.target.value})}><option value="call">CALL</option><option value="put">PUT</option></select></label>{[['support','Soporte'],['resistance','Resistencia'],['atr','ATR M5']].map(([k,label])=><label key={k}>{label}<input type="number" min="0" step="0.01" placeholder="0.00" value={manual[k]} onChange={e=>setManual({...manual,[k]:e.target.value})}/></label>)}</div>{manualPlan&&<div className="nito-result-grid">{[['Confirmación',manualPlan.trigger],['Invalidación',manualPlan.stop],['Objetivo 1R',manualPlan.t1],['Objetivo 2R',manualPlan.t2]].map(([label,value])=><div key={label}><small>{label}</small><strong>${fmt(value)}</strong></div>)}</div>}<p className="tiny">No se garantiza ejecución, rentabilidad ni una ventaja estadística. El laboratorio no es una señal operativa.</p></section>
    {error&&<div className="error-banner" role="alert">{error} · NO OPERAR con datos antiguos.</div>}
    {data&&<><section className="side-card"><p className="eyebrow blue">{data.symbol} · {data.status==='WATCH'?'EN VIGILANCIA':'SIN OPERACIÓN'}</p><h2>{data.symbol} {data.price!=null?'$'+fmt(data.price):''}</h2><p>{data.reason}</p><p className="tiny">Fuente: {data.source} · lectura {time(data.generatedAt)} ET · cotización {time(data.priceAt)} ET</p>{data.context&&<p>5m: {data.context.m5.trend} · 15m: {data.context.m15.trend} · Diario: {data.context.daily.trend}</p>}{data.levels&&<p>Soporte: ${fmt(data.levels.support)} · Resistencia: ${fmt(data.levels.resistance)}</p>}{data.plan&&<div className="side-card"><strong>Escenario condicional M5</strong><p>{data.plan.condition}</p><p>Nivel de confirmación: ${fmt(data.plan.trigger)} · Invalidación: ${fmt(data.plan.invalidation)}</p><p>Objetivos hipotéticos del subyacente (1R / 2R): ${fmt(data.plan.target1)} / ${fmt(data.plan.target2)}</p><p className="tiny">Niveles de investigación, no órdenes ni promesa de rendimiento. Esperar cierre de vela y revalidar opción y noticias.</p></div>}<p>Noticias: {data.newsStatus||'Sin verificar'} · No constituye autorización de entrada.</p></section>
    {data.candidates.map(o=><section className="side-card" key={o.symbol}><p className="eyebrow blue">HIPÓTESIS {o.type.toUpperCase()} · NO EJECUTAR AUTOMÁTICAMENTE</p><h2>{data.symbol} {o.type.toUpperCase()} ${fmt(o.strike)}</h2><p>{o.symbol} · Vencimiento {o.expiration}</p><div className="summary-grid"><div><strong>Bid / Ask</strong><p>${fmt(o.bid)} / ${fmt(o.ask)}</p></div><div><strong>Prima de referencia (ask)</strong><p>${fmt(o.maxLossUsd)} por contrato</p></div><div><strong>Riesgo máximo de la opción</strong><p>${fmt(o.maxLossUsd)} + costes</p></div><div><strong>Equilibrio al vencer</strong><p>${fmt(o.breakEven)}</p></div><div><strong>Beneficio máximo teórico</strong><p>{o.maxProfitUsd===null?'Sin límite teórico':'$'+fmt(o.maxProfitUsd)}</p></div><div><strong>Probabilidad</strong><p>No calibrada</p></div></div><p>Delta {fmt(o.delta)} · Gamma {fmt(o.gamma)} · Theta {fmt(o.theta)} · Vega {fmt(o.vega)} · IV {fmt(o.iv*100)}%</p><p>Volumen {o.volume} · Interés abierto {o.openInterest} · Cotización {time(o.quoteAt)} ET · Greeks {time(o.greeksAt)} ET</p><p>Escenario favorable: continuidad de la tendencia. Desfavorable: reversión, volatilidad implícita descendente o pérdida de valor temporal. No mantener por defecto hasta el vencimiento; revisar riesgo de ejercicio con el bróker. No hay stop o objetivo validado estadísticamente.</p></section>)}</>}
    <section className="disclaimer">Las opciones compradas pueden perder toda la prima. Los precios cambian; el ask no garantiza ejecución. Las hipótesis no son recomendaciones personalizadas. Verifica eventos y datos en tu bróker.</section>
    </main></div>;
}
