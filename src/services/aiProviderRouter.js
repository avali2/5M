import { api } from '../lib/api.js';

export const aiProviderRouter = {
  status: api.aiStatus,
  explainManually: api.explainWithAi,
  testGemini: api.testGemini
};
