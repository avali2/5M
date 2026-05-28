import webPush from 'web-push';

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
    return this.send({
      title: ticket?.notificationTitle || (event.symbol ? `${event.symbol} - Options Guardian` : 'Options Guardian'),
      body: ticket?.notificationBody || event.message,
      tag: ticket ? `guardian-ticket-${ticket.symbol}-${ticket.classification}` : `guardian-${event.type}-${event.symbol || 'market'}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      type: event.type,
      severity: event.severity,
      data: { url: `/institutional-os.html?tab=guardian#${encodeURIComponent(event.id)}`, eventId: event.id, ticketId: ticket?.id || null }
    });
  }

  async test() {
    return this.send({
      title: 'Options Guardian Web Push',
      body: 'La suscripcion para alertas con el movil bloqueado esta funcionando.',
      tag: 'guardian-web-push-test',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: '/institutional-os.html?tab=guardian#guardian' }
    });
  }
}
