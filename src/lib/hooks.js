import { useCallback, useEffect, useRef, useState } from 'react';

/** Fetch declarativo con refresh manual y cancelación. */
export function useApi(fetcher, deps = [], { auto = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(auto);
  const alive = useRef(true);
  const runId = useRef(0);

  const load = useCallback(async () => {
    const id = ++runId.current;
    setLoading(true); setError('');
    try {
      const result = await fetcher();
      if (alive.current && id === runId.current) setData(result);
    } catch (requestError) {
      if (alive.current && id === runId.current) setError(requestError.message || 'Error al consultar.');
    } finally {
      if (alive.current && id === runId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { alive.current = true; if (auto) load(); return () => { alive.current = false; }; }, [load, auto]);
  return { data, error, loading, reload: load, setData };
}

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try { const stored = localStorage.getItem(key); return stored === null ? initial : JSON.parse(stored); } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
  }, [key, value]);
  return [value, setValue];
}

export function useTheme() {
  const [theme, setTheme] = useLocalStorage('5m-theme', 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#070c17' : '#f2f5fa');
  }, [theme]);
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}

export function useCopy() {
  const [message, setMessage] = useState('');
  const timer = useRef(null);
  const copy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Copiado ✓');
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text; document.body.appendChild(area); area.select();
        document.execCommand('copy'); document.body.removeChild(area);
        setMessage('Copiado ✓');
      } catch { setMessage('No se pudo copiar'); }
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 1800);
  }, []);
  return { copy, message };
}
