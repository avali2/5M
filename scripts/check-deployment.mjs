import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';

const origin = 'https://five-millions-5m-free.onrender.com';
const expected = process.env.GITHUB_SHA;
assert.match(expected ?? '', /^[a-f0-9]{40}$/i, 'Falta el commit esperado de GitHub');
const deadline = Date.now() + 8 * 60000;
let health;
while (Date.now() < deadline) {
  try {
    const response = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(15000), redirect: 'error' });
    const result = await response.json();
    if (response.ok && result.ok === true && result.botEngine >= 2 && result.deployedCommit === expected) {
      health = result;
      break;
    }
    console.log('Esperando a que Render publique el commit esperado.');
  } catch {
    console.log('Render todavía no confirmó una respuesta de salud válida.');
  }
  await wait(15000);
}
assert.ok(health, 'Render no publicó el commit esperado dentro de ocho minutos.');
const page = await fetch(origin, { signal: AbortSignal.timeout(15000), redirect: 'error' });
assert.equal(page.status, 200, 'La página principal no responde.');
const html = await page.text();
const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
assert.ok(asset, 'No se encontró el JavaScript compilado en la página.');
const bundle = await fetch(origin + asset, { signal: AbortSignal.timeout(15000), redirect: 'error' });
assert.equal(bundle.status, 200, 'El JavaScript de la web no está disponible.');
assert.ok((await bundle.text()).length > 1000, 'El JavaScript está vacío o incompleto.');
assert.equal(health.security?.requiresKey, true, 'El servicio de producción debe exigir autenticación.');
const privateStatus = await fetch(origin + '/api/status', { signal: AbortSignal.timeout(15000), redirect: 'error' });
assert.equal(privateStatus.status, 401, 'El estado privado debe rechazar solicitudes sin clave.');
console.log(JSON.stringify({
  deployedCommit: health.deployedCommit, botEngine: health.botEngine,
  configured: health.configured, marketData: health.marketData,
  security: health.security, execution: health.execution
}, null, 2));
console.log('Despliegue, interfaz y acceso privado verificados. Esto no valida credenciales ni ejecuta órdenes.');
