import { api } from '../lib/api.js';

export const geminiService = {
  status: api.aiStatus,
  test: api.testGemini,
  explainScan: api.explainWithAi
};
