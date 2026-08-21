import { config } from '../config.js';
import { TradierClient, isTradierConfigured } from '../lib/tradier.js';
import { GeminiReviewer } from '../lib/gemini.js';
import { scanMarket } from '../lib/scanner.js';
import { saveScan } from '../lib/store.js';
import { notifyReadySignal } from '../lib/push.js';

if (!isTradierConfigured()) {
  console.error('[5M] Worker detenido: TRADIER_TOKEN no está configurado.');
  process.exitCode = 1;
} else {
  const tradier = new TradierClient();
  const gemini = new GeminiReviewer();
  const run = async () => {
    try {
      const scan = await scanMarket({ tradier, gemini });
      await saveScan(scan);
      for (const signal of scan.signals.filter((item) => item.status === 'READY')) await notifyReadySignal(signal, config.publicBaseUrl);
      console.info(`[5M] Worker scan: ${scan.summary.ready} READY`);
    } catch (error) { console.error(`[5M] Worker scan falló: ${error.message}`); }
  };
  await run();
  setInterval(run, config.scanner.intervalMinutes * 60000);
}
