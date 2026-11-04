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
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map(a=>a.value||a.description||'').join(' ')+' '+JSON.stringify(m.params.stackTrace?.callFrames.slice(0,5)));
    const object=m.params.args.find(a=>a.objectId);
    if(object) call('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){return {type:this.type,parameters:this.parameters}}',returnByValue:true}).then(r=>console.log('Geometry diagnostic',r.result?.value));
  }
});
function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { return (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value; }
const delay = ms => new Promise(r => setTimeout(r, ms));
await call('Runtime.enable'); await call('Log.enable');
await call('Runtime.discardConsoleEntries'); await call('Log.clear'); errors.length=0;
await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await call('Page.navigate', { url: process.env.TEST_URL || 'http://localhost:3000' });
for (let i = 0; i < 45; i++) {
  await delay(1000);
  if (await evaluate(`!!document.querySelector('canvas') && !document.getElementById('mars-loading-screen')`)) break;
}
// Exercise the real launch event and render the flight scene.
assert.equal(await evaluate(`Array.from(document.querySelectorAll('.compact-drive-pad button')).filter(b=>b.getBoundingClientRect().width>0).length`),4);
await evaluate(`document.getElementById('btn-launch-mobile').click()`);
await delay(3000);
assert.equal(await evaluate(`Array.from(document.querySelectorAll('.flight-touch-dpad button')).filter(b=>b.getBoundingClientRect().width>0).length`),6);
const shot = await call('Page.captureScreenshot', { format: 'png' });
await writeFile('.browser-phone.png', Buffer.from(shot.data, 'base64'));
for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1280, 800]]) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 900 });
  await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await delay(500);
  const controls = await evaluate(`['flight-cam-btn','flight-mission-btn','flight-actions-btn','flight-auto-btn'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,left:r.left,right:r.right,height:r.height}})`);
  for (const c of controls) {
    assert.ok(c.left >= 0 && c.right <= width + 1, `${width}px: ${c.id} overflows (${c.left}..${c.right})`);
    assert.ok(c.height >= 36, `${c.id} is too small`);
  }
  console.log(`Layout ${width} x ${height}: pass`);
}
await evaluate(`(()=>{const g=document.querySelector('canvas').game;g.roadster.board(g.physics.position,g.physics.yaw);g.setMode('roadster')})()`);
assert.equal(await evaluate(`Array.from(document.querySelectorAll('.compact-drive-pad button')).filter(b=>b.getBoundingClientRect().width>0).length`),6);
await call('Emulation.setTouchEmulationEnabled', { enabled: false });
await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
assert.equal(await evaluate(`getComputedStyle(document.getElementById('mobile-controls')).display`),'none');
await evaluate(`document.querySelector('canvas').game.setMode('starship')`);
assert.equal(await evaluate(`getComputedStyle(document.getElementById('flight-mobile-steering')).display`),'none');
console.log('Touch controls: rover 4, flight 6, roadster 6; desktop hidden');
const transferResults = await evaluate(`(() => {
  const g=document.querySelector('canvas').game,p=g.missionPhysics;
  cancelAnimationFrame(g.animId);g.operations.reset();p.yardControl=false;
  const results=[];
  p.setPlanet('earth');g.applyPlanetEnvironment('earth');
  for(const target of ['mars','earth','moon','earth']) {
    p.phase='ORBIT';p.scriptedControl=false;p.yardControl=false;p.autoMission=true;
    g.selectDestination(target);g.beginTransfer();g.ensureTransferStarted();
    const started=g.journey.active;
    for(let i=0;i<100 && g.journey.active;i++)g.journey.update(1,3,200000);
    const arrivedPhase=p.phase,boosterVisible=g.starship.boosterGroup.visible;
    if(target==='earth'){
      g.cameraController.setFlightMode('FREE_ORBIT');
      g.cameraController.adjustGimbal(0.8,0.9);
      g.beginDeorbit();
    }
    results.push({target,started,arrived:p.planetId,phase:arrivedPhase,boosterVisible,
      afterDeorbit:target==='earth'?p.phase:null,
      entryCamera:target==='earth'?g.cameraController.getFlightMode():null,
      entryPitch:target==='earth'?g.cameraController.gimbalPitch:null});
  }
  return results;
})()`);
for(const r of transferResults) { assert.equal(r.started,true);assert.equal(r.arrived,r.target); }
for(const r of transferResults) assert.equal(r.boosterVisible,false);
for(const r of transferResults.filter(r=>r.target==='earth')) {
  assert.equal(r.phase,'ORBIT');
  assert.equal(r.afterDeorbit,'HYPERSONIC_ENTRY');
  assert.equal(r.entryCamera,'CHASE');
  assert.equal(r.entryPitch,0);
}
console.log('Round trip and lunar transfers',transferResults);
await evaluate(`(() => {
  const g=document.querySelector('canvas').game, p=g.missionPhysics;
  cancelAnimationFrame(g.animId); g.operations.reset(); p.setPlanet('earth'); g.applyPlanetEnvironment('earth');
  p.resetToPad(); g.setMode('starship');
  g.camera.position.set(p.padCoords.x+120,p.padGroundY+95,p.padCoords.y+160);
  g.camera.lookAt(p.padCoords.x,p.padGroundY+45,p.padCoords.y);
  g.atmosphere.setAltitude(100); g.atmosphere.update(1/60,g.camera.position,{altitude:100,speed:0});
  g.starship.updateLOD(g.camera.position);
  g.renderer.render(g.scene,g.camera);
})()`);
await delay(1000);
await writeFile('.browser-earth-ground.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
await evaluate(`(() => {
  const g=document.querySelector('canvas').game,p=g.missionPhysics;
  g.camera.position.set(p.padCoords.x,p.padElevation+400000,p.padCoords.y+160000);
  g.camera.lookAt(p.padCoords.x,p.padGroundY,p.padCoords.y);
  g.journey.update(0,1,400000); g.atmosphere.setAltitude(400000);
  g.atmosphere.update(1/60,g.camera.position,{altitude:400000,speed:0});
  g.journey.updateLocalSky(g.camera);
  g.renderer.render(g.scene,g.camera);
})()`);
await delay(1000);
await writeFile('.browser-earth-space.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const angles=await evaluate(`(()=>{const g=document.querySelector('canvas').game,j=g.journey;const diameter=m=>2*Math.atan(m.geometry.parameters.radius*m.scale.x/m.position.distanceTo(g.camera.position))*180/Math.PI;return {mars:diameter(j.marsGlobe),moon:diameter(j.moon)}})()`);
assert.ok(angles.mars<.01);assert.ok(angles.moon>.4 && angles.moon<.6);
console.log('Apparent sizes from Earth',angles);
const boosterPlasmaVisible=await evaluate(`(() => {
  const g=document.querySelector('canvas').game,p=g.missionPhysics;
  p.setPlanet('earth');g.applyPlanetEnvironment('earth');
  g.starship.boosterGroup.visible=true;
  g.starship.boosterGroup.position.set(p.boosterCatchCoords.x,p.padGroundY+180,p.boosterCatchCoords.y);
  g.starship.boosterGroup.quaternion.identity();
  g.starship.setBoosterReentryHeat(1,1);
  g.camera.position.set(p.boosterCatchCoords.x+115,p.padGroundY+225,p.boosterCatchCoords.y+120);
  g.camera.lookAt(p.boosterCatchCoords.x,p.padGroundY+215,p.boosterCatchCoords.y);
  g.atmosphere.setAltitude(225);
  g.atmosphere.update(1/60,g.camera.position,{altitude:225,speed:0});
  g.renderer.render(g.scene,g.camera);
  return g.starship.boosterPlasma.visible;
})()`);
assert.equal(boosterPlasmaVisible,true);
await writeFile('.browser-booster-plasma.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
console.log('errors', [...new Set(errors)]);
const landingView=await evaluate(`(() => {
  const g=document.querySelector('canvas').game,p=g.missionPhysics;
  p.enterPlanetEntry('earth');g.cameraController.setFlightMode('CHASE');g.cameraController.resetGimbal();
  let steps=0;while(steps<90000 && (p.altitude>150 || p.phase==='HYPERSONIC_ENTRY')){p.update(1/60);steps++}
  g.cameraController.updateFlight(1/60,p);g.atmosphere.setAltitude(150);
  g.atmosphere.update(1/60,g.camera.position,{altitude:150,speed:p.speed});
  g.starship.updateLOD(g.camera.position);g.renderer.render(g.scene,g.camera);
  return {phase:p.phase,altitude:p.altitude,position:p.position.toArray(),camera:g.camera.position.toArray(),shipVisible:g.starship.starshipGroup.visible,steps};
})()`);
await writeFile('.browser-earth-landing.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
console.log('landingView',landingView);
assert.equal(landingView.phase,'LANDING_FLIP');
assert.equal(landingView.shipVisible,true);
assert.ok(Math.hypot(...landingView.camera.map((n,i)=>n-landingView.position[i]))<150);
ws.close();
if (errors.some(e => e.startsWith('Uncaught') || e.includes('THREE.') || e.includes('VALIDATE_STATUS'))) process.exitCode = 1;
