import { config } from '../server/config.js';
import { GeminiReviewer } from '../server/lib/gemini.js';
import { chooseExpiration } from '../server/lib/scanner.js';
import { TradierClient } from '../server/lib/tradier.js';

const symbols = ['AMD', 'MSFT', 'SPY'];

if (!config.tradier.token || !config.gemini.apiKey) {
  console.error('[5M smoke] Faltan TRADIER_TOKEN o GEMINI_API_KEY. No se ejecutó ninguna llamada.');
  process.exitCode = 1;
} else {
  try {
    const tradier = new TradierClient();
    const gemini = new GeminiReviewer();
    const now = new Date();
    const [clock, quotes, history, intraday, expirations] = await Promise.all([
      tradier.getMarketClock(),
      tradier.getQuotes(symbols),
      tradier.getHistory('AMD', 120, 'daily', now),
      tradier.getTimeSales('AMD', { interval: '5min', lookbackDays: 3, now }),
      tradier.getExpirations('AMD')
    ]);
    const selected = chooseExpiration(expirations, config.policy.profiles.core, now);
    const chain = selected ? await tradier.getOptionChain('AMD', selected.expiration) : [];
    const news = await gemini.reviewMarketRisk({ symbols, prioritySymbols: symbols, marketClock: clock, now });
    const result = {
      ok: quotes.length === symbols.length && history.length > 20 && intraday.length > 0 && chain.length > 0 && news.sources.length >= config.gemini.minGroundingSources,
      tradier: {
        clock: clock?.state || 'unknown',
        quoteSymbols: quotes.map((quote) => quote.symbol),
        quoteTimestamps: quotes.map((quote) => ({ symbol: quote.symbol, tradeDate: quote.tradeDate })),
        dailyBars: history.length,
        intradayBars: intraday.length,
        expiration: selected?.expiration || null,
        optionContracts: chain.length,
        realtimeEntitledConfigured: config.tradier.realtimeEntitled
      },
      gemini: { model: news.model, status: news.status, sources: news.sources.length, coverageComplete: news.coverageComplete },
      ordersSent: 0
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`[5M smoke] Falló: ${error.message}`);
    process.exitCode = 1;
  }
}
