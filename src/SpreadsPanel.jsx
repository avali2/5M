import { useState } from 'react';
import { apiGet, apiPost } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { money, num, pct, ratio, expiryLabel, dateTime, scoreTone, gradeTone } from './lib/format.js';
import { Icon, Card, Badge, Stat, SectionTitle, Gauge, Segmented, Modal, CopyButton, SourceBanner, Banner, EmptyState, Spinner, LegsTable, Check, KV, Disclaimer } from './components/ui.jsx';
import { PayoffChart, ScenarioBars } from './components/charts.jsx';

const PROFILES = [{ value: 'standard', label: 'Estándar' }, { value: 'aggressive', label: 'Agresivo' }, { value: 'max', label: 'Máximo' }];
const STRATEGIES = [
  { value: 'all', label: 'Todas' }, { value: 'BULL_PUT_CREDIT', label: 'Bull put' }, { value: 'BEAR_CALL_CREDIT', label: 'Bear call' },
  { value: 'IRON_CONDOR', label: 'Iron condor' }, { value: 'IRON_FLY', label: 'Iron fly' }, { value: 'JADE_LIZARD', label: 'Jade lizard' },
  { value: 'BROKEN_WING_PUT', label: 'Broken wing' }, { value: 'CALL_DEBIT', label: 'Debit call' }, { value: 'PUT_DEBIT', label: 'Debit put' }
];

export default function SpreadsPanel({ symbols = [], symbol, setSymbol }) {
  const [profile, setProfile] = useState('aggressive');
  const [strategy, setStrategy] = useState('all');
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(null);
  const [ai, setAi] = useState({ loading: false, text: '', error: '', provider: '' });

  const list = useApi(() => apiGet(`/api/spreads?symbols=${symbols.join(',')}&profile=${profile}&strategy=${strategy}`), [profile, strategy, tick]);
  const ideas = list.data?.ideas || [];

  async function explain(idea) {
    setAi({ loading: true, text: '', error: '', provider: '' });
    try {
      const result = await apiPost('/api/ai/analyze', { task: 'spread', payload: idea, provider: 'auto' });
      setAi({ loading: false, text: result.text || '', error: '', provider: result.provider || '' });
    } catch (error) { setAi({ loading: false, text: '', error: error.message, provider: '' }); }
  }

  return (
    <div className="stack">
      <SourceBanner demo={list.data?.demo} errors={list.data?.errors || []} />
      <section className="signal-hero" style={{ '--tone': 'var(--warn)' }}>
        <div className="row between wrap">
          <div>
            <p className="eyebrow">Spreads · agresivo</p>
            <h2 style={{ fontSize: 22, letterSpacing: '-.5px' }}>Crédito, condors y alas rotas</h2>
            <p className="small muted" style={{ maxWidth: '62ch', marginTop: 3 }}>
              Presets agresivos: más delta vendido, menos días, más crédito por ancho. Cada idea muestra el peor escenario
              antes de que la abras.
            </p>
          </div>
          <button className="btn sm" onClick={() => setTick((value) => value + 1)} disabled={list.loading}><Icon name="refresh" size={14} />{list.loading ? 'Buscando…' : 'Re-escanear'}</button>
        </div>
        <div style={{ marginTop: 12 }}><Segmented options={PROFILES} value={profile} onChange={setProfile} label="Agresividad" /></div>
        <div style={{ marginTop: 8 }}><Segmented options={STRATEGIES.map((item) => item)} value={strategy} onChange={setStrategy} label="Estrategia" /></div>
        <div className="grid-4" style={{ marginTop: 12 }}>
          <Stat label="Ideas" value={ideas.length} sub={`perfil ${profile}`} />
          <Stat label="Crédito total" value={money(ideas.reduce((sum, idea) => sum + (idea.pricing?.credit ?? 0) * 100, 0))} sub="suma si abrís todas" />
          <Stat label="Riesgo total" value={money(ideas.reduce((sum, idea) => sum + (idea.pricing?.maxLossUsd ?? 0), 0))} sub="pérdida máxima sumada" tone="down" />
          <Stat label="POP promedio" value={pct(ideas.length ? (ideas.reduce((sum, idea) => sum + (idea.risk?.pop ?? 0), 0) / ideas.length) * 100 : 0)} sub="modelo, no garantía" />
        </div>
      </section>

      <Banner tone="warn" icon="flame" title="Modo agresivo">Un spread de crédito agresivo cobra más prima porque vende más cerca del dinero: la probabilidad de ganar baja y el ajuste se vuelve obligatorio. Respetá el stop de 2x crédito y el cierre por tiempo.</Banner>
      {list.loading && !ideas.length && <Card><div className="stack"><div className="skeleton" style={{ height: 24, width: '40%' }} /><div className="skeleton" style={{ height: 80 }} /><div className="skeleton" style={{ height: 80 }} /></div></Card>}
      {list.error && <Banner tone="danger" icon="alert-circle" title="No se pudieron calcular">{list.error}</Banner>}
      {!list.loading && !ideas.length && !list.error && <Card title="Sin ideas ahora" icon="layers"><EmptyState icon="filter" title="Ningún spread pasó los filtros" action={<button className="btn sm" onClick={() => setProfile('standard')}>Probar perfil estándar</button>}>El motor exige crédito suficiente por ancho, liquidez y datos frescos. Probá otro perfil o esperá la próxima lectura.</EmptyState></Card>}

      {ideas.map((idea) => (
        <Card key={idea.id} tone={idea.strategy.includes('BULL') ? 'up' : idea.strategy.includes('BEAR') ? 'down' : ''}
          title={`${idea.symbol} · ${idea.label}`}
          subtitle={`${idea.strategy.replaceAll('_', ' ')} · ${expiryLabel(idea.expiration)} · ${idea.dte}d · ${idea.aggression}`}
          icon={idea.direction === 'BULLISH' ? 'trending-up' : idea.direction === 'BEARISH' ? 'trending-down' : 'layers'}
          actions={<><Badge tone={gradeTone(idea.grade)}>{idea.grade}</Badge><Badge tone={idea.aggression === 'MAXIMO' ? 'down' : idea.aggression === 'AGRESIVO' ? 'warn' : 'neutral'}>{idea.aggression}</Badge></>}>
          <div className="grid-4">
            <Stat label="Crédito" value={money(idea.pricing?.credit)} sub={`${num(idea.pricing?.creditWidthPct, 1)}% del ancho`} tone="up" />
            <Stat label="Máx. ganancia" value={money(idea.pricing?.maxProfitUsd)} sub="al vencer" tone="up" />
            <Stat label="Máx. pérdida" value={money(idea.pricing?.maxLossUsd)} sub={`garantía ${money(idea.pricing?.marginUsd)}`} tone="down" />
            <Stat label="POP" value={pct((idea.risk?.pop ?? 0) * 100)} sub={`EV ${money(idea.pricing?.evUsd)}`} />
          </div>
          <div style={{ marginTop: 10 }}><LegsTable legs={idea.legs} /></div>
          <div className="grid-2" style={{ marginTop: 10 }}>
            <div className="stack xs">
              <KV label="Breakeven bajo" value={money(idea.risk?.beLow)} />
              <KV label="Breakeven alto" value={money(idea.risk?.beHigh)} />
              <KV label="Stop" value={money(idea.risk?.stopCreditMultiple ? idea.pricing?.credit * idea.risk.stopCreditMultiple : null)} />
              <KV label="Cierre por tiempo" value={`dte ≤ ${idea.plan?.timeStopDte ?? 7}`} />
            </div>
            <div className="stack xs">
              {(idea.why || []).slice(0, 4).map((item) => <Check key={item.label} status={item.status === 'pos' ? 'pos' : item.status === 'neg' ? 'neg' : 'neutral'}><b>{item.label}:</b> {item.value}</Check>)}
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn sm" onClick={() => { setOpen(idea); setAi({ loading: false, text: '', error: '', provider: '' }); }}><Icon name="eye" size={14} />Ver escenarios</button>
            <button className="btn sm" onClick={() => { setOpen(idea); explain(idea); }}><Icon name="sparkles" size={14} />Explicar con IA</button>
            <CopyButton text={idea.copy} label="Copiar orden" />
          </div>
        </Card>
      ))}

      {open && (
        <Modal title={`${open.symbol} · ${open.label}`} onClose={() => setOpen(null)}>
          <div className="stack">
            <div className="grid-3">
              <Stat label="Crédito" value={money(open.pricing?.credit)} sub={`${num(open.pricing?.creditWidthPct, 1)}% ancho`} />
              <Stat label="POP" value={pct((open.risk?.pop ?? 0) * 100)} />
              <Stat label="EV" value={money(open.pricing?.evUsd)} sub={`por riesgo ${num(open.pricing?.evPerRisk, 2)}`} />
            </div>
            <LegsTable legs={open.legs} />
            <h4 style={{ fontSize: 13 }}>Resultado al vencimiento</h4>
            <PayoffChart legs={open.legs} spot={open.meta?.spot || 100} dte={open.dte} atmIv={open.meta?.atmIv || 0.3} />
            <h4 style={{ fontSize: 13 }}>Stress de precio</h4>
            <ScenarioBars rows={(open.risk?.stress || []).map((row) => ({ movePct: row.movePct, pnlUsd: row.pnlUsd }))} />
            <KV label="P&L con IV -20%" value={money(open.risk?.ivCrushPnlUsd)} />
            <div>
              <h4 style={{ fontSize: 13, marginBottom: 6 }}>Plan de gestión</h4>
              <ul className="small" style={{ margin: '0 0 0 18px', color: 'var(--text-2)' }}>{(open.plan?.management || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <h4 style={{ fontSize: 13 }}>Salidas</h4>
            <div className="table-wrap"><table className="legs"><thead><tr><th>Cuándo</th><th>Acción</th><th>Precio</th></tr></thead>
              <tbody>{(open.plan?.exits || []).map((exit) => <tr key={exit.label}><td>{exit.label}</td><td>{exit.when}</td><td className="num">{money(exit.price)}</td></tr>)}</tbody>
            </table></div>
            {ai.loading && <Spinner label="El analista revisa el spread…" />}
            {ai.error && <Banner tone="danger" icon="alert-circle" title="IA no disponible">{ai.error}</Banner>}
            {ai.text && <Card title="Lectura del analista IA" icon="sparkles" tone="ai"><p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{ai.text}</p></Card>}
          </div>
        </Modal>
      )}
      <Disclaimer />
    </div>
  );
}
