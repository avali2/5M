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
