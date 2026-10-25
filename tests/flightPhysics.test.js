import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StarshipMissionPhysics, FLIGHT_PHASES } from '../src/flight/missionPhysics.js';

function mission() {
  const vehicle = new Proxy({
    isMated: true,
    boosterGroup: new THREE.Group(), starshipGroup: new THREE.Group(), launchPadGroup: new THREE.Group(),
    setMated(value) { this.isMated = value; }
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  return new StarshipMissionPhysics(vehicle);
}
test('Earth and Mars atmosphere use their own gas properties and continuous density', () => {
  const m = mission();
  for (const planet of ['earth', 'mars']) {
    m.setPlanet(planet);
    const air = m.sampleAtmosphere(0);
    assert.ok(Math.abs(air.soundSpeed - (planet === 'earth' ? 340.2 : 231.9)) < 1);
    for (const layer of m.atmLayers.slice(0, -1)) {
      const below = m.sampleAtmosphere(layer.top - .01).density;
      const above = m.sampleAtmosphere(layer.top + .01).density;
      assert.ok(Math.abs(below / above - 1) < .00001);
    }
  }
});
for (const planet of ['earth', 'mars']) {
  test(`${planet}: entry starts hypersonic, finite dynamics and reaches recovery`, () => {
    const m = mission();
    m.enterPlanetEntry(planet);
    assert.equal(m.heat, 0);
    assert.ok(m.velocity.length() > 3000);
    const phases = new Set();
    let maxHeat = 0;
    for (let i = 0; i < 60 * 1800; i++) {
      m.update(1 / 60);
      phases.add(m.phase);
      maxHeat = Math.max(maxHeat, m.heat);
      assert.ok(Number.isFinite(m.position.length() + m.velocity.length()));
      if (m.phase === FLIGHT_PHASES.LANDED) break;
    }
    assert.ok(phases.has(FLIGHT_PHASES.BELLYFLOP));
    assert.ok(phases.has(FLIGHT_PHASES.LANDING_FLIP));
    assert.ok(phases.has(FLIGHT_PHASES.LANDED));
    assert.ok(phases.has(FLIGHT_PHASES.TOUCHDOWN));
    assert.equal(m.shipCaughtByTower, true);
    assert.ok(maxHeat > 0.1);
  });
}

for (const planet of ['earth', 'mars']) {
  test(`${planet}: automated launch separates and reaches orbit`, () => {
    const m = mission();
    m.setPlanet(planet);
    m.startLaunch();
    const phases = new Set();
    for (let i = 0; i < 60 * 1200; i++) {
      m.update(1 / 60);
      phases.add(m.phase);
      assert.ok(Number.isFinite(m.position.length() + m.velocity.length()));
      if (m.phase === FLIGHT_PHASES.ORBIT) break;
    }
    assert.ok(phases.has(FLIGHT_PHASES.BOOSTER_ASCENT));
    assert.ok(phases.has(FLIGHT_PHASES.STARSHIP_ASCENT));
    assert.ok(phases.has(FLIGHT_PHASES.ORBIT), `ended ${m.phase}, altitude ${m.altitude}`);
    assert.equal(m.vehicle.isMated, false);
  });
}
