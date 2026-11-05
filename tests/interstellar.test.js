import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  INTERSTELLAR_STAGES,
  createGargantuaLensingShader,
  createWormholeShader,
  createMillerOceanShader
} from '../src/flight/interstellarSimulation.js';

test('13 exploration stages exist in the exact required sequence', () => {
  assert.equal(INTERSTELLAR_STAGES.length, 13);

  const expectedIds = [
    'EARTH_ORBIT',
    'SATURN_DEPARTURE',
    'WORMHOLE_APPROACH',
    'WORMHOLE_CROSSING',
    'GARGANTUA_DISTANT',
    'GARGANTUA_INSPECT',
    'MILLER_APPROACH',
    'ATMOSPHERIC_DESCENT',
    'WATER_LANDING',
    'WAVE_DISCOVERY',
    'WAVE_ENCOUNTER',
    'EMERGENCY_ASCENT',
    'RENDEZVOUS_ORBIT'
  ];

  expectedIds.forEach((expectedId, idx) => {
    assert.equal(INTERSTELLAR_STAGES[idx].id, expectedId);
    assert.equal(INTERSTELLAR_STAGES[idx].number, idx + 1);
    assert.ok(INTERSTELLAR_STAGES[idx].title.length > 0);
    assert.ok(INTERSTELLAR_STAGES[idx].summary.length > 0);
    assert.ok(INTERSTELLAR_STAGES[idx].physicsNote.length > 0);
  });
});

test("Miller's planet reproduces the 1 hour = 7 years relativistic relationship", () => {
  const landingStage = INTERSTELLAR_STAGES.find(s => s.id === 'WATER_LANDING');
  assert.ok(landingStage);

  // 1 hour locally = 7 Earth years:
  // 7 years * 365.25 days/year * 24 hours/day = 61,362 hours (approx 61,320)
  const factor = landingStage.dilationTarget;
  assert.ok(Math.abs(factor - 61320) < 100);

  // 1 minute locally = roughly 42.6 Earth days
  const earthDaysPerLocalMin = (factor * 60) / 86400;
  assert.ok(Math.abs(earthDaysPerLocalMin - 42.58) < 0.2);

  // 1 second locally = roughly 17 Earth hours
  const earthHoursPerLocalSec = factor / 3600;
  assert.ok(Math.abs(earthHoursPerLocalSec - 17.03) < 0.2);
});

test("Miller's surface gravity is 1.3 times Earth gravity", () => {
  const earthG = 9.80665;
  const millerG = 1.3 * earthG;
  assert.ok(Math.abs(millerG - 12.75) < 0.05);

  const stage = INTERSTELLAR_STAGES.find(s => s.id === 'WATER_LANDING');
  assert.ok(stage.physicsNote.includes('1.3g') || stage.physicsNote.includes('12.75'));
});

test('Time dilation varies continuously from Earth orbit to Miller and rendezvous orbit', () => {
  const earthStage = INTERSTELLAR_STAGES.find(s => s.id === 'EARTH_ORBIT');
  const gargantuaStage = INTERSTELLAR_STAGES.find(s => s.id === 'GARGANTUA_INSPECT');
  const millerStage = INTERSTELLAR_STAGES.find(s => s.id === 'WATER_LANDING');
  const rendezvousStage = INTERSTELLAR_STAGES.find(s => s.id === 'RENDEZVOUS_ORBIT');

  // Baseline Earth is 1.0
  assert.equal(earthStage.dilationTarget, 1.0);

  // Gargantua neighborhood has modest dilation (> 1.0, < 10)
  assert.ok(gargantuaStage.dilationTarget > 1.0 && gargantuaStage.dilationTarget < 5.0);

  // Miller's surface is extreme (61,320x)
  assert.equal(millerStage.dilationTarget, 61320.0);

  // Rendezvous parking orbit experiences much less time dilation than Miller, but distinct from Earth
  assert.ok(rendezvousStage.dilationTarget > 1.0);
  assert.ok(rendezvousStage.dilationTarget < 2.0);
  assert.notEqual(rendezvousStage.dilationTarget, millerStage.dilationTarget);
});

test('Gargantua lensing shader configures shadow, disk, photon ring and Doppler controls', () => {
  const mat = createGargantuaLensingShader();
  assert.ok(mat instanceof THREE.ShaderMaterial);
  assert.ok(mat.uniforms.uShadowRadius.value > 0);
  assert.ok(mat.uniforms.uDiskInnerRadius.value > mat.uniforms.uShadowRadius.value);
  assert.ok(mat.uniforms.uDiskOuterRadius.value > mat.uniforms.uDiskInnerRadius.value);
  assert.ok(mat.uniforms.uPhotonRingWidth.value > 0 && mat.uniforms.uPhotonRingWidth.value < 1.0);
  assert.equal(mat.uniforms.uDopplerBeaming.value, 1.0);
});

test('Wormhole shader creates 3D spherical refraction uniforms', () => {
  const mat = createWormholeShader();
  assert.ok(mat instanceof THREE.ShaderMaterial);
  assert.ok(mat.uniforms.uThroatColor);
  assert.ok(mat.uniforms.uGargantuaTint);
  assert.equal(mat.transparent, true);
});

test("Miller's ocean shader models 1.2-kilometer wave crest and transparent shallows", () => {
  const mat = createMillerOceanShader();
  assert.ok(mat instanceof THREE.ShaderMaterial);
  assert.equal(mat.uniforms.uWaveHeight.value, 1200.0);
  assert.ok(mat.uniforms.uWaveWidth.value > 200.0);
  assert.ok(mat.uniforms.uWaterColorShallow);
  assert.ok(mat.uniforms.uSeabedColor);
});
