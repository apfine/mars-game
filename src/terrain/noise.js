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

// Procedural Martian dune height formula:
// 100% mathematically continuous (no sudden steps, no grid boundaries)
// Produces sweeping barchan dune fields with wind ripples and rolling plains
export function getMarsHeight(x, z) {
  // 1. Broad regional topography (huge Martian undulating plains & rolling highlands)
  const macro = fbm(x * 0.0004, z * 0.0004, 3, 2.0, 0.45) * 45.0;

  // 2. Primary Martian dune fields (oriented along prevailing wind ~36 degrees)
  const angle = 0.63;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const wx = x * cosA - z * sinA;
  const wz = x * sinA + z * cosA;

  // Dune wave wavelength ~ 80m, with undulating serpentine dune crests
  const duneWarp = simplex2D(wx * 0.003, wz * 0.003) * 10.0;
  const wave = Math.sin((wz + duneWarp) * 0.015);

  // Asymmetric barchan dune profile: gentle windward ramp, steeper slip face
  let duneProfile = (wave + 1.0) * 0.5;
  duneProfile = Math.pow(duneProfile, 1.35);

  // Erg mask: dunes gather into large regional dune fields with open flats
  const ergMask = (simplex2D(x * 0.0012, z * 0.0012) + 1.0) * 0.5;
  const dunes = (duneProfile * 15.0 - 5.0) * ergMask;

  // 3. Medium rolling ridges
  const ridges = simplex2D(x * 0.004, z * 0.004) * 6.0;

  // 4. Fine wind ripple surface texture
  const ripples = Math.sin((wz * 0.2) + simplex2D(x * 0.015, z * 0.015) * 2.0) * 0.35;

  return macro + dunes + ridges + ripples;
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
