import { config } from '../config.js';
import { TradierProvider } from './tradier.js';
import { PolygonProvider } from './polygon.js';
import { FinnhubProvider } from './finnhub.js';
import { FmpProvider } from './fmp.js';
import { BenzingaProvider } from './benzinga.js';
import { OpenAiProvider } from './openai.js';
import { YahooProvider } from './yahoo.js';
import { GeminiProvider } from './gemini.js';
import { AlphaVantageProvider } from './alphaVantage.js';
import { AiBudgetManager } from '../ai/ai-budget.js';
import { AiProviderRouter } from '../ai/provider-router.js';

export function createProviders(settings = config) {
  const tradier = new TradierProvider(settings.tradier);
  const polygon = new PolygonProvider(settings.polygon);
  const finnhub = new FinnhubProvider(settings.finnhub);
  const fmp = new FmpProvider(settings.fmp);
  const benzinga = new BenzingaProvider(settings.benzinga);
  const alphaVantage = new AlphaVantageProvider(settings.alphaVantage);
  const openai = new OpenAiProvider(settings.openai);
  const gemini = new GeminiProvider(settings.gemini);
  const yahoo = new YahooProvider(settings.yahoo);
  const aiBudget = new AiBudgetManager({ ...(settings.ai || {}), autoTutor: settings.ai?.autoTutor });
  const ai = new AiProviderRouter({ settings: settings.ai || {}, agentSettings: settings.agent || {}, gemini, openai, budgetManager: aiBudget });

  return {
    tradier,
    polygon,
    finnhub,
    fmp,
    benzinga,
    alphaVantage,
    openai,
    gemini,
    ai,
    yahoo,
    market: tradier.configured ? tradier : polygon.configured ? polygon : yahoo.configured ? yahoo : null,
    options: tradier.configured ? tradier : polygon.configured ? polygon : yahoo.configured ? yahoo : null,
    calendar: finnhub.configured ? finnhub : fmp.configured ? fmp : null,
    news: alphaVantage.configured ? alphaVantage : finnhub.configured ? finnhub : yahoo.configured ? yahoo : null
  };
}
