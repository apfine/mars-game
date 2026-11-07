// Manual browser smoke test. Run npm run dev and Chrome CDP on port 9222.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const port = process.env.CDP_PORT || 9222;
const tabs = await (await fetch(`http://localhost:${port}/json`)).json();
const page = tabs.find(item => item.type === 'page');
if (!page) throw new Error('No Chrome page is available.');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let serial = 0;
const pending = new Map(), errors = [];
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (item) (message.error ? item.reject(message.error) : item.resolve(message.result));
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const wait = async predicate => {
  for (let i = 0; i < 60; i++) {
    if (await evaluate(predicate)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out: ${predicate}`);
};
const clickText = async (selector, value) => {
  const clicked = await evaluate(`(() => { const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.textContent.includes(${JSON.stringify(value)})); button?.click(); return Boolean(button); })()`);
  assert.equal(clicked, true, `Missing button ${value}`);
};
await call('Runtime.enable'); await call('Page.enable');
await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await call('Page.navigate', { url: 'http://localhost:3000' });
await new Promise(resolve => setTimeout(resolve, 1500));
await wait(`Boolean(document.querySelector('canvas')?.game?.career && document.querySelector('.career-build-launch'))`);
const alreadyDone = await evaluate(`Boolean(document.querySelector('canvas').game.career.state.objectives.chapter?.complete)`);
if (!alreadyDone) {
await evaluate(`document.querySelector('canvas').game.physics.position.set(380, 0, 520)`);
await wait(`document.querySelector('canvas').game.career.state.discoveries.includes('perseverance_jezero')`);
await evaluate(`document.querySelector('.career-build-launch').click()`);
await wait(`Boolean(document.querySelector('.career-panel.open'))`);
for (const [module, plot] of [['Solar array', 'A1'], ['Water extractor', 'A2'], ['Greenhouse', 'A3']]) {
  await clickText('.career-catalog button', `PLACE ${module.toUpperCase()}`);
  await clickText('.career-placement .career-plot-grid button', plot);
  await clickText('.career-placement .career-card-actions button', 'CONFIRM');
  await wait(`document.querySelector('canvas').game.career.state.buildings.some(item => item.type === ${JSON.stringify(module === 'Solar array' ? 'solar' : module === 'Water extractor' ? 'water' : 'greenhouse')})`);
}
await clickText('.career-tabs button', 'Farm');
await clickText('.career-card button', 'PLANT ARES SPROUT');
await wait(`Boolean(document.querySelector('canvas').game.career.state.buildings.find(item => item.type === 'greenhouse').crop)`);
await evaluate(`(async () => { const original = Date.now; Date.now = () => original() + 130000; await document.querySelector('canvas').game.career.tickProduction(); Date.now = original; })()`);
await wait(`document.querySelector('canvas').game.career.state.buildings.find(item => item.type === 'greenhouse').crop?.ready === true`);
await clickText('.career-card button', 'HARVEST');
await wait(`document.querySelector('canvas').game.career.state.resources.food === 5`);
await clickText('.career-tabs button', 'Build');
await clickText('.career-catalog button', 'PLACE HABITAT');
await clickText('.career-placement .career-plot-grid button', 'B1');
await clickText('.career-placement .career-card-actions button', 'CONFIRM');
await wait(`document.querySelector('canvas').game.career.state.objectives.chapter?.complete === true`);
} else {
  await evaluate(`document.querySelector('.career-build-launch').click()`);
  await wait(`Boolean(document.querySelector('.career-panel.open'))`);
}
const phone = await evaluate(`(() => { const panel = document.querySelector('.career-panel').getBoundingClientRect(); const controls = document.getElementById('mobile-controls')?.getBoundingClientRect(); return { panel: {top:panel.top,bottom:panel.bottom,left:panel.left,right:panel.right}, controls:controls && {top:controls.top,bottom:controls.bottom}, scrollable: document.querySelector('.career-scroll').scrollHeight > document.querySelector('.career-scroll').clientHeight, badge: document.querySelector('canvas').game.career.state.badges.includes('chapter') }; })()`);
assert.ok(phone.panel.left >= 0 && phone.panel.right <= 390);
assert.ok(phone.scrollable);
assert.ok(phone.badge);
const shot = await call('Page.captureScreenshot', { format: 'png' });
await writeFile('.career-phone.png', Buffer.from(shot.data, 'base64'));
await evaluate(`document.querySelector('.career-head button').click()`);
assert.equal(await evaluate(`Boolean(document.querySelector('.career-panel.open'))`), false);
await call('Page.reload', { ignoreCache: true });
await new Promise(resolve => setTimeout(resolve, 1800));
await wait(`Boolean(document.querySelector('canvas')?.game?.career?.state.objectives.chapter?.complete)`);
assert.equal(await evaluate(`document.querySelector('canvas').game.career.state.buildings.length`), 4);
await call('Emulation.setTouchEmulationEnabled', { enabled: false });
await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await evaluate(`document.querySelector('.career-launch').click()`);
await clickText('.career-tabs button', 'Save');
const desktop = await evaluate(`(() => { const panel=document.querySelector('.career-panel').getBoundingClientRect(); return {left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom, status:document.querySelector('canvas').game.career.saveStatus}; })()`);
assert.ok(desktop.left >= 0 && desktop.right <= 1280);
const desktopShot = await call('Page.captureScreenshot', { format: 'png' });
await writeFile('.career-desktop.png', Buffer.from(desktopShot.data, 'base64'));
await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
await call('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
await evaluate(`document.querySelector('canvas').game.setMode('starship')`);
const landscape = await evaluate(`(() => { const panel=document.querySelector('.career-panel').getBoundingClientRect(); const telemetry=document.querySelector('#flight-hud .spx-broadcast-bar').getBoundingClientRect(); return {panelBottom:panel.bottom,telemetryTop:telemetry.top,scrollable:document.querySelector('.career-scroll').scrollHeight>document.querySelector('.career-scroll').clientHeight}; })()`);
assert.ok(landscape.panelBottom <= landscape.telemetryTop + 1, 'landscape panel overlaps flight telemetry');
assert.ok(landscape.scrollable);
const landscapeShot = await call('Page.captureScreenshot', { format: 'png' });
await writeFile('.career-landscape.png', Buffer.from(landscapeShot.data, 'base64'));
assert.equal(errors.length, 0, errors.join('\n'));
console.log(JSON.stringify({ phone, desktop, landscape, buildings: 4, chapter: true, errors }, null, 2));
ws.close();
