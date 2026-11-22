import { useRef, useState } from 'react';
import { apiGet, apiPost, streamChat } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { Icon, Card, Badge, Stat, Segmented, CopyButton, SourceBanner, Banner, Spinner } from './components/ui.jsx';

const PROVIDERS = [{ value: 'auto', label: 'Auto' }, { value: 'deepseek', label: 'DeepSeek' }, { value: 'gemini', label: 'Gemini' }];
const QUICK = [
  { id: 'briefing', label: 'Briefing del día', icon: 'sun', task: 'briefing' },
  { id: 'signal', label: '¿Cuál es la mejor señal?', icon: 'target', task: 'signal' },
  { id: 'risk', label: 'Auditoría de riesgo', icon: 'shield', task: 'risk' }
];

export default function AiPanel({ symbols = [], symbol, setSymbol }) {
  const [provider, setProvider] = useState('auto');
  const [messages, setMessages] = useState([{ role: 'system', text: 'Analista 5M listo. Preguntá por una señal, un spread o el posicionamiento del símbolo activo.' }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState('');
  const abort = useRef(null);
  const status = useApi(() => apiGet('/api/ai/status'), []);

  const configured = (status.data?.deepseek?.configured || status.data?.gemini?.configured) || false;

  async function buildContext() {
    const context = { symbol };
    try {
      const [market, directional, positioning] = await Promise.all([
        apiGet(`/api/market/${symbol}`).catch(() => null),
        apiGet(`/api/nito/directional?symbols=${symbol}&side=both`).catch(() => null),
        apiGet(`/api/positioning?symbol=${symbol}`).catch(() => null)
      ]);
      if (market?.snapshot) {
        const snapshot = market.snapshot;
        context.quote = snapshot.quote;
        context.technical = snapshot.technical;
        context.simulated = snapshot.simulated;
      }
      context.signals = directional?.signals?.slice(0, 3) || [];
      context.positioning = positioning?.positioning || null;
    } catch { /* contexto opcional */ }
    return context;
  }

  async function send(text) {
    const content = String(text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    setError('');
    const nextMessages = [...messages, { role: 'user', text: content }];
    setMessages([...nextMessages, { role: 'assistant', text: '' }]);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const context = await buildContext();
      const payload = nextMessages.filter((item) => item.role !== 'system').map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: item.text }));
      const done = await streamChat({
        messages: payload, context, provider, signal: controller.signal,
        onDelta: (delta) => setMessages((current) => {
          const copy = [...current];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, text: (last.text || '') + delta };
          return copy;
        })
      });
      if (done) setMeta(`${done.provider || provider} · ${done.model || ''}`);
    } catch (requestError) {
      setError(requestError.message);
      setMessages((current) => current.filter((item) => !(item.role === 'assistant' && !item.text)));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  async function runTask(task, label) {
    if (busy) return;
    setError('');
    setBusy(true);
    setMessages((current) => [...current, { role: 'user', text: `${label} (${symbol})` }, { role: 'assistant', text: '' }]);
    try {
      const context = await buildContext();
      const result = await apiPost('/api/ai/analyze', { task, provider, payload: { symbol, ...context }, question: label });
      setMessages((current) => {
        const copy = [...current];
        copy[copy.length - 1] = { role: 'assistant', text: result.text || '(sin respuesta)' };
        return copy;
      });
      setMeta(`${result.provider} · ${result.model}`);
    } catch (requestError) {
      setError(requestError.message);
      setMessages((current) => current.slice(0, -1));
    } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <section className="signal-hero" style={{ '--tone': 'var(--ai)' }}>
        <div className="row between wrap">
          <div>
            <p className="eyebrow" style={{ color: 'var(--ai)' }}>Analista IA</p>
            <h2 style={{ fontSize: 22, letterSpacing: '-.5px' }}>DeepSeek + Gemini</h2>
            <p className="small muted" style={{ maxWidth: '62ch', marginTop: 3 }}>
              La IA lee la señal, los muros y los catalizadores antes de responder. No calcula precios ni promete resultados:
              interpreta lo que el motor ya calculó.
            </p>
          </div>
          <div className="row"><Badge tone={status.data?.deepseek?.configured ? 'up' : 'neutral'} icon="cpu">DeepSeek</Badge><Badge tone={status.data?.gemini?.configured ? 'up' : 'neutral'} icon="sparkles">Gemini</Badge></div>
        </div>
        <div style={{ marginTop: 10 }}><Segmented options={PROVIDERS} value={provider} onChange={setProvider} label="Proveedor" /></div>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <Stat label="Modelo DeepSeek" value={status.data?.deepseek?.model || '—'} sub={status.data?.deepseek?.configured ? 'configurado' : 'sin clave'} />
          <Stat label="Modelo Gemini" value={status.data?.gemini?.model || '—'} sub={status.data?.gemini?.configured ? 'configurado' : 'sin clave'} />
          <Stat label="Contexto" value={symbol} sub="símbolo activo" />
        </div>
      </section>

      <SourceBanner demo={false} />
      {!configured && !status.loading && (
        <Banner tone="warn" icon="key" title="Falta una API key">
          Agregá <b>DEEPSEEK_API_KEY</b> o <b>GEMINI_API_KEY</b> en el servidor (.env o Render) y reiniciá. Las claves nunca
          pasan por el navegador: las guarda el backend.
        </Banner>
      )}
      {status.error && <Banner tone="warn" icon="alert-circle" title="Estado de IA">{status.error}</Banner>}

      <Card title="Chat del analista" icon="message-circle" actions={meta ? <span className="tiny muted">{meta}</span> : null} bodyClass="tight">
        <div className="chat" style={{ maxHeight: 460, overflowY: 'auto', padding: 4 }}>
          {messages.map((message, index) => (
            <div key={index} className={`msg ${message.role === 'system' ? 'system' : message.role}`}>
              {message.text || (busy && index === messages.length - 1 ? <span className="typing"><i /><i /><i /></span> : null)}
              {message.role === 'assistant' && message.text && <div className="msg-meta"><Icon name="sparkles" size={11} />analista</div>}
            </div>
          ))}
        </div>
        {error && <Banner tone="danger" icon="alert-circle" title="Error de IA">{error}</Banner>}
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <input className="input" placeholder={`Preguntá por ${symbol}…`} value={input} onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} disabled={busy} />
          <button className="btn primary" onClick={() => send()} disabled={busy || !configured}>{busy ? <span className="spinner" /> : <Icon name="arrow-up-right" size={15} />}</button>
        </div>
        <div className="chip-row" style={{ marginTop: 8 }}>
          {QUICK.map((item) => (
            <button key={item.id} type="button" className="chip" onClick={() => runTask(item.task, item.label)} disabled={busy || !configured}>
              <Icon name={item.icon} size={13} />{item.label}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setMessages([{ role: 'system', text: 'Chat reiniciado.' }])}><Icon name="refresh" size={13} />Limpiar</button>
          {busy && <button type="button" className="chip" onClick={() => abort.current?.abort()}><Icon name="x" size={13} />Detener</button>}
        </div>
      </Card>

      <Card title="Cómo usa la IA tus datos" icon="shield-check">
        <ul className="small" style={{ margin: '0 0 0 18px', color: 'var(--text-2)', lineHeight: 1.6 }}>
          <li>Solo enviamos el contexto de la señal activa (precio, Greeks, cadena resumida, posicionamiento). No enviamos tu cuenta ni claves.</li>
          <li>DeepSeek y Gemini reciben el prompt y devuelven texto; el motor de precios siempre es local.</li>
          <li>Si un proveedor falla, el otro responde como respaldo. Sin claves, la IA queda desactivada y la app sigue funcionando.</li>
        </ul>
      </Card>
    </div>
  );
}
