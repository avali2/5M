import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInstitutionalScan } from "./institutional-engine.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "VALIDO 1M Institutional Engine",
    time: new Date().toISOString()
  });
});

app.post("/api/guardian/scan", async (req, res) => {
  try {
    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : undefined;
    const settings = req.body?.settings || {};
    const data = await runInstitutionalScan({ symbols, settings });
    res.json(data);
  } catch (error) {
    res.status(500).json({
      status: "NO_TRADE",
      error: error.message,
      time: new Date().toISOString()
    });
  }
});

app.get("/api/guardian/scan", async (req, res) => {
  try {
    const symbols = typeof req.query.symbols === "string"
      ? req.query.symbols.split(",").map(s => s.trim()).filter(Boolean)
      : undefined;
    const data = await runInstitutionalScan({ symbols });
    res.json(data);
  } catch (error) {
    res.status(500).json({
      status: "NO_TRADE",
      error: error.message,
      time: new Date().toISOString()
    });
  }
});

const publicDir = path.resolve(__dirname, "../dist");
app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`VALIDO 1M server running on port ${PORT}`);
});