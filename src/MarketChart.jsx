import { useState } from 'react';
import { chartSymbol,chartPath,CHART_SYMBOLS } from './marketView.js';
export default function MarketChart({symbol:initial='SPY',followSymbol=false}){
 const [symbol,setSymbol]=useState(initial);
 const [interval,setInterval]=useState('5');
 const [opened,setOpened]=useState(false);
 const selected=followSymbol?initial:symbol;
 const source=chartSymbol(selected);
 return <section className="side-card market-chart-card" aria-label="Gráfico TradingView">
  <p className="eyebrow blue">TRADINGVIEW · ANÁLISIS VISUAL</p><h2>Gráfico de mercado</h2>
  <p>Velas, volumen y herramientas de dibujo. Cotizaciones facilitadas por TradingView, con posibles retrasos según el mercado. Independiente del motor de señales.</p>
  <div className="chart-controls">{!followSymbol&&<label>Activo<select value={symbol} onChange={e=>setSymbol(e.target.value)}>{CHART_SYMBOLS.map(s=><option key={s}>{s}</option>)}</select></label>}<label>Temporalidad<select value={interval} onChange={e=>setInterval(e.target.value)}><option value="5">5 min</option><option value="15">15 min</option><option value="60">1 hora</option><option value="D">1 día</option></select></label><button type="button" className="primary-btn" onClick={()=>setOpened(v=>!v)}>{opened?'Ocultar gráfico':'Mostrar gráfico'}</button></div>
  {opened&&source&&<iframe key={selected+interval} className="market-chart-frame" title={'TradingView '+selected} src={chartPath(selected,interval)} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" loading="lazy"/>}
  {source&&<a className="chart-external" href={'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(source)+'&interval='+encodeURIComponent(interval)} target="_blank" rel="noopener noreferrer">Abrir gráfico directamente en TradingView ↗</a>}
  <p className="tiny">Si el navegador bloquea la inserción, usa el enlace directo. No transmite las claves ni alimenta órdenes del bot.</p>
 </section>;
}
