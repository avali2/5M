const todayKey = () => new Date().toISOString().slice(0, 10);

export class AiBudgetManager {
  constructor(settings = {}) {
    this.settings = settings;
    this.day = todayKey();
    this.tokensUsed = 0;
    this.requestsUsed = 0;
    this.cooldowns = new Map();
    this.lastAutomaticAt = 0;
    this.lastError = '';
  }

  resetIfNeeded() {
    const today = todayKey();
    if (today !== this.day) {
      this.day = today;
      this.tokensUsed = 0;
      this.requestsUsed = 0;
      this.cooldowns.clear();
      this.lastAutomaticAt = 0;
      this.lastError = '';
    }
  }

  usagePercent() {
    const budget = Math.max(1, this.settings.dailyTokenBudget || 60000);
    return Math.round((this.tokensUsed / budget) * 100);
  }

  cooldownUntil(provider) {
    const until = this.cooldowns.get(provider) || 0;
    return until > Date.now() ? new Date(until).toISOString() : null;
  }

  canCall({ provider, estimatedTokens = 1200, automatic = false } = {}) {
    this.resetIfNeeded();
    const now = Date.now();
    const cooldown = this.cooldowns.get(provider) || 0;
    if (cooldown > now) return { allowed: false, reason: `${provider} pausado hasta ${new Date(cooldown).toLocaleString()}` };
    if (this.requestsUsed >= (this.settings.dailyRequestBudget || 18)) return { allowed: false, reason: 'Presupuesto diario de requests IA alcanzado.' };
    if (this.tokensUsed + estimatedTokens > (this.settings.dailyTokenBudget || 60000)) return { allowed: false, reason: 'Presupuesto diario de tokens IA alcanzado.' };
    if (this.usagePercent() >= (this.settings.disableAllAtUsagePercent || 97)) return { allowed: false, reason: 'Uso IA mayor al limite maximo; tutor deterministico activado.' };
    if (automatic) {
      if (!this.settings.autoTutor) return { allowed: false, reason: 'IA automatica desactivada.' };
      if (this.usagePercent() >= (this.settings.disableAutoAtUsagePercent || 85)) return { allowed: false, reason: 'Modo ahorro: automatico pausado por consumo.' };
      const minGap = (this.settings.minAutomaticCallIntervalMinutes || 20) * 60 * 1000;
      if (now - this.lastAutomaticAt < minGap) return { allowed: false, reason: 'Intervalo minimo de IA automatica no cumplido.' };
    }
    return { allowed: true, reason: null };
  }

  recordUsage({ tokens = 0, automatic = false } = {}) {
    this.resetIfNeeded();
    this.requestsUsed += 1;
    this.tokensUsed += Math.max(0, Number(tokens) || 0);
    if (automatic) this.lastAutomaticAt = Date.now();
    this.lastError = '';
  }

  pause(provider, minutes, reason) {
    const until = Date.now() + Math.max(1, Number(minutes) || 1) * 60 * 1000;
    this.cooldowns.set(provider, until);
    this.lastError = reason || `${provider} pausado temporalmente.`;
    return new Date(until).toISOString();
  }

  recordError(reason) {
    this.lastError = reason;
  }

  status() {
    this.resetIfNeeded();
    return {
      day: this.day,
      tokensUsed: this.tokensUsed,
      dailyTokenBudget: this.settings.dailyTokenBudget || 60000,
      requestsUsed: this.requestsUsed,
      dailyRequestBudget: this.settings.dailyRequestBudget || 18,
      usagePercent: this.usagePercent(),
      automaticEnabled: Boolean(this.settings.autoTutor),
      automaticSignalDecision: Boolean(this.settings.autoSignalDecision),
      automaticNarrative: Boolean(this.settings.autoNarrative),
      manualExplain: this.settings.manualExplain !== false,
      disableAutoAtUsagePercent: this.settings.disableAutoAtUsagePercent || 85,
      disableAllAtUsagePercent: this.settings.disableAllAtUsagePercent || 97,
      cooldowns: Object.fromEntries([...this.cooldowns.entries()].map(([key]) => [key, this.cooldownUntil(key)])),
      lastError: this.lastError || null
    };
  }
}
