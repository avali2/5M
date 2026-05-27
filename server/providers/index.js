import { config } from '../config.js';
import { TradierProvider } from './tradier.js';
import { PolygonProvider } from './polygon.js';
import { FinnhubProvider } from './finnhub.js';
import { FmpProvider } from './fmp.js';
import { BenzingaProvider } from './benzinga.js';
import { OpenAiProvider } from './openai.js';

export function createProviders(settings = config) {
  const tradier = new TradierProvider(settings.tradier);
  const polygon = new PolygonProvider(settings.polygon);
  const finnhub = new FinnhubProvider(settings.finnhub);
  const fmp = new FmpProvider(settings.fmp);
  const benzinga = new BenzingaProvider(settings.benzinga);
  const openai = new OpenAiProvider(settings.openai);

  return {
    tradier,
    polygon,
    finnhub,
    fmp,
    benzinga,
    openai,
    market: tradier.configured ? tradier : polygon.configured ? polygon : null,
    options: tradier.configured ? tradier : polygon.configured ? polygon : null,
    calendar: finnhub.configured ? finnhub : fmp.configured ? fmp : null
  };
}
