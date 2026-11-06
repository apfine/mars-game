// Manual screenshot capture for review; requires running app and Chrome CDP.
import { writeFile } from 'node:fs/promises';

const tabs = await (await fetch('http://localhost:9222/json')).json();
const page = tabs.find(tab => tab.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const task = pending.get(message.id);
  pending.delete(message.id);
  message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const key = ++id;
  pending.set(key, { resolve, reject });
  ws.send(JSON.stringify({ id: key, method, params }));
});
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await call('Page.navigate', { url: 'http://localhost:3000' });
for (let i = 0; i < 90; i++) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  if (await evaluate('Boolean(document.querySelector("canvas")?.game)')) break;
}
for (const world of ['gargantua', 'saturn', 'miller']) {
  await evaluate(`(() => {
    const game = document.querySelector('canvas').game;
    cancelAnimationFrame(game.animId);
    game.setMode('starship');
    game.missionPhysics.phase = '${world}' === 'miller' ? 'LANDED' : 'ORBIT';
    game.missionPhysics.scriptedControl = true;
    if ('${world}' === 'miller') game.missionPhysics.setPlanet('${world}');
    else game.missionPhysics.enterFlybyWaypoint('${world}');
    game.applyPlanetEnvironment('${world}');
    if ('${world}' === 'miller') game.camera.position.set(game.missionPhysics.padCoords.x, game.missionPhysics.padGroundY + 35, game.missionPhysics.padCoords.y + 75);
    else game.camera.position.copy(game.missionPhysics.position);
    game.camera.fov = 70; game.camera.near = 1; game.camera.far = 8000000;
    game.camera.updateProjectionMatrix();
    game.journey.updateLocalSky(game.camera);
    const target = '${world}' === 'saturn' ? game.journey.wormhole.position : game.journey.gargantuaGroup.position;
    game.camera.lookAt(target);
    game.journey.updateLocalSky(game.camera);
    game.flightHud.update(game.missionPhysics);
    game.renderer.render(game.scene, game.camera);
  })()`);
  const image = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(`.browser-${world}-review.png`, Buffer.from(image.data, 'base64'));
  console.log(`Captured ${world}`);
}
ws.close();
