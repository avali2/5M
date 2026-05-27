import { DEFAULT_GUARDIAN_SETTINGS, mergeGuardianSettings } from './agentTypes.js';

const keys = {
  settings: 'valido-guardian-settings',
  events: 'valido-guardian-events',
  learning: 'valido-guardian-learning',
  feedback: 'valido-guardian-feedback'
};

function read(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
  return value;
}

export function loadGuardianSettings() {
  return mergeGuardianSettings(read(keys.settings, DEFAULT_GUARDIAN_SETTINGS));
}

export function saveGuardianSettings(settings) {
  return write(keys.settings, { ...mergeGuardianSettings(settings), updatedAt: new Date().toISOString() });
}

export function loadGuardianEvents() {
  return read(keys.events, []);
}

export function saveGuardianEvents(events) {
  return write(keys.events, events.slice(0, 200));
}

export function mergeGuardianEvents(events) {
  const prior = loadGuardianEvents();
  const ids = new Set(prior.map((item) => item.id));
  return saveGuardianEvents([...events.filter((item) => !ids.has(item.id)), ...prior]);
}

export function loadGuardianLearning() {
  return read(keys.learning, null);
}

export function saveGuardianLearning(profile) {
  return write(keys.learning, profile);
}

export function addGuardianFeedback(feedback) {
  const items = read(keys.feedback, []);
  return write(keys.feedback, [{ ...feedback, createdAt: new Date().toISOString() }, ...items].slice(0, 200));
}
