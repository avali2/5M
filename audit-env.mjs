import fs from 'node:fs';
import path from 'node:path';
const RENDER = process.env.RK;
const ID = 'srv-dbkeeq0m7kps738k7ee0';
const main = 'https://api.render.com/v1';
const all = []; let cursor = null;
for (let page = 0; page < 12; page += 1) {
  const qs = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
  const res = await fetch(main + '/services/' + ID + '/env-vars' + qs, { headers: { Authorization: 'Bearer ' + RENDER } });
  const json = await res.json().catch(() => null);
  if (!Array.isArray(json)) break;
  for (const item of json) all.push(item.envVar || item);
  cursor = json[json.length - 1]?.cursor || null;
  if (!cursor) break;
}
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!['node_modules', 'dist', '.git', 'data', 'screenshots'].includes(entry.name)) walk(full); }
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) files.push(full);
  }
}
walk('server'); walk('src'); walk('scripts');
const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const rows = all.map((item) => ({ key: item.key, length: String(item.value || '').length, used: source.includes(item.key) })).sort((a, b) => Number(a.used) - Number(b.used) || a.key.localeCompare(b.key));
console.log('TOTAL', rows.length);
for (const row of rows) console.log((row.used ? 'USED ' : 'UNUSED') + ' ' + row.key + ' (' + row.length + ')');
