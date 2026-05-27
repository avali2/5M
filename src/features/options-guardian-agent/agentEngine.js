import { AGENT_CHANNELS, AGENT_EVENT_TYPES, AGENT_SEVERITIES, mergeGuardianSettings } from './agentTypes.js';
import { evaluateGuardianRules } from './agentRules.js';

function etParts(now) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(now)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function getMarketStatus(now = new Date()) {
  const parts = etParts(now);
  if (['Sat', 'Sun'].includes(parts.weekday)) return 'closed';
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (minutes >= 570 && minutes < 960) return 'regular';
  if (minutes >= 330 && minutes < 570) return 'premarket';
  return 'closed';
}

export function guardianCadenceMinutes({ marketStatus, events = [], settings: inputSettings, hasOpenPaperTrade = false }) {
  const settings = mergeGuardianSettings(inputSettings);
  if (events.some((item) => item.severity === AGENT_SEVERITIES.CRITICAL)) return settings.scanCadence.criticalRiskMinutes;
  if (hasOpenPaperTrade) return settings.scanCadence.paperTradeMonitorMinutes;
  if (events.some((item) => item.type === AGENT_EVENT_TYPES.SIGNAL_VALIDATED || item.type === AGENT_EVENT_TYPES.SIGNAL_CONDITIONAL)) {
    return settings.scanCadence.activeCandidateMinutes;
  }
  if (marketStatus === 'regular') return settings.scanCadence.regularMinutes;
  if (marketStatus === 'premarket') return settings.scanCadence.premarketMinutes;
  return settings.scanCadence.learningMinutesWhenClosed;
}

export function eventFingerprint(item) {
  return [item.type, item.symbol || 'market', item.data?.strategy || '', item.data?.expiration || ''].join(':');
}

export function filterGuardianNotifications(events, priorEvents = [], inputSettings = {}, now = new Date()) {
  const settings = mergeGuardianSettings(inputSettings);
  if (!settings.enabled) return [];
  const nowTime = new Date(now).getTime();
  const hourAgo = nowTime - 3600000;
  const alertsThisHour = priorEvents.filter((item) => item.notificationSent && new Date(item.createdAt).getTime() >= hourAgo).length;
  const silenceSignalsForMacro = settings.workMode.silenceDuringHighImpactMacro &&
    events.some((item) => item.type === AGENT_EVENT_TYPES.MACRO_RISK);
  let available = Math.max(0, settings.workMode.maxAlertsPerHour - alertsThisHour);
  const notifications = [];
  for (const item of events) {
    const critical = item.severity === AGENT_SEVERITIES.CRITICAL;
    if (settings.silencedUntil && new Date(settings.silencedUntil).getTime() > nowTime && !critical) continue;
    if (settings.workMode.onlyCritical && !critical) continue;
    if (silenceSignalsForMacro && item.type.startsWith('SIGNAL_') && !critical) continue;
    if (settings.mutedSymbols.includes(String(item.symbol || '').toUpperCase()) && !critical) continue;
    if (item.type === AGENT_EVENT_TYPES.NO_TRADE_PROFESSIONAL) continue;
    const score = Number(item.data?.score);
    if (item.type.includes('SIGNAL_') && Number.isFinite(score) && score < settings.workMode.minScoreToNotify) continue;
    if (!item.channels?.some((channel) => channel === AGENT_CHANNELS.PWA_NOTIFICATION || channel === AGENT_CHANNELS.WEB_PUSH)) continue;
    const duplicate = priorEvents.find((prior) =>
      eventFingerprint(prior) === eventFingerprint(item) &&
      new Date(prior.createdAt).getTime() >= nowTime - settings.cooldowns.duplicateMinutes * 60000
    );
    if (duplicate && !critical) continue;
    const typeCooldownMinutes = item.type === AGENT_EVENT_TYPES.MOTIVATION_REMINDER
      ? settings.cooldowns.motivationMinutes : settings.cooldowns.perEventTypeMinutes;
    const typeCooldown = priorEvents.find((prior) =>
      prior.notificationSent &&
      prior.type === item.type &&
      new Date(prior.createdAt).getTime() >= nowTime - typeCooldownMinutes * 60000
    );
    if (typeCooldown && !critical) continue;
    const symbolCooldown = item.symbol && priorEvents.find((prior) =>
      prior.notificationSent &&
      prior.symbol === item.symbol &&
      new Date(prior.createdAt).getTime() >= nowTime - settings.cooldowns.perSymbolMinutes * 60000
    );
    if (symbolCooldown && !critical) continue;
    if (available <= 0 && !critical) continue;
    notifications.push(item);
    if (!critical) available -= 1;
  }
  return notifications;
}

export function processGuardianContext(context = {}, priorEvents = []) {
  const settings = mergeGuardianSettings(context.settings);
  const now = context.now || new Date().toISOString();
  const marketStatus = context.marketStatus || getMarketStatus(now);
  const rawEvents = evaluateGuardianRules({ ...context, settings, now, marketStatus });
  const existing = new Set(priorEvents.map(eventFingerprint));
  const events = rawEvents.filter((item) => !existing.has(eventFingerprint(item)) ||
    !priorEvents.some((prior) => eventFingerprint(prior) === eventFingerprint(item) &&
      new Date(prior.createdAt).getTime() >= new Date(now).getTime() - settings.cooldowns.duplicateMinutes * 60000));
  const notifications = filterGuardianNotifications(events, priorEvents, settings, now);
  const nextCadenceMinutes = guardianCadenceMinutes({ marketStatus, events, settings, hasOpenPaperTrade: Boolean(context.hasOpenPaperTrade) });
  return { marketStatus, events, notifications, nextCadenceMinutes, settings };
}
