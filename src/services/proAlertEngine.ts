import type { ProfessionalSignal } from "../types/signal";
import { APP_CONFIG } from "../config/appConfig";
import { showSignalNotification } from "./notificationService";
import { shouldNotifySignal } from "../utils/signalFilters";

const ALERT_MEMORY_KEY = "valido_1m_alert_memory_v1";

interface AlertMemoryItem {
  signalId: string;
  symbol: string;
  status: string;
  timestamp: number;
}

function readAlertMemory(): AlertMemoryItem[] {
  try {
    const raw = localStorage.getItem(ALERT_MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAlertMemory(items: AlertMemoryItem[]): void {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const clean = items.filter((item) => item.timestamp >= oneDayAgo);
  localStorage.setItem(ALERT_MEMORY_KEY, JSON.stringify(clean));
}

function wasRecentlyAlerted(signal: ProfessionalSignal): boolean {
  const memory = readAlertMemory();
  const cooldownMs = APP_CONFIG.notifications.cooldownMinutesBySymbol * 60 * 1000;
  const now = Date.now();
  return memory.some((item) => {
    const sameSignal = item.signalId === signal.id;
    const sameSymbolAndStatus = item.symbol === signal.symbol && item.status === signal.status;
    const insideCooldown = now - item.timestamp < cooldownMs;
    return insideCooldown && (sameSignal || sameSymbolAndStatus);
  });
}

function countAlertsToday(): number {
  const memory = readAlertMemory();
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return memory.filter((item) => item.timestamp >= dayAgo).length;
}

function rememberAlert(signal: ProfessionalSignal): void {
  const memory = readAlertMemory();
  memory.push({
    signalId: signal.id,
    symbol: signal.symbol,
    status: signal.status,
    timestamp: Date.now()
  });
  writeAlertMemory(memory);
}

export async function processProfessionalAlerts(signals: ProfessionalSignal[]): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
}> {
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const candidates = signals.filter(shouldNotifySignal);

  for (const signal of candidates) {
    if (countAlertsToday() >= APP_CONFIG.notifications.maxAlertsPerDay) {
      skipped++;
      continue;
    }
    if (wasRecentlyAlerted(signal)) {
      skipped++;
      continue;
    }
    try {
      await showSignalNotification(signal);
      rememberAlert(signal);
      sent++;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown alert error");
    }
  }

  return { sent, skipped, errors };
}
