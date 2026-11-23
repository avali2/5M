/**
 * 5M · Kill switch global: detiene bots de opciones y crypto.
 * Persistido en disco para sobrevivir reinicios.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

function filePath() { return path.join(config.dataDir, 'kill-switch.json'); }

export function isKillActive() {
  try { return Boolean(JSON.parse(fs.readFileSync(filePath(), 'utf8')).active); }
  catch { return false; }
}

export function setKillActive(active, reason = 'manual') {
  const state = { active: Boolean(active), reason, at: new Date().toISOString() };
  try {
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(filePath(), JSON.stringify(state, null, 1), { mode: 0o600 });
  } catch { /* sin disco */ }
  return state;
}

export function killSwitchStatus() {
  try { return JSON.parse(fs.readFileSync(filePath(), 'utf8')); }
  catch { return { active: false, reason: null, at: null }; }
}
