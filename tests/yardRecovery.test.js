import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StarbaseOperations } from '../src/flight/starbaseOperations.js';
import { StarbaseObstacleSystem } from '../src/flight/solidCollisions.js';
import { STARBASE_LAYOUT as L } from '../src/flight/starbaseLayout.js';
import { AU, SCENE_AU, sceneRadius } from '../src/flight/orbitalMechanics.js';
import { earthSurfaceHeight } from '../src/terrain/earthSurface.js';
import { StarshipMissionVehicle } from '../src/flight/starship.js';

test('planet radius/distance ratio preserves physical angular sizes', () => {
  assert.ok(Math.abs(sceneRadius(6371000)/SCENE_AU-6371000/AU)<1e-12);
  const marsDiameter = 2*Math.atan(sceneRadius(3389500)/(0.52*SCENE_AU))*180/Math.PI;
  assert.ok(marsDiameter < 0.01, 'Mars must be an unresolved dot from Earth');
});
test('Earth surface has a flat pad and a submerged seabed', () => {
  assert.equal(earthSurfaceHeight(0,0),0);
  assert.ok(earthSurfaceHeight(6000,0)<-3);
  assert.ok(earthSurfaceHeight(-3000,0)>0);
});
test('bay walls, doors, lintels and ramps match shared geometry', () => {
  const o = new StarbaseObstacleSystem(new THREE.Vector2(0,0));
  const p = new THREE.Vector3(195,0,192.5);
  assert.equal(o.resolve(p,8.5,1.21,55),null);
  o.setGate('ship',0);
  assert.ok(o.resolve(p,8.5,1.21,55));
  o.setGate('ship',1);
  assert.ok(o.resolve(new THREE.Vector3(195,100,192.5),1,100,1));
  assert.equal(o.supportHeight(195,240,0),L.factory.slabTop);
  assert.ok(o.supportHeight(195,180,0)>0);
});
for (const planet of ['earth','mars','moon']) {
  test(`${planet}: rig, lower, steer and park through the gate without teleporting`, () => {
    const pad = new THREE.Vector2(1400,1150), ground = 37;
    const p = { planetId: planet, padCoords: pad, padGroundY: ground, phase: 'LANDED',
      position: new THREE.Vector3(pad.x+L.shipCatch.x,ground+L.shipCatch.baseY,pad.y+L.shipCatch.z),
      quaternion: new THREE.Quaternion(), boosterPosition: new THREE.Vector3(), boosterQuaternion: new THREE.Quaternion(),
      boosterState: 'CAUGHT', shipArmY: L.shipTower.armY };
    const vehicle = new Proxy({ boosterGroup: {visible:false},
      crawlers: {ship:{group:new THREE.Group(),loadY:4.7}},
      setReviewScan() {}, setShipChopsticks() {}
    }, {get:(t,k)=>k in t?t[k]:()=>{}});
    const ops = new StarbaseOperations(p,vehicle);
    const prev = p.position.clone(), stages = new Set();
    for (let i=0;i<60*600;i++) {
      ops.update(1/60); stages.add(ops.ship.stage);
      assert.ok(p.position.distanceTo(prev)<0.2,'load teleported'); prev.copy(p.position);
      if(ops.state==='SERVICED')break;
    }
    assert.equal(ops.state,'SERVICED',ops.message+` at ${p.position.x-pad.x},${p.position.z-pad.y}`);
    assert.equal(ops.booster.stage,'DONE','off-world booster must stay behind');
    for (const stage of ['RIG','LOWER','RELEASE','DRIVE','PARK','DONE']) assert.ok(stages.has(stage));
    assert.ok(Math.abs(p.position.x-pad.x-195)<0.1);
    assert.ok(Math.abs(p.position.z-pad.y-240)<0.1);
  });
}

test('local booster follows its own gate lane and remains solid on the slab',()=>{
  const pad=new THREE.Vector2(1400,1150),ground=30;
  const p={padCoords:pad,padGroundY:ground,phase:'LANDED',position:new THREE.Vector3(pad.x+129.5,ground+52,pad.y-92),
    quaternion:new THREE.Quaternion(),boosterPosition:new THREE.Vector3(pad.x-144.5,ground+19.5,pad.y+86),
    boosterQuaternion:new THREE.Quaternion(),boosterState:'CAUGHT',shipArmY:83.8,boosterArmY:85};
  const vehicle=new Proxy({boosterGroup:{visible:true},crawlers:{ship:{group:new THREE.Group(),loadY:4.7},booster:{group:new THREE.Group(),loadY:4.7}}},
    {get:(t,k)=>k in t?t[k]:()=>{}});
  const ops=new StarbaseOperations(p,vehicle);
  for(let i=0;i<60*600&&ops.state!=='SERVICED';i++)ops.update(1/60);
  assert.equal(ops.state,'SERVICED',ops.message);
  assert.ok(Math.abs(p.boosterPosition.x-pad.x-105)<.1);
  assert.ok(Math.abs(p.boosterPosition.y-ground-4.7-L.factory.slabTop)<.1);
});

test('crane jaw contacts coincide with lifting lugs in world coordinates',()=>{
  const pad=new THREE.Group();pad.position.set(1400,37,1150);
  const yaw=new THREE.Group();yaw.position.set(L.shipTower.x,L.shipTower.height+4.2,L.shipTower.z);pad.add(yaw);
  const trolley=new THREE.Group();trolley.position.y=3.2;yaw.add(trolley);
  const clamp=new THREE.Group(),cable=new THREE.Object3D();trolley.add(clamp,cable);
  const crane={yaw,trolley,clamp,cable,pivotY:L.shipTower.height+4.2,boomLength:66,clampLampMat:{color:new THREE.Color()}};
  const vehicle={launchPadGroup:pad,cranes:{ship:crane},setCranePose:StarshipMissionVehicle.prototype.setCranePose};
  const hook=new THREE.Vector3(1400+L.shipCatch.x,37+L.shipCatch.baseY+35+3,1150+L.shipCatch.z);
  StarshipMissionVehicle.prototype.setCraneTarget.call(vehicle,'ship',hook,true);
  pad.updateMatrixWorld(true);
  for(const side of [-1,1]) {
    const contact=clamp.localToWorld(new THREE.Vector3(side*4.8,-3,0));
    const lug=new THREE.Vector3(hook.x+side*4.8,hook.y-3,hook.z);
    assert.ok(contact.distanceTo(lug)<1e-6);
  }
});
