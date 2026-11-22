import { useEffect, useState } from 'react';
import { apiGet, apiPost, getKey, setKey } from './lib/api.js';
import { useApi } from './lib/hooks.js';
import { Icon, Card, Badge, Stat, KV, Banner, Spinner, SectionTitle } from './components/ui.jsx';
import { dateTime } from './lib/format.js';

export default function SystemPanel({ theme, toggleTheme, accountUsd, setAccountUsd }) {
  const health = useApi(() => apiGet('/api/health'), []);
  const status = useApi(() => apiGet('/api/status'), []);
  const ai = useApi(() => apiGet('/api/ai/status'), []);
  const [key, setLocalKey] = useState(getKey());
  const [saved, setSaved] = useState('');
  const [capital, setCapital] = useState(String(accountUsd || 10000));

  const integrations = health.data?.configured || {};

  return (
    <div className="stack">
      <SectionTitle eyebrow="Sistema" title="Conexiones y preferencias" note="Lo que está configurado en el servidor y lo que guarda este dispositivo." />
      <Card title="Estado del servidor" icon="cpu" actions={<Badge tone={health.data?.ok ? 'up' : 'down'}>{health.data?.ok ? 'ONLINE' : 'SIN RESPUESTA'}</Badge>}>
        {health.loading ? <Spinner /> : health.error ? <Banner tone="danger" icon="alert-circle">{health.error}</Banner> : (
          <div className="grid-2">
            <KV label="App" value={health.data?.app || '—'} />
            <KV label="Hora servidor" value={dateTime(health.data?.timestamp)} />
            <KV label="Tradier" value={integrations.tradier ? 'configurado' : 'falta'} />
            <KV label="Gemini" value={integrations.gemini ? 'configurado' : 'falta'} />
            <KV label="DeepSeek" value={integrations.deepseek ? 'configurado' : 'falta'} />
            <KV label="Datos" value={health.data?.demo?.dataSource || '—'} />
          </div>
        )}
        {health.data?.demo?.active && <Banner tone="sim" icon="alert-triangle" title="Modo demo activo">Sin TRADIER_TOKEN el servidor genera un mercado simulado. Todo se puede probar, nada se puede operar.</Banner>}
      </Card>

      <Card title="IA" icon="sparkles" tone="ai">
        <div className="grid-2">
          <KV label="DeepSeek" value={ai.data?.deepseek?.configured ? `${ai.data.deepseek.model} · listo` : 'sin DEEPSEEK_API_KEY'} />
          <KV label="Gemini" value={ai.data?.gemini?.configured ? `${ai.data.gemini.model} · listo` : 'sin GEMINI_API_KEY'} />
          <KV label="Proveedor" value={ai.data?.preferred || 'auto'} />
          <KV label="Tareas" value="señal · spread · posicionamiento · briefing · riesgo · chat" />
        </div>
        <pre className="tiny mono" style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 8, marginTop: 10, overflowX: 'auto' }}>{`DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
AI_PROVIDER=auto`}</pre>
        <p className="tiny muted">Las claves viven solo en el servidor. La app nunca las recibe.</p>
      </Card>

      <Card title="Acceso y capital" icon="key">
        <div className="stack">
          <label className="field"><span>APP_ACCESS_KEY (si el servidor la exige)</span>
            <div className="row"><input className="input" type="password" value={key} onChange={(event) => setLocalKey(event.target.value)} placeholder="clave del servidor" />
              <button className="btn sm" onClick={() => { setKey(key); setSaved('Clave guardada en este dispositivo.'); setTimeout(() => setSaved(''), 2000); }}>Guardar</button></div>
          </label>
          {saved && <p className="tiny up">{saved}</p>}
          <label className="field"><span>Capital para dimensionar (USD)</span>
            <div className="row"><input className="input" type="number" min="0" step="500" value={capital} onChange={(event) => setCapital(event.target.value)} />
              <button className="btn sm" onClick={() => { setAccountUsd(Math.max(0, Number(capital) || 0)); setSaved('Capital guardado.'); setTimeout(() => setSaved(''), 2000); }}>Aplicar</button></div>
          </label>
          <p className="tiny muted">Se usa para calcular cuántos contratos comprar según el % de riesgo (por defecto 1,5%).</p>
        </div>
      </Card>

      <Card title="Apariencia" icon="sun">
        <div className="row between">
          <div><b className="small">Tema {theme === 'dark' ? 'oscuro' : 'claro'}</b><p className="tiny muted">Claro por defecto para leer señales de día; oscuro para la noche.</p></div>
          <button className="btn sm" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />Cambiar</button>
        </div>
      </Card>

      <Card title="Módulos" icon="layers">
        <div className="stack xs small">
          <div className="row between"><span>NiTo direccional (CALL/PUT)</span><Badge tone="up">activo</Badge></div>
          <div className="row between"><span>Spreads agresivos</span><Badge tone="up">activo</Badge></div>
          <div className="row between"><span>Posicionamiento institucional</span><Badge tone="up">activo</Badge></div>
          <div className="row between"><span>Analista DeepSeek + Gemini</span><Badge tone={ai.data?.deepseek?.configured || ai.data?.gemini?.configured ? 'up' : 'warn'}>{ai.data?.deepseek?.configured || ai.data?.gemini?.configured ? 'activo' : 'sin claves'}</Badge></div>
          <div className="row between"><span>Rueda (CSP / CC)</span><Badge tone={integrations.tradier ? 'up' : 'warn'}>{integrations.tradier ? 'activo' : 'requiere Tradier'}</Badge></div>
        </div>
      </Card>

      <Card title="Datos y advisories" icon="info">
        <p className="small muted" style={{ lineHeight: 1.6 }}>
          5M calcula todo localmente con Black-Scholes y probabilidad lognormal neutral al riesgo. No es asesoramiento
          financiero. Verificá cada contrato en tu bróker: precio, spread, volumen y eventos pueden invalidar la señal.
        </p>
      </Card>
    </div>
  );
}
