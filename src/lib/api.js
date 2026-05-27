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
  journal: () => request('/api/journal'),
  addJournal: (entry) => request('/api/journal', { method: 'POST', body: JSON.stringify(entry) }),
  saveWatchlist: (symbols) => request('/api/watchlist', { method: 'PUT', body: JSON.stringify({ symbols }) }),
  saveProfile: (profile) => request('/api/profile', { method: 'PUT', body: JSON.stringify(profile) })
};
