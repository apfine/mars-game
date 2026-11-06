import test from 'node:test';
import assert from 'node:assert/strict';
import { GARGANTUA_SCHWARZSCHILD_RADIUS_M, MILLER_DISTANT_SECONDS_PER_LOCAL_SECOND, distantElapsedSeconds, missionRoute, transferKind, wormholeTransit } from '../src/flight/relativity.js';
import { createTransfer } from '../src/flight/orbitalMechanics.js';

test('Miller clock conversion is confined to Miller', () => {
  assert.equal(MILLER_DISTANT_SECONDS_PER_LOCAL_SECOND, 61362);
  assert.equal(distantElapsedSeconds(3600, 'miller'), 7 * 365.25 * 86400);
  assert.equal(distantElapsedSeconds(3600, 'gargantua'), 3600);
  assert.ok(GARGANTUA_SCHWARZSCHILD_RADIUS_M > 2.9e11 && GARGANTUA_SCHWARZSCHILD_RADIUS_M < 3e11);
});

test('wormhole route passes Saturn and is reversible', () => {
  assert.deepEqual(missionRoute('earth', 'miller'), ['mars', 'saturn', 'gargantua', 'miller']);
  assert.deepEqual(missionRoute('earth', 'neptune'), ['mars', 'saturn', 'neptune']);
  assert.deepEqual(missionRoute('miller', 'earth'), ['gargantua', 'saturn', 'earth']);
  assert.equal(transferKind('saturn', 'gargantua'), 'wormhole');
  assert.equal(transferKind('gargantua', 'miller'), 'gargantua-local');
});

test('wormhole transit approaches the mouth, holds, then emerges', () => {
  assert.equal(wormholeTransit(0).phase, 'approach');
  assert.equal(wormholeTransit(0).along, 0);
  assert.equal(wormholeTransit(0.5).phase, 'throat');
  assert.equal(wormholeTransit(0.5).along, 1);
  assert.equal(wormholeTransit(1).phase, 'emergence');
  assert.ok(wormholeTransit(1).along > 1.99);
  assert.ok(wormholeTransit(0.2).along < wormholeTransit(0.4).along);
});

test('every destination route uses injection legs within a 94% Starship tank', () => {
  const worlds = ['mercury','venus','earth','moon','mars','jupiter','saturn','uranus','neptune','gargantua','miller'];
  for (const from of worlds) for (const to of worlds) {
    let current = from;
    for (const next of missionRoute(from, to)) {
      if (transferKind(current, next) === 'kepler') {
        const deltaV = createTransfer(current, next).injectionDeltaV;
        const neededPercent = Math.ceil(((156000 * Math.exp(deltaV / (378 * 9.80665)) - 120000) / 1200000) * 100);
        assert.ok(neededPercent <= 94, `${from} to ${to}: ${current} to ${next} needs ${neededPercent}%`);
      }
      current = next;
    }
  }
});
