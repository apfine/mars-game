// Run against `npm run dev` and a local headless Chrome on debugging port 9222.
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const tabs = await (await fetch('http://localhost:9222/json')).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let seq = 0;
const pending = new Map(), errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ': ' + m.params.exceptionDetails.exception?.description);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
});
function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { return (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value; }
const delay = ms => new Promise(r => setTimeout(r, ms));
await call('Runtime.enable'); await call('Log.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await call('Page.navigate', { url: process.env.TEST_URL || 'http://localhost:3000' });
for (let i = 0; i < 45; i++) {
  await delay(1000);
  if (await evaluate(`!!document.querySelector('canvas') && !document.getElementById('mars-loading-screen')`)) break;
}
// Exercise the real launch event and render the flight scene.
await evaluate(`document.getElementById('btn-launch-mobile').click()`);
await delay(3000);
const shot = await call('Page.captureScreenshot', { format: 'png' });
await writeFile('.browser-phone.png', Buffer.from(shot.data, 'base64'));
for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1280, 800]]) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 900 });
  await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await delay(500);
  const controls = await evaluate(`['flight-cam-btn','flight-mission-btn','flight-actions-btn','flight-auto-btn'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,left:r.left,right:r.right,height:r.height}})`);
  for (const c of controls) {
    assert.ok(c.left >= 0 && c.right <= width + 1, `${width}px: ${c.id} overflows (${c.left}..${c.right})`);
    assert.ok(c.height >= 44, `${c.id} needs a 44px touch target`);
  }
  console.log(`Layout ${width} x ${height}: pass`);
}
console.log('errors', [...new Set(errors)]);
ws.close();
if (errors.some(e => e.startsWith('Uncaught') || e.includes('VALIDATE_STATUS'))) process.exitCode = 1;
