import * as THREE from 'three';

// High-performance 2D Simplex Noise & Mars Dune Procedural Generator

// Permutation table initialized with deterministic seed
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
const COS_DUNE = Math.cos(0.63);
const SIN_DUNE = Math.sin(0.63);

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

// Fast integer bitwise hash (replaces slow Math.sin in hot loop)
function cellHash(a, b, k) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(k | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Stunt jump ramps: one possible ramp per 260m cell, random heading. Long rising wedge, sharp lip,
// then a landing mound further along the heading. Continuous, so physics and mesh stay in sync.
const RAMP_CELL = 260;
export function rampHeight(x, z) {
  const cx = Math.floor(x / RAMP_CELL);
  const cz = Math.floor(z / RAMP_CELL);
  if (cellHash(cx, cz, 1) < 0.5) return 0;
  const px = (cx + 0.3 + 0.4 * cellHash(cx, cz, 3)) * RAMP_CELL;
  const pz = (cz + 0.3 + 0.4 * cellHash(cx, cz, 4)) * RAMP_CELL;
  const dx = x - px, dz = z - pz;
  // Quick bounding-box reject before trig
  if (dx > 55 || dx < -55 || dz > 55 || dz < -55) return 0;
  const a = cellHash(cx, cz, 2) * Math.PI * 2;
  const sinA = Math.sin(a), cosA = Math.cos(a);
  const u = dx * sinA + dz * cosA;   // along heading (lip at u = 0)
  if (u < -17 || u > 50) return 0;
  const v = dx * cosA - dz * sinA;   // across
  const absV = Math.abs(v);
  if (absV > 14) return 0;
  const wv = 1 - sstep(4.5, 7.5, absV);
  let h = 0;
  if (u < 0) h = 4.8 * Math.pow((u + 17) / 17, 1.15);
  else if (u < 3) h = 4.8 * (1 - sstep(0, 3, u));
  const land = (u > 22 && u < 48) ? 2.8 * sstep(22, 32, u) * (1 - sstep(32, 48, u)) * (1 - sstep(9, 14, absV)) : 0;
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

  // Sand drifts and sweeping Martian mega-dunes with sharp asymmetric slip-faces
  const wx = x * COS_DUNE - z * SIN_DUNE;
  const wz = x * SIN_DUNE + z * COS_DUNE;
  const ergMask = sstep(0.48, 0.92, (simplex2D(x * 0.0011, z * 0.0011) + 1.0) * 0.5);
  let dunes = 0;
  if (ergMask > 0.001) {
    // Primary transverse dune wave with undulating crestlines
    const duneWarp = simplex2D(wx * 0.0028, wz * 0.0028) * 16.0;
    const wavePhase = (wz + duneWarp) * 0.014;
    const waveSin = Math.sin(wavePhase);
    // Asymmetric barchan slip-face: gentle windward ramp (power 1.6), steep lee drop
    const windward = Math.pow(Math.max(0.0, (waveSin + 1.0) * 0.5), 1.85);
    const slipFace = (waveSin < -0.2) ? Math.pow(Math.max(0.0, -waveSin - 0.2) / 0.8, 1.4) * 0.35 : 0.0;
    // Secondary cross-dune crest ripples
    const crossWave = Math.sin(wx * 0.022 + simplex2D(x * 0.006, z * 0.006) * 4.0) * 0.28;
    const duneProfile = windward - slipFace + crossWave * windward;
    dunes = duneProfile * 16.5 * ergMask;
  }

  // Steep dune/ridge walls (up to ~40 degrees) to climb and fall from, in sparse regions
  const steepMask = sstep(0.48, 0.82, (simplex2D(x * 0.0018 - 5, z * 0.0018 + 3) + 1.0) * 0.5);
  let steep = 0;
  if (steepMask > 0.001) {
    const r = Math.max(0, 1 - Math.abs(simplex2D(x * 0.006 + 11, z * 0.006 - 7)));
    const r2 = r * r;
    steep = (r2 * r2 * r) * 18.0 * steepMask;
  }

  // Micro wind ripples on sand surfaces
  const ripples = (Math.sin(wz * 0.35 + simplex2D(x * 0.03, z * 0.03) * 3.0) * 0.075 +
                   Math.sin(wz * 0.8) * 0.035) * Math.max(0.3, ergMask);

  return macro + terraces + slabTilt + dunes + steep + rampHeight(x, z) + ripples;
}

// Fast terrain elevation query for minimap/radar (skips sub-meter micro-details)
export function getMarsHeightFast(x, z) {
  const macro = fbm(x * 0.0004, z * 0.0004, 2, 2.0, 0.45) * 30.0;
  const bed = fbm(x * 0.009 + 40, z * 0.009 - 17, 2, 2.0, 0.5) * 6.0;
  const ergMask = sstep(0.48, 0.92, (simplex2D(x * 0.0011, z * 0.0011) + 1.0) * 0.5);
  let dunes = 0;
  if (ergMask > 0.01) {
    const wz = x * SIN_DUNE + z * COS_DUNE;
    dunes = Math.pow((Math.sin(wz * 0.014) + 1.0) * 0.5, 1.85) * 16.5 * ergMask;
  }
  const steepMask = sstep(0.48, 0.82, (simplex2D(x * 0.0018 - 5, z * 0.0018 + 3) + 1.0) * 0.5);
  let steep = 0;
  if (steepMask > 0.01) {
    const r = Math.max(0, 1 - Math.abs(simplex2D(x * 0.006 + 11, z * 0.006 - 7)));
    const r2 = r * r;
    steep = (r2 * r2 * r) * 18.0 * steepMask;
  }
  return macro + bed + dunes + steep;
}

// Landmark sites are levelled so pads and monuments sit flat (coordinates match scatter.js catalog)
// [x, z, fullFlatRadius, fadeRadius]
// The Starbase entry grades a large industrial apron around the launch complex:
// this is what lets the three towers, factory, conveyor, inspection yard and
// crawler roads all share a single surveyed datum.
const SITES = [[380, 520, 15, 28], [-650, 420, 15, 28], [-420, -780, 15, 28], [850, -420, 15, 28], [-950, -320, 15, 28],
  [1200, 1100, 48, 70], [-1350, 950, 32, 48], [-250, -1150, 15, 28],
  [1400, 1150, 380, 540]]
  .map(([sx, sz, r0, r1]) => ({ x: sx, z: sz, r0, r1, h: rawHeight(sx, sz) }));

export function getMarsHeight(x, z) {
  let h = rawHeight(x, z);
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i];
    const dx = x - s.x, dz = z - s.z;
    if (dx > s.r1 || dx < -s.r1 || dz > s.r1 || dz < -s.r1) continue;
    const w = 1 - sstep(s.r0, s.r1, Math.hypot(dx, dz));
    if (w > 0) h += (s.h - h) * w;
  }
  return h;
}

const _sharedNormal = new THREE.Vector3(0, 1, 0);

// Compute central difference normal for physical terrain query (returns reusable THREE.Vector3)
export function getMarsNormal(x, z, epsilon = 0.5, target = _sharedNormal) {
  const hL = getMarsHeight(x - epsilon, z);
  const hR = getMarsHeight(x + epsilon, z);
  const hD = getMarsHeight(x, z - epsilon);
  const hU = getMarsHeight(x, z + epsilon);

  const nx = (hL - hR) / (2.0 * epsilon);
  const nz = (hD - hU) / (2.0 * epsilon);
  const ny = 1.0;

  const invLen = 1.0 / Math.hypot(nx, ny, nz);
  return target.set(nx * invLen, ny * invLen, nz * invLen);
}

