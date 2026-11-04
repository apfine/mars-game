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
    let terminalSamples = 0;
    let previousPosition = m.position.clone();
    for (let i = 0; i < 60 * 1800; i++) {
      m.update(1 / 60);
      phases.add(m.phase);
      maxHeat = Math.max(maxHeat, m.heat);
      assert.ok(Number.isFinite(m.position.length() + m.velocity.length()));
      const height = m.position.y - m.shipCatchBaseY;
      if (height >= 0 && height < 12 && m.phase !== FLIGHT_PHASES.LANDED) {
        terminalSamples++;
        assert.ok(Math.hypot(m.position.x - m.shipCatchCoords.x, m.position.z - m.shipCatchCoords.y) < 2,
          `${planet} ship is beside the arms during final descent`);
        assert.ok(m.position.distanceTo(previousPosition) < 1,
          `${planet} ship jumps during final descent`);
      }
      if (m.shipCaughtByTower) assert.ok(m.position.distanceTo(previousPosition) < 1,
        `${planet} ship jumps into the catch`);
      previousPosition.copy(m.position);
      if (m.phase === FLIGHT_PHASES.LANDED) break;
    }
    assert.ok(phases.has(FLIGHT_PHASES.BELLYFLOP));
    assert.ok(phases.has(FLIGHT_PHASES.LANDING_FLIP));
    assert.ok(phases.has(FLIGHT_PHASES.LANDED));
    assert.ok(phases.has(FLIGHT_PHASES.TOUCHDOWN));
    assert.equal(m.shipCaughtByTower, true);
    assert.ok(terminalSamples > 5);
    assert.ok(maxHeat > 0.1);
  });
}

test('Moon vacuum landing uses propulsion and reaches the catch without plasma', () => {
  const m=mission();m.enterPlanetEntry('moon');
  assert.equal(m.sampleAtmosphere(0).density,0);
  assert.equal(m.sampleAtmosphere(0).wind.length(),0);
  assert.equal(m.phase,FLIGHT_PHASES.LANDING_FLIP);
  for(let i=0;i<60*1200 && m.phase!==FLIGHT_PHASES.LANDED;i++)m.update(1/60);
  assert.equal(m.phase,FLIGHT_PHASES.LANDED);
  assert.equal(m.shipCaughtByTower,true);
  assert.equal(m.heat,0);
});

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
    let boosterTerminalSamples=0;
    let previousBooster=m.boosterPosition.clone();
    for(let i=0;i<60*1200 && m.boosterState!=='CAUGHT';i++) {
      m.update(1/60);
      const height=m.boosterPosition.y-m.boosterCatchBaseY;
      if(height>=0 && height<12 && m.boosterState!=='CAUGHT') {
        boosterTerminalSamples++;
        assert.ok(Math.hypot(m.boosterPosition.x-m.boosterCatchCoords.x,m.boosterPosition.z-m.boosterCatchCoords.y)<2,
          `${planet} booster is beside the arms during final descent`);
        assert.ok(m.boosterPosition.distanceTo(previousBooster)<1,
          `${planet} booster jumps during final descent`);
      }
      if(m.boosterState==='CAUGHT') assert.ok(m.boosterPosition.distanceTo(previousBooster)<1,
        `${planet} booster jumps into the catch`);
      previousBooster.copy(m.boosterPosition);
    }
    assert.equal(m.boosterState,'CAUGHT',`${planet} booster ended ${m.boosterState}`);
    assert.ok(boosterTerminalSamples>5);
  });
}
