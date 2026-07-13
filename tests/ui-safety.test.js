import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('chart hover and tooltip styles avoid full black overlays', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const simulator = await readFile(new URL('../src/features/options-simulator/OptionsStrategyLab.jsx', import.meta.url), 'utf8');
  const gex = await readFile(new URL('../src/features/gex-dealer-positioning-lab/GexLab.jsx', import.meta.url), 'utf8');
  assert.match(css, /--chart-cursor:\s*rgba\(37,\s*99,\s*235,\s*0\.08\)/);
  assert.match(css, /\.recharts-tooltip-cursor/);
  assert.doesNotMatch(`${app}\n${simulator}\n${gex}`, /contentStyle=\{\{\s*background:\s*['"]#111a2d/i);
  assert.doesNotMatch(`${app}\n${simulator}\n${gex}`, /<Tooltip[^>]*#273453/i);
});

test('Paper and live Tradier are independent broker workspaces', async () => {
  const app = await readFile(new URL('../src/AppPro.jsx', import.meta.url), 'utf8');
  const desk = await readFile(new URL('../src/components/TradierAutopilotDesk.jsx', import.meta.url), 'utf8');
  const coach = await readFile(new URL('../src/components/GeminiBrokerCoach.jsx', import.meta.url), 'utf8');
  assert.match(app, /\['paper',\s*'P',\s*'Paper'\]/);
  assert.match(app, /\['tradier',\s*'T',\s*'En vivo'\]/);
  assert.match(app, /activeTab === 'paper'[\s\S]*view="paper"[\s\S]*<TradeJournal/);
  assert.match(app, /activeTab === 'tradier'[\s\S]*view="live"/);
  assert.doesNotMatch(app, /\['journal',/);
  assert.match(desk, /GeminiBrokerCoach environment="paper"/);
  assert.match(desk, /GeminiBrokerCoach environment="live"/);
  assert.match(coach, /Pedir criterio a Gemini/);
});
