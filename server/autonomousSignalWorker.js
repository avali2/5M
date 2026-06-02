/**
 * Autonomous Signal Worker — Background scanner con notificaciones push reales.
 * Conectado al ScanScheduler y GuardianScheduler existentes en server/index.js.
 * 
 * Intervalos:
 * - Market pulse: 60s (solo durante mercado abierto)
 * - Scanner general: 120s (2 min)
 * - News/macro: 15 min
 * - Gemini: solo cuando hay candidato serio o cambio de riesgo (max 1 cada 5 min)
 * - 0DTE: 60s solo si activo
 * - Posiciones abiertas: 120s
 */

let workerStarted = false;
let scheduler = null;
let guardianScheduler = null;
let pushService = null;
let repository = null;

let lastGeneralScan = 0;
let lastNewsScan = 0;
let lastGeminiBrief = 0;
let lastPositionCheck = 0;
let lastOpenPositionsAlert = null;
let consecutiveErrors = 0;

export function startAutonomousSignalWorker(deps = {}) {
  if (workerStarted) return;
  scheduler = deps.scheduler || null;
  guardianScheduler = deps.guardianScheduler || null;
  pushService = deps.pushService || null;
  repository = deps.repository || null;
  
  workerStarted = true;
  globalThis.workerStarted = true;
  console.log('VALIDO 1M Autonomous Signal Worker started');
  
  setInterval(async () => {
    try { 
      await autonomousCycle(); 
      consecutiveErrors = 0;
    } catch (error) { 
      consecutiveErrors++;
      if (consecutiveErrors <= 3) {
        console.error('Autonomous worker error:', error.message);
      }
    }
  }, 60_000);
  
  // Initial cycle immediately
  setTimeout(() => autonomousCycle().catch(() => {}), 5000);
}

async function autonomousCycle() {
  const now = Date.now();
  const session = getMarketSessionET();
  
  // Durante mercado cerrado, solo revisar noticias/macro cada 15 min
  if (session.phase === 'CLOSED' || session.phase === 'AFTER_CLOSE') {
    if (now - lastNewsScan > 15 * 60_000) {
      lastNewsScan = now;
      await checkForCriticalNews();
    }
    return;
  }

  // Market pulse scan (60s)
  // --- El ScanScheduler ya maneja esto internamente. Solo notificamos si hay cambios.

  // Full scanner (120s o más rápido en power hour / gamma window)
  const scanInterval = getScanInterval(session);
  if (now - lastGeneralScan > scanInterval) {
    lastGeneralScan = now;
    await scanAndNotify();
  }

  // News/macro refresh (15 min)
  if (now - lastNewsScan > 15 * 60_000) {
    lastNewsScan = now;
    await checkForCriticalNews();
  }

  // Gemini refresh (solo cada 5 min y si hay candidatos)
  if (now - lastGeminiBrief > 5 * 60_000) {
    lastGeminiBrief = now;
    await refreshGeminiIfNeeded();
  }

  // Position monitoring (120s)
  if (now - lastPositionCheck > 120_000) {
    lastPositionCheck = now;
    await monitorOpenPositions();
  }
}

function getScanInterval(session) {
  if (session.phase === 'FINAL_GAMMA_WINDOW') return 30_000;
  if (session.phase === 'POWER_HOUR') return 60_000;
  if (session.phase === 'OPENING_NOISE') return 90_000;
  return 120_000;
}

function getMarketSessionET() {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return { phase: 'CLOSED', label: 'Weekend' };
  
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  const t = hour * 60 + minute;
  
  if (t < 4 * 60 || t >= 20 * 60) return { phase: 'CLOSED', label: 'Market closed' };
  if (t < 9 * 60 + 30) return { phase: 'PREMARKET', label: 'Pre-market' };
  if (t < 9 * 60 + 45) return { phase: 'OPENING_NOISE', label: 'Opening noise' };
  if (t < 11 * 60 + 15) return { phase: 'MORNING_PRIME', label: 'Morning prime' };
  if (t < 13 * 60 + 45) return { phase: 'MIDDAY', label: 'Midday' };
  if (t < 15 * 60) return { phase: 'AFTERNOON_PRIME', label: 'Afternoon prime' };
  if (t < 15 * 60 + 30) return { phase: 'POWER_HOUR', label: 'Power hour' };
  if (t < 16 * 60) return { phase: 'FINAL_GAMMA_WINDOW', label: 'Final gamma window' };
  return { phase: 'AFTER_CLOSE', label: 'After close' };
}

async function scanAndNotify() {
  if (!scheduler) return;
  try {
    const scan = await scheduler.run(true);
    if (!scan) return;
    
    // Check for actionable signals
    const opportunities = scan.opportunities || [];
    const actionableTickets = scan.guardianEdge?.actionableTickets || [];
    
    // Notify on new high-confidence signals
    if (opportunities.length > 0 && pushService) {
      const best = opportunities[0];
      const id = `${best.symbol}-${best.strategy}-${best.expiration}`;
      
      // Evitar spam: solo notificar si es una señal nueva
      if (id !== lastOpenPositionsAlert) {
        lastOpenPositionsAlert = id;
        try {
          await pushService.send({
            title: `✅ Señal: ${best.symbol} ${best.strategy}`,
            body: `Confianza ${best.confidenceScore}/100 | Riesgo max $${best.maxRisk} | POP ${best.pop?.toFixed(0) ?? 'N/D'}%`,
            tag: `signal-${id}`,
            url: '/archivo',
            requireInteraction: true
          });
        } catch (pushError) {
          console.error('Push notification failed:', pushError.message);
        }
      }
    }
    
    // Notify on critical risk changes
    if (scan.decision?.status === 'no_trade' && scan.decision?.reasons?.length) {
      const reasons = scan.decision.reasons;
      const criticalReasons = reasons.filter(r => 
        /kill switch|perdida|bloqueo|critico/i.test(r)
      );
      if (criticalReasons.length > 0 && pushService && criticalReasons.join() !== lastOpenPositionsAlert) {
        lastOpenPositionsAlert = criticalReasons.join();
        try {
          await pushService.send({
            title: '🚨 Riesgo Crítico Detectado',
            body: criticalReasons[0],
            tag: `risk-${Date.now()}`,
            url: '/archivo',
            requireInteraction: true
          });
        } catch (pushError) {
          console.error('Push notification failed:', pushError.message);
        }
      }
    }
  } catch (error) {
    console.error('scanAndNotify error:', error.message);
  }
}

async function checkForCriticalNews() {
  if (!scheduler) return;
  try {
    const scan = await scheduler.snapshot();
    if (!scan?.macro) return;
    
    const criticalEvents = (scan.macro.highImpactEvents || []).filter(e =>
      /fed|fomc|powell|cpi|nfp|pce|rate|war|geopolit|sanction|bank/i.test(e.title || '')
    );
    const criticalNews = (scan.macro.breakingRisk || []).filter(n =>
      n.blocksSignal || /critic|urgent|war|sanction/i.test(n.headline || '')
    );
    
    if ((criticalEvents.length > 0 || criticalNews.length > 0) && pushService) {
      const id = criticalEvents[0]?.title || criticalNews[0]?.headline || 'critical-news';
      if (id !== lastOpenPositionsAlert) {
        lastOpenPositionsAlert = id;
        try {
          await pushService.send({
            title: '📰 Noticia Crítica: ' + (criticalEvents[0]?.title || criticalNews[0]?.headline || 'Evento macro'),
            body: 'Revisa el escáner antes de abrir nuevas posiciones.',
            tag: `news-${Date.now()}`,
            url: '/archivo',
            requireInteraction: true
          });
        } catch (pushError) {
          console.error('News push failed:', pushError.message);
        }
      }
    }
  } catch (error) {
    console.error('checkForCriticalNews error:', error.message);
  }
}

async function refreshGeminiIfNeeded() {
  if (!scheduler) return;
  try {
    const scan = await scheduler.snapshot();
    const opportunities = scan?.opportunities || [];
    const guardianEdge = scan?.guardianEdge;
    const hasCandidate = opportunities.length > 0 || 
      (guardianEdge?.actionableTickets?.length > 0) ||
      (guardianEdge?.candidateTickets?.length > 0);
    
    // Solo llamar Gemini si hay candidatos serios
    if (!hasCandidate) {
      return;
    }
    
    // Gemini se llama desde el frontend o desde guardianScheduler
    // Este worker solo verifica que haya candidatos disponibles
    console.log('VALIDO 1M: Candidatos detectados para revisión Gemini. Señales:', opportunities.length, 'Tickets:', guardianEdge?.actionableTickets?.length || 0);
  } catch (error) {
    console.error('refreshGeminiBrief error:', error.message);
  }
}

async function monitorOpenPositions() {
  if (!scheduler || !repository) return;
  try {
    // Verificar posiciones registradas en el journal con estado "EJECUTADA"
    const journalEntries = repository.listJournal ? await repository.listJournal() : [];
    const openPositions = (journalEntries || []).filter(e => 
      e.outcome === 'EJECUTADA' || e.outcome === 'OBSERVADA'
    );
    
    if (openPositions.length === 0) return;
    
    const scan = await scheduler.snapshot();
    if (!scan?.market?.quotes) return;
    
    for (const position of openPositions) {
      const quote = scan.market.quotes.find(q => q.symbol === position.symbol);
      if (!quote) continue;
      
      // Verificar si la posición está cerca del stop loss
      const plannedExit = position.plannedExit || '';
      const stopMatch = plannedExit.match(/(\d+\.?\d*)/);
      const stopPrice = stopMatch ? parseFloat(stopMatch[1]) : null;
      
      if (stopPrice && quote.price <= stopPrice * 1.05) {
        // Near stop — notify
        const id = `position-warning-${position.symbol}-${position.id || Date.now()}`;
        if (pushService && id !== lastOpenPositionsAlert) {
          lastOpenPositionsAlert = id;
          try {
            await pushService.send({
              title: `⚠️ ${position.symbol} cerca de stop loss`,
              body: `Precio actual: $${quote.price.toFixed(2)} | Stop: $${stopPrice.toFixed(2)} | ${position.strategy || ''}`,
              tag: id,
              url: '/archivo',
              requireInteraction: true
            });
          } catch (pushError) {
            console.error('Position monitor push failed:', pushError.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('monitorOpenPositions error:', error.message);
  }
}

export { getMarketSessionET };
