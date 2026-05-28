import { ProviderError } from '../lib/http.js';
import { buildAiTutorPrompt, createCompactScanPayload, deterministicTutorFallback } from './deterministic-tutor.js';

function isRateLimit(error) {
  return error instanceof ProviderError && error.status === 429 || /HTTP 429|rate limit|quota/i.test(error.message);
}

export class AiProviderRouter {
  constructor({ settings = {}, gemini, openai, budgetManager }) {
    this.settings = settings;
    this.gemini = gemini;
    this.openai = openai;
    this.budgetManager = budgetManager;
  }

  providerOrder() {
    const order = [];
    if (this.settings.primaryProvider === 'openai') order.push('openai', 'gemini');
    else order.push('gemini', 'openai');
    return order;
  }

  providerStatus(provider) {
    const instance = provider === 'gemini' ? this.gemini : this.openai;
    return typeof instance?.status === 'function' ? instance.status() : { configured: false, enabled: false };
  }

  status() {
    return {
      primaryProvider: this.settings.primaryProvider || 'gemini',
      activeProvider: this.gemini?.configured && this.gemini?.enabled ? 'gemini' : this.openai?.configured && this.openai?.settings?.enabled ? 'openai' : 'deterministic',
      manualOnly: true,
      automaticSignalDecision: false,
      automaticNarrative: false,
      fallbackToDeterministic: this.settings.fallbackToDeterministic !== false,
      gemini: this.providerStatus('gemini'),
      openai: this.providerStatus('openai'),
      budget: this.budgetManager.status(),
      note: 'La IA solo explica. POP, EV, strikes, Greeks y riesgo vienen del motor deterministico.'
    };
  }

  async explainScan(scan, { manual = true, automatic = false, purpose = 'manual_explain' } = {}) {
    if (!manual && !automatic) {
      return this.fallback(scan, 'La solicitud no fue iniciada manualmente.');
    }
    if (automatic && (!this.settings.autoTutor || this.settings.autoSignalDecision || this.settings.autoNarrative)) {
      return this.fallback(scan, 'IA automatica restringida por configuracion.');
    }
    if (manual && this.settings.manualExplain === false) {
      return this.fallback(scan, 'Explicaciones IA manuales desactivadas.');
    }

    const payload = createCompactScanPayload(scan);
    const prompt = buildAiTutorPrompt();
    const estimatedTokens = Math.min(this.settings.maxTotalTokensPerCall || 3000, JSON.stringify(payload).length / 3 + 650);
    for (const providerName of this.providerOrder()) {
      const provider = providerName === 'gemini' ? this.gemini : this.openai;
      const status = this.providerStatus(providerName);
      if (!status.enabled || !status.configured) continue;
      const allowed = this.budgetManager.canCall({ provider: providerName, estimatedTokens, automatic });
      if (!allowed.allowed) continue;
      try {
        if (providerName === 'gemini') {
          const result = await provider.explain({
            payload,
            prompt,
            maxOutputTokens: this.settings.maxOutputTokensPerCall || 650
          });
          this.budgetManager.recordUsage({ tokens: result.usage?.totalTokens || estimatedTokens, automatic });
          return {
            narrative: result.text,
            source: 'Gemini - explicacion solicitada por el usuario',
            provider: 'gemini',
            purpose,
            usedFallback: false,
            status: this.status()
          };
        }
        const narrative = await provider.summarize(scan);
        this.budgetManager.recordUsage({ tokens: estimatedTokens, automatic });
        return {
          narrative,
          source: 'OpenAI - explicacion solicitada por el usuario',
          provider: 'openai',
          purpose,
          usedFallback: false,
          status: this.status()
        };
      } catch (error) {
        if (isRateLimit(error)) {
          const minutes = providerName === 'gemini'
            ? this.settings.cooldownAfter429Minutes || 120
            : Math.max(60, this.settings.cooldownAfter429Minutes || 120);
          this.budgetManager.pause(providerName, minutes, `${providerName} rate limit; usando tutor deterministico.`);
        } else {
          this.budgetManager.recordError(error.message);
        }
      }
    }
    return this.fallback(scan, this.budgetManager.status().lastError || 'No hay proveedor IA disponible.');
  }

  async testGemini(scan = {}) {
    if (!this.gemini?.configured || !this.gemini?.enabled) {
      return this.fallback(scan, 'Gemini no configurado. Agrega GEMINI_API_KEY para probarlo.');
    }
    const allowed = this.budgetManager.canCall({ provider: 'gemini', estimatedTokens: 700, automatic: false });
    if (!allowed.allowed) return this.fallback(scan, allowed.reason);
    try {
      const result = await this.gemini.explain({
        payload: { test: true, app: 'VALIDO 1M OS', timestamp: new Date().toISOString() },
        prompt: 'Responde en una frase breve que Gemini esta conectado a VALIDO 1M OS. No des consejos financieros.',
        maxOutputTokens: 80
      });
      this.budgetManager.recordUsage({ tokens: result.usage?.totalTokens || 700, automatic: false });
      return { ok: true, provider: 'gemini', narrative: result.text, status: this.status() };
    } catch (error) {
      if (isRateLimit(error)) this.budgetManager.pause('gemini', this.settings.cooldownAfter429Minutes || 120, 'Gemini 429 en prueba manual.');
      else this.budgetManager.recordError(error.message);
      return this.fallback(scan, error.message);
    }
  }

  fallback(scan, reason) {
    return {
      ok: true,
      narrative: deterministicTutorFallback(scan, reason),
      source: 'Tutor deterministico local',
      provider: 'deterministic',
      usedFallback: true,
      status: this.status()
    };
  }
}
