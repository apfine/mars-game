import { getMarsHeight } from './noise.js';

// The Moon's local terrain and all ground contacts sample this same field.
// Keep the Starbase apron level, then blend into broad regolith and craters.
const PAD_X = 1400;
const PAD_Z = 1150;
const PAD_Y = getMarsHeight(PAD_X, PAD_Z);
const craters = Array.from({ length: 28 }, (_, i) => {
  const angle = i * 2.399963229728653;
  const distance = 560 + (i * 613) % 4700;
  return {
    x: PAD_X + Math.cos(angle) * distance,
    z: PAD_Z + Math.sin(angle) * distance,
    radius: 35 + (i * 71) % 175,
    depth: 3 + (i * 13) % 14
  };
});

export function getMoonHeight(x, z) {
  const dx = x - PAD_X, dz = z - PAD_Z;
  const distance = Math.hypot(dx, dz);
  const blend = Math.min(1, Math.max(0, (distance - 420) / 260));
  let relief = 7 * Math.sin(dx * 0.00063) * Math.cos(dz * 0.00051)
    + 2.1 * Math.sin(dx * 0.0041 + dz * 0.0017) * Math.cos(dz * 0.0034);
  for (const crater of craters) {
    const r = Math.hypot(x - crater.x, z - crater.z) / crater.radius;
    if (r > 2) continue;
    relief -= crater.depth * Math.exp(-r * r * 4.2);
    relief += crater.depth * 0.25 * Math.exp(-(((r - 1) / 0.2) ** 2));
  }
  return PAD_Y + blend * (relief - distance * distance / (2 * 1737400));
}

export function getMoonNormal(x, z) {
  const step = 2;
  const nx = getMoonHeight(x - step, z) - getMoonHeight(x + step, z);
  const nz = getMoonHeight(x, z - step) - getMoonHeight(x, z + step);
  const length = Math.hypot(nx, 2 * step, nz);
  return { x: nx / length, y: 2 * step / length, z: nz / length };
}
