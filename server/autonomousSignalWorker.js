let workerStarted = false;
let lastGeneralScan = 0;
let lastNewsScan = 0;
let lastGeminiBrief = 0;

export function startAutonomousSignalWorker() {
  if (workerStarted) return;
  workerStarted = true;
  console.log("VALIDO 1M Autonomous Signal Worker started");
  setInterval(async () => {
    try { await autonomousCycle(); }
    catch (error) { console.error("Autonomous worker error:", error); }
  }, 60_000);
}

async function autonomousCycle() {
  const now = Date.now();
  const session = getMarketSessionStateServer();
  if (session.phase === "CLOSED") return;

  if (now - lastNewsScan > 15 * 60_000) { lastNewsScan = now; await refreshNewsAndEvents(); }
  if (now - lastGeneralScan > getScanInterval(session)) {
    lastGeneralScan = now;
    const signal = await scanForBestSignal();
    if (signal?.notify) {
      const { sendPushToAll } = await import("./pushRoutes.js");
      await sendPushToAll({
        title: signal.title,
        body: signal.body,
        tag: signal.tag,
        url: "/signals",
        requireInteraction: signal.urgency === "HIGH"
      });
    }
  }
  if (now - lastGeminiBrief > 5 * 60_000) { lastGeminiBrief = now; await refreshGeminiBriefIfNeeded(); }
}

function getScanInterval(session) {
  if (session.phase === "FINAL_GAMMA_WINDOW") return 30_000;
  if (session.phase === "POWER_HOUR") return 60_000;
  return 120_000;
}

function getMarketSessionStateServer() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  const t = hour * 60 + minute;
  if (t < 8 * 60 + 30 || t >= 16 * 60 + 15) return { phase: "CLOSED" };
  if (t < 9 * 60 + 30) return { phase: "PREMARKET" };
  if (t < 9 * 60 + 45) return { phase: "OPENING_NOISE" };
  if (t < 11 * 60 + 15) return { phase: "MORNING_PRIME" };
  if (t < 13 * 60 + 45) return { phase: "MIDDAY" };
  if (t < 15 * 60) return { phase: "AFTERNOON_PRIME" };
  if (t < 15 * 60 + 30) return { phase: "POWER_HOUR" };
  if (t < 16 * 60) return { phase: "FINAL_GAMMA_WINDOW" };
  return { phase: "AFTER_CLOSE" };
}

async function refreshNewsAndEvents() {
  // TODO: conectar Finnhub/FMP/Benzinga/AlphaVantage si existen
}

async function scanForBestSignal() {
  // TODO: pipeline completo de señales
  return null;
}

async function refreshGeminiBriefIfNeeded() {
  // TODO: llamar Gemini solo si cambió market state, noticias críticas o candidatos
}