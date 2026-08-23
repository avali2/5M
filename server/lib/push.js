import webpush from 'web-push';
import { config } from '../config.js';
import { addSubscription, getSubscriptions, markSignalNotified, removeSubscription, wasSignalNotified } from './store.js';

let configured = false;
if (config.push.enabled && config.push.publicKey && config.push.privateKey) {
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
  configured = true;
}

export function pushStatus() {
  return { enabled: config.push.enabled, configured, publicKey: configured ? config.push.publicKey : null };
}

export async function savePushSubscription(subscription) {
  if (!configured) throw new Error('Web Push no está configurado en el servidor.');
  return addSubscription(subscription);
}

async function sendPayload(payload) {
  if (!configured) return { sent: 0, skipped: true };
  const subscriptions = await getSubscriptions();
  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) await removeSubscription(subscription.endpoint);
      else console.warn(`[5M] Push falló: ${error.message}`);
    }
  }
  return { sent, skipped: false };
}

export async function notifyReadySignal(signal, baseUrl = '') {
  if (await wasSignalNotified(signal.id)) return { sent: 0, duplicate: true };
  const result = await sendPayload({
    title: `5 MILLIONS · ${signal.symbol} ${signal.profile?.label || ''}`,
    body: `${signal.strategyLabel} ${signal.shortStrike}/${signal.longStrike} · ${signal.expiration} · crédito $${signal.credit.toFixed(2)} · ${signal.sizing?.contractsAtWorstRisk || 0} contrato(s) máx.`,
    tag: `5m-${signal.id}`,
    url: `${baseUrl || ''}/?signal=${encodeURIComponent(signal.id)}`
  });
  if (result.sent > 0) await markSignalNotified(signal.id);
  return result;
}

export async function sendTestPush() {
  return sendPayload({ title: '5 MILLIONS · Notificaciones activas', body: 'La app puede avisarte cuando aparezca una señal READY.', tag: '5m-test' });
}
