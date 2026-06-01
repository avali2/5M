import React, { useEffect, useState } from 'react';
import InfoTooltip from './InfoTooltip';

export default function SystemStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Error fetching status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="bg-white rounded-xl p-3 text-sm border border-slate-200 mb-3">🔍 Verificando conexiones...</div>;

  const services = status?.services || {};
  const getIcon = (svc) => {
    if (!svc?.configured) return '⚫';
    if (svc?.working) return '🟢';
    return '🔴';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-3 mb-3 text-xs border border-slate-200">
      <div className="flex justify-between items-center">
        <h4 className="font-bold flex items-center gap-1 text-slate-900">📡 Estado del sistema <InfoTooltip explanation="Conexión con servicios externos. Verde = OK, Rojo = falla, Gris = no configurado." /></h4>
        <button onClick={fetchStatus} className="text-blue-500">↻</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
        <div className="flex items-center gap-1"><span>{getIcon(services.gemini)}</span> Gemini {services.gemini?.working ? '✓' : services.gemini?.configured ? '✗' : '⚫'}</div>
        <div className="flex items-center gap-1"><span>{getIcon(services.tradier)}</span> Tradier {services.tradier?.working ? '✓' : services.tradier?.configured ? '✗' : '⚫'}</div>
        <div className="flex items-center gap-1"><span>{getIcon(services.polygon)}</span> Polygon {services.polygon?.working ? '✓' : services.polygon?.configured ? '✗' : '⚫'}</div>
        <div className="flex items-center gap-1"><span>{getIcon(services.alphaVantage)}</span> Alpha Vantage {services.alphaVantage?.working ? '✓' : services.alphaVantage?.configured ? '✗' : '⚫'}</div>
        <div className="flex items-center gap-1"><span>{getIcon(services.postgresql)}</span> PostgreSQL {services.postgresql?.working ? '✓' : services.postgresql?.configured ? '✗' : '⚫'}</div>
        <div className="flex items-center gap-1"><span>{getIcon(services.webpush)}</span> Web Push {services.webpush?.working ? '✓' : services.webpush?.configured ? '✗' : '⚫'}</div>
        <div className="col-span-2 flex items-center gap-1">⏲️ Scheduler: {services.scheduler?.running ? '🟢 Activo' : '🔴 Inactivo'}</div>
      </div>
      {services.gemini?.message && <div className="text-red-500 mt-1 text-xs">⚠️ Gemini: {services.gemini.message}</div>}
      {services.tradier?.message && <div className="text-red-500 mt-1 text-xs">⚠️ Tradier: {services.tradier.message}</div>}
    </div>
  );
}