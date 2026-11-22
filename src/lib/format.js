/* 5M · formateo de números y fechas */
export const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

export function money(value, digits = 2) {
  if (!isNum(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${Math.round(value).toLocaleString('en-US')}`;
  return `$${value.toFixed(digits)}`;
}
export function usd(value, digits = 0) {
  if (!isNum(value)) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
export function num(value, digits = 2) {
  if (!isNum(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function pct(value, digits = 1) {
  if (!isNum(value)) return '—';
  return `${value.toFixed(digits)}%`;
}
export function signedPct(value, digits = 2) {
  if (!isNum(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}
export function ratio(value) { return isNum(value) ? `1:${value.toFixed(2)}` : '—'; }

export function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-US', { timeZone: 'America/New_York', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}
export function timeOnly(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('es-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }).format(date);
}
export function dateShort(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-US', { timeZone: 'America/New_York', month: 'short', day: '2-digit' }).format(date);
}
export function expiryLabel(value) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-US', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' }).format(date);
}
export function ago(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'ahora';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}
export function scoreTone(score) { return score >= 78 ? 'up' : score >= 62 ? 'brand' : score >= 48 ? 'warn' : 'down'; }
export function gradeTone(grade) { return grade === 'A+' || grade === 'A' ? 'up' : grade === 'B' ? 'brand' : 'warn'; }
