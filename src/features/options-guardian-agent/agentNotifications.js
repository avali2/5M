import { showMobileSafeNotification } from '../../services/notifications.js';
import { AGENT_EVENT_TYPES } from './agentTypes.js';

const notificationCopy = {
  [AGENT_EVENT_TYPES.SIGNAL_VALIDATED]: 'Senal validada. Revisa Delta, IV, bid/ask, OI y riesgo maximo.',
  [AGENT_EVENT_TYPES.SIGNAL_CONDITIONAL]: 'Condicional. Falta confirmacion; no entrar todavia.',
  [AGENT_EVENT_TYPES.RISK_BLOCKED]: 'Operacion bloqueada. Riesgo o colateral excede el plan.',
  [AGENT_EVENT_TYPES.LIQUIDITY_WARNING]: 'Bid/ask u OI debil. Riesgo de slippage.',
  [AGENT_EVENT_TYPES.GAMMA_RISK]: 'Gamma alto. El P/L puede cambiar rapidamente.',
  [AGENT_EVENT_TYPES.PAPER_PRACTICE_SUGGESTED]: 'Mercado cerrado: practica y registra aprendizaje.',
  [AGENT_EVENT_TYPES.MOTIVATION_REMINDER]: 'Disciplina primero. Sin edge validado, no hay trade.'
};

export function guardianNotificationPayload(event) {
  const ticket = event.data?.ticket;
  if (ticket) {
    return {
      title: ticket.notificationTitle || `${ticket.symbol} - ${ticket.classification}`,
      body: ticket.notificationBody || event.message,
      tag: `guardian-ticket-${ticket.symbol}-${ticket.classification}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: `/institutional-os.html?tab=guardian#${encodeURIComponent(event.id)}`, eventId: event.id, ticketId: ticket.id }
    };
  }
  const prefix = event.symbol ? `${event.symbol} - ` : '';
  return {
    title: `${prefix}Options Guardian`,
    body: notificationCopy[event.type] || event.message,
    tag: `guardian-${event.type}-${event.symbol || 'market'}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: '/institutional-os.html?tab=guardian#guardian', eventId: event.id }
  };
}

export async function sendGuardianLocalNotification(event, requestPermission = false) {
  return showMobileSafeNotification({ ...guardianNotificationPayload(event), requestPermission });
}

export async function deliverGuardianNotifications(events = []) {
  const diagnostics = [];
  for (const event of events) {
    diagnostics.push({ eventId: event.id, diagnostic: await sendGuardianLocalNotification(event, false) });
  }
  return diagnostics;
}
