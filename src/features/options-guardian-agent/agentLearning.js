const asText = (value) => String(value || '').toLowerCase();

function occurrences(items, matcher) {
  return items.filter((item) => matcher(asText(JSON.stringify(item)))).length;
}

export function analyzeGuardianLearning({ journal = [], events = [], feedback = [], previous = {} } = {}) {
  const all = [...journal, ...feedback];
  const fomo = occurrences(all, (text) => text.includes('fomo') || text.includes('impulso'));
  const revenge = occurrences(all, (text) => text.includes('revenge') || text.includes('venganza'));
  const stopped = occurrences(all, (text) => text.includes('stop') && (text.includes('viola') || text.includes('ignore') || text.includes('no respet')));
  const tired = occurrences(all, (text) => text.includes('cansancio') || text.includes('cansado'));
  const liquidity = occurrences([...all, ...events], (text) => text.includes('bid/ask') || text.includes('slippage') || text.includes('liquidez'));
  const gamma = occurrences([...all, ...events], (text) => text.includes('0dte') || text.includes('gamma'));
  const ignoredConditional = feedback.filter((item) => item.action === 'ignored' && item.eventType === 'SIGNAL_CONDITIONAL').length;
  const paperOutcomes = journal.filter((entry) => asText(entry.outcome).includes('paper'));
  const winners = paperOutcomes.filter((entry) => Number(entry.pnl) > 0);
  const losers = paperOutcomes.filter((entry) => Number(entry.pnl) < 0);
  const weakConcepts = [];
  if (liquidity >= 2) weakConcepts.push('liquidez y slippage');
  if (gamma >= 2) weakConcepts.push('riesgo gamma en 0DTE/1DTE');
  if (stopped > 0) weakConcepts.push('plan de salida y stop');
  if (fomo > 0 || revenge > 0) weakConcepts.push('disciplina emocional');
  const disciplineScore = Math.max(0, Math.min(100, Number(previous.disciplineScore ?? 80) - fomo * 5 - revenge * 10 - stopped * 8 + winners.length));
  const fomoRiskScore = Math.min(100, Number(previous.fomoRiskScore || 0) + fomo * 15);
  const revengeRiskScore = Math.min(100, Number(previous.revengeRiskScore || 0) + revenge * 20);
  const weakConcept = weakConcepts[0] || 'Mantener checklist y revision de cadena';
  const lesson = gamma >= 2
    ? 'Estudia Gamma 0DTE: movimientos pequenos del subyacente pueden cambiar Delta y P/L rapidamente.'
    : liquidity >= 2
      ? 'Practica lectura de bid/ask, OI y slippage antes de elegir strikes.'
      : 'Repasa expected move, riesgo maximo e invalidacion antes de cada estructura.';
  const practice = tired > 0 || revenge > 0
    ? 'Solo paper trade hoy y revision del journal.'
    : 'Simula un spread definido y registra plan, stop y take profit.';
  const notificationAdjustment = ignoredConditional >= 3
    ? 'Has ignorado varias alertas condicionales; considera elevar minScoreToNotify.'
    : 'Mantener alertas filtradas por Work Mode.';
  const motivation = revenge > 0
    ? 'Revisa proceso, no te vengues. Una perdida correcta es costo operativo.'
    : fomo > 0
      ? 'El mercado abre todos los dias. Tu capital no se arriesga por impulso.'
      : 'Antes de entrar: cadena, riesgo, invalidacion y tamano. Primero proceso.';
  return {
    ...previous,
    preferredStrategies: previous.preferredStrategies || [],
    weakConcepts,
    repeatedMistakes: { fomo, revenge, ignoredStop: stopped, liquidity, gamma, tired },
    bestSetups: previous.bestSetups || [],
    worstSetups: previous.worstSetups || [],
    bestSymbols: previous.bestSymbols || [],
    worstSymbols: previous.worstSymbols || [],
    notificationFatigueScore: Math.min(100, Number(previous.notificationFatigueScore || 0) + ignoredConditional * 5),
    disciplineScore,
    fomoRiskScore,
    revengeRiskScore,
    lastLearningRecommendation: lesson,
    paperSampleSize: paperOutcomes.length,
    paperWins: winners.length,
    paperLosses: losers.length,
    coach: {
      weakConcept,
      lesson,
      practice,
      repeatedError: weakConcepts.length ? weakConcepts.join(', ') : 'Ningun patron repetido confirmado aun.',
      notificationAdjustment,
      motivation,
      sampleWarning: paperOutcomes.length < 20 ? 'Muestra paper pequena: no asumir ventaja estadistica.' : 'Revisa expectancy y drawdown antes de cambiar reglas.'
    },
    updatedAt: new Date().toISOString()
  };
}
