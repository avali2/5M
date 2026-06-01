import { runInstitutionalScan } from '../institutional-engine.mjs';
import { getCacheKey, getCached, setCached } from '../lib/geminiCache.js';
import { getCurrentSession } from '../lib/marketSessionClock.js';
import { getEarningsRisk } from '../lib/earningsCalendar.js';

let workerStarted = false;
let intervalId = null;
let scanCount = 0;

export function startAutonomousWorker({ onSignal = null, pushService = null } = {}) {
  if (workerStarted) return;
  workerStarted = true;
  console.log('VALIDO 1M Autonomous Scheduler started (3min interval)');

  const run = async () => {
    const session = getCurrentSession();
    if (session === 'closed' || session === 'weekend') return;

    try {
      scanCount++;
      const result = await runInstitutionalScan({
        settings: {
          accountSize: Number(process.env.ACCOUNT_SIZE || 2500),
          maxRiskPct: Number(process.env.MAX_RISK_PCT || 0.02),
          maxSignalsPerScan: 5
        }
      });

      const readyTickets = (result.results || []).flatMap(r => r.tickets || [])
        .filter(t => t.classification === 'ENTRAR_AHORA');

      for (const ticket of readyTickets) {
        const cacheKey = getCacheKey(ticket.symbol, ticket.strategy);
        const cached = getCached(cacheKey);
        if (cached) continue;

        setCached(cacheKey, true);

        if (pushService) {
          try {
            const { sendPushToAll } = await import('../pushRoutes.js');
            await sendPushToAll({
              title: `✅ ${ticket.symbol} ${ticket.strategy}`,
              body: `Score ${ticket.score} | POP ${ticket.pop}% | Max risk $${ticket.maxRisk}`,
              tag: `signal-${ticket.id}`,
              url: '/archivo',
              requireInteraction: true
            });
          } catch (e) { console.error('Push failed:', e.message); }
        }

        if (onSignal) onSignal(ticket);
      }

      if (scanCount % 5 === 0) {
        console.log(`VALIDO 1M Scan #${scanCount}: ${readyTickets.length} ready tickets`);
      }
    } catch (error) {
      console.error('Autonomous scan error:', error.message);
    }
  };

  run();
  intervalId = setInterval(run, 3 * 60 * 1000);
}

export function stopAutonomousWorker() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  workerStarted = false;
}

export function getWorkerStatus() {
  return { started: workerStarted, scanCount, session: getCurrentSession() };
}