// SI units. Circular, coplanar patched-conic navigation model.
export const AU = 149597870700;
export const SUN_MU = 1.32712440018e20;
export const EARTH_MU = 3.986004418e14;
export const MOON_ORBIT_RADIUS = 384400000;
export const SCENE_AU = 180000;
export function sceneRadius(metres) { return metres / AU * SCENE_AU; }
export const SOLAR_BODIES = [
  { id: 'mercury', au: 0.3871, radius: 2439700, color: 0xa99c8c },
  { id: 'venus', au: 0.7233, radius: 6051800, color: 0xe6c58c },
  { id: 'earth', au: 1, radius: 6371000, color: 0x347ec1 },
  { id: 'mars', au: 1.523679, radius: 3389500, color: 0xc27953 },
  { id: 'jupiter', au: 5.2026, radius: 69911000, color: 0xd3b18e },
  { id: 'saturn', au: 9.5549, radius: 58232000, color: 0xd8c49a },
  { id: 'uranus', au: 19.2184, radius: 25362000, color: 0x9cdde0 },
  { id: 'neptune', au: 30.1104, radius: 24622000, color: 0x436ed0 }
];
export function solveKepler(meanAnomaly, eccentricity) {
  let e = meanAnomaly;
  for (let i = 0; i < 8; i++) {
    e -= (e - eccentricity * Math.sin(e) - meanAnomaly) / (1 - eccentricity * Math.cos(e));
  }
  return e;
}
export function createTransfer(from, to) {
  if ((from === 'earth' && to === 'moon') || (from === 'moon' && to === 'earth')) {
    const departureRadius = from === 'moon' ? MOON_ORBIT_RADIUS : 6571000;
    const arrivalRadius = to === 'moon' ? MOON_ORBIT_RADIUS : 6571000;
    return makeHohmannTransfer(departureRadius, arrivalRadius, EARTH_MU, true, from, to);
  }
  from = from === 'moon' ? 'earth' : from;
  to = to === 'moon' ? 'earth' : to;
  const r1 = SOLAR_BODIES.find(b => b.id === from).au * AU;
  const r2 = SOLAR_BODIES.find(b => b.id === to).au * AU;
  return makeHohmannTransfer(r1, r2, SUN_MU, false, from, to);
}
function makeHohmannTransfer(departureRadius, arrivalRadius, mu, lunar, from, to) {
  const a = (departureRadius + arrivalRadius) / 2;
  const e = Math.abs(arrivalRadius - departureRadius) / (arrivalRadius + departureRadius);
  const seconds = Math.PI * Math.sqrt(a ** 3 / mu);
  const transferSpeed = r => Math.sqrt(mu * (2 / r - 1 / a));
  const circularSpeed = r => Math.sqrt(mu / r);
  const targetRate = lunar
    ? Math.sqrt(EARTH_MU / MOON_ORBIT_RADIUS ** 3)
    : Math.sqrt(mu / arrivalRadius ** 3);
  return {
    a, e, mu, inward: departureRadius > arrivalRadius, lunar, from, to, seconds,
    departureRadius, arrivalRadius,
    injectionDeltaV: Math.abs(transferSpeed(departureRadius) - circularSpeed(departureRadius)),
    arrivalRelativeSpeed: Math.abs(transferSpeed(arrivalRadius) - circularSpeed(arrivalRadius)),
    phaseAngle: Math.PI - targetRate * seconds
  };
}
export function sampleTransfer(orbit, t) {
  const M = (orbit.inward ? Math.PI : 0) + Math.min(1, Math.max(0, t)) * Math.PI;
  const E = solveKepler(M, orbit.e);
  const x = orbit.a * (Math.cos(E) - orbit.e);
  const z = orbit.a * Math.sqrt(1 - orbit.e ** 2) * Math.sin(E);
  const r = Math.hypot(x, z);
  return { x, z, speed: Math.sqrt((orbit.mu || SUN_MU) * (2 / r - 1 / orbit.a)) };
}
export function orbitalRate(au) { return Math.sqrt(SUN_MU / (au * AU) ** 3); }
