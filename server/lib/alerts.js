/**
 * 5M · Alertas: decide qué vale la pena notificar (oportunidades y posiciones)
 * y evita repetir el mismo aviso dentro de una ventana de enfriamiento.
 */
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

function money(value) {
  return isNum(value) ? '$' + Math.round(value).toLocaleString('en-US') : '—';
}

export function decideOpportunityAlerts({ scan, minScore = 75, now = new Date() } = {}) {
  if (!scan || scan.simulated) return [];
  const alerts = [];
  for (const item of scan.opportunities || []) {
    if (!isNum(item.score) || item.score < minScore) continue;
    if (item.meta?.operable === false) continue;
    const detail = item.kind === 'SPREAD'
      ? `${item.strategy?.replaceAll('_', ' ')} · ${item.dte}d · ${(item.credit ?? 0) < 0 ? 'débito ' + money(Math.abs(item.credit)) : 'crédito ' + money(item.credit)} · POP ${Math.round((item.pop || 0) * 100)}%`
      : `${item.expiry} ${item.kind === 'CALL' ? 'C' : 'P'} ${item.contract?.strike} · entrada ${money(item.entry)} · POP ${Math.round((item.pop || 0) * 100)}%`;
    alerts.push({
      key: 'opp:' + item.kind + ':' + item.symbol + ':' + (item.kind === 'SPREAD' ? item.strategy : item.contract?.strike + ':' + item.expiry),
      title: `5M · ${item.kind === 'SPREAD' ? item.strategy?.replaceAll('_', ' ') : item.kind} ${item.symbol} (${item.score})`,
      body: `${item.action}: ${detail}. Abrí Rápido para copiar la orden.`,
      url: '/#quick',
      kind: 'opportunity',
      symbol: item.symbol,
      score: item.score,
      at: now.toISOString()
    });
  }
  return alerts;
}

export function decidePositionAlerts({ analysis, now = new Date() } = {}) {
  if (!analysis) return [];
  const alerts = [];
  for (const position of analysis.positions || []) {
    if (position.priority !== 'ALTA') continue;
    alerts.push({
      key: 'pos:' + position.id + ':' + position.action.slice(0, 12),
      title: `5M · ${position.symbol} pide acción`,
      body: `${position.strategy}: ${position.action}. P/L ${money(position.pnlUsd)} · ${position.dte ?? '—'}d para vencer.`,
      url: '/#quick',
      kind: 'position',
      symbol: position.symbol,
      at: now.toISOString()
    });
  }
  return alerts;
}

export class AlertCenter {
  constructor({ cooldownMinutes = 120 } = {}) {
    this.cooldownMs = Math.max(1, cooldownMinutes) * 60000;
    this.sent = new Map();
  }

  due(items = [], now = Date.now()) {
    const ready = [];
    for (const item of items) {
      const last = this.sent.get(item.key) || 0;
      if (now - last < this.cooldownMs) continue;
      this.sent.set(item.key, now);
      ready.push(item);
    }
    if (this.sent.size > 500) {
      for (const [key, at] of this.sent) if (now - at > this.cooldownMs * 4) this.sent.delete(key);
    }
    return ready;
  }

  peek() {
    return [...this.sent.entries()].map(([key, at]) => ({ key, at: new Date(at).toISOString() }));
  }
}