import 'dotenv/config';
import { startScannerWorker } from '../server/worker/scannerWorker.js';

startScannerWorker().catch((error: Error) => {
  console.error('Scanner worker fatal error:', error);
  process.exit(1);
});
