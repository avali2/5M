function list(value) {
  return Array.isArray(value) ? value : [];
}

function reviewAllowsEntry(review) {
  return review?.decision === 'APPROVED' &&
    review.entry_ok === true &&
    review.hallucination_check === 'PASSED' &&
    review.requires_manual_review !== true &&
    review.macro_warning !== true &&
    review.news_warning !== true;
}

function blockedReason(review) {
  if (!review) return 'Gemini Guardian no emitio revision.';
  if (review.decision === 'BLOCKED') return `Gemini Guardian BLOCKED: ${review.summary}`;
  if (review.decision === 'WATCH_ONLY') return `Gemini Guardian WATCH_ONLY: ${review.summary}`;
  if (review.requires_manual_review) return `Gemini Guardian requiere revision manual: ${review.summary}`;
  if (review.hallucination_check !== 'PASSED') return `Sigma Guardian rechazo por hallucination/data check: ${review.summary}`;
  if (review.macro_warning) return `Gemini Guardian detecto macro warning: ${review.summary}`;
  if (review.news_warning) return `Gemini Guardian detecto news warning: ${review.summary}`;
  return `Gemini Guardian no aprobo entrada: ${review.summary || 'revision incompleta'}`;
}

function sameTicketAndSetup(ticket, setup) {
  return ticket?.symbol === setup?.symbol &&
    ticket?.strategy === setup?.strategy &&
    ticket?.expiration === setup?.expiration &&
    String(ticket?.sourceSetup?.strikes || ticket?.strikes || '') === String(setup?.strikes || '');
}

function setupKey(setup = {}) {
  return [
    setup.symbol,
    setup.strategy,
    setup.expiration,
    String(setup.strikes || ''),
    JSON.stringify((setup.legs || []).map((leg) => [leg.side, leg.type, leg.strike]))
  ].join('|');
}

function setupScore(setup = {}) {
  return Number(setup.confidenceScore ?? setup.tradeQualityScore ?? setup.score ?? 0);
}

function isCreditOrIncomeSetup(setup = {}) {
  return /(Credit Spread|Bull Put|Bear Call|Put Credit|Call Credit|Iron Condor|Iron Fly|income|venta de prima)/i.test(String(setup.strategy || '')) ||
    Number.isFinite(Number(setup.credit ?? setup.netCredit ?? setup.maxProfit));
}

function isCreditOrIncomeTicket(ticket = {}) {
  return isCreditOrIncomeSetup(ticket.sourceSetup || ticket) ||
    /(Credit|Bull Put|Bear Call|Iron Condor|Iron Fly)/i.test(String(ticket.strategy || ticket.classification || ''));
}

function hasDefinedRiskMath(setup = {}) {
  if (/naked|short straddle|short strangle|ratio/i.test(String(setup.strategy || ''))) return false;
  return Number.isFinite(Number(setup.maxRisk)) && Number.isFinite(Number(setup.maxProfit)) && Array.isArray(setup.legs) && setup.legs.length >= 2;
}

function buildReviewCandidates(scan, agentSettings, signalSettings) {
  const strictMin = agentSettings.verifyMinScore || signalSettings.minScore || 78;
  const creditMin = agentSettings.creditReviewMinScore || 60;
  const topN = agentSettings.reviewTopN || 5;
  const seen = new Set();
  const ticketSetups = list(scan.guardianEdge?.actionableTickets).map((ticket) => ({
    ...(ticket.sourceSetup || {}),
    symbol: ticket.symbol,
    strategy: ticket.strategy,
    expiration: ticket.expiration,
    strikes: ticket.sourceSetup?.strikes || ticket.legsText,
    legs: ticket.sourceSetup?.legs || ticket.legs,
    dte: ticket.sourceSetup?.dte ?? ticket.dte,
    maxRisk: ticket.sourceSetup?.maxRisk ?? ticket.maxRisk,
    maxProfit: ticket.sourceSetup?.maxProfit ?? ticket.maxProfit,
    collateralRequired: ticket.sourceSetup?.collateralRequired ?? ticket.collateralRequired,
    confidenceScore: ticket.sourceSetup?.confidenceScore ?? ticket.edgeScore,
    score: ticket.sourceSetup?.score ?? ticket.edgeScore,
    pop: ticket.sourceSetup?.pop ?? ticket.popEstimated,
    edge: ticket.sourceSetup?.edge || { probabilityOfProfit: ticket.popEstimated },
    riskGovernor: ticket.sourceSetup?.riskGovernor || { allowedReal: ticket.classification === 'EDGE_READY' },
    blocks: ticket.sourceSetup?.blocks || ticket.warnings || [],
    tapeProxy: ticket.sourceSetup?.tapeProxy || ticket.tapeProxy
  }));
  const pools = [
    ...list(scan.opportunities).map((setup) => ({ setup, origin: 'opportunity', priority: 0 })),
    ...ticketSetups.map((setup) => ({ setup, origin: 'edge_ticket', priority: 1 })),
    ...list(scan.rejected).map((setup) => ({ setup, origin: 'rejected', priority: 2 })),
    ...list(scan.conditionalIdeas).map((setup) => ({ setup, origin: 'conditional', priority: 3 }))
  ];
  return pools
    .filter(({ setup, origin }) => origin === 'opportunity'
      ? Number.isFinite(Number(setup.maxRisk)) && Number.isFinite(Number(setup.maxProfit))
      : hasDefinedRiskMath(setup))
    .filter(({ setup }) => setupScore(setup) >= (isCreditOrIncomeSetup(setup) ? creditMin : strictMin))
    .filter(({ setup }) => {
      const key = setupKey(setup);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) =>
      left.priority - right.priority ||
      (isCreditOrIncomeSetup(right.setup) ? 1 : 0) - (isCreditOrIncomeSetup(left.setup) ? 1 : 0) ||
      setupScore(right.setup) - setupScore(left.setup)
    )
    .slice(0, topN);
}

function restrictGuardianTicketsToApproved(scan, approved) {
  if (!scan.guardianEdge) return;
  const candidateTickets = scan.guardianEdge.candidateTickets ||
    scan.guardianEdge.actionableTickets ||
    scan.guardianEdge.tickets ||
    [];
  scan.guardianEdge.candidateTickets = candidateTickets
    .slice()
    .sort((left, right) =>
      (isCreditOrIncomeTicket(right) ? 1 : 0) - (isCreditOrIncomeTicket(left) ? 1 : 0) ||
      Number(right.edgeScore || 0) - Number(left.edgeScore || 0) ||
      Number(right.maxProfit || 0) - Number(left.maxProfit || 0)
    );
  const approvedTickets = (tickets = []) => tickets.filter((ticket) => approved.some((setup) => sameTicketAndSetup(ticket, setup)));
  scan.guardianEdge.notifyableTickets = approvedTickets(scan.guardianEdge.notifyableTickets);
  scan.guardianEdge.actionableTickets = approvedTickets(scan.guardianEdge.actionableTickets);
  scan.guardianEdge.tickets = approvedTickets(scan.guardianEdge.tickets);
  scan.guardianEdge.dailyBest = scan.guardianEdge.actionableTickets[0] || null;
  scan.guardianEdge.bestBullish = scan.guardianEdge.actionableTickets.find((ticket) => ticket.bias === 'Bullish') || null;
  scan.guardianEdge.bestBearish = scan.guardianEdge.actionableTickets.find((ticket) => ticket.bias === 'Bearish') || null;
  scan.guardianEdge.bestNeutral = scan.guardianEdge.actionableTickets.find((ticket) => ticket.bias === 'Neutral') || null;
  scan.guardianEdge.status = scan.guardianEdge.dailyBest?.classification || 'NO_READY';
}

/**
 * Construye el veredicto JSON completo de Gemini Guardian
 * que debe devolver el proveedor AI en cada revisión.
 *
 * Formato esperado por la app:
 * {
 *   "approved": true|false,
 *   "confidence": 0-100,
 *   "verdict": "APPROVED | WATCH_ONLY | REJECTED",
 *   "summary": "string",
 *   "riskNotes": ["string"],
 *   "whatCanGoWrong": ["string"],
 *   "entryComment": "string",
 *   "exitComment": "string",
 *   "educationNote": "string"
 * }
 */
function buildGeminiVerdictTemplate() {
  return {
    approved: false,
    confidence: 0,
    verdict: 'REJECTED',
    summary: 'Gemini Guardian no ha revisado esta señal aún.',
    riskNotes: [],
    whatCanGoWrong: [],
    entryComment: '',
    exitComment: '',
    educationNote: ''
  };
}

export async function applyGeminiGuardianGate(scan, { providers, settings } = {}) {
  const signalSettings = settings?.signals || {};
  const agentSettings = settings?.agent || {};
  const aiStatus = typeof providers?.ai?.status === 'function' ? providers.ai.status() : null;
  const requireAi = signalSettings.requireAiConfirmation === true;
  const shouldAutoReview = Boolean(settings?.ai?.autoSignalDecision && agentSettings.autoVerifySignals);
  const candidates = buildReviewCandidates(scan, agentSettings, signalSettings);
  const candidateKeys = new Set(candidates.map((item) => setupKey(item.setup)));
  const opportunityKeys = new Set(list(scan.opportunities).map(setupKey));

  scan.aiGuardian = {
    enabled: Boolean(agentSettings.enabled),
    name: agentSettings.name || 'Gemini Guardian',
    mode: agentSettings.mode || 'gatekeeper',
    required: requireAi,
    autoVerifySignals: shouldAutoReview,
    reviewed: 0,
    approved: 0,
    cautioned: 0,
    blocked: 0,
    cacheHits: 0,
    unavailable: false,
    reason: null,
    lastReviewAt: aiStatus?.gatekeeper?.lastReviewAt || null,
    tokenBudget: aiStatus?.budget || null,
    reviews: [],
    reviewPolicy: {
      strictMinScore: agentSettings.verifyMinScore || signalSettings.minScore || 78,
      creditReviewMinScore: agentSettings.creditReviewMinScore || 60,
      reviewTopN: agentSettings.reviewTopN || 5,
      note: 'Gemini revisa mas candidatos de credito/venta de prima, pero solo los que pasan gates deterministas pueden ser operables.'
    }
  };

  if (!requireAi && !shouldAutoReview) return scan;
  if (!candidates.length) {
    scan.aiGuardian.reason = 'No hay candidatos definidos con score suficiente para revision Gemini.';
    return scan;
  }
  if (typeof providers?.ai?.reviewSignal !== 'function') {
    scan.aiGuardian.unavailable = true;
    scan.aiGuardian.reason = 'Proveedor IA no soporta revision estructurada.';
    if (requireAi) {
      scan.rejected = [
        ...list(scan.opportunities).map((setup) => ({
          ...setup,
          aiVerificationStatus: 'REQUIRES_MANUAL_REVIEW',
          geminiReview: null,
          blocks: [...list(setup.blocks), 'Requiere revision manual: Gemini Guardian no disponible.']
        })),
        ...list(scan.rejected)
      ];
      scan.opportunities = [];
    }
    return scan;
  }

  const approved = [];
  const rejectedByAi = [];
  const unreviewed = [];
  for (const setup of list(scan.opportunities)) {
    if (!candidateKeys.has(setupKey(setup))) {
      unreviewed.push(setup);
    }
  }
  for (const candidate of candidates) {
    const setup = candidate.setup;
    const review = await providers.ai.reviewSignal(setup, scan, { automatic: true, cycleKey: scan.asOf });
    scan.aiGuardian.reviewed += 1;
    if (review.cacheHit) scan.aiGuardian.cacheHits += 1;
    if (review.decision === 'APPROVED') scan.aiGuardian.approved += 1;
    if (review.decision === 'WATCH_ONLY') scan.aiGuardian.cautioned += 1;
    if (review.decision === 'BLOCKED') scan.aiGuardian.blocked += 1;

    // Construir veredicto completo
    const verdict = buildGeminiVerdictTemplate();
    verdict.approved = reviewAllowsEntry(review);
    verdict.confidence = review.confidence || 50;
    verdict.verdict = review.decision === 'APPROVED' ? 'APPROVED'
      : review.decision === 'WATCH_ONLY' ? 'WATCH_ONLY'
      : 'REJECTED';
    verdict.summary = review.summary || 'Sin resumen de Gemini.';
    verdict.riskNotes = Array.isArray(review.risks) ? review.risks
      : Array.isArray(review.riskNotes) ? review.riskNotes
      : review.whatCanGoWrong || [];
    verdict.whatCanGoWrong = Array.isArray(review.whatCanGoWrong) ? review.whatCanGoWrong
      : ['El precio puede moverse en contra.', 'La liquidez puede disminuir.', 'Evento macro imprevisto.'];
    verdict.entryComment = review.entry_comment || review.entryComment || 'Usar orden limite. No perseguir precio.';
    verdict.exitComment = review.exit_comment || review.exitComment || 'Respetar stop loss y take profit. Cerrar antes de 3:30pm ET en 0DTE.';
    verdict.educationNote = review.education_note || review.educationNote || (review.decision === 'APPROVED'
      ? 'Operación con riesgo definido. La probabilidad es estimación, no garantía.'
      : 'Esta señal no está aprobada para operar. Revisar condiciones del mercado antes de actuar.');

    scan.aiGuardian.reviews.push({
      symbol: setup.symbol,
      strategy: setup.strategy,
      expiration: setup.expiration,
      strikes: setup.strikes,
      decision: verdict.verdict,
      confidence: verdict.confidence,
      summary: verdict.summary,
      riskNotes: verdict.riskNotes,
      whatCanGoWrong: verdict.whatCanGoWrong,
      requiresManualReview: review.requires_manual_review,
      cacheHit: review.cacheHit,
      reviewHash: review.reviewHash,
      entryComment: verdict.entryComment,
      exitComment: verdict.exitComment,
      educationNote: verdict.educationNote
    });

    const reviewedSetup = {
      ...setup,
      geminiReview: {
        ...review,
        approved: verdict.approved,
        confidence: verdict.confidence,
        verdict: verdict.verdict,
        summary: verdict.summary,
        riskNotes: verdict.riskNotes,
        whatCanGoWrong: verdict.whatCanGoWrong,
        entryComment: verdict.entryComment,
        exitComment: verdict.exitComment,
        educationNote: verdict.educationNote
      },
      aiVerificationStatus: verdict.approved ? 'APPROVED_BY_GEMINI_GUARDIAN' : 'REQUIRES_MANUAL_REVIEW'
    };

    if (verdict.approved && opportunityKeys.has(setupKey(setup))) {
      approved.push(reviewedSetup);
    } else {
      rejectedByAi.push({
        ...reviewedSetup,
        blocks: [
          ...list(setup.blocks),
          candidate.origin === 'opportunity'
            ? blockedReason(review)
            : `Gemini reviso como ${candidate.origin}, pero no pasa gates deterministicos para senal real: ${blockedReason(review)}`
        ]
      });
    }
  }

  if (requireAi) {
    scan.opportunities = approved;
    scan.rejected = [
      ...rejectedByAi,
      ...unreviewed.map((setup) => ({
        ...setup,
        aiVerificationStatus: 'REQUIRES_MANUAL_REVIEW',
        blocks: [...list(setup.blocks), 'Requiere revision Gemini Guardian antes de ser operable.']
      })),
      ...list(scan.rejected)
    ];
    if (!approved.length) {
      scan.decision = {
        status: 'no_trade',
        label: 'NO TRADE REAL - REQUIERE REVISION GEMINI',
        reasons: [
          scan.aiGuardian.reviews[0]?.summary || scan.aiGuardian.reason || 'Ningun candidato operable recibio APPROVED estructurado de Gemini Guardian.',
          'No se envia push ni se marca operable sin decision APPROVED.'
        ]
      };
      scan.summary = `NO TRADE REAL: ${scan.decision.reasons.join(' ')}`;
    }
    restrictGuardianTicketsToApproved(scan, approved);
  } else {
    const originalReviewedRejected = rejectedByAi.filter((setup) => opportunityKeys.has(setupKey(setup)));
    const reviewedNonOpportunities = rejectedByAi.filter((setup) => !opportunityKeys.has(setupKey(setup)));
    scan.opportunities = [...approved, ...originalReviewedRejected, ...unreviewed];
    scan.rejected = [...reviewedNonOpportunities, ...list(scan.rejected)];
  }

  scan.aiGuardian.lastReviewAt = typeof providers?.ai?.status === 'function'
    ? providers.ai.status()?.gatekeeper?.lastReviewAt || scan.aiGuardian.lastReviewAt
    : scan.aiGuardian.lastReviewAt;
  if (scan.aiGuardian.reviewed && !scan.aiGuardian.reason) {
    scan.aiGuardian.reason = approved.length
      ? `Gemini aprobo ${approved.length} candidato(s) que ya pasaban gates deterministas.`
      : `Gemini reviso ${scan.aiGuardian.reviewed} candidato(s), pero ninguno quedo operable.`;
  }
  return scan;
}