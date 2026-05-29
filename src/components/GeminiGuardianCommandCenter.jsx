const money = (value) => Number.isFinite(value)
  ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  : 'Confirmar';

const num = (value, digits = 0) => Number.isFinite(value) ? Number(value).toFixed(digits) : 'N/D';

const time = (value) => value
  ? new Intl.DateTimeFormat('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).format(new Date(value))
  : '--';

const stateTone = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CAUTION: 'bg-amber-100 text-amber-700 border-amber-200',
  BLOCKED: 'bg-red-100 text-red-700 border-red-200',
  SLEEPING: 'bg-slate-100 text-slate-600 border-slate-200'
};

const guardTone = {
  clear: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  caution: 'bg-amber-50 text-amber-700 border-amber-200',
  block: 'bg-red-50 text-red-700 border-red-200',
  unavailable: 'bg-slate-50 text-slate-600 border-slate-200'
};

function copySignal(signal) {
  const lines = [
    `VALIDO 1M - ${signal.ticker} ${signal.strategy}`,
    `Exp: ${signal.expiration || 'confirmar'} | Strikes: ${signal.strikes || 'confirmar'}`,
    `${signal.creditDebit?.type === 'credit' ? 'Credito minimo' : 'Debito maximo'}: ${Number.isFinite(signal.creditDebit?.value) ? `$${signal.creditDebit.value}` : 'confirmar bid/ask'}`,
    `POP est.: ${num(signal.popEstimated)}% | Score: ${num(signal.score)}`,
    `Max risk: ${money(signal.maxRisk)} | Collateral: ${money(signal.collateralRequired)}`,
    `Invalidacion: ${signal.invalidation}`,
    'Revisar cadena en Robinhood antes de enviar. No usar market order.'
  ];
  navigator.clipboard?.writeText(lines.join('\n'));
}

function GuardPill({ label, guard }) {
  const status = guard?.status || 'unavailable';
  return (
    <div className={`rounded-xl border p-3 ${guardTone[status] || guardTone.unavailable}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-[.12em]">{label}</p>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase">{status}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs">{guard?.detail || 'clear'}</p>
    </div>
  );
}

function SignalTicket({ signal, onSimulate, onPaper, onAiExplain }) {
  const guardian = signal.geminiGuardian;
  return (
    <article className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.16em] text-blue-600">Senal real candidata</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950">{signal.ticker} <span className="text-blue-700">{signal.strategy}</span></h3>
          <p className="mt-1 text-sm text-slate-600">{signal.reason}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-right text-emerald-700">
          <p className="text-[10px] font-bold uppercase">Score / POP</p>
          <p className="font-mono text-lg font-black">{num(signal.score)} / {num(signal.popEstimated)}%</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Mini label="Expiracion" value={`${signal.expiration || 'N/D'} (${signal.dte ?? '--'} DTE)`} />
        <Mini label="Strikes" value={signal.strikes || 'Confirmar'} />
        <Mini label="Credito/Debito" value={Number.isFinite(signal.creditDebit?.value) ? `$${signal.creditDebit.value}` : 'Confirmar chain'} />
        <Mini label="Max loss" value={money(signal.maxRisk)} />
        <Mini label="Collateral" value={money(signal.collateralRequired)} />
        <Mini label="Riesgo" value={signal.riskClass || 'moderado'} />
        <Mini label="Fuente" value={signal.source?.quote || signal.dataSource || 'server-side'} />
        <Mini label="Gemini Guardian" value={guardian ? `${guardian.decision} (${num(guardian.confidence)})` : signal.aiStatus || 'manual only'} />
      </div>
      {guardian && (
        <div className={`mt-3 rounded-xl border p-3 text-sm ${
          guardian.decision === 'APPROVE' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
            guardian.decision === 'BLOCK' ? 'border-red-200 bg-red-50 text-red-800' :
              'border-amber-200 bg-amber-50 text-amber-800'
        }`}>
          <strong>Veredicto Gemini Guardian:</strong> {guardian.summary}
          {guardian.risks?.length ? <p className="mt-1 text-xs">Riesgos: {guardian.risks.join(' | ')}</p> : null}
        </div>
      )}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Invalidacion:</strong> {signal.invalidation}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <strong>Cierre:</strong> {signal.closeAlert}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => copySignal(signal)}>Copiar senal</button>
        <button className="btn" onClick={() => onSimulate?.(signal)}>Simular</button>
        <button className="btn" onClick={() => onPaper?.(signal)}>Guardar como paper</button>
        <button className="btn" onClick={onAiExplain}>Explicarme con Gemini</button>
        <a className="btn" href="#paper">Ver checklist Robinhood</a>
      </div>
      <p className="mt-3 text-xs text-slate-500">Probabilidad estimada, no garantia. Si el bid/ask cambia o el broker muestra max loss distinto, no perseguir.</p>
    </article>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">{label}</p>
      <p className="mt-1 break-words font-mono text-xs font-bold text-slate-900">{value}</p>
    </div>
  );
}

function CommandTile({ label, value, tone = 'info' }) {
  const tones = {
    info: 'border-blue-100 bg-blue-50 text-blue-900',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-100 bg-amber-50 text-amber-800',
    danger: 'border-red-100 bg-red-50 text-red-800'
  };
  return (
    <div className={`rounded-2xl border p-3 ${tones[tone] || tones.info}`}>
      <p className="text-[10px] font-black uppercase tracking-[.14em] opacity-75">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

export default function GeminiGuardianCommandCenter({ scan, loading, onRefresh, onAiExplain, onSimulate, onPaper }) {
  const agent = scan?.agent || {};
  const budget = agent.tokenBudget || {};
  const aiGuardian = agent.aiGuardian || agent.aiVerificationStatus?.guardian || {};
  const signals = agent.approvedSignals || [];
  const rejected = agent.rejectedCandidates || [];
  const state = agent.state || 'SLEEPING';
  const decision = agent.marketDecision || scan?.decision?.label || 'DATA INSUFFICIENT';
  const source = scan?.providers?.find((provider) => provider.id === 'tradier' && provider.configured) ? 'Tradier' : 'Yahoo/fallback';
  const guardEntries = Object.entries(agent.guards || {});
  const nonClearGuards = guardEntries.filter(([, guard]) => guard?.status && guard.status !== 'clear');
  const topThings = [
    signals[0] ? `Operable: ${signals[0].ticker} ${signals[0].strategy}` : 'Ahora: WATCHLIST/NO_TRADE hasta que pase score, POP y auditoria.',
    nonClearGuards[0] ? `Riesgo principal: ${nonClearGuards[0][0]} - ${nonClearGuards[0][1].detail}` : 'Guards principales sin bloqueo.',
    `Data: ${source}; refresh ${(scan?.refreshSeconds || 300) / 60} min.`
  ];
  const avoid = rejected[0]?.rejectionReasons?.[0] || 'Evitar entradas sin chain fresca, max loss y confirmacion Guardian.';
  return (
    <section className="guardian-pro-shell scroll-mt-24" id="guardian-pro">
      <div className="guardian-hero">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Gemini Market Command Center</p>
          <h2 className="mt-2 text-3xl font-black text-slate-950 md:text-4xl">Gemini Guardian / SIGMA Guardian</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Primero decision, despues tickets. SIGMA audita candidatos calculados por el motor; precios, riesgo, POP, Greeks, news y macro siguen viniendo de datos y reglas verificables.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-black ${stateTone[state] || stateTone.SLEEPING}`}>{state}</span>
          <button className="btn btn-primary" disabled={loading} onClick={onRefresh}>{loading ? 'Escaneando...' : 'Escanear ahora'}</button>
          <button className="btn" onClick={onAiExplain}>Pedir revision de Gemini</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Mini label="Market Decision" value={decision} />
        <Mini label="Ultima revision" value={time(agent.lastRunAt || scan?.asOf)} />
        <Mini label="Proxima revision" value={time(agent.nextRunAt || scan?.guardianStatus?.nextScan)} />
        <Mini label="Fuente principal" value={source} />
        <Mini label="Tokens IA hoy" value={`${budget.tokensUsed ?? 0} / ${budget.dailyTokenBudget ?? '--'}`} />
        <Mini label="Revisiones IA hoy" value={`${budget.requestsUsed ?? 0} / ${budget.dailyRequestBudget ?? '--'}`} />
        <Mini label="Modo Guardian" value={agent.aiVerificationStatus?.mode || 'manual_only'} />
        <Mini label="Motivo actual" value={aiGuardian.reason || signals[0]?.geminiGuardian?.summary || rejected[0]?.rejectionReasons?.[0] || 'Vigilando sin senal aprobada'} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <CommandTile label="Que puedo operar ahora" value={signals[0] ? `${signals[0].ticker} ${signals[0].strategy}` : 'Nada aprobado: solo watchlist/paper'} tone={signals[0] ? 'success' : 'warning'} />
        <CommandTile label="Que debo esperar" value={rejected[0] ? `${rejected[0].ticker} requiere mejora: ${rejected[0].rejectionReasons?.[0] || 'validacion pendiente'}` : 'Nuevo escaneo con chain y guards frescos'} />
        <CommandTile label="Que debo evitar" value={avoid} tone={avoid.toLowerCase().includes('bloque') || avoid.toLowerCase().includes('riesgo') ? 'danger' : 'warning'} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {topThings.map((item, index) => (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm" key={item}>
            <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Top {index + 1}</p>
            <p className="mt-1 font-semibold">{item}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.16em] text-emerald-700">Real Signals</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{signals.length ? `${signals.length} senal(es) aprobada(s)` : 'NO TRADE: no hay entrada limpia ahora'}</h3>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Max 0-3 por dia</span>
        </div>
        <div className="mt-4 space-y-3">
          {signals.length ? signals.slice(0, 3).map((signal) => (
            <SignalTicket signal={signal} key={signal.id} onSimulate={onSimulate} onPaper={onPaper} onAiExplain={onAiExplain} />
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              <strong>No hay senal aprobada.</strong> El sistema sigue vigilando {scan?.watchlist?.symbols?.slice(0, 8).join(', ') || 'la watchlist'}.
              {rejected[0] && <p className="mt-2">Mejor candidato rechazado: {rejected[0].ticker} {rejected[0].strategy}. Razon: {rejected[0].rejectionReasons?.[0]}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <GuardPill label="Macro Guard" guard={agent.guards?.macro} />
        <GuardPill label="Fed Guard" guard={agent.guards?.fed} />
        <GuardPill label="News Guard" guard={agent.guards?.news} />
        <GuardPill label="Geopolitical" guard={agent.guards?.geopolitical} />
        <GuardPill label="Earnings" guard={agent.guards?.earnings} />
        <GuardPill label="Liquidity" guard={agent.guards?.liquidity} />
        <GuardPill label="Risk" guard={agent.guards?.risk} />
        <GuardPill label="Data Quality" guard={agent.guards?.dataQuality} />
      </div>
    </section>
  );
}
