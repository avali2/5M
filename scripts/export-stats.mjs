import fs from 'node:fs';
const RENDER = process.env.RK;
const ID = 'srv-dbkeeq0m7kps738k7ee0';
const base = 'https://five-millions-5m-free.onrender.com';
async function rj(url, options = {}) {
  for (let i = 0; i < 7; i += 1) {
    try { const res = await fetch(url, { ...options, signal: AbortSignal.timeout(120000) }); const text = await res.text(); try { return JSON.parse(text); } catch { await new Promise((r) => setTimeout(r, 8000)); } }
    catch { await new Promise((r) => setTimeout(r, 8000)); }
  }
  return null;
}
const k = await rj('https://api.render.com/v1/services/' + ID + '/env-vars/APP_ACCESS_KEY', { headers: { Authorization: 'Bearer ' + RENDER } });
const key = k?.value ?? k?.envVar?.value;
const h = { 'X-5M-Key': key };
const outDir = 'exports';
fs.mkdirSync(outDir, { recursive: true });
function csv(rows, header) { if (!rows.length) return header.join(',') + '\n'; return [header.join(','), ...rows.map((row) => header.map((field) => { const v = row[field] ?? ''; return '"' + String(v).replaceAll('"', '""') + '"'; }).join(','))].join('\n'); }

const cryptoRows = [];
for (const book of ['pepe', 'near', 'inj']) {
  const s = await rj(base + '/api/crypto/paper?book=' + book, { headers: h });
  for (const trade of (s?.history || [])) cryptoRows.push({ book, symbol: trade.symbol, side: trade.side, entry: trade.entry, exit: trade.exit, pnlUsd: trade.realizedUsd, pips: trade.pips, reason: trade.closeReason, openedAt: trade.openedAt, closedAt: trade.closedAt });
}
fs.writeFileSync(outDir + '/crypto-trades.csv', csv(cryptoRows, ['book', 'symbol', 'side', 'entry', 'exit', 'pnlUsd', 'pips', 'reason', 'openedAt', 'closedAt']));

const forex = await rj(base + '/api/forex/paper', { headers: h });
fs.writeFileSync(outDir + '/forex-trades.csv', csv((forex?.history || []).map((t) => ({ symbol: t.symbol, side: t.side, entry: t.entry, exit: t.exit, pnlUsd: t.realizedUsd, pips: t.pips, reason: t.closeReason, openedAt: t.openedAt, closedAt: t.closedAt })), ['symbol', 'side', 'entry', 'exit', 'pnlUsd', 'pips', 'reason', 'openedAt', 'closedAt']));

const paper = await rj(base + '/api/bots/paper', { headers: h });
fs.writeFileSync(outDir + '/options-trades.csv', csv((paper?.history || []).map((t) => ({ strategy: t.strategy, symbol: t.symbol, credit: t.credit, contracts: t.contracts, riskUsd: t.riskUsd, pnlUsd: t.realizedUsd, capturePct: t.premiumCapturePct, maePct: t.maePctOfCredit, reason: t.closeReason, openedAt: t.openedAt, closedAt: t.closedAt })), ['strategy', 'symbol', 'credit', 'contracts', 'riskUsd', 'pnlUsd', 'capturePct', 'maePct', 'reason', 'openedAt', 'closedAt']));

const telemetry = await rj(base + '/api/telemetry?limit=500', { headers: h });
fs.writeFileSync(outDir + '/telemetry-events.csv', csv((telemetry?.events || []).map((e) => ({ at: e.at, module: e.module, level: e.level, type: e.type, message: e.message })), ['at', 'module', 'level', 'type', 'message']));

const stats = await rj(base + '/api/telemetry/stats', { headers: h });
const summary = [];
for (const [mode, bot] of Object.entries(stats?.bots || {})) summary.push({ module: 'options:' + mode, trades: bot.trades, winRate: bot.winRate, pnlUsd: bot.totalPnlUsd, expectancy: bot.expectancyUsd });
if (stats?.crypto) summary.push({ module: 'crypto:pepe', trades: stats.crypto.trades, winRate: stats.crypto.winRate, pnlUsd: stats.crypto.totalPnlUsd, expectancy: stats.crypto.expectancyUsd });
if (stats?.forex) summary.push({ module: 'forex', trades: stats.forex.trades, winRate: stats.forex.winRate, pnlUsd: stats.forex.totalPnlUsd, expectancy: stats.forex.expectancyUsd });
fs.writeFileSync(outDir + '/summary.csv', csv(summary, ['module', 'trades', 'winRate', 'pnlUsd', 'expectancy']));
fs.mkdirSync('/sdcard/Download/DSH-Go/5M-stats', { recursive: true });
for (const file of fs.readdirSync(outDir)) fs.copyFileSync(outDir + '/' + file, '/sdcard/Download/DSH-Go/5M-stats/' + file);
console.log('archivos:', fs.readdirSync(outDir).join(', '));
console.log('resumen:', JSON.stringify(summary));
