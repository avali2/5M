import { api } from '../lib/api.js';

export const openAiService = {
  status: api.aiStatus,
  explainScan: api.explainWithAi
};
