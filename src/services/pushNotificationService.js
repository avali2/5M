import { showMobileSafeNotification } from './notifications.js';

export async function sendLocalGuardianNotification(ticket = {}) {
  return showMobileSafeNotification({
    title: ticket.notificationTitle || `${ticket.symbol || 'VALIDO'} - Guardian`,
    body: ticket.notificationBody || ticket.message || 'Revision manual requerida.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: ticket.id || `guardian-${ticket.symbol || 'market'}`,
    requireInteraction: true,
    data: {
      url: ticket.url || '/institutional-os.html?tab=guardian',
      signalId: ticket.signalId || ticket.id || null,
      symbol: ticket.symbol || null,
      strategy: ticket.strategy || null
    }
  });
}
