// SI units. Circular, coplanar patched-conic navigation model.
export const AU = 149597870700;
export const SUN_MU = 1.32712440018e20;
export const SCENE_AU = 180000;
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
  const r1 = SOLAR_BODIES.find(b => b.id === from).au * AU;
  const r2 = SOLAR_BODIES.find(b => b.id === to).au * AU;
  const a = (r1 + r2) / 2;
  const e = Math.abs(r2 - r1) / (r1 + r2);
  return { a, e, inward: r1 > r2, seconds: Math.PI * Math.sqrt(a ** 3 / SUN_MU) };
}
export function sampleTransfer(orbit, t) {
  const M = (orbit.inward ? Math.PI : 0) + Math.min(1, Math.max(0, t)) * Math.PI;
  const E = solveKepler(M, orbit.e);
  const x = orbit.a * (Math.cos(E) - orbit.e);
  const z = orbit.a * Math.sqrt(1 - orbit.e ** 2) * Math.sin(E);
  const r = Math.hypot(x, z);
  return { x, z, speed: Math.sqrt(SUN_MU * (2 / r - 1 / orbit.a)) };
}
export function orbitalRate(au) { return Math.sqrt(SUN_MU / (au * AU) ** 3); }
