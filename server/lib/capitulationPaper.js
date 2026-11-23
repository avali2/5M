/**
 * 5M · Seguimiento paper de alertas de capitulación.
 * Abre cada alerta, marca el spread con la cadena actual y cierra por TP/stop/tiempo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getSnapshot, optionChainFor, dteFor } from './marketData.js';
import { TradierClient } from './tradier.js';

const filePath = () => path.join(config.dataDir, 'capitulation-paper.json');

export function load() {
  try { return JSON.parse(fs.readFileSync(filePath(), 'utf8')); }
  catch { return { open: [], closed: [], lastUpdate: null }; }
}

function save(state) {
  try { fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 }); fs.writeFileSync(filePath(), JSON.stringify(state, null, 1), { mode: 0o600 }); } catch { /* sin disco */ }
  return state;
}

export function openCandidates(candidates) {
  const state = load();
  for (const candidate of candidates || []) {
    const key = candidate.symbol + ':' + candidate.expiration + ':' + candidate.shortStrike;
    if ((state.open || []).some((trade) => trade.key === key) || (state.closed || []).some((trade) => trade.key === key)) continue;
    state.open = [...(state.open || []), {
      key, symbol: candidate.symbol, expiration: candidate.expiration, dte: candidate.dte,
      shortStrike: candidate.shortStrike, longStrike: candidate.longStrike,
      credit: candidate.credit, maxLoss: candidate.maxLoss, contracts: 1,
      entryMark: candidate.credit, mae: candidate.credit, openedAt: new Date().toISOString()
    }];
  }
  return save(state);
}

export async function markAll() {
  const state = load();
  const tradier = config.tradier && config.tradier.token ? new TradierClient(config.tradier) : undefined;
  const stillOpen = [];
  for (const trade of state.open || []) {
    try {
      const snapshot = await getSnapshot(trade.symbol, { tradier });
      const spot = snapshot?.quote?.price;
      const chain = optionChainFor(snapshot, trade.expiration);
      const shortLeg = chain.find((option) => option.type === 'put' && Math.abs(option.strike - trade.shortStrike) < 0.001);
      const longLeg = chain.find((option) => option.type === 'put' && Math.abs(option.strike - trade.longStrike) < 0.001);
      if (!shortLeg || !longLeg) { stillOpen.push(trade); continue; }
      const mark = Math.max(0, Math.round((((shortLeg.bid + shortLeg.ask) / 2) - ((longLeg.bid + longLeg.ask) / 2)) * 100) / 100);
      const pnl = Math.round((trade.credit - mark) * 100 * trade.contracts * 100) / 100;
      const mae = Math.max(trade.mae || trade.credit, mark);
      const dte = dteFor(snapshot, trade.expiration);
      let reason = null;
      if (mark <= trade.credit * 0.5) reason = 'OBJETIVO';
      else if (Number.isFinite(spot) && spot <= trade.shortStrike) reason = 'STOP';
      else if (Number.isFinite(dte) && dte <= 21) reason = 'TIEMPO';
      if (reason) {
        state.closed = [...(state.closed || []), { ...trade, exitMark: mark, realizedUsd: pnl, closeReason: reason, closedAt: new Date().toISOString(), maeMark: mae }];
      } else stillOpen.push({ ...trade, lastMark: mark, pnlUsd: pnl, maeMark: mae, dte });
    } catch { stillOpen.push(trade); }
  }
  state.open = stillOpen;
  state.lastUpdate = new Date().toISOString();
  return save(state);
}

export function status() {
  const state = load();
  const closed = state.closed || [];
  const wins = closed.filter((trade) => trade.realizedUsd > 0).length;
  const total = closed.reduce((sum, trade) => sum + (trade.realizedUsd || 0), 0);
  return {
    lastUpdate: state.lastUpdate, open: state.open || [], closed: closed.slice(-20),
    stats: { trades: closed.length, wins, losses: closed.length - wins, winRate: closed.length ? Math.round((wins / closed.length) * 1000) / 10 : null, totalPnlUsd: Math.round(total * 100) / 100, openCount: (state.open || []).length }
  };
}