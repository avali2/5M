import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInstitutionalScan } from "./institutional-engine.mjs";
import { getCurrentSession } from "./lib/marketSessionClock.js";
import { startAutonomousWorker, stopAutonomousWorker, getWorkerStatus } from "./scheduler/autonomousWorker.js";
import { addPosition, closePosition, getOpenPositions, getAllPositions, getPositionById } from "./db/positionsRepository.js";
import { getEarningsRisk } from "./lib/earningsCalendar.js";
import geminiAssistantRouter from './geminiAssistant.js';
import { getSystemStatus } from './status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/status", async (_req, res) => {
  try {
    const status = await getSystemStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "VALIDO 1M Institutional Engine",
    time: new Date().toISOString(),
    worker: getWorkerStatus(),
    session: getCurrentSession()
  });
});

app.post("/api/guardian/scan", async (req, res) => {
  try {
    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : undefined;
    const settings = req.body?.settings || {};
    const data = await runInstitutionalScan({ symbols, settings });
    res.json(data);
  } catch (error) {
    res.status(500).json({ status: "NO_TRADE", error: error.message, time: new Date().toISOString() });
  }
});

app.get("/api/guardian/scan", async (req, res) => {
  try {
    const symbols = typeof req.query.symbols === "string" ? req.query.symbols.split(",").map(s => s.trim()).filter(Boolean) : undefined;
    const data = await runInstitutionalScan({ symbols });
    res.json(data);
  } catch (error) {
    res.status(500).json({ status: "NO_TRADE", error: error.message, time: new Date().toISOString() });
  }
});

app.post("/api/guardian/scan/auto", async (_req, res) => {
  try {
    const data = await runInstitutionalScan({ settings: { maxSignalsPerScan: 5 } });
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/scheduler/status", (_req, res) => {
  res.json({ ok: true, worker: getWorkerStatus(), session: getCurrentSession() });
});

app.post("/api/scheduler/start", (_req, res) => {
  startAutonomousWorker();
  res.json({ ok: true, worker: getWorkerStatus() });
});

app.post("/api/scheduler/stop", (_req, res) => {
  stopAutonomousWorker();
  res.json({ ok: true, worker: getWorkerStatus() });
});

app.post("/api/positions/add", (req, res) => {
  try {
    const position = addPosition(req.body);
    res.json({ ok: true, position });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/positions/:id/close", (req, res) => {
  const position = closePosition(req.params.id, req.body);
  if (!position) return res.status(404).json({ ok: false, error: "Posición no encontrada." });
  res.json({ ok: true, position });
});

app.get("/api/positions", (_req, res) => {
  res.json({ ok: true, positions: getOpenPositions(), all: getAllPositions() });
});

app.get("/api/positions/:id", (req, res) => {
  const position = getPositionById(req.params.id);
  if (!position) return res.status(404).json({ ok: false, error: "No encontrada." });
  res.json({ ok: true, position });
});

app.get("/api/earnings/:symbol", (req, res) => {
  res.json({ ok: true, symbol: req.params.symbol.toUpperCase(), ...getEarningsRisk(req.params.symbol) });
});

const publicDir = path.resolve(__dirname, "../dist");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () => {
  console.log(`VALIDO 1M server running on port ${PORT}. Scheduler: ${process.env.SCHEDULER_ENABLED !== 'false' ? 'ON' : 'OFF'}`);
  if (process.env.SCHEDULER_ENABLED !== 'false') startAutonomousWorker();
});

app.use('/api/gemini', geminiAssistantRouter);
