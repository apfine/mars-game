import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MarsCameraController } from '../src/camera.js';
import { badgeOverlapsVehicle } from '../src/ui/hud.js';
import { universalMapState } from '../src/ui/universalMap.js';
import { MarsMap } from '../src/ui/map.js';
import { SCENE_AU } from '../src/flight/orbitalMechanics.js';

test('zoom works in chase and cockpit views and reset restores the view', () => {
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 10000);
  const controller = new MarsCameraController(camera, null);
  controller.surfaceHeight = () => -100;
  const rover = { position: new THREE.Vector3(0, 0, 0), yaw: 0, speedKmh: 0, isNitroActive: false };
  controller.update(0.1, rover);
  const nearDistance = camera.position.distanceTo(rover.position);
  controller.zoomBy(500);
  controller.update(1, rover);
  assert.ok(camera.position.distanceTo(rover.position) > nearDistance);
  controller.setRoverMode('COCKPIT');
  controller.update(1, rover);
  assert.ok(camera.fov > 65);
  controller.resetView();
  controller.update(1, rover);
  assert.equal(controller.zoomFactor, 1);
  assert.ok(camera.fov <= 65.01);
});

test('every flight camera responds to zoom', () => {
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 10000);
  const controller = new MarsCameraController(camera, null);
  controller.surfaceHeight = () => -1000;
  const physics = {
    position: new THREE.Vector3(1400, 300, 1150), boosterPosition: new THREE.Vector3(1400, 220, 1150),
    padCoords: new THREE.Vector2(1400, 1150), padGroundY: 0, padElevation: 22,
    altitude: 278, phase: 'ORBIT', boosterState: 'SEPARATED',
    vehicle: { isMated: false }, quaternion: new THREE.Quaternion(),
    yaw: 0, pitch: 0, roll: 0, mach: 0, throttle: 0, heat: 0
  };
  for (const mode of controller.flightModes) {
    controller.setFlightMode(mode);
    controller.zoomFactor = 1;
    camera.fov = 65;
    controller.updateFlight(1, physics);
    const firstFov = camera.fov;
    const firstDistance = camera.position.distanceTo(mode === 'BOOSTER_CAM' ? physics.boosterPosition : physics.position);
    controller.zoomFactor = 1.8;
    controller.updateFlight(1, physics);
    if (mode === 'GROUND_CAM' || mode === 'TOWER_CAM' || mode === 'COCKPIT') {
      assert.ok(camera.fov > firstFov, `${mode} should optically zoom`);
    } else {
      assert.ok(camera.position.distanceTo(mode === 'BOOSTER_CAM' ? physics.boosterPosition : physics.position) > firstDistance,
        `${mode} should move farther out`);
    }
  }
});

test('universal map follows the ship during transfer and switches charts at the wormhole', () => {
  const journey = {
    active: true, routeKind: 'kepler', target: 'earth', progress: 0.4,
    solarOrigin: new THREE.Vector3(100, 0, 200),
    bodyEphemeris: new Map([['earth', new THREE.Vector3(SCENE_AU, 0, 0)]])
  };
  const physics = { planetId: 'mars', position: new THREE.Vector3(100 + SCENE_AU * 1.2, 0, 200 + SCENE_AU * 0.3) };
  const transfer = universalMapState(physics, journey);
  assert.equal(transfer.chart, 'solar');
  assert.ok(Math.abs(transfer.x - 1.2) < 1e-9);
  assert.ok(Math.abs(transfer.z - 0.3) < 1e-9);
  journey.routeKind = 'wormhole'; journey.target = 'gargantua'; journey.progress = 0.7;
  assert.equal(universalMapState(physics, journey).chart, 'gargantua');
});

test('monument labels avoid the central vehicle view', () => {
  assert.equal(badgeOverlapsVehicle(400, 550, 800, 800), true);
  assert.equal(badgeOverlapsVehicle(80, 550, 800, 800), false);
  assert.equal(badgeOverlapsVehicle(400, 120, 800, 800), false);
});

test('solar and Gargantua charts render from the current location', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    const ctx = new Proxy({}, { get: (target, key) => target[key] || (() => {}) });
    const canvas = { width: 760, height: 760, getContext: () => ctx };
    const journey = {
      active: true, routeKind: 'kepler', target: 'earth', progress: 0.5,
      solarOrigin: new THREE.Vector3(), bodyEphemeris: new Map(),
      moonEphemeris: new THREE.Vector3(), arrivalVisualScale: 1,
      pathEnd: new THREE.Vector3(1000, 0, 0)
    };
    const map = Object.create(MarsMap.prototype);
    map.journey = journey;
    map.planetId = 'mars';
    const actor = { planetId: 'mars', position: new THREE.Vector3(SCENE_AU * 1.3, 0, 0), altitude: 0 };
    map.drawUniversal(canvas, actor);
    map.drawSpaceLocal(canvas, actor);
    journey.routeKind = 'wormhole'; journey.target = 'gargantua'; journey.progress = 0.7;
    map.drawUniversal(canvas, actor);
    map.drawSpaceLocal(canvas, actor);
  } finally {
    globalThis.document = previousDocument;
  }
});
