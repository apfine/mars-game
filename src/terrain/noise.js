// High-performance 2D Simplex Noise & Mars Dune Procedural Generator

// Permutation table initialized with deterministic seed
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

const p = new Uint8Array(256);
for (let i = 0; i < 256; i++) p[i] = i;
// Shuffle
let seed = 42;
function pseudoRandom() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
for (let i = 255; i > 0; i--) {
  const j = Math.floor(pseudoRandom() * (i + 1));
  const t = p[i];
  p[i] = p[j];
  p[j] = t;
}

const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);
for (let i = 0; i < 512; i++) {
  perm[i] = p[i & 255];
  permMod12[i] = perm[i] % 12;
}

const grad3 = new Float32Array([
  1, 1, 0,
  -1, 1, 0,
  1, -1, 0,
  -1, -1, 0,
  1, 0, 1,
  -1, 0, 1,
  1, 0, -1,
  -1, 0, -1,
  0, 1, 1,
  0, -1, 1,
  0, 1, -1,
  0, -1, -1
]);

export function simplex2D(xin, yin) {
  let n0 = 0, n1 = 0, n2 = 0;
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;

  let i1, j1;
  if (x0 > y0) {
    i1 = 1; j1 = 0;
  } else {
    i1 = 0; j1 = 1;
  }

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1.0 + 2.0 * G2;
  const y2 = y0 - 1.0 + 2.0 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    const gi0 = permMod12[ii + perm[jj]] * 3;
    n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    const gi1 = permMod12[ii + i1 + perm[jj + j1]] * 3;
    n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    const gi2 = permMod12[ii + 1 + perm[jj + 1]] * 3;
    n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2);
  }

  return 70.0 * (n0 + n1 + n2);
}

export function fbm(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let sum = 0;
  let amp = 1.0;
  let freq = 1.0;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    sum += simplex2D(x * freq, y * freq) * amp;
    maxAmp += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / maxAmp;
}

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function cellHash(a, b, k) {
  const p = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453123;
  return p - Math.floor(p);
}

// Stunt jump ramps: one possible ramp per 260m cell, random heading. Long rising wedge, sharp lip,
// then a landing mound further along the heading. Continuous, so physics and mesh stay in sync.
const RAMP_CELL = 260;
export function rampHeight(x, z) {
  const cx = Math.floor(x / RAMP_CELL);
  const cz = Math.floor(z / RAMP_CELL);
  if (cellHash(cx, cz, 1) < 0.5) return 0;
  const a = cellHash(cx, cz, 2) * Math.PI * 2;
  const px = (cx + 0.3 + 0.4 * cellHash(cx, cz, 3)) * RAMP_CELL;
  const pz = (cz + 0.3 + 0.4 * cellHash(cx, cz, 4)) * RAMP_CELL;
  const dx = x - px, dz = z - pz;
  const u = dx * Math.sin(a) + dz * Math.cos(a);   // along heading (lip at u = 0)
  const v = dx * Math.cos(a) - dz * Math.sin(a);   // across
  if (u < -17 || u > 50) return 0;
  const wv = 1 - sstep(4.5, 7.5, Math.abs(v));
  let h = 0;
  if (u < 0) h = 4.8 * Math.pow((u + 17) / 17, 1.15);
  else h = 4.8 * (1 - sstep(0, 3, u));
  const land = 2.8 * sstep(22, 32, u) * (1 - sstep(32, 48, u)) * (1 - sstep(9, 14, Math.abs(v)));
  return h * wv + land;
}

// Martian surface: layered sedimentary bedrock terraces (flagstone pavement with low ledges),
// sparse sand drifts, rare steep climbable dune ridges and stunt ramps. Fully continuous.
function rawHeight(x, z) {
  const macro = fbm(x * 0.0004, z * 0.0004, 3, 2.0, 0.45) * 30.0;

  // Bedrock terraces: low-frequency noise quantised into ~1m ledges
  const bed = fbm(x * 0.009 + 40, z * 0.009 - 17, 3, 2.0, 0.5) * 6.0;
  const t = bed / 1.1;
  const f = Math.floor(t);
  const terraces = (f + sstep(0.42, 0.58, t - f)) * 1.1;
  const slabTilt = simplex2D(x * 0.07, z * 0.07) * 0.22 + simplex2D(x * 0.19, z * 0.19) * 0.07;

  // Sand drifts in the lee of obstacles (shallow wind dunes in an erg mask)
  const angle = 0.63;
  const wx = x * Math.cos(angle) - z * Math.sin(angle);
  const wz = x * Math.sin(angle) + z * Math.cos(angle);
  const duneWarp = simplex2D(wx * 0.003, wz * 0.003) * 10.0;
  const duneProfile = Math.pow((Math.sin((wz + duneWarp) * 0.015) + 1.0) * 0.5, 1.35);
  const ergMask = sstep(0.55, 0.95, (simplex2D(x * 0.0012, z * 0.0012) + 1.0) * 0.5);
  const dunes = duneProfile * 6.0 * ergMask;

  // Steep dune/ridge walls (up to ~40 degrees) to climb and fall from, in sparse regions
  const r = 1 - Math.abs(simplex2D(x * 0.0065 + 11, z * 0.0065 - 7));
  const steepMask = sstep(0.5, 0.82, (simplex2D(x * 0.0019 - 5, z * 0.0019 + 3) + 1.0) * 0.5);
  const steep = Math.pow(Math.max(r, 0), 5) * 15.0 * steepMask;

  const ripples = Math.sin(wz * 0.2 + simplex2D(x * 0.015, z * 0.015) * 2.0) * 0.05;

  return macro + terraces + slabTilt + dunes + steep + rampHeight(x, z) + ripples;
}

// Landmark sites are levelled so pads and monuments sit flat (coordinates match scatter.js catalog)
const SITES = [[380, 520], [-650, 420], [-420, -780], [850, -420], [-950, -320], [1200, 1100], [-1350, 950]]
  .map(([sx, sz]) => ({ x: sx, z: sz, h: rawHeight(sx, sz) }));

export function getMarsHeight(x, z) {
  let h = rawHeight(x, z);
  for (const s of SITES) {
    const dx = x - s.x, dz = z - s.z;
    if (dx > 30 || dx < -30 || dz > 30 || dz < -30) continue;
    const w = 1 - sstep(15, 28, Math.hypot(dx, dz));
    if (w > 0) h += (s.h - h) * w;
  }
  return h;
}

// Compute analytical or central difference normal for physical terrain query
export function getMarsNormal(x, z, epsilon = 0.5) {
  const hL = getMarsHeight(x - epsilon, z);
  const hR = getMarsHeight(x + epsilon, z);
  const hD = getMarsHeight(x, z - epsilon);
  const hU = getMarsHeight(x, z + epsilon);

  const nx = (hL - hR) / (2.0 * epsilon);
  const nz = (hD - hU) / (2.0 * epsilon);
  const ny = 1.0;

  const len = Math.hypot(nx, ny, nz);
  return {
    x: nx / len,
    y: ny / len,
    z: nz / len
  };
}
