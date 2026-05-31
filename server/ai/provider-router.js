import { ProviderError } from '../lib/http.js';
import { buildAiTutorPrompt, createCompactScanPayload, deterministicTutorFallback } from './deterministic-tutor.js';
import { createHash } from 'node:crypto';

function isRateLimit(error) {
  return error instanceof ProviderError && error.status === 429 || /HTTP 429|rate limit|quota/i.test(error.message);
}

function cleanJsonText(text = '') {
  let cleaned = String(text)
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  // Strip any text before the first '{' and after the last '}'
  const braceStart = cleaned.indexOf('{');
  const braceEnd = cleaned.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    cleaned = cleaned.slice(braceStart, braceEnd + 1);
  }
  return cleaned;
}

function normalizeReview(raw, fallbackSummary = 'Gemini Guardian no entrego una aprobacion operable.') {
  const decision = ['APPROVE', 'CAUTION', 'BLOCK'].includes(raw?.decision) ? raw.decision : 'CAUTION';
  return {
    agent: 'SIGMA_GUARDIAN',
    decision,
    confidence: Number.isFinite(Number(raw?.confidence)) ? Math.max(0, Math.min(100, Number(raw.confidence))) : 50,
    summary: String(raw?.summary || fallbackSummary).slice(0, 500),
    why: Array.isArray(raw?.why) ? raw.why.map(String).slice(0, 5) : [],
    risks: Array.isArray(raw?.risks) ? raw.risks.map(String).slice(0, 5) : [],
    entry_ok: Boolean(raw?.entry_ok) && decision === 'APPROVE',
    invalidation: String(raw?.invalidation || 'Revalidar precio, bid/ask, macro/news y soporte/resistencia antes de entrar.'),
    position_management: String(raw?.position_management || 'Usar tamano pequeno, take profit definido y stop segun plan.'),
    news_warning: Boolean(raw?.news_warning),
    macro_warning: Boolean(raw?.macro_warning),
    requires_manual_review: raw?.requires_manual_review !== undefined ? Boolean(raw.requires_manual_review) : decision !== 'APPROVE',
    hallucination_check: raw?.hallucination_check === 'PASSED' && decision === 'APPROVE' ? 'PASSED' : 'FAILED'
  };
}

function isCreditOrIncomeCandidate(signal = {}) {
  const strategy = String(signal.strategy || '');
  const creditDebit = String(signal.creditDebit?.type || signal.premiumType || '').toLowerCase();
  return creditDebit === 'credit' ||
    Number.isFinite(Number(signal.netCredit ?? signal.credit)) ||
    /(Credit Spread|Bull Put|Bear Call|Iron Condor|Iron Fly|Put Credit|Call Credit|income|venta de prima)/i.test(strategy);
}

function reviewThresholdFor(signal = {}, agentSettings = {}) {
  return isCreditOrIncomeCandidate(signal)
    ? (agentSettings.creditReviewMinScore || 60)
    : (agentSettings.verifyMinScore || 78);
}

function extractReviewJson(text) {
  const cleaned = cleanJsonText(text);
  try {
    return normalizeReview(JSON.parse(cleaned));
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return normalizeReview(null, 'Gemini devolvio texto no JSON; se requiere revision manual.');
    try {
      return normalizeReview(JSON.parse(match[0]));
    } catch {
      return normalizeReview(null, 'Gemini devolvio JSON invalido; se requiere revision manual.');
    }
  }
}

function compactSignalPayload(signal = {}, scan = {}) {
  const macro = scan.macro || {};
  const legs = Array.isArray(signal.legs) ? signal.legs : [];
  return {
    symbol: signal.symbol || signal.ticker,
    price: signal.underlyingPrice ?? signal.currentPrice ?? null,
    strategy: signal.strategy,
    strikes: signal.strikes,
    expiration: signal.expiration,
    creditDebit: signal.creditDebit || { type: signal.netCredit ? 'credit' : signal.netDebit ? 'debit' : 'unknown', value: signal.netCredit ?? signal.netDebit ?? null },
    pop: signal.pop ?? signal.popEstimated ?? signal.edge?.probabilityOfProfit ?? null,
    delta: signal.legs?.map((leg) => ({ side: leg.side, type: leg.type, strike: leg.strike, delta: leg.delta })),
    ivRank: signal.ivRank,
    score: signal.confidenceScore ?? signal.score,
    maxRisk: signal.maxRisk,
    maxProfit: signal.maxProfit,
    riskReward: signal.riskReward,
    expectedMove: signal.expectedMove,
    liquidityScore: signal.liquidityScore,
    tradeQualityScore: signal.tradeQualityScore,
    maxBidAskSpreadPct: signal.maxBidAskSpreadPct,
    collateral: signal.collateralRequired,
    definedRisk: !/naked|short straddle|short strangle|ratio/i.test(String(signal.strategy || '')),
    legs: legs.map((leg) => ({
      side: leg.side,
      type: leg.type,
      strike: leg.strike,
      bid: leg.bid,
      ask: leg.ask,
      delta: leg.delta,
      gamma: leg.gamma,
      theta: leg.theta,
      vega: leg.vega,
      iv: leg.iv,
      volume: leg.volume,
      openInterest: leg.openInterest,
      source: leg.source
    })),
    technicals: signal.technicals ? {
      trend: signal.technicals.trend,
      support: signal.technicals.support,
      resistance: signal.technicals.resistance,
      vwap20: signal.technicals.vwap20,
      rsi14: signal.technicals.rsi14,
      macdHistogram: signal.technicals.macd?.histogram,
      relativeVolume20: signal.technicals.relativeVolume20
    } : null,
    tapeProxy: signal.tapeProxy || null,
    eventsMacro: (macro.highImpactEvents || []).slice(0, 5).map((event) => event.title || event.event || event.name || event.date),
    macroWarnings: (macro.softImpactEvents || []).slice(0, 5).map((event) => event.title || event.event || event.name || event.date),
    newsDetected: [...(macro.newsBlocks || []), ...(macro.breakingRisk || []).filter((item) => item.caution)].slice(0, 5).map((item) => ({
      title: item.title,
      source: item.source,
      riskScore: item.riskScore,
      riskType: item.riskType
    })),
    earnings: (macro.earnings || []).filter((item) => item.symbol === signal.symbol).slice(0, 3).map((item) => ({ symbol: item.symbol, date: item.date })),
    scannerReason: signal.reasoning || signal.reason || [],
    riskBlocks: signal.blocks || signal.riskGovernor?.blocks || [],
    timestamp: scan.asOf
  };
}

export class AiProviderRouter {
  constructor({ settings = {}, agentSettings = {}, gemini, openai, budgetManager }) {
    this.settings = settings;
    this.agentSettings = agentSettings;
    this.gemini = gemini;
    this.openai = openai;
    this.budgetManager = budgetManager;
    this.reviewCache = new Map();
    this.lastReviewAt = null;
    this.lastReviewCycle = null;
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
      manualOnly: !this.settings.autoSignalDecision && !this.settings.autoNarrative,
      automaticSignalDecision: Boolean(this.settings.autoSignalDecision),
      automaticNarrative: Boolean(this.settings.autoNarrative),
      fallbackToDeterministic: this.settings.fallbackToDeterministic !== false,
      gatekeeper: {
        mode: this.agentSettings.mode || 'gatekeeper',
        autoVerifySignals: Boolean(this.agentSettings.autoVerifySignals && this.settings.autoSignalDecision),
        verifyMinScore: this.agentSettings.verifyMinScore || 78,
        creditReviewMinScore: this.agentSettings.creditReviewMinScore || 60,
        reviewTopN: this.agentSettings.reviewTopN || 5,
        cacheTtlMinutes: this.agentSettings.cacheTtlMinutes || 180,
        requireStructuredJson: this.agentSettings.requireStructuredJson !== false,
        lastReviewAt: this.lastReviewAt
      },
      gemini: this.providerStatus('gemini'),
      openai: this.providerStatus('openai'),
      budget: this.budgetManager.status(),
      note: 'La IA solo explica. POP, EV, strikes, Greeks y riesgo vienen del motor deterministico.'
    };
  }

  reviewHash(signal, scan) {
    const payload = compactSignalPayload(signal, scan);
    return createHash('sha256').update(JSON.stringify({
      symbol: payload.symbol,
      strategy: payload.strategy,
      expiration: payload.expiration,
      strikes: payload.strikes,
      price: payload.price,
      score: payload.score,
      pop: payload.pop,
      macro: payload.eventsMacro,
      news: payload.newsDetected,
      earnings: payload.earnings
    })).digest('hex').slice(0, 24);
  }

  async reviewSignal(signal, scan, { automatic = true, cycleKey = null } = {}) {
    const score = Number(signal?.confidenceScore ?? signal?.score ?? 0);
    const minReviewScore = reviewThresholdFor(signal, this.agentSettings);
    const hash = this.reviewHash(signal, scan);
    const cached = this.reviewCache.get(hash);
    if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cacheHit: true };

    const unavailable = (summary) => ({
      provider: 'deterministic',
      decision: 'CAUTION',
      confidence: 40,
      summary,
      why: ['La revision IA no aprobo automaticamente este candidato.'],
      risks: ['No enviar push ni marcar como operable hasta revision manual.'],
      entry_ok: false,
      invalidation: signal?.invalidation || 'Revalidar cadena, precio y eventos antes de considerar entrada.',
      position_management: 'Mantener en candidatos; usar paper/simulador hasta aprobacion manual.',
      news_warning: false,
      macro_warning: false,
      requires_manual_review: true,
      status: 'requires_manual_review',
      reviewHash: hash,
      cacheHit: false
    });

    if (!this.settings.autoSignalDecision || !this.agentSettings.autoVerifySignals) {
      return unavailable('Gemini Guardian automatico esta desactivado; requiere revision manual.');
    }
    if (score < minReviewScore) {
      return unavailable(`Score ${score} debajo del minimo de revision Gemini ${minReviewScore}.`);
    }
    if (!this.gemini?.configured || !this.gemini?.enabled) {
      return unavailable('Gemini no configurado o desactivado; fallback deterministico activo.');
    }
    const budgetStatus = this.budgetManager.status();
    if (budgetStatus.requestsUsed >= (this.agentSettings.maxAiVerificationsPerDay || this.settings.dailyRequestBudget || 8)) {
      return unavailable('Limite diario de revisiones Gemini Guardian alcanzado.');
    }
    if (automatic && this.lastReviewAt && this.lastReviewCycle !== cycleKey) {
      const minGap = (this.agentSettings.minutesBetweenAiCalls || this.settings.minAutomaticCallIntervalMinutes || 45) * 60000;
      if (Date.now() - new Date(this.lastReviewAt).getTime() < minGap) {
        return unavailable('Cooldown entre revisiones Gemini Guardian aun activo.');
      }
    }

    const payload = compactSignalPayload(signal, scan);
    const estimatedTokens = Math.min(this.settings.maxTotalTokensPerCall || 3000, JSON.stringify(payload).length / 3 + 500);
    const allowed = this.budgetManager.canCall({ provider: 'gemini', estimatedTokens, automatic });
    if (!allowed.allowed) return unavailable(allowed.reason || 'Presupuesto/cooldown de Gemini impide revision automatica.');

    const prompt = [
      'Eres Gemini Guardian, auditor final de una plataforma de opciones.',
      'NO calcules precios, Greeks, POP, EV, strikes ni riesgo. Solo audita los datos calculados.',
      'No prometas ganancias. Si faltan datos, si hay macro/news/earnings/geopolitica seria, o el trade no es limpio, usa CAUTION o BLOCK.',
      'Actua como SIGMA_GUARDIAN: audita evidencia, contradicciones, frescura de datos y blockers. No apruebes nada con datos incompletos.',
      'Prioriza la auditoria de spreads de credito/venta de prima cuando el riesgo sea definido, el potencial estimado sea suficiente y el usuario pueda revisar manualmente en Robinhood.',
      'Si recibes tapeProxy, tratalo como confirmacion secundaria educativa; no es Level 2 ni order flow institucional confirmado.',
      'Responde SOLO JSON valido con exactamente estas claves:',
      '{"agent":"SIGMA_GUARDIAN","decision":"APPROVE|CAUTION|BLOCK","confidence":0-100,"summary":"breve","why":["razon 1","razon 2","razon 3"],"risks":["riesgo 1","riesgo 2"],"entry_ok":true/false,"invalidation":"condicion","position_management":"plan","news_warning":true/false,"macro_warning":true/false,"requires_manual_review":true/false,"hallucination_check":"PASSED|FAILED"}'
    ].join('\n');

    try {
      const result = await this.gemini.explain({
        payload,
        prompt,
        maxOutputTokens: Math.min(this.settings.maxOutputTokensPerCall || 650, 500)
      });
      const review = extractReviewJson(result.text);
      const value = {
        ...review,
        provider: 'gemini',
        status: review.decision === 'APPROVE' && review.entry_ok && !review.requires_manual_review ? 'approved' : review.decision.toLowerCase(),
        reviewHash: hash,
        cacheHit: false,
        rawUsage: result.usage || null
      };
      this.budgetManager.recordUsage({ tokens: result.usage?.totalTokens || estimatedTokens, automatic });
      this.lastReviewAt = new Date().toISOString();
      this.lastReviewCycle = cycleKey;
      this.reviewCache.set(hash, { value, expiresAt: Date.now() + (this.agentSettings.cacheTtlMinutes || 180) * 60000 });
      return value;
    } catch (error) {
      if (isRateLimit(error)) this.budgetManager.pause('gemini', this.settings.cooldownAfter429Minutes || 120, 'Gemini 429; requiere revision manual.');
      else this.budgetManager.recordError(error.message);
      return unavailable(`Gemini error: ${error.message}`);
    }
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
