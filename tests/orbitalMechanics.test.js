import test from 'node:test';
import assert from 'node:assert/strict';
import { AU, SUN_MU, SOLAR_BODIES, createTransfer, sampleTransfer, solveKepler } from '../src/flight/orbitalMechanics.js';

test('eight planets have ordered orbital distances', () => {
  assert.equal(SOLAR_BODIES.length, 8);
  SOLAR_BODIES.slice(1).forEach((b, i) => assert.ok(b.au > SOLAR_BODIES[i].au));
});
for (const [from, to] of [['earth', 'mars'], ['mars', 'earth']]) {
  test(`${from} to ${to}: endpoints, time, energy, angular momentum`, () => {
    const orbit = createTransfer(from, to);
    assert.ok(Math.abs(orbit.seconds / 86400 - 258.86) < 1);
    assert.ok(orbit.injectionDeltaV > 2400 && orbit.injectionDeltaV < 3500);
    assert.ok(orbit.arrivalRelativeSpeed > 2000 && orbit.arrivalRelativeSpeed < 3500);
    assert.ok(Number.isFinite(orbit.phaseAngle));
    const start = sampleTransfer(orbit, 0), end = sampleTransfer(orbit, 1);
    const radius = id => SOLAR_BODIES.find(b => b.id === id).au * AU;
    assert.ok(Math.abs(Math.hypot(start.x, start.z) - radius(from)) < 0.001);
    assert.ok(Math.abs(Math.hypot(end.x, end.z) - radius(to)) < 0.001);
    assert.ok(Math.abs(radius(from) * start.speed / (radius(to) * end.speed) - 1) < 1e-10);
    for (let t = 0; t <= 1; t += 0.01) {
      const p = sampleTransfer(orbit, t);
      const energy = p.speed ** 2 / 2 - SUN_MU / Math.hypot(p.x, p.z);
      assert.ok(Math.abs(energy / (-SUN_MU / (2 * orbit.a)) - 1) < 1e-10);
    }
  });
}
test('Kepler solver converges around apsides', () => {
  for (const e of [0, 0.2075, 0.7]) for (const m of [0, 0.001, 1, Math.PI, 5, Math.PI * 2]) {
    const E = solveKepler(m, e);
    assert.ok(Math.abs(E - e * Math.sin(E) - m) < 1e-10);
  }
});

test('Earth/Moon transfer uses Earth gravity and reverses the same ellipse',()=>{
  const out=createTransfer('earth','moon'), back=createTransfer('moon','earth');
  assert.equal(out.seconds,back.seconds);
  assert.ok(out.seconds/86400>4 && out.seconds/86400<6);
  assert.ok(Math.abs(Math.hypot(sampleTransfer(out,1).x,sampleTransfer(out,1).z)-384400000)<0.01);
  assert.ok(sampleTransfer(back,1).speed>sampleTransfer(back,0).speed);
  assert.ok(out.injectionDeltaV > 3000 && out.injectionDeltaV < 3300);
  assert.ok(out.arrivalRelativeSpeed > 700 && out.arrivalRelativeSpeed < 1000);
});
