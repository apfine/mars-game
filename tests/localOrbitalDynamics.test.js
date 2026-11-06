import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { localCentralAcceleration, localOrbitElements } from '../src/flight/localOrbitalDynamics.js';

test('circular velocity balances radial gravity for any world profile', () => {
  for (const [radius, gravity, altitude] of [
    [3389500, 3.721, 84000],
    [6371000, 9.80665, 140000],
    [1737400, 1.625, 20000],
    [2439700, 3.7, 100000],
    [6051800, 8.87, 250000],
    [69911000, 24.8, 500000],
    [58232000, 10.44, 500000],
    [25362000, 8.69, 500000],
    [24622000, 11.15, 500000]
  ]) {
    const speed = Math.sqrt(gravity * radius * radius / (radius + altitude));
    const velocity = new THREE.Vector3(speed, 0, 0);
    const acceleration = localCentralAcceleration(radius, gravity, altitude, velocity, new THREE.Vector3());
    const orbit = localOrbitElements(radius, gravity, altitude, velocity);
    assert.ok(Math.abs(acceleration.y) < 1e-12);
    assert.ok(Math.abs(orbit.apoapsis - altitude) < 1e-7);
    assert.ok(Math.abs(orbit.periapsis - altitude) < 1e-7);
  }
});

test('a Jupiter circular coast stays at altitude under a 1.5 s orbit step', () => {
  const radius = 69911000;
  const gravity = 24.8;
  const start = 500000;
  let altitude = start;
  const speed = Math.sqrt(gravity * radius * radius / (radius + altitude));
  const velocity = new THREE.Vector3(0, 0, speed);
  const acceleration = new THREE.Vector3();
  for (let step = 0; step < 40; step++) {
    localCentralAcceleration(radius, gravity, altitude, velocity, acceleration);
    velocity.addScaledVector(acceleration, 1.5);
    altitude += velocity.y * 1.5;
  }
  assert.ok(Math.abs(altitude - start) < 1);
  assert.ok(Math.abs(velocity.y) < 0.01);
  assert.ok(Math.abs(velocity.z - speed) < 0.01);
});

test('radial climb reduces tangent speed and keeps angular momentum', () => {
  const radius = 3389500, altitude = 100000;
  const velocity = new THREE.Vector3(3300, 1000, 0);
  const acceleration = localCentralAcceleration(radius, 3.721, altitude, velocity, new THREE.Vector3());
  assert.ok(acceleration.x < 0);
  const r = radius + altitude;
  assert.ok(Math.abs(r * acceleration.x + velocity.y * velocity.x) < 1e-6);
});
