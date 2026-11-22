import { useEffect, useRef, useState } from 'react';

/* --------------------------------- Iconos --------------------------------- */
const P = {
  'trending-up': 'M3 17l6-6 4 4 8-8M17 7h4v4',
  'trending-down': 'M3 7l6 6 4-4 8 8M17 17h4v-4',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  sparkles: 'M12 3l1.8 4.9L19 9.8l-4.4 2.6L13.4 18 12 13.2 7.5 11.6 11 9zM19 15l.9 2.3 2.1 1-2.1 1-1 2.2-1-2.2-2-1 2-1z',
  brain: 'M9.5 3a3 3 0 0 0-3 3v.4A3 3 0 0 0 5 9.3a3 3 0 0 0 .3 5.4A3 3 0 0 0 9 18.6V21M14.5 3a3 3 0 0 1 3 3v.4A3 3 0 0 1 19 9.3a3 3 0 0 1-.3 5.4A3 3 0 0 1 15 18.6V21M9.5 8h5M9 12.5h6M10 17h4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'shield-check': 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 11.5l2 2 4-4',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  zap: 'M13 2 3 14h8l-1 8 10-12h-8l1-8z',
  'alert-triangle': 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  'alert-circle': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01',
  check: 'M20 6 9 17l-5-5',
  'check-circle': 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.1l-3-3',
  x: 'M18 6 6 18M6 6l12 12',
  copy: 'M9 9h10v12H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-5-.5 2.2 1.3 3.7 2.5 5.2A6.4 6.4 0 0 1 16 13.5a5.5 5.5 0 1 1-11 0c0-.8.3-1.6.8-2.2',
  crosshair: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM22 12h-4M6 12H2M12 6V2M12 22v-4',
  coins: 'M9 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM15 20a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  gauge: 'M12 15l4-4M21.8 17A10 10 0 1 0 2.2 17',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  'message-circle': 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 21l1.9-4.9A8.4 8.4 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 9 8.4z',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zM15.5 7.5 19 4l3 3-3.5 3.5',
  wifi: 'M5 12.6a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 8.8a15 15 0 0 1 20 0',
  'wifi-off': 'M2 2l20 20M8.5 16a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 5.2-2.7M12 20h.01M16.7 9.9A10 10 0 0 1 19 12M2 8.8a15 15 0 0 1 6-3.6',
  database: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  cpu: 'M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2M6 6h12v12H6zM10 10h4v4h-4z',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  'arrow-up-right': 'M7 17 17 7M7 7h10v10',
  'arrow-down-right': 'M7 7l10 10M17 7v10H7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  'pie-chart': 'M21.2 15.9A10 10 0 1 1 8 2.8M22 12A10 10 0 0 0 12 2v10z',
  'bar-chart': 'M12 20V10M18 20V4M6 20v-4',
  'line-chart': 'M3 3v18h18M18.7 8l-5.1 5.2-3-3L4 17',
  wallet: 'M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5zM16 12h5M3 7h16',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  'external-link': 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5',
  play: 'M5 3l14 9-14 9z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8',
  terminal: 'M4 17l6-6-6-6M12 19h8',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z',
  award: 'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM8.2 13.9 7 22l5-3 5 3-1.2-8.1',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16.2 7.8l-2.3 6.1-6.1 2.3 2.3-6.1z',
  percent: 'M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  scale: 'M12 3v18M7 7l-4 8h8zM17 7l-4 8h8zM7 21h10',
  menu: 'M3 6h18M3 12h18M3 18h18'
};

export function Icon({ name, size = 16, stroke = 2, className = '', ...rest }) {
  const d = P[name] || P.info;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden="true" {...rest}>
      <path d={d} />
    </svg>
  );
}

/* ------------------------------- Primitivas ------------------------------- */
export function Card({ title, subtitle, icon, actions, tone = '', children, className = '', bodyClass = '' }) {
  return (
    <section className={`card ${tone ? `tone-${tone}` : ''} ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {icon && <span className="card-icon"><Icon name={icon} /></span>}
          <div style={{ minWidth: 0 }}>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={`card-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Badge({ children, tone = 'neutral', icon }) {
  return <span className={`badge ${tone}`}>{icon && <Icon name={icon} size={11} />}{children}</span>;
}

export function Stat({ label, value, sub, tone = '' }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
      {sub && <em>{sub}</em>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, note, actions }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Gauge({ value = 0, grade = '', label = 'Score', size = 92 }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = size / 2 - 7;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = clamped >= 78 ? 'var(--up)' : clamped >= 62 ? 'var(--brand)' : clamped >= 48 ? 'var(--warn)' : 'var(--down)';
  return (
    <div className="gauge">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`} aria-hidden="true">
        <path d={`M 7 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 7} ${size / 2}`} fill="none" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        <path d={`M 7 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 7} ${size / 2}`} fill="none" stroke={color}
          strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 500ms ease' }} />
      </svg>
      <div className="gauge-meta">
        <strong style={{ color }}>{Math.round(clamped)}</strong>
        <span>{label}{grade ? ` · ${grade}` : ''}</span>
      </div>
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="chip-row" role="group" aria-label={label}>
      {options.map((option) => {
        const key = typeof option === 'string' ? option : option.value;
        const text = typeof option === 'string' ? option : option.label;
        return (
          <button key={key} type="button" className="chip" aria-pressed={value === key} onClick={() => onChange(key)}>
            {text}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function CopyButton({ text, label = 'Copiar', small = true, className = '' }) {
  const [state, setState] = useState('');
  const timer = useRef(null);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState('¡Copiado!'); }
    catch {
      try { const area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); document.execCommand('copy'); document.body.removeChild(area); setState('¡Copiado!'); }
      catch { setState('No se pudo'); }
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(''), 1800);
  }
  return (
    <button type="button" className={`btn ${small ? 'sm' : ''} ${className}`} onClick={copy}>
      <Icon name={state ? 'check' : 'copy'} size={14} />{state || label}
    </button>
  );
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" style={{ marginLeft: 'auto', width: 32, height: 32 }} onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-body" style={{ borderTop: '1px solid var(--border)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Toasts({ items = [] }) {
  if (!items.length) return null;
  return <div className="toast-wrap">{items.map((item) => <div key={item.id} className={`toast ${item.tone || ''}`}>{item.text}</div>)}</div>;
}

export function Banner({ tone = 'info', icon = 'info', title, children }) {
  return (
    <div className={`banner ${tone}`} role="status">
      <Icon name={icon} />
      <div>
        {title && <b className="banner-title">{title}</b>}
        {children}
      </div>
    </div>
  );
}

export function SourceBanner({ demo, marketOpen, asOf, stale, errors = [] }) {
  const items = [];
  if (demo) items.push(<Banner key="demo" tone="sim" icon="alert-triangle" title="DATOS SIMULADOS · NO OPERAR">El servidor no tiene TRADIER_TOKEN. Todo lo que ves es generado por el modo demo: sirve para probar la app, no para tomar decisiones. </Banner>);
  if (stale) items.push(<Banner key="stale" tone="warn" icon="clock" title="Datos vencidos">La última lectura es vieja. Actualizá antes de operar. </Banner>);
  if (marketOpen === false) items.push(<Banner key="closed" tone="info" icon="moon" title="Mercado cerrado">Podés planificar, pero no ejecutar hasta la apertura. La cotización corresponde al último cierre. </Banner>);
  if (errors.length) items.push(<Banner key="err" tone="warn" icon="alert-circle" title="Datos incompletos">{errors.slice(0, 3).map((item) => `${item.symbol || ''} ${item.error}`).join(' · ')}</Banner>);
  return items.length ? <div className="stack xs">{items}</div> : null;
}

export function EmptyState({ icon = 'compass', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={20} /></div>
      <h4>{title}</h4>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Spinner({ label }) {
  return <span className="row small muted"><span className="spinner" />{label || 'Cargando…'}</span>;
}

export function Skeleton({ height = 64 }) {
  return <div className="skeleton" style={{ height }} />;
}

export function KV({ label, value, tone = '' }) {
  return <div className="kv"><span>{label}</span><strong className={tone}>{value}</strong></div>;
}

export function Check({ status = 'neutral', children }) {
  const icon = status === 'pos' ? 'check' : status === 'neg' ? 'x' : status === 'warn' ? 'alert-triangle' : 'minus';
  return <div className={`check ${status}`}><span className="dot"><Icon name={icon} /></span><div>{children}</div></div>;
}

export function LegsTable({ legs = [] }) {
  if (!legs.length) return null;
  return (
    <div className="table-wrap">
      <table className="legs">
        <thead><tr><th>Pata</th><th>Tipo</th><th>Strike</th><th>Prima</th><th>Delta</th><th>IV</th><th>OI</th></tr></thead>
        <tbody>
          {legs.map((leg, index) => (
            <tr key={`${leg.action}-${leg.type}-${leg.strike}-${index}`}>
              <td><span className={`leg-action ${leg.action === 'SELL' ? 'sell' : 'buy'}`}>{leg.action === 'SELL' ? 'VENDE' : 'COMPRA'}</span></td>
              <td>{leg.type === 'call' ? 'CALL' : 'PUT'}</td>
              <td className="num">{leg.strike?.toFixed?.(2) ?? leg.strike}</td>
              <td className="num">{money2(leg.price)}</td>
              <td className="num">{leg.delta != null ? leg.delta.toFixed(2) : '—'}</td>
              <td className="num">{leg.iv != null ? `${(leg.iv * 100).toFixed(0)}%` : '—'}</td>
              <td className="num">{leg.oi != null ? leg.oi.toLocaleString('en-US') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function money2(value) { return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : '—'; }
export { money2 };

export function Disclaimer() {
  return (
    <p className="tiny muted" style={{ marginTop: 16, lineHeight: 1.5 }}>
      Señales generadas por modelo (Black-Scholes + lognormal neutral al riesgo). No garantizan ganancias ni sustituyen la
      revisión manual: verificá precio, spread, volumen y eventos en tu bróker antes de operar. Las opciones compradas
      pueden perder el 100% de la prima; los spreads de crédito pueden perder varias veces el crédito recibido.
    </p>
  );
}