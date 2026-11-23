/**
 * 5M · Puente MT5: el terminal Windows (EA) hace polling a este servidor.
 * Estado en archivo persistente; comandos con id y ack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const STALE_MS = 30000;
const filePath = () => path.join(config.dataDir, 'mt5-bridge.json');

function load() {
  try { return JSON.parse(fs.readFileSync(filePath(), 'utf8')); }
  catch { return { state: null, commands: [], nextId: 1, connectedAt: null, lastHeartbeat: null }; }
}

function save(data) {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(filePath(), JSON.stringify(data, null, 1), { mode: 0o600 });
  } catch { /* sin disco */ }
  return data;
}

export function bridgeToken(env = process.env) { return String(env.MT5_BRIDGE_TOKEN || env.CRON_TOKEN || ''); }

export function authorized(supplied, env = process.env) {
  const token = bridgeToken(env);
  return Boolean(token) && String(supplied || '') === token;
}

export function parseStateText(text) {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const state = { account: null, positions: [], quotes: {} };
  for (const line of lines) {
    const parts = line.split('|');
    if (parts[0] === 'account') state.account = { broker: parts[1] || null, login: parts[2] || null, balance: Number(parts[3] || 0), equity: Number(parts[4] || 0), leverage: Number(parts[5] || 0), currency: parts[6] || 'USD' };
    else if (parts[0] === 'position') state.positions.push({ ticket: parts[1], symbol: parts[2], type: parts[3] === '1' ? 'SELL' : 'BUY', side: parts[3] === '1' ? 'SELL' : 'BUY', volume: Number(parts[4] || 0), price: Number(parts[5] || 0), sl: Number(parts[6] || 0), tp: Number(parts[7] || 0), profit: Number(parts[8] || 0) });
    else if (parts[0] === 'quote') state.quotes[parts[1]] = { bid: Number(parts[2] || 0), ask: Number(parts[3] || 0), at: new Date().toISOString() };
  }
  return state;
}

export function receiveState(text, now = new Date()) {
  const data = load();
  data.state = parseStateText(text);
  data.lastHeartbeat = now.toISOString();
  if (!data.connectedAt) data.connectedAt = data.lastHeartbeat;
  save(data);
  return status();
}

export function status() {
  const data = load();
  const last = data.lastHeartbeat ? Date.parse(data.lastHeartbeat) : 0;
  return {
    connected: Boolean(last) && Date.now() - last < STALE_MS,
    lastHeartbeat: data.lastHeartbeat,
    connectedAt: data.connectedAt,
    account: data.state?.account || null,
    positions: data.state?.positions || [],
    quotes: data.state?.quotes || {},
    pendingCommands: (data.commands || []).filter((command) => command.status === 'pending').length
  };
}

export function enqueueCommand(command) {
  const data = load();
  const entry = {
    id: data.nextId || 1,
    status: 'pending',
    createdAt: new Date().toISOString(),
    action: String(command.action || 'NOOP').toUpperCase(),
    symbol: String(command.symbol || '').toUpperCase(),
    side: String(command.side || '').toUpperCase(),
    volume: Number(command.volume || 0),
    sl: Number(command.sl || 0),
    tp: Number(command.tp || 0),
    comment: String(command.comment || '5M').slice(0, 24)
  };
  data.commands = [...(data.commands || []), entry].slice(-100);
  data.nextId = entry.id + 1;
  save(data);
  return entry;
}

export function takeCommands() {
  const data = load();
  const pending = (data.commands || []).filter((command) => command.status === 'pending');
  const lines = pending.map((command) => [command.id, command.action, command.symbol, command.side, command.volume, command.sl, command.tp, command.comment].join('|'));
  return { lines, commands: pending };
}

export function ackCommand(id, result = 'ok') {
  const data = load();
  const command = (data.commands || []).find((entry) => Number(entry.id) === Number(id));
  if (!command) return null;
  command.status = String(result).toLowerCase() === 'ok' ? 'done' : 'error';
  command.ackedAt = new Date().toISOString();
  command.result = String(result).slice(0, 200);
  save(data);
  return command;
}