import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Realistic Procedural Mars Planetary Texture Generator
// Creates a 2048 x 1024 equirectangular texture of Mars with iconic landmarks:
// - Valles Marineris (4,000 km grand canyon rift)
// - Olympus Mons (22 km shield volcano caldera & scarp)
// - Tharsis Montes (Ascraeus, Pavonis, Arsia Mons)
// - Dark basaltic mare (Syrtis Major, Acidalia Planitia, Sinus Meridiani)
// - Northern Polar Ice Cap (Planum Boreum with Chasma Boreale)
// - Southern Polar Frost (Planum Australe)
// - Impact Basins & Crater Rings (Hellas, Argyre, and crater fields)
// - Orographic water-ice clouds over volcanic summits
// ---------------------------------------------------------------------------
let _cachedMarsTexture = null;
let _cachedEarthTexture = null;

// A hand-shaped but geographically recognisable Earth albedo map. We avoid
// external image dependencies, yet keep the silhouette of the real continents
// so the globe reads as Earth from orbit instead of a generic blue marble.
export function createProceduralEarthTexture() {
  if (typeof document === 'undefined') return null;
  if (_cachedEarthTexture) return _cachedEarthTexture;

  const W = 2048;
  const H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  if (!g) return null;

  // ---- Ocean -----------------------------------------------------------
  const ocean = g.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0.0, '#071b38');
  ocean.addColorStop(0.18, '#0a2d5f');
  ocean.addColorStop(0.46, '#0b4b8f');
  ocean.addColorStop(0.58, '#0d5a9f');
  ocean.addColorStop(0.82, '#082d61');
  ocean.addColorStop(1.0, '#06162f');
  g.fillStyle = ocean;
  g.fillRect(0, 0, W, H);

  // Subtle sea-floor / current variation.
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 20 + Math.random() * 130;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const warm = Math.random() > 0.55;
    grad.addColorStop(0, warm ? 'rgba(20,98,150,0.055)' : 'rgba(8,35,80,0.07)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const px = (lon) => ((lon + 180) / 360) * W;
  const py = (lat) => ((90 - lat) / 180) * H;

  const fillPolygon = (points, fill) => {
    g.beginPath();
    for (let i = 0; i < points.length; i++) {
      const [lon, lat] = points[i];
      const x = px(lon);
      const y = py(lat);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };

  // ---- Continents ------------------------------------------------------
  // Coordinates are deliberately simplified but preserve real continental
  // shapes: the Americas, Africa, Europe, Asia, Australia and Antarctica.
  fillPolygon([
    [-168, 66], [-150, 71], [-132, 70], [-115, 73], [-95, 73], [-78, 70],
    [-62, 59], [-52, 47], [-63, 45], [-70, 40], [-81, 25], [-97, 18],
    [-106, 23], [-115, 31], [-125, 41], [-135, 53], [-150, 61]
  ], '#46763d');
  fillPolygon([
    [-81, 12], [-70, 12], [-54, 4], [-35, -6], [-39, -23], [-47, -31],
    [-54, -40], [-66, -55], [-75, -50], [-72, -31], [-79, -10]
  ], '#3f7238');
  fillPolygon([
    [-17, 37], [-5, 36], [10, 37], [31, 31], [43, 12], [51, 11],
    [42, -12], [35, -25], [20, -35], [10, -30], [1, -5], [-10, 5],
    [-17, 20]
  ], '#7a793d');
  fillPolygon([
    [-10, 36], [0, 44], [14, 38], [30, 40], [40, 45], [30, 60],
    [20, 70], [6, 60], [-5, 50]
  ], '#4e7a3b');
  fillPolygon([
    [30, 45], [60, 55], [88, 70], [120, 75], [158, 70], [180, 60],
    [172, 10], [145, 0], [122, -9], [100, 5], [80, 8], [60, 25],
    [42, 30], [30, 40]
  ], '#5f7d3b');
  fillPolygon([
    [112, -10], [130, -12], [153, -25], [150, -38], [125, -35],
    [114, -25]
  ], '#8b6f3e');
  fillPolygon([
    [-55, 60], [-40, 59], [-20, 60], [-18, 76], [-28, 83], [-46, 83],
    [-60, 75]
  ], '#d9e8e9');
  fillPolygon([
    [-180, -65], [180, -65], [180, -90], [-180, -90]
  ], '#eef5f5');

  // Great Britain / Ireland, Japan, Madagascar, New Zealand.
  fillPolygon([[-11, 50], [-5, 58], [1, 51], [-4, 49]], '#527c3e');
  fillPolygon([[-10, 52], [-6, 55], [-8, 51]], '#4e783a');
  fillPolygon([[130, 31], [141, 40], [146, 43], [142, 34], [135, 31]], '#4c753d');
  fillPolygon([[43, -12], [50, -17], [47, -25], [43, -20]], '#6e7e3e');
  fillPolygon([[166, -35], [178, -38], [174, -46], [166, -45]], '#5b7f46');

  // ---- Deserts, forests, mountain ranges -------------------------------
  const biome = (cx, cy, rx, ry, color, alpha = 1) => {
    const grad = g.createRadialGradient(px(cx), py(cy), 4, px(cx), py(cy), Math.max(rx, ry));
    grad.addColorStop(0, color);
    grad.addColorStop(0.6, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha;
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(px(cx), py(cy), rx, ry, -0.18, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  };
  // Sahara, Arabian, Gobi, Australian outback, Atacama, Kalahari.
  biome(12, 23, 150, 70, '#c8a96a', 0.9);
  biome(42, 22, 70, 48, '#c7a164', 0.78);
  biome(95, 43, 110, 50, '#b9a477', 0.7);
  biome(134, -25, 100, 48, '#b4824e', 0.8);
  biome(-70, -24, 24, 70, '#b39261', 0.7);
  biome(22, -23, 55, 40, '#b0955d', 0.55);
  // Amazon, Congo, Southeast Asia rainforests.
  biome(-62, -4, 90, 44, '#1f6131', 0.9);
  biome(20, 0, 65, 38, '#2a6a35', 0.85);
  biome(110, 2, 75, 35, '#256a34', 0.75);
  // Boreal forest belt.
  biome(-100, 55, 200, 30, '#315c3a', 0.6);
  biome(100, 60, 250, 34, '#315c3a', 0.6);
  // Rockies / Andes / Himalaya rock + snow.
  biome(-108, 42, 28, 60, '#8b8170', 0.55);
  biome(-70, -25, 18, 100, '#8c7d69', 0.65);
  biome(82, 32, 90, 18, '#8e806b', 0.55);
  biome(82, 32, 60, 8, '#e7ecec', 0.5);

  // ---- Coastline haze / islands ----------------------------------------
  for (let i = 0; i < 520; i++) {
    const lon = -180 + Math.random() * 360;
    const lat = -58 + Math.random() * 132;
    const r = 1 + Math.random() * 5;
    g.fillStyle = `rgba(60,110,58,${0.08 + Math.random() * 0.12})`;
    g.beginPath();
    g.arc(px(lon), py(lat), r, 0, Math.PI * 2);
    g.fill();
  }

  // ---- Fine terrain grain ---------------------------------------------
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      const n = (Math.random() - 0.5) * 8;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
  }
  g.putImageData(img, 0, 0);

  // ---- Polar caps ------------------------------------------------------
  const north = g.createLinearGradient(0, 0, 0, 78);
  north.addColorStop(0, 'rgba(248,252,255,0.98)');
  north.addColorStop(0.55, 'rgba(240,249,255,0.78)');
  north.addColorStop(1, 'rgba(240,249,255,0)');
  g.fillStyle = north;
  g.fillRect(0, 0, W, 86);
  const south = g.createLinearGradient(0, H - 86, 0, H);
  south.addColorStop(0, 'rgba(240,249,255,0)');
  south.addColorStop(0.45, 'rgba(242,250,255,0.8)');
  south.addColorStop(1, 'rgba(250,254,255,0.98)');
  g.fillStyle = south;
  g.fillRect(0, H - 86, W, 86);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  _cachedEarthTexture = tex;
  return tex;
}

function createProceduralMarsTexture() {
  if (typeof document === 'undefined') return null;
  if (_cachedMarsTexture) return _cachedMarsTexture;

  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Ultra-fast integer bitwise hash (replaces slow Math.sin per pixel)
  const hash2d = (x, y) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const smoothNoise = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);

    const a = hash2d(ix, iy);
    const b = hash2d(ix + 1, iy);
    const c = hash2d(ix, iy + 1);
    const d = hash2d(ix + 1, iy + 1);

    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  };

  const fbm = (x, y, octaves = 3) => {
    let val = 0;
    let amp = 0.5;
    let freq = 1.0;
    for (let o = 0; o < octaves; o++) {
      val += smoothNoise(x * freq, y * freq) * amp;
      freq *= 2.02;
      amp *= 0.5;
    }
    return val;
  };

  // Color Palette Constants
  // Ferric red-ochre highlands
  const COL_HIGHLAND_R = 198, COL_HIGHLAND_G = 102, COL_HIGHLAND_B = 64;
  // Dark volcanic basalt (Syrtis Major, Acidalia)
  const COL_BASALT_R = 54, COL_BASALT_G = 38, COL_BASALT_B = 32;
  // Canyon floor shadow
  const COL_CANYON_R = 36, COL_CANYON_G = 22, COL_CANYON_B = 16;
  // Polar ice cap (white/ice-blue)
  const COL_ICE_R = 244, COL_ICE_G = 249, COL_ICE_B = 255;
  // Hellas basin dust
  const COL_HELLAS_R = 216, COL_HELLAS_G = 136, COL_HELLAS_B = 92;

  // Precompute longitude trig table
  const cosU = new Float32Array(width);
  const sinU = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const a = (x / width) * Math.PI * 2;
    cosU[x] = Math.cos(a);
    sinU[x] = Math.sin(a);
  }

  for (let y = 0; y < height; y++) {
    const v = y / height; // 0 (North Pole) to 1 (South Pole)
    const lat = (0.5 - v) * Math.PI; // +PI/2 to -PI/2
    const cosLat = Math.cos(lat);
    const ny = Math.sin(lat);

    for (let x = 0; x < width; x++) {
      const u = x / width; // 0 to 1 (Longitude 0° to 360°)
      const idx = (y * width + x) * 4;

      // Spherical coordinates for seamless wrapping
      const nx = cosLat * cosU[x];
      const nz = cosLat * sinU[x];

      // Base planetary fractal terrain
      const n1 = fbm(nx * 3.5 + 10.0, ny * 3.5 + 10.0, 3);
      const n2 = fbm(nz * 7.0 + 20.0, ny * 7.0 + 20.0, 2) * 0.4;
      let elevation = n1 + n2; // ~0.0 to 1.3

      // 1. Dark Volcanic Basaltic Mare (Albedo Features)
      const dSyrtis = Math.hypot(u - 0.79, (v - 0.50) * 1.8);
      const isSyrtis = Math.max(0, 1.0 - dSyrtis / 0.08);

      const dAcidalia = Math.hypot(u - 0.48, (v - 0.32) * 1.5);
      const isAcidalia = Math.max(0, 1.0 - dAcidalia / 0.12);

      const dMeridiani = Math.hypot(u - 0.56, (v - 0.52) * 3.2);
      const isMeridiani = Math.max(0, 1.0 - dMeridiani / 0.14);

      const darkMare = Math.min(1.0, isSyrtis * 1.6 + isAcidalia * 1.2 + isMeridiani * 1.1 + (elevation < 0.42 ? (0.42 - elevation) * 2.5 : 0.0));

      // 2. Valles Marineris (Grand Canyon of Mars)
      let isCanyon = 0.0;
      if (u > 0.20 && u < 0.44 && Math.abs(v - 0.52) < 0.045) {
        const canyonProgress = (u - 0.20) / 0.24;
        const canyonMeander = Math.sin(canyonProgress * Math.PI * 3.5) * 0.008;
        const distToCenter = Math.abs((v - 0.52) - canyonMeander);
        if (distToCenter < 0.016) {
          isCanyon = Math.pow(1.0 - distToCenter / 0.016, 1.8);
          isCanyon *= 0.75 + 0.25 * Math.sin(canyonProgress * Math.PI * 8.0);
        }
      }

      // 3. Tharsis Shield Volcanoes
      const dOlympus = Math.hypot(u - 0.17, (v - 0.38) * 1.3);
      let isOlympus = 0.0;
      let isCaldera = 0.0;
      if (dOlympus < 0.038) {
        isOlympus = Math.pow(1.0 - dOlympus / 0.038, 2.2);
        if (dOlympus < 0.008) {
          isCaldera = Math.cos((dOlympus / 0.008) * Math.PI * 0.5);
        }
      }

      const dAscraeus = Math.hypot(u - 0.24, (v - 0.39) * 1.4);
      const dPavonis = Math.hypot(u - 0.22, (v - 0.47) * 1.4);
      const dArsia = Math.hypot(u - 0.20, (v - 0.55) * 1.4);
      const isTharsisMons = Math.max(0, 1.0 - Math.min(dAscraeus, dPavonis, dArsia) / 0.024);

      // 4. Hellas Planitia Impact Basin
      const dHellas = Math.hypot(u - 0.72, (v - 0.72) * 1.2);
      const isHellas = Math.max(0, 1.0 - dHellas / 0.11);

      // 5. Northern Polar Ice Cap
      let isNorthIce = 0.0;
      if (v < 0.14) {
        const iceEdge = 0.14 - smoothNoise(nx * 12.0, nz * 12.0) * 0.03;
        if (v < iceEdge) {
          isNorthIce = Math.min(1.0, (iceEdge - v) / 0.05);
          const spiral = Math.sin(Math.atan2(nz, nx) * 3.0 + v * 30.0);
          if (spiral > 0.6) isNorthIce *= 0.78;
        }
      }

      // Southern Polar Frost
      let isSouthIce = 0.0;
      if (v > 0.88) {
        const iceEdge = 0.88 + smoothNoise(nx * 10.0, nz * 10.0) * 0.03;
        if (v > iceEdge) {
          isSouthIce = Math.min(1.0, (v - iceEdge) / 0.06);
        }
      }

      // Base color blending
      let r = COL_HIGHLAND_R;
      let g = COL_HIGHLAND_G;
      let b = COL_HIGHLAND_B;

      const terraVar = (elevation - 0.7) * 42.0;
      r = Math.min(255, Math.max(0, r + terraVar));
      g = Math.min(255, Math.max(0, g + terraVar * 0.75));
      b = Math.min(255, Math.max(0, b + terraVar * 0.5));

      if (darkMare > 0.05) {
        const m = Math.min(1.0, darkMare);
        r = r * (1 - m) + COL_BASALT_R * m;
        g = g * (1 - m) + COL_BASALT_G * m;
        b = b * (1 - m) + COL_BASALT_B * m;
      }

      if (isHellas > 0.05) {
        const h = Math.min(1.0, isHellas);
        r = r * (1 - h) + COL_HELLAS_R * h;
        g = g * (1 - h) + COL_HELLAS_G * h;
        b = b * (1 - h) + COL_HELLAS_B * h;
      }

      if (isCanyon > 0.05) {
        r = r * (1 - isCanyon) + COL_CANYON_R * isCanyon;
        g = g * (1 - isCanyon) + COL_CANYON_G * isCanyon;
        b = b * (1 - isCanyon) + COL_CANYON_B * isCanyon;
      }

      if (isOlympus > 0.05) {
        const oR = 212, oG = 114, oB = 74;
        r = r * (1 - isOlympus) + oR * isOlympus;
        g = g * (1 - isOlympus) + oG * isOlympus;
        b = b * (1 - isOlympus) + oB * isOlympus;
        if (isCaldera > 0.1) {
          r = r * (1 - isCaldera) + COL_CANYON_R * isCaldera;
          g = g * (1 - isCaldera) + COL_CANYON_G * isCaldera;
          b = b * (1 - isCaldera) + COL_CANYON_B * isCaldera;
        }
      }

      if (isTharsisMons > 0.05) {
        const tm = isTharsisMons * 0.75;
        r = r * (1 - tm) + 215 * tm;
        g = g * (1 - tm) + 115 * tm;
        b = b * (1 - tm) + 75 * tm;
      }

      const iceTotal = Math.min(1.0, isNorthIce + isSouthIce);
      if (iceTotal > 0.02) {
        r = r * (1 - iceTotal) + COL_ICE_R * iceTotal;
        g = g * (1 - iceTotal) + COL_ICE_G * iceTotal;
        b = b * (1 - iceTotal) + COL_ICE_B * iceTotal;
      }

      data[idx + 0] = Math.round(r);
      data[idx + 1] = Math.round(g);
      data[idx + 2] = Math.round(b);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  _cachedMarsTexture = texture;
  return texture;
}

// ---------------------------------------------------------------------------
// PostLaunchSpace: Hyper-Realistic 3D Mars Planet Globe & Orbital Space System
// ---------------------------------------------------------------------------
export class PostLaunchSpace {
  constructor(scene, padCoords = new THREE.Vector2(1400, 1150)) {
    this.scene = scene;
    this.padCoords = padCoords;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    // Massive 165 km planetary radius in camera space so the horizon curvature looks vast and authentic, never compressed!
    this.planetRadius = 165000.0;
    this.sunDirection = new THREE.Vector3(0.5, 0.65, 0.45).normalize();
    this.orbitRotation = 0.0;
    this.initialized = false;
    this.planetId = 'mars';
    this.pendingPlanetId = 'mars';
  }

  // Switches the high-altitude globe between worlds. Earth gets its own
  // albedo, Rayleigh-blue limb and cloud treatment so arriving from Mars never
  // shows a red Mars-looking planet above the Earth Starbase.
  setPlanet(planetId) {
    this.pendingPlanetId = planetId === 'earth' ? 'earth' : 'mars';
    this.planetId = this.pendingPlanetId;
    if (!this.initialized) return;
    this._applyPlanetLook();
  }

  _applyPlanetLook() {
    const earth = this.planetId === 'earth';
    if (this.planetMat) {
      const u = this.planetMat.uniforms;
      u.uMap.value = earth ? createProceduralEarthTexture() : createProceduralMarsTexture();
      u.uEarth.value = earth ? 1 : 0;
      u.uAtmosphereColor.value.setHex(earth ? 0x5b9fe8 : 0xc8825c);
      u.uAirglowBlue.value.setHex(earth ? 0x9bd6ff : 0x5ca8e6);
    }
    if (this.airglowMat) {
      this.airglowMat.uniforms.uDustColor.value.setHex(earth ? 0x7fb8ef : 0xe28d62);
      this.airglowMat.uniforms.uAirglowCyan.value.setHex(earth ? 0x6fc5ff : 0x58b2ff);
    }
    if (this.phobosMesh) this.phobosMesh.visible = !earth;
    if (this.deimosMesh) this.deimosMesh.visible = !earth;
  }

  ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;
    this.initPlanetGlobe();
    this.initAtmosphericAirglowLimb();
    this.initCosmicSpaceEnvironment();
    this.initOrbitalSatellite();
    this.planetId = this.pendingPlanetId || 'mars';
    this._applyPlanetLook();
  }

  initPlanetGlobe() {
    const planetTexture = createProceduralMarsTexture();

    // Rotate SphereGeometry by 90° around X so the mesh poles (and polar ice caps) sit 165km away on the ±Z horizon,
    // placing the smooth Martian equator (Valles Marineris, Olympus Mons, Tharsis ochre plains) directly beneath the rocket (+Y)!
    const planetGeo = new THREE.SphereGeometry(this.planetRadius, 64, 48);
    planetGeo.rotateX(Math.PI / 2);

    const planetMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: planetTexture },
        uSunDir: { value: this.sunDirection.clone() },
        uFade: { value: 0.0 },
        uAtmosphereColor: { value: new THREE.Color(0xc8825c) },
        uAirglowBlue: { value: new THREE.Color(0x5ca8e6) },
        uEarth: { value: 0.0 },
        uTime: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vLocalNormal;
        varying vec3 vPositionWorld;
        varying vec3 vViewDir;

        void main() {
          vUv = uv;
          vLocalNormal = normalize(normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vPositionWorld = worldPos.xyz;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uSunDir;
        uniform float uFade;
        uniform vec3 uAtmosphereColor;
        uniform vec3 uAirglowBlue;
        uniform float uEarth;
        uniform float uTime;

        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vLocalNormal;
        varying vec3 vPositionWorld;
        varying vec3 vViewDir;

        float hash31(vec3 p3) {
          p3 = fract(p3 * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float noise3D(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(
              mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
              mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x),
              f.y
            ),
            mix(
              mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
              mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x),
              f.y
            ),
            f.z
          );
        }

        float fbm3D(vec3 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise3D(p);
            p = p * 2.05 + vec3(13.7, 29.3, 7.1);
            a *= 0.5;
          }
          return v;
        }

        // Domain-warped 3D Martian canyon & highland relief (zero circular cheerio grid artifacts)
        float sampleRelief(vec3 sphereDir) {
          vec3 p = sphereDir * 24.0;
          vec3 warp = vec3(fbm3D(p), fbm3D(p + vec3(4.1, 7.3, 2.9)), fbm3D(p + vec3(9.2, 1.8, 5.4)));
          float macro = fbm3D(p + warp * 1.1);
          float detail = fbm3D(sphereDir * 95.0 + warp * 2.0);
          return macro * 0.68 + detail * 0.32;
        }

        void main() {
          if (uFade <= 0.001) discard;

          vec3 N = normalize(vNormalWorld);
          vec3 S = normalize(vLocalNormal);
          vec3 L = normalize(uSunDir);
          vec3 V = normalize(vViewDir);

          // Sample global Mars albedo map (already decoded to linear RGB by SRGBColorSpace)
          vec3 baseAlbedo = texture2D(uMap, vUv).rgb;

          // Tangent basis aligned with Z-poles so the top hemisphere (+Y) has zero singularity!
          float eps = 0.0022;
          vec3 tangent = normalize(cross(vec3(0.0, 0.0, 1.0), S + vec3(0.0001)));
          vec3 bitangent = normalize(cross(S, tangent));

          float h0 = sampleRelief(S);
          float hx = sampleRelief(normalize(S + tangent * eps));
          float hy = sampleRelief(normalize(S + bitangent * eps));

          vec3 bumpN = normalize(N + (tangent * (h0 - hx) + bitangent * (h0 - hy)) * 0.75);

          float earth = clamp(uEarth, 0.0, 1.0);

          // Modulate with geological detail. Mars has stronger canyon/regolith
          // relief; Earth keeps its albedo crisp while retaining cloud relief.
          float microTex = noise3D(S * 210.0);
          baseAlbedo *= mix(0.78 + 0.32 * h0, 0.93 + 0.12 * h0, earth);
          baseAlbedo *= mix(0.90 + 0.18 * microTex, 0.96 + 0.08 * microTex, earth);

          // Cloud systems. Earth gets broad white frontal bands and tropical
          // convection; Mars keeps only thin water-ice cirrus.
          float latMask = mix(1.0 - smoothstep(0.15, 0.75, abs(S.z)), 1.0, earth);
          float cloudNoise = fbm3D(S * mix(14.0, 10.0, earth) + vec3(uTime * mix(0.002, 0.006, earth), 0.0, uTime * 0.001));
          float cloudFactor = smoothstep(mix(0.64, 0.53, earth), mix(0.85, 0.76, earth), cloudNoise) * latMask * mix(0.24, 0.78, earth);
          baseAlbedo = mix(baseAlbedo, mix(vec3(0.82, 0.68, 0.58), vec3(0.95, 0.98, 1.0), earth), cloudFactor);

          // Day/Night Solar Terminator with calibrated dusty regolith reflectance (never bleaches white!)
          float NdotL = dot(bumpN, L);
          float macroNdotL = dot(N, L);
          float dayFactor = smoothstep(-0.14, 0.28, macroNdotL);
          float diff = clamp((NdotL + 0.26) * 0.78, 0.04, 1.0) * dayFactor;

          float twilight = smoothstep(-0.22, 0.06, macroNdotL) * (1.0 - smoothstep(0.04, 0.40, macroNdotL));

          vec3 dayLight = mix(vec3(0.96, 0.82, 0.70), vec3(1.03, 1.04, 1.02), earth);
          vec3 nightLight = vec3(0.005, 0.006, 0.012);
          vec3 ambientTint = mix(vec3(0.22, 0.13, 0.10), vec3(0.09, 0.13, 0.18), earth);
          vec3 surfaceColor = baseAlbedo * (ambientTint * dayFactor + mix(nightLight, dayLight, diff));

          // Dust scattering on Mars; cool Rayleigh twilight on Earth.
          surfaceColor += mix(vec3(0.62, 0.25, 0.12) * 0.28, vec3(0.08, 0.24, 0.50) * 0.18, earth) * twilight;

          // Rayleigh + Mie Atmospheric Haze & Planetary Limb scattering
          float fresnel = 1.0 - max(0.0, dot(N, V));
          float sunIllum = max(0.12, macroNdotL * 0.70 + 0.30);

          // Smooth volumetric atmospheric blending without a razor-sharp neon ring
          float atmoDepth = pow(fresnel, mix(2.6, 3.2, earth));
          vec3 limbColor = mix(uAtmosphereColor, uAirglowBlue, smoothstep(0.35, 0.92, fresnel));
          surfaceColor = mix(surfaceColor, limbColor * sunIllum, atmoDepth * (earth > 0.5 ? 0.62 : 0.50));

          // Soft edge feathering so there is zero artificial sharp polygon ring cutting into space
          float edgeFeather = smoothstep(0.002, 0.075, dot(N, V));
          float finalAlpha = uFade * mix(1.0, edgeFeather, earth > 0.5 ? 0.88 : 0.75);

          gl_FragColor = vec4(surfaceColor, finalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true
    });

    this.planetMesh = new THREE.Mesh(planetGeo, planetMat);
    this.planetMesh.renderOrder = -800;
    this.planetMat = planetMat;
    this.group.add(this.planetMesh);
  }

  initAtmosphericAirglowLimb() {
    // Concentric outer atmospheric airglow halo (radius +1.4%)
    const airglowGeo = new THREE.SphereGeometry(this.planetRadius * 1.014, 64, 48);
    const airglowMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: this.sunDirection.clone() },
        uFade: { value: 0.0 },
        uDustColor: { value: new THREE.Color(0xe28d62) },
        uAirglowCyan: { value: new THREE.Color(0x58b2ff) }
      },
      vertexShader: `
        varying vec3 vNormalWorld;
        varying vec3 vViewDir;
        varying vec3 vPosWorld;

        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vPosWorld = worldPos.xyz;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform float uFade;
        uniform vec3 uDustColor;
        uniform vec3 uAirglowCyan;

        varying vec3 vNormalWorld;
        varying vec3 vViewDir;
        varying vec3 vPosWorld;

        void main() {
          if (uFade <= 0.001) discard;

          vec3 N = normalize(vNormalWorld);
          vec3 V = normalize(vViewDir);
          vec3 L = normalize(uSunDir);

          float NdotV = abs(dot(N, V));
          float edge = pow(1.0 - NdotV, 4.0);

          // Sunlight crescent modulation
          float NdotL = dot(N, L);
          float sunLit = max(0.08, NdotL * 0.78 + 0.22);

          // Dual-layer color: inner salmon dust troposphere, outer electric blue mesosphere
          vec3 haloCol = mix(uDustColor, uAirglowCyan, smoothstep(0.28, 0.88, 1.0 - NdotV));
          vec3 finalGlow = haloCol * edge * sunLit * 1.45;

          gl_FragColor = vec4(finalGlow, edge * uFade * 0.88);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true
    });

    this.airglowMesh = new THREE.Mesh(airglowGeo, airglowMat);
    this.airglowMesh.renderOrder = -790;
    // The old back-sided airglow shell was responsible for the translucent
    // faceted dome seen from high altitude. The planet shader already carries a
    // physically softer Rayleigh limb, so the extra shell stays disabled.
    this.airglowMesh.visible = false;
    this.airglowMat = airglowMat;
    this.group.add(this.airglowMesh);
  }

  initCosmicSpaceEnvironment() {
    this.spaceGroup = new THREE.Group();
    this.group.add(this.spaceGroup);

    // 1. Procedural 3D Moon Phobos (Irregular cratered potato moon)
    const phobosGeo = new THREE.DodecahedronGeometry(180.0, 2);
    const posAttr = phobosGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      x *= 1.25;
      y *= 0.88;
      z *= 0.76;

      const len = Math.hypot(x, y, z);
      const craterNoise = (Math.sin(x * 0.03) * Math.cos(z * 0.03)) * 16.0;
      const dStickney = Math.hypot(x - 130.0, y - 15.0, z - 15.0);
      const stickneyIndent = dStickney < 120.0 ? Math.cos((dStickney / 120.0) * Math.PI * 0.5) * 38.0 : 0.0;

      const scale = (len + craterNoise - stickneyIndent) / len;
      posAttr.setXYZ(i, x * scale, y * scale, z * scale);
    }
    phobosGeo.computeVertexNormals();

    const phobosMat = new THREE.MeshStandardMaterial({
      color: 0x8a847e,
      roughness: 0.92,
      metalness: 0.05
    });
    this.phobosMesh = new THREE.Mesh(phobosGeo, phobosMat);
    this.phobosOrbitRadius = 210000.0;
    this.phobosOrbitAngle = 0.65;
    this.spaceGroup.add(this.phobosMesh);

    // 2. Procedural 3D Moon Deimos
    const deimosGeo = new THREE.DodecahedronGeometry(75.0, 1);
    const dPosAttr = deimosGeo.attributes.position;
    for (let i = 0; i < dPosAttr.count; i++) {
      let x = dPosAttr.getX(i) * 1.15;
      let y = dPosAttr.getY(i) * 0.95;
      let z = dPosAttr.getZ(i) * 0.85;
      dPosAttr.setXYZ(i, x, y, z);
    }
    deimosGeo.computeVertexNormals();
    const deimosMat = new THREE.MeshStandardMaterial({
      color: 0x9b958e,
      roughness: 0.88,
      metalness: 0.05
    });
    this.deimosMesh = new THREE.Mesh(deimosGeo, deimosMat);
    this.deimosOrbitRadius = 285000.0;
    this.deimosOrbitAngle = 2.4;
    this.spaceGroup.add(this.deimosMesh);

    // 3. The "Pale Blue Dot" (Distant Earth & Moon in Mars orbital sky)
    // The old static earthGroup in postLaunchSpace is disabled so that InterplanetaryJourney
    // acts as the single source of truth for the astronomical Earth, Moon, and Mars.
    this.earthGroup = new THREE.Group();
    this.earthGroup.visible = false;
    this.spaceGroup.add(this.earthGroup);
  }

  initOrbitalSatellite() {
    this.satellite = new THREE.Group();

    const busGeo = new THREE.BoxGeometry(4.5, 3.2, 3.0);
    const busMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.32,
      metalness: 0.88
    });
    const bus = new THREE.Mesh(busGeo, busMat);
    this.satellite.add(bus);

    const dishGeo = new THREE.CylinderGeometry(2.4, 0.4, 0.9, 12, 1, true);
    dishGeo.rotateX(Math.PI / 2);
    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.25,
      metalness: 0.75,
      side: THREE.DoubleSide
    });
    const dish = new THREE.Mesh(dishGeo, dishMat);
    dish.position.set(0, 2.2, 0);
    dish.lookAt(new THREE.Vector3(-1, 0.8, -1));
    this.satellite.add(dish);

    const panelGeo = new THREE.BoxGeometry(11.0, 0.08, 2.6);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1a3366,
      roughness: 0.2,
      metalness: 0.92
    });
    const leftPanel = new THREE.Mesh(panelGeo, panelMat);
    leftPanel.position.set(-8.2, 0, 0);
    this.satellite.add(leftPanel);

    const rightPanel = new THREE.Mesh(panelGeo, panelMat);
    rightPanel.position.set(8.2, 0, 0);
    this.satellite.add(rightPanel);

    const beaconGeo = new THREE.SphereGeometry(0.35, 8, 8);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0x33ff88 });
    const beacon = new THREE.Mesh(beaconGeo, this.beaconMat);
    beacon.position.set(0, -1.8, 0);
    this.satellite.add(beacon);

    this.satelliteOrbitRadius = 172000.0;
    this.satelliteOrbitAngle = 1.25;
    this.spaceGroup.add(this.satellite);
  }

  update(dt, alt, speed, shipPos, isInterplanetary = false) {
    // During interplanetary transfer, InterplanetaryJourney takes full control of celestial
    // planets. The local orbital globe must NOT follow the ship into deep space or overlap Earth!
    if (isInterplanetary) {
      this.group.visible = false;
      return;
    }

    // Smooth cross-fade between the 36km regional Martian surface (0 - 14km) and the 165km 3D planetary globe (3km - 100km+)
    const fade = THREE.MathUtils.smoothstep(alt, 3000.0, 12500.0);
    this.group.visible = fade > 0.005;

    if (!this.group.visible) return;
    this.ensureInitialized();

    if (this.planetMat) {
      this.planetMat.uniforms.uFade.value = fade;
      this.planetMat.uniforms.uTime.value += dt;
    }
    if (this.airglowMat) {
      this.airglowMat.uniforms.uFade.value = fade;
    }

    // Keep the 165km Mars globe horizontally centered directly beneath the active camera (shipPos.x, shipPos.z)
    // and keep visual altitude close to the planetary surface during atmospheric entry (12km - 50km)
    const clampedAlt = Math.max(0.0, alt);
    const visualSpaceAlt = clampedAlt <= 3500.0
      ? clampedAlt
      : 3500.0 + (clampedAlt - 3500.0) * 0.30;
    const globeCenterY = shipPos.y - this.planetRadius - visualSpaceAlt;

    this.planetMesh.position.set(shipPos.x, globeCenterY, shipPos.z);
    this.airglowMesh.position.set(shipPos.x, globeCenterY, shipPos.z);

    // Roll the planet surface along its equator (Z-axis polar spin) as the spacecraft travels downrange (+X) and orbits
    this.orbitRotation += dt * (0.0025 + Math.max(0, speed - 400) * 0.000004);
    const downrangeLon = (shipPos.x - this.padCoords.x) * 0.000008;
    const downrangeLat = (shipPos.z - this.padCoords.y) * 0.000008;
    this.planetMesh.rotation.z = -0.35 + this.orbitRotation * 0.12 + downrangeLon;
    this.planetMesh.rotation.x = THREE.MathUtils.clamp(downrangeLat, -0.35, 0.35);

    // Orbit Phobos across the Martian space sky
    if (this.phobosMesh) {
      this.phobosOrbitAngle += dt * 0.008;
      const px = shipPos.x + Math.cos(this.phobosOrbitAngle) * this.phobosOrbitRadius;
      const pz = shipPos.z + Math.sin(this.phobosOrbitAngle) * this.phobosOrbitRadius;
      const py = globeCenterY + Math.sin(this.phobosOrbitAngle * 0.6) * 24000.0 + 115000.0;
      this.phobosMesh.position.set(px, py, pz);
      this.phobosMesh.rotation.y += dt * 0.02;
    }

    // Orbit Deimos in the far distance
    if (this.deimosMesh) {
      this.deimosOrbitAngle += dt * 0.003;
      const dx = shipPos.x + Math.cos(this.deimosOrbitAngle) * this.deimosOrbitRadius;
      const dz = shipPos.z + Math.sin(this.deimosOrbitAngle) * this.deimosOrbitRadius;
      const dy = globeCenterY + 165000.0;
      this.deimosMesh.position.set(dx, dy, dz);
    }

    // Orbit Communications Satellite
    if (this.satellite) {
      this.satelliteOrbitAngle += dt * 0.035;
      const sx = shipPos.x + Math.cos(this.satelliteOrbitAngle) * this.satelliteOrbitRadius;
      const sz = shipPos.z + Math.sin(this.satelliteOrbitAngle) * this.satelliteOrbitRadius;
      const sy = globeCenterY + 162000.0 + Math.sin(this.satelliteOrbitAngle * 2.0) * 2200.0;
      this.satellite.position.set(sx, sy, sz);
      this.satellite.rotation.y += dt * 0.15;
    }
  }

  dispose() {
    try {
      if (this.planetMesh) {
        this.planetMesh.geometry.dispose();
        if (this.planetMat) {
          if (this.planetMat.uniforms?.uMap?.value) {
            this.planetMat.uniforms.uMap.value.dispose();
          }
          this.planetMat.dispose();
        }
      }
      if (this.airglowMesh) {
        this.airglowMesh.geometry.dispose();
        if (this.airglowMat) this.airglowMat.dispose();
      }
      if (this.group && this.scene) {
        this.scene.remove(this.group);
      }
    } catch (_) {}
  }
}
