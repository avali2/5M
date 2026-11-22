import { useMemo, useState } from 'react';
import { apiGet, apiPost } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { money, num, pct, expiryLabel, dateTime, ago, scoreTone, gradeTone } from './lib/format.js';
import { Icon, Card, Badge, Stat, SectionTitle, Gauge, Segmented, Modal, CopyButton, Banner, SourceBanner, EmptyState, Spinner, Check, KV, Disclaimer } from './components/ui.jsx';
import { PriceChart, PayoffChart, ScenarioBars } from './components/charts.jsx';

const SIDE_OPTIONS = [{ value: 'both', label: 'CALL + PUT' }, { value: 'call', label: 'Solo CALL' }, { value: 'put', label: 'Solo PUT' }];

export default function NitoPanel({ symbols = [], symbol, setSymbol, accountUsd }) {
  const [side, setSide] = useState('both');
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(null);
  const [ai, setAi] = useState({ loading: false, text: '', error: '', provider: '' });

  const directional = useApi(() => apiGet(`/api/nito/directional?symbols=${symbols.join(',')}&side=${side}&account=${accountUsd}`), [side, accountUsd, tick]);
  const market = useApi(() => apiGet(`/api/market/${encodeURIComponent(symbol)}`), [symbol, tick]);

  const signals = directional.data?.signals || [];
  const gates = directional.data?.gates || [];
  const gate = directional.data?.gate || null;
  const snapshot = market.data?.snapshot || null;
  const derived = market.data?.derived || snapshot?.derived || null;
  const spot = snapshot?.quote?.price ?? null;
  const bestScore = useMemo(() => (signals.length ? Math.max(...signals.map((signal) => signal.score || 0)) : 0), [signals]);

  async function explain(signal) {
    setAi({ loading: true, text: '', error: '', provider: '' });
    try {
      const result = await apiPost('/api/ai/analyze', { task: 'signal', payload: signal, provider: 'auto' });
      setAi({ loading: false, text: result.text || '', error: '', provider: result.provider || '' });
    } catch (error) {
      setAi({ loading: false, text: '', error: error.message, provider: '' });
    }
  }

  return (
    <div className="stack">
      <SourceBanner demo={directional.data?.demo ?? market.data?.demo} marketOpen={snapshot?.marketOpen} asOf={snapshot?.asOf} stale={false} errors={directional.data?.errors || []} />

      <section className="signal-hero" style={{ '--tone': 'var(--brand)' }}>
        <div className="row between wrap">
          <div>
            <p className="eyebrow">NiTo · mesa direccional</p>
            <h2 style={{ fontSize: 22, letterSpacing: '-.5px' }}>CALL & PUT planificados</h2>
            <p className="small muted" style={{ marginTop: 3, maxWidth: '60ch' }}>
              Compra de prima con contrato concreto, entrada, breakeven, objetivos y stop. Cada señal se explica sola:
              si no entendés por qué, no la operes.
            </p>
          </div>
          <div className="row wrap">
            <button className="btn sm" onClick={() => setTick((value) => value + 1)} disabled={directional.loading}>
              <Icon name="refresh" size={14} />{directional.loading ? 'Analizando…' : 'Actualizar'}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}><Segmented options={SIDE_OPTIONS} value={side} onChange={setSide} label="Lado" /></div>
        <div className="grid-4" style={{ marginTop: 12 }}>
          <Stat label="Señales" value={signals.length} sub={`mejor score ${Math.round(bestScore)}`} />
          <Stat label="Símbolos" value={symbols.length} sub="radar NiTo" />
          <Stat label="Mercado" value={snapshot?.marketOpen ? 'ABIERTO' : snapshot?.marketOpen === false ? 'CERRADO' : '—'} tone={snapshot?.marketOpen ? 'up' : 'muted'} sub={gate?.status || ''} />
          <Stat label="Cuenta" value={accountUsd ? money(accountUsd) : '—'} sub={`riesgo sugerido ${num(signals[0]?.plan?.riskPct ?? 1.5, 1)}%`} />
        </div>
      </section>

      {gate?.reasons?.length ? <Banner tone="warn" icon="alert-triangle" title="Antes de operar"><ul style={{ margin: '4px 0 0 18px' }}>{gate.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul></Banner> : null}

      {directional.loading && !signals.length && <Card><div className="stack"><div className="skeleton" style={{ height: 22, width: '45%' }} /><div className="skeleton" style={{ height: 90 }} /><div className="skeleton" style={{ height: 90 }} /></div></Card>}
      {directional.error && <Banner tone="danger" icon="alert-circle" title="No se pudo analizar">{directional.error}</Banner>}

      {!directional.loading && !signals.length && !directional.error && (
        <Card title="Sin señal de calidad ahora" icon="crosshair">
          <EmptyState icon="shield" title="Ninguna entrada supera el filtro" action={<button className="btn sm" onClick={() => setTick((value) => value + 1)}><Icon name="refresh" size={14} />Volver a intentar</button>}>
            La mesa solo marca CALL/PUT cuando dirección, liquidez, IV y riesgo se alinean. Mirá el radar de abajo: cada símbolo
            muestra por qué quedó fuera. No operar también es una decisión.
          </EmptyState>
        </Card>
      )}

      {signals.map((signal) => (
        <SignalCard key={signal.id} signal={signal} spot={spot} onOpen={() => { setOpen(signal); setAi({ loading: false, text: '', error: '', provider: '' }); }} onExplain={() => { setOpen(signal); explain(signal); }} />
      ))}

      <Card title="Radar NiTo" subtitle="Cada símbolo con su estado y la mejor idea disponible" icon="crosshair">
        <div className="stack xs">
          {gates.length === 0 && <p className="small muted">Sin datos del radar.</p>}
          {gates.map((item) => {
            const suggestion = signals.find((signal) => signal.symbol === item.symbol);
            return (
              <button key={item.symbol} type="button" onClick={() => setSymbol(item.symbol)}
                className="row between" style={{ width: '100%', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
                <span className="row" style={{ gap: 8 }}>
                  <strong style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>{item.symbol}</strong>
                  <Badge tone={item.status === 'OPEN' ? 'up' : item.status === 'DEMO' ? 'warn' : 'neutral'}>{item.status}</Badge>
                  {item.tradeable ? <Badge tone="brand" icon="check">operable</Badge> : <Badge tone="neutral" icon="lock">solo plan</Badge>}
                </span>
                <span className="row" style={{ gap: 8 }}>
                  {suggestion ? <Badge tone={suggestion.side === 'CALL' ? 'up' : 'down'} icon={suggestion.side === 'CALL' ? 'trending-up' : 'trending-down'}>{suggestion.side} {Math.round(suggestion.score)}</Badge> : <span className="tiny muted">{item.reasons?.[0]?.slice(0, 40) || 'sin señal'}</span>}
                  <Icon name="chevron-right" size={14} />
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {snapshot && (
        <Card title={`${snapshot.symbol} · contexto`} subtitle={`${dateTime(snapshot.asOf)} ET · ${snapshot.source === 'demo' ? 'simulado' : 'Tradier'} · ${ago(snapshot.asOf)}`}
          icon="activity" actions={<Badge tone={snapshot.technical?.trend === 'bullish' ? 'up' : snapshot.technical?.trend === 'bearish' ? 'down' : 'neutral'}>{snapshot.technical?.trend || 'neutral'}</Badge>}>
          <div className="grid-4" style={{ marginBottom: 10 }}>
            <Stat label="Precio" value={money(spot)} sub={`${snapshot.quote?.changePct > 0 ? '+' : ''}${num(snapshot.quote?.changePct, 2)}% hoy`} tone={snapshot.quote?.changePct >= 0 ? 'up' : 'down'} />
            <Stat label="IV ATM" value={pct((derived?.atmIv ?? 0) * 100, 1)} sub={derived?.ivVerdict || 'según cadena'} />
            <Stat label="Mov. esperado" value={money(derived?.expectedMove?.sigmaUsd)} sub={`±${num(derived?.expectedMove?.pct, 1)}%`} />
            <Stat label="ATR 14" value={money(snapshot.technical?.atr)} sub="rango diario" />
          </div>
          <PriceChart bars={snapshot.history} levels={[
            { price: snapshot.technical?.support, label: 'SUP', color: 'var(--up)' },
            { price: snapshot.technical?.resistance, label: 'RES', color: 'var(--down)' }
          ]} expectedMove={derived?.expectedMove} />
          <div className="row wrap small muted" style={{ gap: 12, marginTop: 8 }}>
            <span>5m: <b className={snapshot.technical?.timeframes?.m5?.trend === 'bullish' ? 'up' : snapshot.technical?.timeframes?.m5?.trend === 'bearish' ? 'down' : ''}>{snapshot.technical?.timeframes?.m5?.trend || '—'}</b></span>
            <span>15m: <b>{snapshot.technical?.timeframes?.m15?.trend || '—'}</b></span>
            <span>D1: <b>{snapshot.technical?.timeframes?.d1?.trend || '—'}</b></span>
            <span>RSI {num(snapshot.technical?.rsi14, 1)}</span>
            <span>Flujo: <b>{snapshot.flow?.direction || '—'}</b> ({snapshot.flow?.confidence ?? '—'}%)</span>
          </div>
        </Card>
      )}

      {open && <SignalModal signal={open} spot={spot} onClose={() => setOpen(null)} ai={ai} onExplain={() => explain(open)} />}
      <Disclaimer />
    </div>
  );
}

function SignalCard({ signal, spot, onOpen, onExplain }) {
  const call = signal.side === 'CALL';
  return (
    <section className={`signal-hero ${call ? 'call' : 'put'}`}>
      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 9 }}>
          <span className={`brand-logo`} style={{ width: 34, height: 34, borderRadius: 10, background: call ? 'linear-gradient(140deg,var(--up),var(--up-2))' : 'linear-gradient(140deg,var(--down),var(--down-2))' }}>
            <Icon name={call ? 'trending-up' : 'trending-down'} size={17} />
          </span>
          <div>
            <div className="signal-topline">
              <span className="signal-symbol">{signal.symbol}</span>
              <Badge tone={call ? 'up' : 'down'}>{signal.side}</Badge>
              <Badge tone={gradeTone(signal.grade)}>{signal.grade}</Badge>
              <Badge tone="neutral">{signal.setup}</Badge>
              {signal.meta?.operable ? <Badge tone="brand" icon="check">OPERABLE</Badge> : <Badge tone="warn" icon="lock">SOLO PLAN</Badge>}
            </div>
            <div className="contract-line" style={{ marginTop: 6 }}>
              <Icon name="target" size={13} />
              <span>{signal.symbol} {expiryLabel(signal.contract.expiration)} {call ? 'C' : 'P'} {money(signal.contract.strike, 0)}</span>
              <span className="muted">· {signal.contract.dte}d</span>
            </div>
          </div>
        </div>
        <Gauge value={signal.score} grade={signal.grade} label="Score" />
      </div>

      <div className="grid-4" style={{ marginTop: 12 }}>
        <Stat label="Prima estimada" value={money(signal.contract.entry)} sub={`mid ${money(signal.contract.mid)} · spread ${num(signal.contract.spreadPct, 1)}%`} />
        <Stat label="Entrada máx." value={money(signal.plan.maxEntry)} sub="no pagar más" />
        <Stat label="Breakeven" value={money(signal.contract.breakeven)} sub={`${num(signal.contract.breakevenPct, 1)}% del spot`} />
        <Stat label="POP modelo" value={pct((signal.probabilities?.pop ?? 0) * 100)} sub={`tocar: ${pct((signal.probabilities?.probTouch ?? 0) * 100)}`} />
      </div>

      <div className="grid-3" style={{ marginTop: 10 }}>
        <div className="metric-box"><span>Objetivo 1</span><strong className="up">{money(signal.plan.targets?.[0]?.price)}</strong><div className="tiny muted">subyacente {money(signal.plan.targets?.[0]?.underlying)}</div></div>
        <div className="metric-box"><span>Objetivo 2</span><strong className="up">{money(signal.plan.targets?.[1]?.price)}</strong><div className="tiny muted">subyacente {money(signal.plan.targets?.[1]?.underlying)}</div></div>
        <div className="metric-box"><span>Stop</span><strong className="down">{money(signal.plan.stopPrice)}</strong><div className="tiny muted">sale si pierde este nivel</div></div>
      </div>

      <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
        <CopyButton text={signal.copy} label="Copiar señal" />
        <button className="btn sm" onClick={onOpen}><Icon name="eye" size={14} />Plan completo</button>
        <button className="btn sm" onClick={onExplain}><Icon name="sparkles" size={14} />Explicar con IA</button>
        <span className="tiny muted" style={{ marginLeft: 'auto' }}>sigma del contrato: {num(signal.contract.iv * 100, 0)}% · Δ {num(signal.contract.delta, 2)} · θ {num(signal.contract.theta, 2)}/día</span>
      </div>

      <div className="stack xs" style={{ marginTop: 12 }}>
        {(signal.why || []).slice(0, 4).map((item) => (
          <Check key={item.key || item.label} status={item.status === 'pos' ? 'pos' : item.status === 'neg' ? 'neg' : 'neutral'}>
            <b>{item.label}:</b> {item.value}{item.detail ? <small>{item.detail}</small> : null}
          </Check>
        ))}
      </div>
    </section>
  );
}

function SignalModal({ signal, spot, onClose, ai, onExplain }) {
  const call = signal.side === 'CALL';
  const underlying = signal.meta?.spot ?? spot;
  return (
    <Modal title={`${signal.symbol} ${signal.side} · plan`} onClose={onClose} footer={<div className="row wrap"><CopyButton text={signal.copy} label="Copiar señal" /><button className="btn sm" onClick={onExplain} disabled={ai.loading}><Icon name="sparkles" size={14} />{ai.loading ? 'Pensando…' : 'Explicar con IA'}</button></div>}>
      <div className="stack">
        <div className="grid-2">
          <div><span className="tiny muted">Contrato</span><div className="contract-line">{signal.contract.occ || `${signal.symbol} ${signal.contract.expiration} ${call ? 'C' : 'P'} ${signal.contract.strike}`}</div></div>
          <div><span className="tiny muted">Score</span><div><Gauge value={signal.score} grade={signal.grade} /></div></div>
        </div>
        <div className="grid-3">
          <Stat label="Prima mid" value={money(signal.contract.mid)} sub={`bid ${money(signal.contract.bid)} / ask ${money(signal.contract.ask)}`} />
          <Stat label="Delta" value={num(signal.contract.delta, 2)} sub={`gamma ${num(signal.contract.gamma, 3)}`} />
          <Stat label="IV" value={pct(signal.contract.iv * 100, 0)} sub={signal.ivContext?.verdict || ''} />
          <Stat label="Theta" value={num(signal.contract.theta, 2)} sub="por día" />
          <Stat label="OI / Vol" value={`${num(signal.contract.oi, 0)} / ${num(signal.contract.volume, 0)}`} sub={`ratio ${num(signal.contract.volOiRatio, 2)}`} />
          <Stat label="Riesgo" value={money(signal.plan.maxLossUsd)} sub={signal.plan.sizingNote || 'por contrato'} />
        </div>
        <h4 style={{ fontSize: 13 }}>Curva de resultado</h4>
        <PayoffChart legs={[{ action: 'BUY', type: signal.contract.type, strike: signal.contract.strike, price: signal.contract.entry }]} spot={underlying || signal.levels?.trigger} dte={signal.contract.dte} atmIv={signal.contract.iv} />
        <h4 style={{ fontSize: 13 }}>Escenarios</h4>
        <ScenarioBars rows={(signal.scenario?.expiry || []).map((row) => ({ ...row, pnlUsd: row.pnlUsd }))} />
        <div>
          <h4 style={{ fontSize: 13, marginBottom: 6 }}>Plan paso a paso</h4>
          <div className="stack xs">
            <KV label="Entrada límite" value={money(signal.plan.entryLimit)} />
            <KV label="Techo de entrada" value={money(signal.plan.maxEntry)} />
            <KV label="Stop de precio" value={money(signal.plan.stopPrice)} />
            <KV label="Stop de tiempo" value={`${signal.plan.timeStopDays} días`} />
            <KV label="Tamaño sugerido" value={`${signal.plan.contracts || 0} contrato(s) · ${money(signal.plan.maxLossUsd)} de riesgo`} />
            <KV label="Invalidación del subyacente" value={money(signal.levels?.invalidate)} />
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: 13, marginBottom: 6 }}>Por qué</h4>
          <div className="stack xs">{(signal.why || []).map((item) => (<Check key={item.key || item.label} status={item.status === 'pos' ? 'pos' : item.status === 'neg' ? 'neg' : 'neutral'}><b>{item.label}:</b> {item.value}{item.detail ? <small>{item.detail}</small> : null}</Check>))}</div>
        </div>
        <div>
          <h4 style={{ fontSize: 13, marginBottom: 6 }}>Riesgos</h4>
          <ul className="small" style={{ margin: '0 0 0 18px', color: 'var(--text-2)' }}>{(signal.risks || []).map((risk) => <li key={risk}>{risk}</li>)}</ul>
        </div>
        {ai.error && <Banner tone="danger" icon="alert-circle" title="IA no disponible">{ai.error}</Banner>}
        {ai.loading && <Spinner label="El analista está leyendo la señal…" />}
        {ai.text && (
          <Card title="Lectura del analista IA" icon="sparkles" tone="ai">
            <p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{ai.text}</p>
            <p className="tiny muted" style={{ marginTop: 6 }}>Generado por {ai.provider || 'IA'} con los datos de esta señal. No es asesoramiento financiero.</p>
          </Card>
        )}
      </div>
    </Modal>
  );
}