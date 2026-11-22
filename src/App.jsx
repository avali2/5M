import { useEffect, useMemo, useState } from 'react';
import { apiGet, getKey, setKey } from './lib/api.js';
import { useLocalStorage, useTheme } from './lib/hooks.js';
import { Icon, Badge, Card } from './components/ui.jsx';
import QuickPanel from './QuickPanel.jsx';
import BotPanel from './BotPanel.jsx';
import SpreadsPanel from './SpreadsPanel.jsx';
import PositioningPanel from './PositioningPanel.jsx';
import AiPanel from './AiPanel.jsx';
import SystemPanel from './SystemPanel.jsx';
import CryptoPanel from './CryptoPanel.jsx';

const SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'AMD', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'PLTR', 'COIN', 'SOFI', 'MARA'];
const RADAR_DEFAULTS = ['SPY', 'QQQ', 'AMD', 'NVDA', 'TSLA', 'META', 'PLTR'];

const TABS = [
  { id: 'alertas', label: 'Alertas', icon: 'flame', title: 'Alertas agresivas' },
  { id: 'spreads', label: 'Spreads', icon: 'layers', title: 'Spreads agresivos' },
  { id: 'positioning', label: 'Institucional', icon: 'bar-chart', title: 'Posicionamiento institucional' },
  { id: 'ai', label: 'IA', icon: 'sparkles', title: 'Analista IA' },
  { id: 'botreal', label: 'Bot Real', icon: 'cpu', title: 'Bot de trading real' },
  { id: 'botpaper', label: 'Bot Paper', icon: 'database', title: 'Bot de paper' },
  { id: 'crypto', label: 'Crypto SOL', icon: 'flame', title: 'Crypto SOL turbo (paper)' },
  { id: 'system', label: 'Sistema', icon: 'settings', title: 'Sistema' }
];

// Guarda la clave que venga por URL antes de montar cualquier panel (?k=CLAVE o ?key=CLAVE).
try {
  const bootParams = new URLSearchParams(window.location.search);
  const bootKey = bootParams.get('k') || bootParams.get('key');
  if (bootKey) {
    setKey(bootKey);
    bootParams.delete('k');
    bootParams.delete('key');
    const bootSearch = bootParams.toString();
    window.history.replaceState({}, '', window.location.pathname + (bootSearch ? '?' + bootSearch : '') + window.location.hash);
  }
} catch { /* sin window */ }

function tabFromLocation() {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (hash === 'quick' || hash === 'rapido' || hash === 'rápido') return 'alertas';
  if (TABS.some((tab) => tab.id === hash)) return hash;
  if (/^\/bot-real|^\/botreal/i.test(window.location.pathname)) return 'botreal';
  if (/^\/bot-paper|^\/botpaper/i.test(window.location.pathname)) return 'botpaper';
  return 'alertas';
}

export default function App() {
  const [tab, setTab] = useState(tabFromLocation);
  const [symbol, setSymbol] = useLocalStorage('5m-symbol', 'AMD');
  const [accountUsd, setAccountUsd] = useLocalStorage('5m-account', 10000);
  const [theme, toggleTheme] = useTheme();
  const [health, setHealth] = useState(null);
  const [locked, setLocked] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyError, setKeyError] = useState('');

  useEffect(() => {
    const onUnauthorized = () => setLocked(true);
    window.addEventListener('5m:unauthorized', onUnauthorized);
    if (!getKey()) setLocked(true);
    return () => window.removeEventListener('5m:unauthorized', onUnauthorized);
  }, []);

  function saveKey() {
    const value = keyDraft.trim();
    if (!value) { setKeyError('Pegá la clave del servidor.'); return; }
    setKey(value);
    window.location.reload();
  }

  useEffect(() => {
    apiGet('/api/health').then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    const onHash = () => setTab(tabFromLocation());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const active = TABS.find((item) => item.id === tab);
    document.title = `${active?.title || '5M'} · 5 MILLIONS`;
  }, [tab]);

  const radarSymbols = useMemo(() => {
    const list = [symbol, ...RADAR_DEFAULTS.filter((item) => item !== symbol)];
    return [...new Set(list)].slice(0, 8);
  }, [symbol]);

  const panelProps = { symbols: radarSymbols, symbol, setSymbol, accountUsd };

  return (
    <div className="shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand-lockup">
            <div className="brand-logo">5M</div>
            <div className="brand-text">
              <b>5 MILLIONS</b>
              <span>Opciones · señales</span>
            </div>
          </div>
          <div className="header-tools">
            <label className="row" style={{ gap: 6 }}>
              <span className="sr-only">Símbolo</span>
              <select className="select" style={{ width: 'auto', minHeight: 34, padding: '5px 9px', fontFamily: 'var(--mono)', fontWeight: 700 }} value={symbol} onChange={(event) => setSymbol(event.target.value)}>
                {SYMBOLS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <Badge tone={health?.demo?.active ? 'warn' : 'up'}>{health?.demo?.active ? 'DEMO' : 'REAL'}</Badge>
            <button className="icon-btn" onClick={() => setLocked(true)} aria-label="Clave de acceso" title="Clave de acceso"><Icon name="key" /></button>
            <button className="icon-btn" onClick={toggleTheme} aria-label="Cambiar tema"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          </div>
        </div>
      </header>

      {locked && (
        <div className="main" style={{ maxWidth: 520 }}>
          <Card title="Acceso a 5 MILLIONS" icon="lock" subtitle="Tu servidor privado exige la clave APP_ACCESS_KEY.">
            <div className="stack">
              <p className="small" style={{ color: 'var(--text-2)' }}>Pegá la clave una vez: queda guardada solo en este dispositivo y no se envía a nadie más.</p>
              <label className="field"><span>Clave del servidor</span>
                <input className="input" type="password" value={keyDraft} placeholder="APP_ACCESS_KEY" onChange={(event) => setKeyDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveKey(); }} />
              </label>
              {keyError && <p className="tiny down">{keyError}</p>}
              <div className="row wrap" style={{ gap: 8 }}>
                <button className="btn primary" onClick={saveKey}><Icon name="lock" size={15} />Guardar y entrar</button>
                <a className="btn" href="https://dashboard.render.com/web/srv-dbkeeq0m7kps738k7ee0/env" target="_blank" rel="noopener noreferrer">Ver dónde está la clave</a>
                <button className="btn ghost" onClick={() => setLocked(false)}>Solo mirar</button>
              </div>
              <p className="tiny muted">La clave está en Render → tu servicio → Environment → <b>APP_ACCESS_KEY</b>. También podés abrir la app con <span className="mono">?k=TU_CLAVE</span> una vez y se guarda sola.</p>
            </div>
          </Card>
        </div>
      )}

      <main className="main">
        {tab === 'alertas' && <QuickPanel {...panelProps} />}
        {tab === 'botreal' && <BotPanel mode="live" accountUsd={accountUsd} />}
        {tab === 'botpaper' && <BotPanel mode="paper" accountUsd={accountUsd} />}
        {tab === 'spreads' && <SpreadsPanel symbols={radarSymbols.slice(0, 6)} symbol={symbol} setSymbol={setSymbol} />}
        {tab === 'positioning' && <PositioningPanel {...panelProps} />}
        {tab === 'ai' && <AiPanel {...panelProps} />}
        {tab === 'crypto' && <CryptoPanel />}
        {tab === 'system' && <SystemPanel theme={theme} toggleTheme={toggleTheme} accountUsd={accountUsd} setAccountUsd={setAccountUsd} />}
      </main>

      <nav className="tabbar" aria-label="Secciones">
        <div className="tabbar-inner">
          {TABS.map((item) => (
            <button key={item.id} type="button" className="tab" aria-selected={tab === item.id}
              onClick={() => { window.location.hash = item.id; setTab(item.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              <span className="tab-dot" />
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}