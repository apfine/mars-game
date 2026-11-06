import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StarshipMissionPhysics, FLIGHT_PHASES } from '../src/flight/missionPhysics.js';
import { getMillerHeight } from '../src/terrain/millerSurface.js';

test('Miller ocean impact is a mission loss', () => {
  const vehicle = new Proxy({
    isMated: false,
    boosterGroup: new THREE.Group(), starshipGroup: new THREE.Group(), launchPadGroup: new THREE.Group(),
    setMated(value) { this.isMated = value; }
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const mission = new StarshipMissionPhysics(vehicle);
  mission.setPlanet('miller');
  mission.vehicle.setMated(false);
  mission.autoMission = false;
  mission.phase = FLIGHT_PHASES.HYPERSONIC_ENTRY;
  const x = mission.padCoords.x + 900, z = mission.padCoords.y;
  mission.position.set(x, getMillerHeight(x, z, 0) + .1, z);
  mission.velocity.set(0, -20, 0);
  mission.update(1 / 60);
  assert.equal(mission.phase, FLIGHT_PHASES.CRASHED);
  assert.match(mission.opsMessage, /OCEAN IMPACT/);
});

test('Miller entry reaches its raft on landing legs without a hidden tower catch', () => {
  const vehicle = new Proxy({
    isMated: true,
    boosterGroup: new THREE.Group(), starshipGroup: new THREE.Group(), launchPadGroup: new THREE.Group(),
    setMated(value) { this.isMated = value; }
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const mission = new StarshipMissionPhysics(vehicle);
  mission.starshipFuel = 42;
  mission.enterPlanetEntry('miller', { preserveFuel: true });
  assert.equal(mission.starshipFuel, 42);
  for (let i = 0; i < 60 * 1200 && !['LANDED', 'CRASHED'].includes(mission.phase); i++) {
    mission.update(1 / 60);
  }
  assert.equal(mission.phase, FLIGHT_PHASES.LANDED);
  assert.equal(mission.shipCaughtByTower, false);
  assert.equal(mission.landingLegsDeployed, true);
  assert.ok(Math.hypot(mission.position.x - mission.padCoords.x,
    mission.position.z - mission.padCoords.y) < 2);
  assert.ok(mission.starshipFuel < 42);
});
