async function request(path, options) {
  const accessKey = window.localStorage.getItem('valido-access-key') || '';
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(accessKey ? { 'X-Valido-Key': accessKey } : {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.detail || data.error || 'API request failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  setAccessKey: (key) => window.localStorage.setItem('valido-access-key', key),
  clearAccessKey: () => window.localStorage.removeItem('valido-access-key'),
  health: () => request('/api/health'),
  scan: () => request('/api/scan'),
  refresh: () => request('/api/scan/refresh', { method: 'POST' }),
  explainers: () => request('/api/explainers'),
  aiStatus: () => request('/api/ai/status'),
  explainWithAi: () => request('/api/ai/explain', { method: 'POST' }),
  journal: () => request('/api/journal'),
  addJournal: (entry) => request('/api/journal', { method: 'POST', body: JSON.stringify(entry) }),
  saveWatchlist: (symbols) => request('/api/watchlist', { method: 'PUT', body: JSON.stringify({ symbols }) }),
  saveProfile: (profile) => request('/api/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  guardianStatus: () => request('/api/guardian/status'),
  guardianEvents: () => request('/api/guardian/events'),
  guardianLearning: () => request('/api/guardian/learning'),
  guardianSettings: () => request('/api/guardian/settings'),
  guardianRun: () => request('/api/guardian/run', { method: 'POST' }),
  saveGuardianSettings: (settings) => request('/api/guardian/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  guardianFeedback: (id, feedback) => request(`/api/guardian/events/${id}/feedback`, { method: 'POST', body: JSON.stringify(feedback) }),
  pushPublicKey: () => request('/api/push/public-key'),
  pushSubscribe: (subscription) => request('/api/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  pushUnsubscribe: (subscription) => request('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  pushTest: () => request('/api/push/test', { method: 'POST' })
};
