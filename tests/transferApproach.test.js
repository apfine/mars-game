import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InterplanetaryJourney } from '../src/flight/interplanetary.js';
import { createTransfer, sceneRadius } from '../src/flight/orbitalMechanics.js';
import { PLANET_PROFILES } from '../src/flight/planetProfiles.js';

for (const [from, to] of [['mars', 'earth'], ['earth', 'mars'], ['earth', 'jupiter']]) {
  test(`${from} to ${to} approach ends outside the destination globe without a path gap`, () => {
    const route = {
      routeKind: 'kepler', orbit: createTransfer(from, to),
      solarOrigin: new THREE.Vector3(), arrivalOffset: new THREE.Vector3()
    };
    const sample = (t) => InterplanetaryJourney.prototype._samplePath.call(route, t, new THREE.Vector3());
    const center = sample(1);
    const approach = sample(0.995);
    const profile = PLANET_PROFILES[to];
    const visualScale = Math.max(1, 70 / sceneRadius(profile.radius));
    const captureRadius = sceneRadius(profile.radius + profile.entryAltitude) * visualScale;
    route.arrivalOffset.subVectors(approach, center).normalize().multiplyScalar(captureRadius);
    assert.ok(Math.abs(sample(1).distanceTo(center) - captureRadius) < 1e-6);
    assert.ok(sample(0.970001).distanceTo(sample(0.97)) < 1);
    assert.ok(sample(0.999).distanceTo(center) > captureRadius);
  });
}
