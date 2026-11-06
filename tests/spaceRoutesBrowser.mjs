// Manual browser smoke test. Run with `npm run dev` and Chrome remote debugging
// on port 9222; it exercises the real Three.js scene and route callbacks.
import assert from 'node:assert/strict';

const tabs = await (await fetch('http://localhost:9222/json')).json();
const page = tabs.find(tab => tab.type === 'page');
assert.ok(page, 'Chrome page is available');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
await call('Runtime.enable');
await call('Page.navigate', { url: 'http://localhost:3000' });
let loaded = false;
for (let i = 0; i < 90; i++) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  loaded = await evaluate('Boolean(document.querySelector("canvas")?.game)');
  if (loaded) break;
}
assert.ok(loaded, `game initialized: ${errors.join(' | ')}`);
const result = await evaluate(`(() => {
  const game = document.querySelector('canvas').game;
  cancelAnimationFrame(game.animId);
  game.setMode('starship');
  const physics = game.missionPhysics;
  physics.enterPlanetOrbit('saturn');
  game.applyPlanetEnvironment('saturn');
  game.selectDestination('gargantua');
  game.beginTransfer();
  game.ensureTransferStarted();
  const wormhole = game.journey.routeKind;
  for (let step = 0; step < 8 && physics.planetId !== 'gargantua'; step++) game.journey.update(8, 1, 500000);
  const atGargantua = physics.planetId;
  const saturnHiddenAtGargantua = !game.journey.celestialGroup.visible &&
    !game.atmosphere.postLaunchSpace.group.visible;
  game.selectDestination('miller');
  game.beginTransfer();
  game.ensureTransferStarted();
  const localRoute = game.journey.routeKind;
  game.journey.update(24, 1, 100000);
  game.millerOcean.update(physics.localSurfaceTime);
  game.journey.updateLocalSky(game.camera);
  game.renderer.render(game.scene, game.camera);
  const atMiller = physics.planetId;
  const oceanVisible = game.millerOcean.group.visible;
  physics.enterPlanetOrbit('earth');
  game.applyPlanetEnvironment('earth');
  physics.starshipFuel = 94;
  game.pendingRoute = [];
  game.selectDestination('venus');
  game.beginTransfer();
  game.ensureTransferStarted();
  const departureError = game.journey.pathStart.distanceTo(physics.position);
  game.journey.updateLocalSky(game.camera);
  const venusMarkerVisible = game.journey.navigationMarkers.get('venus').visible;
  const initialFuel = physics.starshipFuel;
  game.journey.update(3, 1, 120000);
  let burnSteps = 0;
  while (game.journey.transferStage !== 'COAST' && burnSteps++ < 200) game.journey.update(1, 1, 120000);
  const burnResult = { stage: game.journey.transferStage, fuelUsed: initialFuel - physics.starshipFuel,
    achieved: game.journey.burnDeltaV, required: game.journey.orbit.injectionDeltaV };
  game.journey.update(1, 1, 120000);
  const cruiseProgress = game.journey.progress;
  game.journey.progress = 0.9995;
  game.journey.update(0.01, 1, 120000);
  const encounterDistanceKm = Math.round(game.journey.physics.position.distanceTo(
    game.journey.solarBodies.get('venus').position) / 180000 * 149597870.7);
  return { wormhole, atGargantua, saturnHiddenAtGargantua, localRoute, atMiller,
    oceanVisible,
    clock: Boolean(document.getElementById('relativity-clock')),
    departureError, venusMarkerVisible, burnResult, cruiseProgress, encounterDistanceKm };
})()`);
assert.equal(result.wormhole, 'wormhole');
assert.equal(result.atGargantua, 'gargantua');
assert.equal(result.saturnHiddenAtGargantua, true);
assert.equal(result.localRoute, 'gargantua-local');
assert.equal(result.atMiller, 'miller');
assert.equal(result.oceanVisible, true);
assert.equal(result.clock, true);
assert.ok(result.departureError < 1, 'inward transfer starts at the departing ship');
assert.equal(result.venusMarkerVisible, true);
assert.equal(result.burnResult.stage, 'COAST');
assert.ok(result.burnResult.fuelUsed > 0);
assert.ok(result.burnResult.achieved >= result.burnResult.required);
assert.ok(result.cruiseProgress > 0);
assert.ok(result.encounterDistanceKm < 100000, 'destination grows into view before encounter');
assert.deepEqual(errors, []);
console.log('Space route browser check passed:', result);
ws.close();
