function list(value) {
  return Array.isArray(value) ? value : [];
}

function reviewAllowsEntry(review) {
  return review?.decision === 'APPROVE' &&
    review.entry_ok === true &&
    review.requires_manual_review !== true &&
    review.macro_warning !== true &&
    review.news_warning !== true;
}

function blockedReason(review) {
  if (!review) return 'Gemini Guardian no emitio revision.';
  if (review.decision === 'BLOCK') return `Gemini Guardian BLOCK: ${review.summary}`;
  if (review.decision === 'CAUTION') return `Gemini Guardian CAUTION: ${review.summary}`;
  if (review.requires_manual_review) return `Gemini Guardian requiere revision manual: ${review.summary}`;
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

function restrictGuardianTicketsToApproved(scan, approved) {
  if (!scan.guardianEdge) return;
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

export async function applyGeminiGuardianGate(scan, { providers, settings } = {}) {
  const signalSettings = settings?.signals || {};
  const agentSettings = settings?.agent || {};
  const aiStatus = typeof providers?.ai?.status === 'function' ? providers.ai.status() : null;
  const requireAi = signalSettings.requireAiConfirmation === true;
  const shouldAutoReview = Boolean(settings?.ai?.autoSignalDecision && agentSettings.autoVerifySignals);
  const candidates = list(scan.opportunities)
    .filter((setup) => Number(setup.confidenceScore ?? setup.score ?? 0) >= (agentSettings.verifyMinScore || signalSettings.minScore || 82))
    .slice(0, agentSettings.reviewTopN || 3);

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
    reviews: []
  };

  if (!requireAi && !shouldAutoReview) return scan;
  if (!candidates.length) {
    scan.aiGuardian.reason = 'No hay candidatos con score suficiente para revision Gemini.';
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
    if (!candidates.includes(setup)) {
      unreviewed.push(setup);
      continue;
    }
    const review = await providers.ai.reviewSignal(setup, scan, { automatic: true, cycleKey: scan.asOf });
    scan.aiGuardian.reviewed += 1;
    if (review.cacheHit) scan.aiGuardian.cacheHits += 1;
    if (review.decision === 'APPROVE') scan.aiGuardian.approved += 1;
    if (review.decision === 'CAUTION') scan.aiGuardian.cautioned += 1;
    if (review.decision === 'BLOCK') scan.aiGuardian.blocked += 1;
    scan.aiGuardian.reviews.push({
      symbol: setup.symbol,
      strategy: setup.strategy,
      expiration: setup.expiration,
      strikes: setup.strikes,
      decision: review.decision,
      confidence: review.confidence,
      summary: review.summary,
      requiresManualReview: review.requires_manual_review,
      cacheHit: review.cacheHit,
      reviewHash: review.reviewHash
    });
    const reviewedSetup = {
      ...setup,
      geminiReview: review,
      aiVerificationStatus: reviewAllowsEntry(review) ? 'APPROVED_BY_GEMINI_GUARDIAN' : 'REQUIRES_MANUAL_REVIEW'
    };
    if (reviewAllowsEntry(review)) {
      approved.push(reviewedSetup);
    } else {
      rejectedByAi.push({
        ...reviewedSetup,
        blocks: [...list(setup.blocks), blockedReason(review)]
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
          scan.aiGuardian.reviews[0]?.summary || scan.aiGuardian.reason || 'Ningun candidato recibio APPROVE estructurado de Gemini Guardian.',
          'No se envia push ni se marca operable sin decision APPROVE.'
        ]
      };
      scan.summary = `NO TRADE REAL: ${scan.decision.reasons.join(' ')}`;
    }
    restrictGuardianTicketsToApproved(scan, approved);
  } else {
    scan.opportunities = [...approved, ...rejectedByAi, ...unreviewed];
  }

  scan.aiGuardian.lastReviewAt = typeof providers?.ai?.status === 'function'
    ? providers.ai.status()?.gatekeeper?.lastReviewAt || scan.aiGuardian.lastReviewAt
    : scan.aiGuardian.lastReviewAt;
  return scan;
}
