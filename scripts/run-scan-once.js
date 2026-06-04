import 'dotenv/config';
import { runScannerWorkerCycle } from '../server/worker/scannerWorker.js';

const result = await runScannerWorkerCycle({ mode: 'manual-once' });
console.log(JSON.stringify(result, null, 2));
