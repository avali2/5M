import { api } from '../../lib/api.js';
import {
  addGuardianFeedback,
  loadGuardianEvents,
  loadGuardianLearning,
  loadGuardianSettings,
  mergeGuardianEvents,
  saveGuardianLearning,
  saveGuardianSettings
} from './guardianStorage.js';

export async function getGuardianDashboardState() {
  try {
    const [status, events, learning, settings] = await Promise.all([
      api.guardianStatus(),
      api.guardianEvents(),
      api.guardianLearning(),
      api.guardianSettings()
    ]);
    mergeGuardianEvents(events);
    if (learning) saveGuardianLearning(learning);
    saveGuardianSettings(settings);
    return { status, events, learning, settings, persistence: status.persistence || 'server' };
  } catch (error) {
    return {
      status: { enabled: true, backendScheduler: false, lastError: error.message, persistence: 'localStorage fallback' },
      events: loadGuardianEvents(),
      learning: loadGuardianLearning(),
      settings: loadGuardianSettings(),
      persistence: 'localStorage fallback'
    };
  }
}

export async function runGuardianAgent() {
  try {
    const result = await api.guardianRun();
    mergeGuardianEvents(result.events || []);
    if (result.learning) saveGuardianLearning(result.learning);
    return result;
  } catch (error) {
    return { events: [], notifications: [], error: error.message, offline: true };
  }
}

export async function updateGuardianSettings(settings) {
  const local = saveGuardianSettings(settings);
  try {
    return await api.saveGuardianSettings(local);
  } catch {
    return local;
  }
}

export async function recordGuardianFeedback(event, action, feedback = '') {
  const entry = { eventId: event.id, eventType: event.type, symbol: event.symbol, action, feedback };
  addGuardianFeedback(entry);
  try {
    return await api.guardianFeedback(event.id, entry);
  } catch {
    return entry;
  }
}
