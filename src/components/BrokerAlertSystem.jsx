import React, { useEffect, useState, useRef } from 'react';
import { Bell, BellRing, Plus, Trash2, Volume2, CheckCircle2, AlertTriangle, X, ShieldAlert, Sparkles, Filter, Play } from 'lucide-react';

const LOCAL_ALERTS_KEY = 'valido_broker_custom_alerts_v1';
const LOCAL_ALERT_HISTORY_KEY = 'valido_broker_alert_history_v1';

// Web Audio API Sound Generator for Institutional Broker Chime
function playBrokerChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    osc2.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.05); // D6

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.42);
    osc2.stop(ctx.currentTime + 0.42);
  } catch (err) {
    console.warn('Audio chime warning:', err);
  }
}

export default function BrokerAlertSystem({ signals = [], scan = null, onOpenSignal = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [customAlerts, setCustomAlerts] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCAL_ALERTS_KEY);
      return saved ? JSON.parse(saved) : [
        { id: 'def-1', symbol: 'SPY', metric: 'READY_SIGNAL', condition: 'EQUALS', value: 'READY', note: 'Avisar cuando haya entrada verde en SPY', active: true },
        { id: 'def-2', symbol: 'VIX', metric: 'IV', condition: 'GREATER_THAN', value: '25', note: 'Alerta de pico de volatilidad VIX > 25', active: true },
        { id: 'def-3', symbol: 'QQQ', metric: 'PRICE', condition: 'LESS_THAN', value: '450', note: 'Nivel clave de soporte en QQQ $450', active: true }
      ];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCAL_ALERT_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [
        { id: 'hist-1', timestamp: new Date(Date.now() - 15 * 60000).toISOString(), title: '🟢 Señal READY Detectada', symbol: 'SPY', body: 'Bull Put Spread 540/535 disponible con 86% POP', type: 'READY' }
      ];
    } catch {
      return [];
    }
  });

  const [toasts, setToasts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(1);
  const [newSymbol, setNewSymbol] = useState('SPY');
  const [newMetric, setNewMetric] = useState('PRICE');
  const [newCondition, setNewCondition] = useState('GREATER_THAN');
  const [newValue, setNewValue] = useState('560');
  const [newNote, setNewNote] = useState('');
  const seenSignalIdsRef = useRef(new Set());

  // Save alerts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(customAlerts));
    } catch (e) {
      console.error('Error saving custom alerts:', e);
    }
  }, [customAlerts]);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_ALERT_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      console.error('Error saving alert history:', e);
    }
  }, [history]);

  // Helper to trigger a live toast + audio
  const triggerAlertToast = (alertItem) => {
    playBrokerChime();
    
    // Browser notification if allowed
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(`V Broker Alerta: ${alertItem.symbol}`, {
          body: alertItem.body || alertItem.title,
          icon: '/icons/valido-v-192.png'
        });
      } catch (e) {
        console.warn('Browser notification error:', e);
      }
    }

    const toastObj = {
      id: `toast-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      ...alertItem
    };

    setToasts((prev) => [toastObj, ...prev.slice(0, 4)]);
    setHistory((prev) => [toastObj, ...prev.slice(0, 49)]);
    setUnreadCount((prev) => prev + 1);
  };

  // Automatically check incoming signals for READY status
  useEffect(() => {
    if (!signals || !signals.length) return;

    signals.forEach((sig) => {
      if ((sig.status === 'READY' || sig.status === '0DTE_SCALP') && !seenSignalIdsRef.current.has(sig.id)) {
        seenSignalIdsRef.current.add(sig.id);
        
        triggerAlertToast({
          title: `⚡ Oportunidad Verde: ${sig.symbol}`,
          symbol: sig.symbol,
          body: `${sig.strategyLabel || sig.strategy}: POP ${sig.pop ? Math.round(sig.pop * 100) : '80'}% | Max Profit $${sig.maxProfitUsd || '150'}`,
          type: 'READY',
          signal: sig
        });
      }
    });
  }, [signals]);

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleAddCustomAlert = (e) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;

    const newRule = {
      id: `alert-${Date.now()}`,
      symbol: newSymbol.toUpperCase().trim(),
      metric: newMetric,
      condition: newCondition,
      value: newValue,
      note: newNote || `Alerta de broker para ${newSymbol.toUpperCase()}`,
      active: true
    };

    setCustomAlerts((prev) => [newRule, ...prev]);
    setNewNote('');
    
    // Feedback toast
    triggerAlertToast({
      title: '🛡️ Regla de Alerta Creada',
      symbol: newRule.symbol,
      body: `Regla activa: ${newRule.metric} ${newRule.condition === 'GREATER_THAN' ? '>' : '<'} ${newRule.value}`,
      type: 'INFO'
    });
  };

  const handleDeleteAlert = (id) => {
    setCustomAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const toggleAlertActive = (id) => {
    setCustomAlerts((prev) => prev.map((a) => a.id === id ? { ...a, active: !a.active } : a));
  };

  const clearHistory = () => {
    setHistory([]);
    setUnreadCount(0);
  };

  const simulateTestAlert = () => {
    triggerAlertToast({
      title: '🛎️ Alerta de Broker Personal (Prueba)',
      symbol: 'NVDA',
      body: 'Breakout detectado en $125.00 con IV % en 68%. Gemini sugiere Put Spread OTM.',
      type: 'TEST'
    });
  };

  return (
    <>
      {/* Floating Header / Corner Bell Button */}
      <div className="relative inline-block">
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setUnreadCount(0);
          }}
          className="relative flex items-center gap-2 bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-slate-200 border border-indigo-500/40 px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95"
          title="Centro de Alertas de Broker"
        >
          {unreadCount > 0 ? (
            <BellRing className="w-4 h-4 text-amber-400 animate-bounce" />
          ) : (
            <Bell className="w-4 h-4 text-indigo-400" />
          )}
          <span className="hidden sm:inline">Alertas Broker</span>
          {unreadCount > 0 && (
            <span className="bg-amber-500 text-slate-950 font-black text-[10px] rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Floating Live Toasts Banner Array */}
      <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-slate-900/95 border-2 border-indigo-500/60 text-white rounded-2xl p-3.5 shadow-2xl backdrop-blur-md flex items-start gap-3 animate-in slide-in-from-right duration-300"
          >
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
              {toast.type === 'READY' ? (
                <Sparkles className="w-5 h-5 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              )}
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-indigo-200">{toast.title}</span>
                <span className="text-[10px] font-mono text-slate-400">
                  {new Date(toast.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-snug">{toast.body}</p>

              {toast.signal && onOpenSignal && (
                <button
                  onClick={() => {
                    onOpenSignal(toast.signal);
                    dismissToast(toast.id);
                  }}
                  className="mt-1 text-[11px] font-black text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Play className="w-3 h-3" /> Ver Ticket en Señales
                </button>
              )}
            </div>

            <button
              onClick={() => dismissToast(toast.id)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Full Modal Drawer for Active Alerts & History */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/30 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 border-b border-indigo-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300">
                  <BellRing className="w-6 h-6 text-indigo-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Centro de Alertas de Broker</h3>
                  <p className="text-xs text-slate-400">Notificaciones en tiempo real, reglas de precio y avisos de señales</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={simulateTestAlert}
                  className="bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/50 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition"
                >
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" /> Probar Sonido
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-6 flex-1 text-slate-200">
              
              {/* Form to Create Custom Alert */}
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-black uppercase text-indigo-300 tracking-wider flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" /> Crear Nueva Alerta de Broker
                </h4>

                <form onSubmit={handleAddCustomAlert} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">Símbolo</label>
                    <input
                      type="text"
                      value={newSymbol}
                      onChange={(e) => setNewSymbol(e.target.value)}
                      placeholder="SPY, NVDA"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white uppercase focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">Métrica</label>
                    <select
                      value={newMetric}
                      onChange={(e) => setNewMetric(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="PRICE">Precio de Acción ($)</option>
                      <option value="IV">Volatilidad Implícita IV (%)</option>
                      <option value="DELTA">Delta de Posición</option>
                      <option value="PNL">P&L $ USD</option>
                      <option value="READY_SIGNAL">Estado de Señal READY</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">Condición</label>
                    <select
                      value={newCondition}
                      onChange={(e) => setNewCondition(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="GREATER_THAN">Mayor que (&gt;)</option>
                      <option value="LESS_THAN">Menor que (&lt;)</option>
                      <option value="EQUALS">Igual a (=)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">Valor Objetivo</label>
                    <input
                      type="text"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="550, 25"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Nota opcional: Soporte clave, romper resistencia, etc."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs px-4 py-2 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Plus className="w-4 h-4" /> Activar Alerta
                  </button>
                </form>
              </div>

              {/* Active Custom Rules */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider">
                    Reglas Activas ({customAlerts.length})
                  </h4>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {customAlerts.map((rule) => (
                    <div
                      key={rule.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition ${
                        rule.active
                          ? 'bg-slate-800/80 border-indigo-500/30'
                          : 'bg-slate-900/50 border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleAlertActive(rule.id)}
                          className={`w-8 h-5 rounded-full flex items-center p-0.5 transition ${
                            rule.active ? 'bg-indigo-600 justify-end' : 'bg-slate-700 justify-start'
                          }`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-sm"></span>
                        </button>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-white">{rule.symbol}</span>
                            <span className="bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded-md text-[10px] font-bold border border-indigo-700/40">
                              {rule.metric} {rule.condition === 'GREATER_THAN' ? '>' : rule.condition === 'LESS_THAN' ? '<' : '='} {rule.value}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{rule.note}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteAlert(rule.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded-lg hover:bg-slate-800 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trigger History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider">
                    Historial de Disparos Recientes ({history.length})
                  </h4>
                  {history.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="text-[11px] font-bold text-slate-400 hover:text-rose-400 underline"
                    >
                      Limpiar Historial
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {history.map((hist) => (
                    <div
                      key={hist.id}
                      className="bg-slate-800/40 border border-slate-800 p-3 rounded-2xl flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-300">{hist.title}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(hist.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-300">{hist.body}</p>
                      </div>
                    </div>
                  ))}

                  {history.length === 0 && (
                    <p className="text-xs text-slate-500 italic text-center py-4">No hay historial de alertas registrado.</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
