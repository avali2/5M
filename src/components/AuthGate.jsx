import { useEffect, useState } from 'react';

async function authRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export function AuthGate({ children }) {
  const [status, setStatus] = useState(null);
  const [accessKey, setAccessKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const check = () => authRequest('/api/auth/status')
      .then((value) => { if (active) setStatus(value); })
      .catch((reason) => { if (active) setStatus({ required: true, configured: false, error: reason.message }); });
    const requireLogin = () => setStatus((current) => ({ ...(current || {}), required: true, authenticated: false }));
    check();
    window.addEventListener('valido-auth-required', requireLogin);
    return () => {
      active = false;
      window.removeEventListener('valido-auth-required', requireLogin);
    };
  }, []);

  async function login(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await authRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ accessKey }) });
      setStatus((current) => ({ ...(current || {}), required: true, configured: true, authenticated: true }));
      setAccessKey('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!status) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-sm font-bold text-white">VALIDO 1M</main>;
  }
  if (!status.required || status.authenticated) return children;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-900">
      <form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
        <div>
          <p className="text-xs font-black uppercase text-blue-700">VALIDO 1M</p>
          <h1 className="mt-1 text-2xl font-black">Acceso privado</h1>
          <p className="mt-2 text-sm text-slate-600">Usa la clave privada configurada en Render.</p>
        </div>
        {!status.configured && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">APP_ACCESS_KEY no esta configurada en el Web Service.</p>}
        <label className="block text-sm font-bold">
          Clave privada
          <input
            autoComplete="current-password"
            autoFocus
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            disabled={!status.configured || submitting}
            onChange={(event) => setAccessKey(event.target.value)}
            required
            type="password"
            value={accessKey}
          />
        </label>
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
        <button className="w-full rounded-md bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-50" disabled={!status.configured || submitting} type="submit">
          {submitting ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
