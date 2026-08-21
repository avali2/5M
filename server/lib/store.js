import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const filePath = path.join(config.dataDir, 'store.json');
let state = { subscriptions: [], notifiedSignalIds: [], recentScans: [] };
let loaded = false;
let writeQueue = Promise.resolve();

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    state = {
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
      notifiedSignalIds: Array.isArray(parsed.notifiedSignalIds) ? parsed.notifiedSignalIds : [],
      recentScans: Array.isArray(parsed.recentScans) ? parsed.recentScans : []
    };
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`[5M] No se pudo leer el almacén local: ${error.message}`);
  }
}

function persist() {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
  }).catch((error) => console.warn(`[5M] No se pudo persistir el almacén: ${error.message}`));
  return writeQueue;
}

export async function addSubscription(subscription) {
  await ensureLoaded();
  const endpoint = String(subscription?.endpoint || '');
  if (!endpoint) throw new Error('Suscripción push inválida: falta endpoint.');
  state.subscriptions = state.subscriptions.filter((item) => item.endpoint !== endpoint);
  state.subscriptions.push(subscription);
  state.subscriptions = state.subscriptions.slice(-20);
  await persist();
  return state.subscriptions.length;
}

export async function removeSubscription(endpoint) {
  await ensureLoaded();
  state.subscriptions = state.subscriptions.filter((item) => item.endpoint !== endpoint);
  await persist();
}

export async function getSubscriptions() {
  await ensureLoaded();
  return [...state.subscriptions];
}

export async function markSignalNotified(signalId) {
  await ensureLoaded();
  state.notifiedSignalIds = [...new Set([...state.notifiedSignalIds, signalId])].slice(-200);
  await persist();
}

export async function wasSignalNotified(signalId) {
  await ensureLoaded();
  return state.notifiedSignalIds.includes(signalId);
}

export async function saveScan(scan) {
  await ensureLoaded();
  state.recentScans = [
    { id: scan.id, generatedAt: scan.generatedAt, summary: scan.summary, readyIds: scan.signals.filter((signal) => signal.status === 'READY').map((signal) => signal.id) },
    ...state.recentScans
  ].slice(0, 20);
  await persist();
}

export async function getStoreStatus() {
  await ensureLoaded();
  return { subscriptions: state.subscriptions.length, recentScans: state.recentScans.length };
}
