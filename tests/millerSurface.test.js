import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMillerOcean, getMillerHeight, getMillerNormal, MILLER_PAD_X, MILLER_PAD_Y, MILLER_PAD_Z, MILLER_TIDAL_SWELL } from '../src/terrain/millerSurface.js';

test('Miller apron remains fixed while open ocean moves in proper time', () => {
  for (const t of [0, 5, 100, 5000]) {
    assert.equal(getMillerHeight(MILLER_PAD_X, MILLER_PAD_Z, t), MILLER_PAD_Y);
    assert.equal(getMillerHeight(MILLER_PAD_X + 300, MILLER_PAD_Z, t), MILLER_PAD_Y);
  }
  const x = MILLER_PAD_X + 900, z = MILLER_PAD_Z + 120;
  const h0 = getMillerHeight(x, z, 0);
  const h1 = getMillerHeight(x, z, 4);
  assert.ok(Math.abs(h1 - h0) > 0.1);
  assert.ok(Math.abs(h0 - MILLER_PAD_Y) <= MILLER_TIDAL_SWELL.amplitude + 17.5);
  const normal = getMillerNormal(x, z, 4);
  assert.ok(Math.abs(Math.hypot(normal.x, normal.y, normal.z) - 1) < 1e-12);
  assert.ok(normal.y > 0);
});

test('a tall tidal crest travels toward the apron and recurs after one local hour', () => {
  const swell = MILLER_TIDAL_SWELL;
  const point = along => ({
    x: MILLER_PAD_X + swell.direction[0] * along,
    z: MILLER_PAD_Z + swell.direction[1] * along
  });
  const initial = point(swell.initialCrestOffset);
  const approaching = point(swell.initialCrestOffset - swell.speed * 20);
  const crestNow = getMillerHeight(initial.x, initial.z, 0) - MILLER_PAD_Y;
  const crestMoved = getMillerHeight(approaching.x, approaching.z, 20) - MILLER_PAD_Y;
  const oldPositionLater = getMillerHeight(initial.x, initial.z, 20) - MILLER_PAD_Y;
  assert.ok(crestNow > 850);
  assert.ok(crestMoved > 850);
  assert.ok(oldPositionLater < crestNow * 0.3);
  const nextHour = getMillerHeight(initial.x, initial.z, swell.repeatSeconds) - MILLER_PAD_Y;
  assert.ok(nextHour > 850);
  assert.ok(Math.abs(nextHour - crestNow) < 35); // short-period chop differs
});

test('Miller ocean advances its render clock and can be disposed', () => {
  const scene = new THREE.Scene();
  const ocean = createMillerOcean(scene, { size: 1000, segments: 8 });
  assert.equal(scene.children.includes(ocean.group), true);
  ocean.update(12.5);
  assert.equal(ocean.ocean.material.uniforms.uTime.value, 12.5);
  ocean.dispose();
  assert.equal(scene.children.includes(ocean.group), false);
});
