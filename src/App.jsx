import { useEffect, useMemo, useState } from 'react';
import { apiGet } from './lib/api.js';
import { useLocalStorage, useTheme } from './lib/hooks.js';
import { Icon, Badge } from './components/ui.jsx';
import QuickPanel from './QuickPanel.jsx';
import NitoPanel from './NitoPanel.jsx';
import SpreadsPanel from './SpreadsPanel.jsx';
import PositioningPanel from './PositioningPanel.jsx';
import AiPanel from './AiPanel.jsx';
import WheelPanel from './WheelPanel.jsx';
import SystemPanel from './SystemPanel.jsx';

const SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'AMD', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'PLTR', 'COIN', 'SOFI', 'MARA'];
const RADAR_DEFAULTS = ['SPY', 'QQQ', 'AMD', 'NVDA', 'TSLA', 'META', 'PLTR'];

const TABS = [
  { id: 'quick', label: 'Rápido', icon: 'flame', title: 'Modo rápido' },
  { id: 'nito', label: 'NiTo', icon: 'zap', title: 'NiTo · Call & Put' },
  { id: 'spreads', label: 'Spreads', icon: 'layers', title: 'Spreads agresivos' },
  { id: 'positioning', label: 'Institucional', icon: 'bar-chart', title: 'Posicionamiento institucional' },
  { id: 'ai', label: 'IA', icon: 'sparkles', title: 'Analista IA' },
  { id: 'wheel', label: 'Rueda', icon: 'refresh', title: 'Rueda del dueño' },
  { id: 'system', label: 'Sistema', icon: 'settings', title: 'Sistema' }
];

function tabFromLocation() {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (TABS.some((tab) => tab.id === hash)) return hash;
  if (/^\/nito/.test(window.location.pathname)) return 'nito';
  if (/^\/rapido|^\/rápido/i.test(window.location.pathname)) return 'quick';
  return 'quick';
}

export default function App() {
  const [tab, setTab] = useState(tabFromLocation);
  const [symbol, setSymbol] = useLocalStorage('5m-symbol', 'AMD');
  const [accountUsd, setAccountUsd] = useLocalStorage('5m-account', 10000);
  const [theme, toggleTheme] = useTheme();
  const [health, setHealth] = useState(null);

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
            <button className="icon-btn" onClick={toggleTheme} aria-label="Cambiar tema"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          </div>
        </div>
      </header>

      <main className="main">
        {tab === 'quick' && <QuickPanel {...panelProps} />}
        {tab === 'nito' && <NitoPanel {...panelProps} />}
        {tab === 'spreads' && <SpreadsPanel symbols={radarSymbols.slice(0, 6)} symbol={symbol} setSymbol={setSymbol} />}
        {tab === 'positioning' && <PositioningPanel {...panelProps} />}
        {tab === 'ai' && <AiPanel {...panelProps} />}
        {tab === 'wheel' && <WheelPanel />}
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