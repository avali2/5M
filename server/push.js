import webPush from 'web-push';

const ALLOWED_PUSH_TYPES = new Set(['READY_GREEN', 'CRITICAL_RISK']);

function payloadType(payload = {}) {
  return payload.type || payload.data?.type || payload.status || payload.data?.status || null;
}

export class GuardianPushService {
  constructor(settings = {}, store) {
    this.settings = settings;
    this.store = store;
    this.configured = Boolean(settings.enabled && settings.publicKey && settings.privateKey && settings.subject);
    this.configurationError = null;
    if (this.configured) {
      try {
        webPush.setVapidDetails(settings.subject, settings.publicKey, settings.privateKey);
      } catch (error) {
        this.configured = false;
        this.configurationError = error.message;
      }
    }
  }

  status() {
    return {
      enabled: Boolean(this.settings.enabled),
      configured: this.configured,
      publicKey: this.configured ? this.settings.publicKey : null,
      configurationError: this.configurationError,
      fcmEnabled: Boolean(this.settings.enableFcm),
      fcmConfigured: false,
      deliveryNote: 'Web Push requiere HTTPS, permiso, suscripcion activa y disponibilidad del sistema operativo.'
    };
  }

  async subscribe(payload) {
    const subscription = payload?.subscription;
    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      const error = new Error('Push subscription invalida.');
      error.status = 400;
      throw error;
    }
    return this.store.save(payload);
  }

  async unsubscribe(endpoint) {
    if (!endpoint) {
      const error = new Error('endpoint requerido.');
      error.status = 400;
      throw error;
    }
    return this.store.unsubscribe(endpoint);
  }

  async send(payload) {
    const type = payloadType(payload);
    if (!ALLOWED_PUSH_TYPES.has(type)) {
      return { sent: 0, failed: 0, skipped: true, error: `Push blocked: ${type || 'missing type'} is not READY_GREEN or CRITICAL_RISK.` };
    }
    if (!this.configured) return { sent: 0, failed: 0, error: 'Web Push no configurado: agrega VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY.' };
    const subscriptions = await this.store.active();
    let sent = 0;
    let failed = 0;
    for (const item of subscriptions) {
      try {
        await webPush.sendNotification(item.subscription, JSON.stringify(payload));
        sent += 1;
        await this.store.success(item);
      } catch (error) {
        failed += 1;
        const inactive = error.statusCode === 404 || error.statusCode === 410;
        await this.store.failure(item, error, inactive);
      }
    }
    return { sent, failed, error: subscriptions.length ? null : 'No hay dispositivos suscritos.' };
  }

  async sendGuardianEvent(event) {
    const ticket = event.data?.ticket;
    const status = ticket?.status || ticket?.signalStatus || ticket?.classification;
    const critical = event.severity === 'critical' || event.type === 'CRITICAL_RISK' || status === 'CRITICAL_RISK';
    if (status !== 'READY_GREEN' && !critical) {
      return { sent: 0, failed: 0, skipped: true, error: 'Guardian event is not READY_GREEN or CRITICAL_RISK.' };
    }
    if (critical) {
      return this.sendCriticalRisk({
        symbol: event.symbol || ticket?.symbol || 'PORTFOLIO',
        reason: event.message || 'Critical position risk detected.',
        action: event.recommendation || 'REVISAR_MANUAL',
        url: `/institutional-os.html?tab=guardian#${encodeURIComponent(event.id)}`
      });
    }
    return this.send({
      type: 'READY_GREEN',
      title: ticket?.notificationTitle || `Senal lista: ${ticket?.symbol || event.symbol} ${ticket?.strategy || ''}`.trim(),
      body: ticket?.notificationBody || event.message,
      tag: ticket ? `guardian-ticket-${ticket.symbol}-${ticket.classification}` : `guardian-${event.type}-${event.symbol || 'market'}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      severity: event.severity,
      data: { type: 'READY_GREEN', url: `/institutional-os.html?tab=guardian#${encodeURIComponent(event.id)}`, eventId: event.id, ticketId: ticket?.id || null }
    });
  }

  async sendReadyGreen(signal) {
    const id = signal.id || `${signal.symbol}-${signal.strategy}-${signal.expiration}`;
    const cd = signal.creditDebit || (Number.isFinite(signal.credit) ? { type: 'credit', value: signal.credit } : Number.isFinite(signal.debit) ? { type: 'debit', value: signal.debit } : { type: 'limit', value: signal.limitPrice });
    return this.send({
      type: 'READY_GREEN',
      title: `Senal lista: ${signal.symbol} ${signal.strategy}`,
      body: `${signal.expiration || 'exp N/D'} | ${signal.strikes || 'strikes N/D'} | ${cd.type} ${cd.value ?? 'N/D'} | Riesgo $${signal.maxRisk ?? 'N/D'} | POP ${signal.pop ?? signal.popEstimated ?? 'N/D'}% | Score ${signal.confidenceScore ?? signal.score ?? 'N/D'}`,
      tag: `ready-green-${id}`,
      url: `/signals/${encodeURIComponent(id)}`,
      requireInteraction: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: {
        type: 'READY_GREEN',
        signalId: id,
        symbol: signal.symbol,
        strategy: signal.strategy,
        url: `/signals/${encodeURIComponent(id)}`
      }
    });
  }

  async sendCriticalRisk({ symbol = 'PORTFOLIO', reason = 'Critical risk detected.', action = 'REVISAR_MANUAL', url = '/institutional-os.html?tab=risk' } = {}) {
    return this.send({
      type: 'CRITICAL_RISK',
      title: `Riesgo critico: ${symbol}`,
      body: `${reason} | Accion sugerida: ${action}`,
      tag: `critical-risk-${symbol}`,
      url,
      requireInteraction: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { type: 'CRITICAL_RISK', symbol, reason, action, url }
    });
  }

  async test() {
    return {
      sent: 0,
      failed: 0,
      dryRun: true,
      skipped: true,
      error: 'Live test push disabled by READY_GREEN/CRITICAL_RISK-only policy.',
      status: this.status()
    };
  }
}
