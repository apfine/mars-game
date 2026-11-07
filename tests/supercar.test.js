import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StarbaseSupercar } from '../src/vehicle/supercar.js';
import { MarsGameEngine } from '../src/game/engine.js';
import { FLIGHT_PHASES } from '../src/flight/missionPhysics.js';

test('parked supercars have distinct finishes and can be driven, exited, and reboarded', () => {
  const scene = new THREE.Scene();
  const cars = [0, 1, 2].map((i) => new StarbaseSupercar(scene, i, i * 8, 0, 0, () => 2));
  assert.equal(new Set(cars.map((car) => car.name)).size, 3);
  assert.ok(cars.every((car) => car.group.children.length > 30));
  const car = cars[0];
  car.board();
  car.updatePiloted(0.5, { throttle: 1, steer: 0.4 }, () => 2);
  assert.ok(car.speed > 0);
  assert.ok(car.group.position.z > 0);
  assert.equal(car.group.position.y, 2);
  const parked = car.disembark();
  assert.equal(car.piloted, false);
  assert.ok(parked.distanceTo(car.group.position) < 0.001);
  car.board();
  assert.equal(car.piloted, true);
});

test('boarding targets the nearest vehicle in reach and rejects distant vehicles', () => {
  const scene = new THREE.Scene();
  const car = new StarbaseSupercar(scene, 0, 20, 0, 0, () => 0);
  const game = {
    mode: 'walking',
    walker: { position: new THREE.Vector3(0, 0, 0) },
    physics: { position: new THREE.Vector3(2, 0, 0) },
    supercars: [car],
    roadster: { enabled: false },
    missionPhysics: { phase: FLIGHT_PHASES.ON_PAD, terminalPosition: new THREE.Vector3(40, 0, 0) }
  };
  assert.equal(MarsGameEngine.prototype.nearestBoardableVehicle.call(game).type, 'rover');
  game.walker.position.x = 20;
  assert.equal(MarsGameEngine.prototype.nearestBoardableVehicle.call(game).type, 'car');
  game.walker.position.x = 40;
  assert.equal(MarsGameEngine.prototype.nearestBoardableVehicle.call(game).type, 'ship');
  game.walker.position.x = 80;
  assert.equal(MarsGameEngine.prototype.nearestBoardableVehicle.call(game), null);
});
